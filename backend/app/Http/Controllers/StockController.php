<?php

namespace App\Http\Controllers;

use App\Enums\LocationType;
use App\Enums\MovementType;
use App\Enums\Role;
use App\Http\Controllers\Concerns\PresentsDocuments;
use App\Models\Item;
use App\Models\Location;
use App\Models\StockMovement;
use App\Support\DocumentExport;
use App\Support\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Saldo stok, laporan harian/mingguan/bulanan, mutasi, dan penyesuaian (Admin). */
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

    /** Penyesuaian / saldo awal (hanya Admin). Mengisi saldo aktual hasil hitung fisik. */
    public function adjust(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole(Role::Admin), 403, 'Hanya Admin yang bisa melakukan penyesuaian stok.');

        $data = $request->validate([
            'location_id' => ['required', 'integer', 'exists:locations,id'],
            'date' => ['required', 'date', 'before_or_equal:today'],
            'note' => ['required', 'string', 'max:255'],
            'items' => ['required', 'array', 'min:1', 'max:300'],
            'items.*.item_id' => ['required', 'integer', 'distinct', 'exists:items,id'],
            'items.*.actual' => ['required', 'numeric', 'min:0', 'max:99999999'],
        ], [
            'note.required' => 'Isi alasan penyesuaian (mis. saldo awal / hasil hitung fisik).',
            'items.*.item_id.distinct' => 'Barang ini sudah ada di daftar.',
        ]);

        $changes = 0;
        DB::transaction(function () use ($data, $request, &$changes) {
            $current = StockService::balances($data['location_id']);
            foreach ($data['items'] as $i => $line) {
                $delta = round((float) $line['actual'] - ($current[$line['item_id']] ?? 0), 3);
                if ($delta != 0.0) {
                    StockService::move($data['location_id'], (int) $line['item_id'], $delta, MovementType::Adjustment,
                        $data['date'], null, $request->user(), $data['note'], "items.{$i}.actual");
                    $changes++;
                }
            }
        });

        return response()->json(['message' => $changes ? "Penyesuaian tersimpan ({$changes} barang)." : 'Tidak ada perubahan saldo.']);
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
