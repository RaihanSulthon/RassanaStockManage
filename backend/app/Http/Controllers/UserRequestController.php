<?php

namespace App\Http\Controllers;

use App\Enums\LocationType;
use App\Enums\RequestStatus;
use App\Enums\Role;
use App\Http\Controllers\Concerns\PresentsDocuments;
use App\Models\Location;
use App\Models\User;
use App\Models\UserRequest;
use App\Support\DocumentExport;
use App\Support\Fmt;
use App\Support\LineItems;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/** UR (User Request): Operation1 (lapangan) -> Logistic (gudang induk). */
class UserRequestController extends Controller
{
    use PresentsDocuments;

    public function index(Request $request): JsonResponse
    {
        $f = $this->dateFilters($request);
        $actor = $request->user();
        $search = trim((string) ($f['search'] ?? ''));

        $query = UserRequest::query()
            ->with(['field:id,name,type', 'warehouse:id,name,type', 'creator:id,name', 'purchaseRequisition:id,user_request_id,number,status'])
            ->withCount('items');

        match (true) {
            $actor->hasRole(Role::Operation1) => $query->whereIn('field_id', $actor->assignedLocationIds()),
            $actor->hasRole(Role::Logistic) => $query->whereIn('warehouse_id', $actor->assignedLocationIds())
                ->where('status', '!=', RequestStatus::Draft->value),
            $actor->hasRole(Role::User) => $query->whereRaw('1 = 0'),
            default => $query->where('status', '!=', RequestStatus::Draft->value),
        };

        $urs = $query
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['date_from'] ?? null, fn ($q, $v) => $q->whereDate('created_at', '>=', $v))
            ->when($f['date_to'] ?? null, fn ($q, $v) => $q->whereDate('created_at', '<=', $v))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('number', 'ilike', "%{$search}%")
                ->orWhereHas('items.item', fn ($i) => $i->where('name', 'ilike', "%{$search}%"))))
            ->orderByDesc('id')
            ->paginate(15);

        return response()->json($this->paginated($urs, fn ($ur) => $this->present($ur, $actor, false)));
    }

    public function show(Request $request, UserRequest $userRequest): JsonResponse
    {
        Gate::authorize('view', $userRequest);

        return response()->json(['data' => $this->present($this->load($userRequest), $request->user())]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', UserRequest::class);
        $actor = $request->user();
        $data = $this->validated($request);
        $field = $this->field($actor, $data['field_id'] ?? null);
        LineItems::assertWarehouse($data['items'], $field->parent_id);

        $ur = DB::transaction(function () use ($data, $field, $actor) {
            $ur = UserRequest::create([
                'field_id' => $field->id,
                'warehouse_id' => $field->parent_id,
                'needed_date' => $data['needed_date'] ?? null,
                'note' => $data['note'] ?? null,
                'status' => RequestStatus::Draft,
                'created_by' => $actor->id,
            ]);
            $ur->items()->createMany($data['items']);
            $ur->addLog($actor, 'created', ['items' => count($data['items'])]);

            return $ur;
        });

        return response()->json(['data' => $this->present($this->load($ur), $actor)], 201);
    }

    public function update(Request $request, UserRequest $userRequest): JsonResponse
    {
        $actor = $request->user();

        DB::transaction(function () use ($request, $userRequest, $actor) {
            $ur = UserRequest::lockForUpdate()->findOrFail($userRequest->id);
            Gate::authorize('update', $ur);
            $data = $this->validated($request);
            LineItems::assertWarehouse($data['items'], $ur->warehouse_id);

            $changes = LineItems::diff($ur->items()->get(), $data['items']);
            $ur->update(['needed_date' => $data['needed_date'] ?? null, 'note' => $data['note'] ?? null]);
            $ur->items()->delete();
            $ur->items()->createMany($data['items']);
            if ($changes) {
                $ur->addLog($actor, 'edited', ['changes' => $changes]);
            }
        });

        return response()->json(['data' => $this->present($this->load($userRequest->refresh()), $actor)]);
    }

    public function submit(Request $request, UserRequest $userRequest): JsonResponse
    {
        $actor = $request->user();

        DB::transaction(function () use ($userRequest, $actor) {
            $ur = UserRequest::lockForUpdate()->findOrFail($userRequest->id);
            Gate::authorize('submit', $ur);
            if (! $ur->items()->exists()) {
                throw ValidationException::withMessages(['items' => ['UR belum memiliki barang.']]);
            }
            $ur->update(['status' => RequestStatus::Submitted, 'submitted_at' => now()]);
            $ur->addLog($actor, 'submitted', ['to' => 'logistic']);

            Notifier::role(Role::Logistic, "UR baru: {$ur->number}",
                "{$actor->name} mengirim permintaan barang dari {$ur->field->name}.",
                "/ur/{$ur->id}", $ur->warehouse_id);
        });

        return response()->json(['data' => $this->present($this->load($userRequest->refresh()), $actor)]);
    }

    public function destroy(UserRequest $userRequest): JsonResponse
    {
        Gate::authorize('delete', $userRequest);
        $userRequest->logs()->delete();
        $userRequest->delete();

        return response()->json(['message' => 'UR dihapus.']);
    }

    public function export(Request $request, UserRequest $userRequest, string $format)
    {
        Gate::authorize('export', $userRequest);
        $this->exportFormat($format);
        $ur = $this->load($userRequest);

        return (new DocumentExport('User Request (UR)', $ur->number))
            ->meta('Nomor UR', $ur->number)
            ->meta('Status', $ur->status->labelFor('ur'))
            ->meta('Lapangan', $ur->field->name)
            ->meta('Gudang', $ur->warehouse->name)
            ->meta('Dibuat oleh', $ur->creator->name)
            ->meta('Tanggal kirim', Fmt::datetime($ur->submitted_at))
            ->meta('Dibutuhkan tanggal', Fmt::date($ur->needed_date))
            ->meta('Catatan', $ur->note)
            ->table(null, [
                ['label' => 'No', 'type' => 'int'], ['label' => 'Nama Barang'], ['label' => 'Jenis'],
                ['label' => 'Satuan'], ['label' => 'Jumlah', 'type' => 'qty'], ['label' => 'Catatan'],
            ], $ur->items->values()->map(fn ($l, $i) => [
                $i + 1, $l->item->name, $l->item->category->label(), $l->item->unit, $l->quantity, $l->note,
            ])->all())
            ->download($format, $request->user());
    }

    // ---------------------------------------------------------------------

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'field_id' => ['nullable', 'integer'],
            'needed_date' => ['nullable', 'date', 'after_or_equal:today'],
            'note' => ['nullable', 'string', 'max:1000'],
        ], ['needed_date.after_or_equal' => 'Tanggal dibutuhkan tidak boleh di masa lalu.']);
        $data['items'] = LineItems::validate($request);

        return $data;
    }

    /** Lapangan tempat Operation1 ditugaskan (otomatis jika hanya satu). */
    private function field(User $actor, ?int $fieldId): Location
    {
        $fields = Location::whereIn('id', $actor->assignedLocationIds())
            ->where('type', LocationType::Field->value)->where('is_active', true)->get();

        $field = $fieldId ? $fields->firstWhere('id', $fieldId) : ($fields->count() === 1 ? $fields->first() : null);
        if (! $field) {
            throw ValidationException::withMessages(['field_id' => [
                $fields->isEmpty() ? 'Akun Anda belum ditugaskan ke lapangan. Hubungi Admin.' : 'Pilih lapangan.',
            ]]);
        }

        return $field;
    }

    private function load(UserRequest $ur): UserRequest
    {
        return $ur->load(['items.item', 'field', 'warehouse', 'creator:id,name',
            'purchaseRequisition:id,user_request_id,number,status', 'transfers:id,user_request_id,number,status', 'logs.user']);
    }

    private function present(UserRequest $ur, User $actor, bool $full = true): array
    {
        return [
            'id' => $ur->id,
            'number' => $ur->number,
            'status' => $ur->status->value,
            'status_label' => $ur->status->labelFor('ur'),
            'field' => $this->locationRef($ur->field),
            'warehouse' => $this->locationRef($ur->warehouse),
            'needed_date' => $ur->needed_date?->toDateString(),
            'note' => $ur->note,
            'creator' => $this->userRef($ur->creator),
            'submitted_at' => $ur->submitted_at,
            'processed_at' => $ur->processed_at,
            'created_at' => $ur->created_at,
            'items_count' => $ur->items_count ?? $ur->items->count(),
            'purchase_requisition' => $ur->purchaseRequisition?->only(['id', 'number']),
            ...($full ? [
                'items' => $ur->items->map(fn ($l) => $this->line($l, ['quantity' => $l->quantity]))->values(),
                'transfers' => $ur->transfers->map(fn ($t) => ['id' => $t->id, 'number' => $t->number, 'status' => $t->status->value, 'status_label' => $t->status->label()])->values(),
                'logs' => $this->logs($ur),
            ] : []),
            'can' => [
                'update' => $actor->can('update', $ur),
                'submit' => $actor->can('submit', $ur),
                'delete' => $actor->can('delete', $ur),
                'create_pr' => $actor->can('process', $ur) && $ur->status === RequestStatus::Submitted && ! $ur->purchaseRequisition,
                'transfer' => $actor->can('process', $ur),
                'export' => $actor->can('export', $ur),
            ],
        ];
    }
}
