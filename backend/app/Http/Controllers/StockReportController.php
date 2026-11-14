<?php

namespace App\Http\Controllers;

use App\Enums\StockStatus;
use App\Enums\StockType;
use App\Http\Resources\StockReportResource;
use App\Models\StockReport;
use App\Models\StockReportItem;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StockReportController extends Controller
{
    public function index(Request $request)
    {
        $filters = $request->validate([
            'type' => ['nullable', Rule::enum(StockType::class)],
            'status' => ['nullable', Rule::enum(StockStatus::class)],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'search' => ['nullable', 'string', 'max:100'],
        ]);
        $search = trim((string) ($filters['search'] ?? ''));

        $reports = StockReport::query()
            ->visibleTo($request->user())
            ->with('creator:id,name')
            ->withCount('items')
            ->when($filters['type'] ?? null, fn ($q, $v) => $q->where('type', $v))
            ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($filters['date_from'] ?? null, fn ($q, $v) => $q->whereDate('report_date', '>=', $v))
            ->when($filters['date_to'] ?? null, fn ($q, $v) => $q->whereDate('report_date', '<=', $v))
            ->when($search !== '', function ($q) use ($search) {
                $q->where(function ($q) use ($search) {
                    $q->whereHas('creator', fn ($c) => $c->where('name', 'ilike', "%{$search}%"))
                        ->orWhereHas('items', fn ($i) => $i->where('name', 'ilike', "%{$search}%"));
                });
            })
            ->orderByDesc('report_date')
            ->orderByDesc('id')
            ->paginate(10);

        return StockReportResource::collection($reports);
    }

    /** Jumlah laporan per status (sesuai hak lihat user), untuk badge/dashboard. */
    public function summary(Request $request): JsonResponse
    {
        $counts = StockReport::query()
            ->visibleTo($request->user())
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        $result = [];
        foreach (StockStatus::cases() as $status) {
            $result[$status->value] = (int) ($counts[$status->value] ?? 0);
        }

        return response()->json(['data' => $result]);
    }

    /** Saran nama + satuan dari laporan sebelumnya, agar input harian lebih cepat dan konsisten. */
    public function suggestions(Request $request): JsonResponse
    {
        $request->validate(['type' => ['required', Rule::enum(StockType::class)]]);

        $rows = StockReportItem::query()
            ->join('stock_reports', 'stock_reports.id', '=', 'stock_report_items.stock_report_id')
            ->where('stock_reports.type', $request->query('type'))
            ->select('stock_report_items.name', 'stock_report_items.unit', DB::raw('count(*) as used'))
            ->groupBy('stock_report_items.name', 'stock_report_items.unit')
            ->orderByDesc('used')
            ->limit(500)
            ->get();

        // Satu satuan per nama: yang paling sering dipakai.
        $data = $rows->unique(fn ($r) => mb_strtolower($r->name))
            ->map(fn ($r) => ['name' => $r->name, 'unit' => $r->unit])
            ->values();

        return response()->json(['data' => $data]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', StockReport::class);

        $data = $this->validated($request, creating: true);
        $actor = $request->user();

        $this->ensureUniquePerDay($data['type'], $data['report_date'], $actor->id);

        $report = DB::transaction(function () use ($data, $actor) {
            $report = StockReport::create([
                'type' => $data['type'],
                'report_date' => $data['report_date'],
                'note' => $data['note'] ?? null,
                'status' => StockStatus::Draft,
                'created_by' => $actor->id,
            ]);
            $report->items()->createMany($data['items']);
            $report->addLog($actor, 'created', ['items' => count($data['items'])]);

            return $report;
        });

        if ($request->boolean('submit')) {
            Gate::authorize('submit', $report);
            $this->advance($report, $actor);
        }

        return (new StockReportResource($this->load($report)))->response()->setStatusCode(201);
    }

    public function show(StockReport $stockReport): StockReportResource
    {
        Gate::authorize('view', $stockReport);

        return new StockReportResource($this->load($stockReport));
    }

    public function update(Request $request, StockReport $stockReport): StockReportResource
    {
        $actor = $request->user();

        DB::transaction(function () use ($request, $stockReport, $actor) {
            $report = StockReport::lockForUpdate()->findOrFail($stockReport->id);
            Gate::authorize('update', $report);

            $data = $this->validated($request, creating: false);

            // Tanggal hanya bisa diubah selama masih Draft.
            if ($report->status === StockStatus::Draft && isset($data['report_date'])
                && $data['report_date'] !== $report->report_date->toDateString()) {
                $this->ensureUniquePerDay($report->type->value, $data['report_date'], $report->created_by, $report->id);
                $report->report_date = $data['report_date'];
            }
            $report->note = $data['note'] ?? null;
            $report->save();

            $changes = $this->replaceItems($report, $data['items']);
            if ($changes !== []) {
                $report->addLog($actor, 'edited', ['changes' => $changes]);
            }
        });

        return new StockReportResource($this->load($stockReport->refresh()));
    }

    /** Meneruskan laporan ke tahap berikutnya (User -> Operation -> Co-Admin). */
    public function submit(Request $request, StockReport $stockReport): StockReportResource
    {
        DB::transaction(function () use ($request, $stockReport) {
            $report = StockReport::lockForUpdate()->findOrFail($stockReport->id);
            Gate::authorize('submit', $report);

            if (! $report->items()->exists()) {
                throw ValidationException::withMessages(['items' => ['Laporan belum memiliki item.']]);
            }

            $this->advance($report, $request->user());
        });

        return new StockReportResource($this->load($stockReport->refresh()));
    }

    /** Co-Admin menandai laporan selesai (terkunci dari perubahan). */
    public function complete(Request $request, StockReport $stockReport): StockReportResource
    {
        DB::transaction(function () use ($request, $stockReport) {
            $report = StockReport::lockForUpdate()->findOrFail($stockReport->id);
            Gate::authorize('complete', $report);

            $report->update([
                'status' => StockStatus::Completed,
                'completed_by' => $request->user()->id,
                'completed_at' => now(),
            ]);
            $report->addLog($request->user(), 'completed');
        });

        return new StockReportResource($this->load($stockReport->refresh()));
    }

    public function destroy(StockReport $stockReport): JsonResponse
    {
        Gate::authorize('delete', $stockReport);

        $stockReport->delete();

        return response()->json(['message' => 'Laporan berhasil dihapus.']);
    }

    // ---------------------------------------------------------------------

    private function load(StockReport $report): StockReport
    {
        return $report->load(['items', 'creator:id,name', 'operator:id,name', 'completer:id,name', 'logs.user']);
    }

    private function advance(StockReport $report, User $actor): void
    {
        $next = $report->status->next();
        $from = $report->status;

        $attrs = ['status' => $next];
        if ($from === StockStatus::Draft) {
            $attrs['submitted_at'] = now();
        } else {
            $attrs['operation_by'] = $actor->id;
            $attrs['operation_submitted_at'] = now();
        }

        $report->update($attrs);
        $report->addLog($actor, 'submitted', ['from' => $from->value, 'to' => $next->value]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $creating): array
    {
        // Rapikan spasi sebelum validasi agar "Beras " dan "beras" terdeteksi duplikat.
        $items = collect($request->input('items', []))
            ->map(fn ($i) => is_array($i) ? [
                'name' => trim((string) ($i['name'] ?? '')),
                'unit' => trim((string) ($i['unit'] ?? '')),
                'quantity' => $i['quantity'] ?? null,
                'note' => isset($i['note']) && trim((string) $i['note']) !== '' ? trim((string) $i['note']) : null,
            ] : $i)
            ->all();
        $request->merge(['items' => $items]);

        $rules = [
            'note' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1', 'max:500'],
            'items.*.name' => ['required', 'string', 'max:150'],
            'items.*.unit' => ['required', 'string', 'max:30'],
            'items.*.quantity' => ['required', 'numeric', 'min:0', 'max:99999999'],
            'items.*.note' => ['nullable', 'string', 'max:255'],
            'submit' => ['sometimes', 'boolean'],
        ];
        $rules['report_date'] = $creating
            ? ['required', 'date', 'before_or_equal:today']
            : ['sometimes', 'date', 'before_or_equal:today'];
        if ($creating) {
            $rules['type'] = ['required', Rule::enum(StockType::class)];
        }

        $data = $request->validate($rules, [
            'items.required' => 'Tambahkan minimal 1 item.',
            'items.min' => 'Tambahkan minimal 1 item.',
            'items.*.name.required' => 'Nama item wajib diisi.',
            'items.*.unit.required' => 'Satuan wajib diisi.',
            'items.*.quantity.required' => 'Jumlah wajib diisi.',
            'items.*.quantity.numeric' => 'Jumlah harus berupa angka.',
            'items.*.quantity.min' => 'Jumlah tidak boleh negatif.',
            'report_date.before_or_equal' => 'Tanggal tidak boleh di masa depan.',
        ]);

        // Nama + satuan yang sama tidak boleh muncul dua kali dalam satu laporan.
        $seen = [];
        foreach ($data['items'] as $index => $item) {
            $key = mb_strtolower($item['name']).'|'.mb_strtolower($item['unit']);
            if (isset($seen[$key])) {
                throw ValidationException::withMessages([
                    "items.{$index}.name" => ["\"{$item['name']}\" ({$item['unit']}) sudah ada di daftar."],
                ]);
            }
            $seen[$key] = true;
        }

        return $data;
    }

    private function ensureUniquePerDay(string $type, string $date, int $userId, ?int $ignoreId = null): void
    {
        $exists = StockReport::query()
            ->where('type', $type)
            ->whereDate('report_date', $date)
            ->where('created_by', $userId)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'report_date' => ['Anda sudah membuat laporan jenis ini untuk tanggal tersebut. Buka dan edit laporan yang ada.'],
            ]);
        }
    }

    /**
     * Mengganti seluruh item laporan dan mengembalikan daftar perubahan yang mudah dibaca.
     *
     * @param  array<int, array<string, mixed>>  $new
     * @return array<int, string>
     */
    private function replaceItems(StockReport $report, array $new): array
    {
        $key = fn (string $name, string $unit) => mb_strtolower($name).'|'.mb_strtolower($unit);
        $fmt = fn ($n) => rtrim(rtrim(number_format((float) $n, 3, '.', ''), '0'), '.');

        $old = $report->items()->get()->keyBy(fn ($i) => $key($i->name, $i->unit));
        $newByKey = collect($new)->keyBy(fn ($i) => $key($i['name'], $i['unit']));

        $changes = [];
        foreach ($newByKey as $k => $item) {
            if (! $old->has($k)) {
                $changes[] = "Tambah {$item['name']}: {$fmt($item['quantity'])} {$item['unit']}";

                continue;
            }
            $before = $old[$k];
            if (abs($before->quantity - (float) $item['quantity']) > 0.0005) {
                $changes[] = "{$item['name']}: {$fmt($before->quantity)} → {$fmt($item['quantity'])} {$item['unit']}";
            }
            if (($before->note ?? null) !== ($item['note'] ?? null)) {
                $changes[] = "Catatan {$item['name']} diubah";
            }
        }
        foreach ($old as $k => $before) {
            if (! $newByKey->has($k)) {
                $changes[] = "Hapus {$before->name} ({$fmt($before->quantity)} {$before->unit})";
            }
        }

        $report->items()->delete();
        $report->items()->createMany($new);

        return $changes;
    }
}
