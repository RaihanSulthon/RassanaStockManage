<?php

namespace App\Http\Controllers;

use App\Enums\LocationType;
use App\Enums\RequestStatus;
use App\Enums\Role;
use App\Http\Controllers\Concerns\PresentsDocuments;
use App\Models\Location;
use App\Models\PurchaseRequisition;
use App\Models\StockBalance;
use App\Models\User;
use App\Models\UserRequest;
use App\Support\DocumentExport;
use App\Support\Fmt;
use App\Support\LineItems;
use App\Support\Notifier;
use App\Support\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** PR (Purchasing Requisition): Logistic (gudang) -> Purchasing. 1 UR -> 1 PR. */
class PurchaseRequisitionController extends Controller
{
    use PresentsDocuments;

    public function index(Request $request): JsonResponse
    {
        $f = $this->dateFilters($request);
        $actor = $request->user();
        $search = trim((string) ($f['search'] ?? ''));

        $query = PurchaseRequisition::query()
            ->with(['warehouse:id,name,type', 'creator:id,name', 'userRequest:id,number', 'purchaseOrder:id,purchase_requisition_id,number,status'])
            ->withCount('items');

        $actor->hasRole(Role::Logistic)
            ? $query->whereIn('warehouse_id', $actor->assignedLocationIds())
            : $query->where('status', '!=', RequestStatus::Draft->value);

        $prs = $query
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['date_from'] ?? null, fn ($q, $v) => $q->whereDate('created_at', '>=', $v))
            ->when($f['date_to'] ?? null, fn ($q, $v) => $q->whereDate('created_at', '<=', $v))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('number', 'ilike', "%{$search}%")
                ->orWhereHas('items.item', fn ($i) => $i->where('name', 'ilike', "%{$search}%"))))
            ->orderByDesc('id')
            ->paginate(15);

        return response()->json($this->paginated($prs, fn ($pr) => $this->present($pr, $actor, false)));
    }

    public function show(Request $request, PurchaseRequisition $purchaseRequisition): JsonResponse
    {
        Gate::authorize('view', $purchaseRequisition);

        return response()->json(['data' => $this->present($this->load($purchaseRequisition), $request->user())]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', PurchaseRequisition::class);
        $actor = $request->user();
        $data = $this->validated($request);
        $ur = null;

        if (! empty($data['user_request_id'])) {
            $ur = UserRequest::with('purchaseRequisition')->findOrFail($data['user_request_id']);
            if (! $actor->can('process', $ur) || $ur->status !== RequestStatus::Submitted || $ur->purchaseRequisition) {
                throw ValidationException::withMessages(['user_request_id' => ['UR ini tidak bisa dibuatkan PR (sudah diproses atau bukan untuk gudang Anda).']]);
            }
            $data['warehouse_id'] = $ur->warehouse_id;
        }
        $warehouse = $this->warehouse($actor, $data['warehouse_id'] ?? null);
        LineItems::assertWarehouse($data['items'], $warehouse->id);

        $pr = DB::transaction(function () use ($data, $warehouse, $actor, $ur) {
            $pr = PurchaseRequisition::create([
                'warehouse_id' => $warehouse->id,
                'user_request_id' => $ur?->id,
                'period' => $data['period'],
                'needed_date' => $data['needed_date'] ?? null,
                'note' => $data['note'] ?? null,
                'status' => RequestStatus::Draft,
                'created_by' => $actor->id,
            ]);
            $pr->items()->createMany($data['items']);
            $pr->addLog($actor, 'created', ['items' => count($data['items']), 'from' => $ur?->number]);

            return $pr;
        });

        return response()->json(['data' => $this->present($this->load($pr), $actor)], 201);
    }

    public function update(Request $request, PurchaseRequisition $purchaseRequisition): JsonResponse
    {
        $actor = $request->user();

        DB::transaction(function () use ($request, $purchaseRequisition, $actor) {
            $pr = PurchaseRequisition::lockForUpdate()->findOrFail($purchaseRequisition->id);
            Gate::authorize('update', $pr);
            $data = $this->validated($request);
            LineItems::assertWarehouse($data['items'], $pr->warehouse_id);

            $changes = LineItems::diff($pr->items()->get(), $data['items']);
            $pr->update([
                'period' => $data['period'],
                'needed_date' => $data['needed_date'] ?? null,
                'note' => $data['note'] ?? null,
            ]);
            $pr->items()->delete();
            $pr->items()->createMany($data['items']);
            if ($changes) {
                $pr->addLog($actor, 'edited', ['changes' => $changes]);
            }
        });

        return response()->json(['data' => $this->present($this->load($purchaseRequisition->refresh()), $actor)]);
    }

    public function submit(Request $request, PurchaseRequisition $purchaseRequisition): JsonResponse
    {
        $actor = $request->user();

        DB::transaction(function () use ($purchaseRequisition, $actor) {
            $pr = PurchaseRequisition::lockForUpdate()->findOrFail($purchaseRequisition->id);
            Gate::authorize('submit', $pr);
            if (! $pr->items()->exists()) {
                throw ValidationException::withMessages(['items' => ['PR belum memiliki barang.']]);
            }

            $pr->update(['status' => RequestStatus::Submitted, 'submitted_at' => now()]);
            $pr->addLog($actor, 'submitted', ['to' => 'purchasing']);

            if ($pr->userRequest) {
                $pr->userRequest->update(['status' => RequestStatus::Processed, 'processed_at' => now()]);
                $pr->userRequest->addLog($actor, 'processed', ['pr' => $pr->number]);
                Notifier::users([$pr->userRequest->creator], "UR {$pr->userRequest->number} diproses",
                    "Permintaan Anda sudah dibuatkan {$pr->number} oleh {$actor->name}.", "/ur/{$pr->userRequest->id}");
            }

            Notifier::role(Role::Purchasing, "PR baru: {$pr->number}",
                "{$actor->name} mengirim PR dari gudang {$pr->warehouse->name}.", "/pr/{$pr->id}");
        });

        return response()->json(['data' => $this->present($this->load($purchaseRequisition->refresh()), $actor)]);
    }

    public function destroy(PurchaseRequisition $purchaseRequisition): JsonResponse
    {
        Gate::authorize('delete', $purchaseRequisition);
        $purchaseRequisition->logs()->delete();
        $purchaseRequisition->delete();

        return response()->json(['message' => 'PR dihapus.']);
    }

    public function export(Request $request, PurchaseRequisition $purchaseRequisition, string $format)
    {
        Gate::authorize('export', $purchaseRequisition);
        $this->exportFormat($format);
        $pr = $this->load($purchaseRequisition);
        $stock = StockService::balances($pr->warehouse_id);

        return (new DocumentExport('Purchasing Requisition (PR)', $pr->number))
            ->meta('Nomor PR', $pr->number)
            ->meta('Status', $pr->status->labelFor('pr'))
            ->meta('Gudang', $pr->warehouse->name)
            ->meta('Berdasarkan UR', $pr->userRequest?->number ?? 'Estimasi kebutuhan (tanpa UR)')
            ->meta('Periode kebutuhan', PurchaseRequisition::PERIODS[$pr->period] ?? $pr->period)
            ->meta('Dibuat oleh', $pr->creator->name)
            ->meta('Tanggal kirim', Fmt::datetime($pr->submitted_at))
            ->meta('Dibutuhkan tanggal', Fmt::date($pr->needed_date))
            ->meta('Catatan', $pr->note)
            ->table(null, [
                ['label' => 'No', 'type' => 'int'], ['label' => 'Nama Barang'], ['label' => 'Satuan'],
                ['label' => 'Stok Gudang', 'type' => 'qty'], ['label' => 'Min', 'type' => 'qty'], ['label' => 'Max', 'type' => 'qty'],
                ['label' => 'Jumlah Diminta', 'type' => 'qty'], ['label' => 'Catatan'],
            ], $pr->items->values()->map(fn ($l, $i) => [
                $i + 1, $l->item->name, $l->item->unit, $stock[$l->item_id] ?? 0,
                $l->item->min_stock, $l->item->max_stock, $l->quantity, $l->note,
            ])->all())
            ->download($format, $request->user());
    }

    // ---------------------------------------------------------------------

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer'],
            'user_request_id' => ['nullable', 'integer'],
            'period' => ['required', Rule::in(array_keys(PurchaseRequisition::PERIODS))],
            'needed_date' => ['nullable', 'date', 'after_or_equal:today'],
            'note' => ['nullable', 'string', 'max:1000'],
        ], ['needed_date.after_or_equal' => 'Tanggal dibutuhkan tidak boleh di masa lalu.']);
        $data['items'] = LineItems::validate($request);

        return $data;
    }

    private function warehouse(User $actor, ?int $warehouseId): Location
    {
        $warehouses = Location::whereIn('id', $actor->assignedLocationIds())
            ->where('type', LocationType::Warehouse->value)->get();

        $warehouse = $warehouseId ? $warehouses->firstWhere('id', $warehouseId) : ($warehouses->count() === 1 ? $warehouses->first() : null);
        if (! $warehouse) {
            throw ValidationException::withMessages(['warehouse_id' => [
                $warehouses->isEmpty() ? 'Akun Anda belum ditugaskan ke gudang. Hubungi Admin.' : 'Pilih gudang.',
            ]]);
        }

        return $warehouse;
    }

    private function load(PurchaseRequisition $pr): PurchaseRequisition
    {
        return $pr->load(['items.item', 'warehouse.children', 'creator:id,name', 'userRequest.field',
            'purchaseOrder:id,purchase_requisition_id,number,status', 'logs.user']);
    }

    private function present(PurchaseRequisition $pr, User $actor, bool $full = true): array
    {
        $data = [
            'id' => $pr->id,
            'number' => $pr->number,
            'status' => $pr->status->value,
            'status_label' => $pr->status->labelFor('pr'),
            'warehouse' => $this->locationRef($pr->warehouse),
            'period' => $pr->period,
            'period_label' => PurchaseRequisition::PERIODS[$pr->period] ?? $pr->period,
            'needed_date' => $pr->needed_date?->toDateString(),
            'note' => $pr->note,
            'creator' => $this->userRef($pr->creator),
            'submitted_at' => $pr->submitted_at,
            'created_at' => $pr->created_at,
            'items_count' => $pr->items_count ?? $pr->items->count(),
            'user_request' => $pr->userRequest?->only(['id', 'number']),
            'purchase_order' => $pr->purchaseOrder?->only(['id', 'number']),
            'can' => [
                'update' => $actor->can('update', $pr),
                'submit' => $actor->can('submit', $pr),
                'delete' => $actor->can('delete', $pr),
                'create_po' => $actor->can('create', \App\Models\PurchaseOrder::class)
                    && $pr->status === RequestStatus::Submitted && ! $pr->purchaseOrder,
                'export' => $actor->can('export', $pr),
            ],
        ];

        if (! $full) {
            return $data;
        }

        // Data stok gudang + lapangan di bawahnya untuk validasi (Pak Andi) dan acuan min/max.
        $fields = $pr->warehouse->children;
        $balances = StockBalance::whereIn('location_id', [$pr->warehouse_id, ...$fields->pluck('id')])
            ->whereIn('item_id', $pr->items->pluck('item_id'))
            ->get()->groupBy('location_id');
        $qty = fn ($locId, $itemId) => (float) ($balances->get($locId)?->firstWhere('item_id', $itemId)?->quantity ?? 0);

        $data['fields'] = $fields->map(fn ($f) => ['id' => $f->id, 'name' => $f->name])->values();
        $data['items'] = $pr->items->map(fn ($l) => $this->line($l, [
            'quantity' => $l->quantity,
            'min_stock' => $l->item->min_stock,
            'max_stock' => $l->item->max_stock,
            'warehouse_stock' => $qty($pr->warehouse_id, $l->item_id),
            'field_stock' => $fields->mapWithKeys(fn ($f) => [$f->id => $qty($f->id, $l->item_id)]),
        ]))->values();
        $data['logs'] = $this->logs($pr);

        return $data;
    }
}
