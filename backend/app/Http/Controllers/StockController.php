<?php

namespace App\Http\Controllers;

use App\Enums\LocationType;
use App\Enums\MovementType;
use App\Enums\Role;
use App\Http\Controllers\Concerns\PresentsDocuments;
use App\Models\Item;
use App\Models\Location;
use App\Models\StockMovement;
use App\Models\User;
use App\Support\DocumentExport;
use App\Support\Fmt;
use App\Support\LineItems;
use App\Support\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Saldo stok, laporan harian/mingguan/bulanan, mutasi, dan ubah stok manual (penyesuaian). */
class StockController extends Controller
{
    use PresentsDocuments;

    /** Saldo saat ini per barang di satu lokasi (dipakai form). */
    public function balances(Request $request): JsonResponse
    {
        $location = $this->location($request);

        return response()->json(['data' => (object) StockService::balances($location->id)]);
    }

    public function report(Request $request): JsonResponse
    {
        [$location, $from, $to, $period] = $this->reportParams($request);

        return response()->json([
            'location' => $this->locationRef($location) + ['parent' => $location->parent?->only(['id', 'name'])],
            'period' => $period,
            'from' => $from,
            'to' => $to,
            'data' => StockService::report($location, $from, $to),
        ]);
    }

    public function movements(Request $request): JsonResponse
    {
        [$location, $from, $to] = $this->reportParams($request);
        $request->validate(['item_id' => ['nullable', 'integer']]);

        $movements = StockMovement::query()
            ->with(['item:id,name,unit', 'user:id,name'])
            ->where('location_id', $location->id)
            ->whereBetween('movement_date', [$from, $to])
            ->when($request->query('item_id'), fn ($q, $v) => $q->where('item_id', $v))
            ->orderByDesc('movement_date')->orderByDesc('id')
            ->paginate(20);

        return response()->json($this->paginated($movements, fn (StockMovement $m) => [
            'id' => $m->id,
            'date' => $m->movement_date->toDateString(),
            'type' => $m->type->value,
            'type_label' => $m->type->label(),
            'item' => $m->item?->only(['id', 'name', 'unit']),
            'quantity' => $m->quantity,
            'balance_after' => $m->balance_after,
            'reference_type' => $m->reference_type,
            'reference_id' => $m->reference_id,
            'reference_number' => $m->reference_number,
            'user' => $this->userRef($m->user),
            'note' => $m->note,
            'created_at' => $m->created_at,
        ]));
    }

    public function export(Request $request, string $format)
    {
        $this->exportFormat($format);
        [$location, $from, $to, $period] = $this->reportParams($request);
        $rows = StockService::report($location, $from, $to);
        $isWarehouse = $location->type === LocationType::Warehouse;
        $statusLabel = ['below_min' => 'Di bawah minimal', 'above_max' => 'Di atas maksimal', 'ok' => 'Aman'];

        $columns = [
            ['label' => 'No', 'type' => 'int'], ['label' => 'Nama'], ['label' => 'Jenis'], ['label' => 'Satuan'],
            ['label' => 'Saldo Awal', 'type' => 'qty'], ['label' => 'Masuk', 'type' => 'qty'],
            ['label' => 'Keluar', 'type' => 'qty'], ['label' => 'Saldo Akhir', 'type' => 'qty'],
        ];
        if ($isWarehouse) {
            array_push($columns, ['label' => 'Min', 'type' => 'qty'], ['label' => 'Max', 'type' => 'qty'], ['label' => 'Status']);
        }

        $data = $rows->values()->map(function ($r, $i) use ($isWarehouse, $statusLabel) {
            $row = [$i + 1, $r['name'], ucfirst($r['category']), $r['unit'], $r['opening'], $r['in'], $r['out'], $r['closing']];
            if ($isWarehouse) {
                array_push($row, $r['min_stock'], $r['max_stock'], $statusLabel[$r['status']] ?? '');
            }

            return $row;
        })->all();

        $periodLabel = ['harian' => 'Harian', 'mingguan' => 'Mingguan', 'bulanan' => 'Bulanan', 'custom' => 'Rentang tanggal'][$period];

        return (new DocumentExport(
            'Laporan Saldo Stok '.$location->type->label(),
            "saldo-stok-{$location->id}-{$from}-{$to}",
        ))
            ->meta('Lokasi', $location->name.($location->parent ? ' (Gudang '.$location->parent->name.')' : ''))
            ->meta('Periode', $periodLabel)
            ->meta('Tanggal', $from === $to ? \App\Support\Fmt::date($from) : \App\Support\Fmt::date($from).' s/d '.\App\Support\Fmt::date($to))
            ->table(null, $columns, $data)
            ->download($format, $request->user());
    }

    /**
     * Ubah stok manual (tercatat sebagai mutasi penyesuaian).
     *  - mode "add"      : quantity = jumlah yang ditambahkan (hanya gudang).
     *  - mode "subtract" : quantity = jumlah yang dikurangi.
     *  - mode "set"      : quantity = jumlah fisik sebenarnya (stock opname); sistem mencatat selisihnya.
     *
     * Gudang  : Admin/Purchasing/Finance, atau Logistic di gudang yang ditugaskan.
     * Lapangan: Admin/Purchasing/Finance, atau Operation1/User di lapangan yang ditugaskan.
     *           Stok lapangan hanya boleh BERTAMBAH lewat kiriman gudang, jadi di lapangan
     *           tidak ada "tambah" dan hitung fisik tidak boleh melebihi stok sistem.
     */
    public function adjust(Request $request): JsonResponse
    {
        $data = $request->validate([
            'location_id' => ['required', 'integer', 'exists:locations,id'],
            'mode' => ['required', Rule::in(['add', 'subtract', 'set'])],
            'date' => ['required', 'date', 'before_or_equal:today'],
            'note' => ['required', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1', 'max:300'],
            'items.*.item_id' => ['required', 'integer', 'distinct', 'exists:items,id'],
            'items.*.quantity' => ['required', 'numeric', 'max:99999999', $request->input('mode') === 'set' ? 'min:0' : 'gt:0'],
        ], [
            'note.required' => 'Pilih / isi alasan perubahan stok.',
            'items.required' => 'Isi jumlah minimal untuk satu barang.',
            'items.*.item_id.distinct' => 'Barang ini sudah ada di daftar.',
            'items.*.quantity.gt' => 'Jumlah harus lebih dari 0.',
            'items.*.quantity.min' => 'Jumlah tidak boleh negatif.',
        ]);

        $location = Location::findOrFail($data['location_id']);
        $this->authorizeAdjust($request->user(), $location);
        LineItems::assertWarehouse($data['items'], $location->warehouseId());
        $isField = $location->type === LocationType::Field;

        if ($isField && $data['mode'] === 'add') {
            throw ValidationException::withMessages(['mode' => ['Stok lapangan hanya bertambah lewat kiriman dari gudang.']]);
        }

        $changes = 0;
        DB::transaction(function () use ($data, $request, $isField, &$changes) {
            $current = StockService::balances($data['location_id']);
            foreach ($data['items'] as $i => $line) {
                $qty = (float) $line['quantity'];
                $before = $current[$line['item_id']] ?? 0;
                $delta = round(match ($data['mode']) {
                    'add' => $qty,
                    'subtract' => -$qty,
                    'set' => $qty - $before,
                }, 3);
                if ($isField && $delta > 0) {
                    throw ValidationException::withMessages(["items.{$i}.quantity" => [
                        'Hitung fisik di lapangan tidak boleh melebihi stok sistem ('.Fmt::qty($before).'). Kelebihan barang harus lewat kiriman gudang.',
                    ]]);
                }
                if ($delta != 0.0) {
                    StockService::move($data['location_id'], (int) $line['item_id'], $delta, MovementType::Adjustment,
                        $data['date'], null, $request->user(), $data['note'], "items.{$i}.quantity");
                    $changes++;
                }
            }
        });

        return response()->json(['message' => $changes ? "Stok {$location->name} diperbarui ({$changes} barang)." : 'Tidak ada perubahan stok.']);
    }

    private function authorizeAdjust(User $user, Location $location): void
    {
        if ($user->role->isPrivileged()) {
            return;
        }
        $allowed = $location->type === LocationType::Warehouse
            ? $user->hasRole(Role::Logistic) && $user->isAssignedTo($location->id)
            : $user->role->isFieldRole() && $user->isAssignedTo($location->id);

        abort_unless($allowed, 403, $location->type === LocationType::Warehouse
            ? 'Stok gudang hanya bisa diubah oleh Admin, Purchasing, Finance, atau Logistic gudang ini.'
            : 'Anda tidak punya akses untuk mengubah stok lapangan ini.');
    }

    // ---------------------------------------------------------------------

    private function location(Request $request): Location
    {
        $request->validate(['location_id' => ['required', 'integer', 'exists:locations,id']]);
        $location = Location::with('parent:id,name')->findOrFail($request->query('location_id', $request->input('location_id')));
        abort_unless($request->user()->canSeeLocation($location->id), 403, 'Anda tidak punya akses ke lokasi ini.');

        return $location;
    }

    /** @return array{0: Location, 1: string, 2: string, 3: string} */
    private function reportParams(Request $request): array
    {
        $location = $this->location($request);
        $data = $request->validate([
            'period' => ['nullable', Rule::in(['harian', 'mingguan', 'bulanan', 'custom'])],
            'date' => ['nullable', 'date'],
            'from' => ['nullable', 'date', 'required_if:period,custom'],
            'to' => ['nullable', 'date', 'required_if:period,custom', 'after_or_equal:from'],
        ]);
        $period = $data['period'] ?? 'harian';
        [$from, $to] = StockService::periodRange($period, $data['date'] ?? now()->toDateString(), $data['from'] ?? null, $data['to'] ?? null);

        if (\Illuminate\Support\Carbon::parse($from)->diffInDays(\Illuminate\Support\Carbon::parse($to)) > 366) {
            throw ValidationException::withMessages(['to' => ['Rentang maksimal 1 tahun.']]);
        }

        return [$location, $from, $to, $period];
    }
}
