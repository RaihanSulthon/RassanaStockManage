<?php

namespace App\Http\Controllers;

use App\Enums\LocationType;
use App\Enums\MovementType;
use App\Http\Controllers\Concerns\PresentsDocuments;
use App\Models\Location;
use App\Models\Usage;
use App\Models\User;
use App\Support\LineItems;
use App\Support\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/** Catat Pemakaian Harian (Operation1 / User di lapangannya). Mengurangi saldo lapangan. */
class UsageController extends Controller
{
    use PresentsDocuments;

    public function index(Request $request): JsonResponse
    {
        $f = $this->dateFilters($request);
        $request->validate(['location_id' => ['nullable', 'integer']]);
        $actor = $request->user();
        $ids = $actor->visibleLocationIds();

        $usages = Usage::query()
            ->with(['location:id,name,type', 'creator:id,name', 'items.item:id,name,unit'])
            ->when($ids !== null, fn ($q) => $q->whereIn('location_id', $ids))
            ->when($request->query('location_id'), fn ($q, $v) => $q->where('location_id', $v))
            ->when($f['date_from'] ?? null, fn ($q, $v) => $q->whereDate('usage_date', '>=', $v))
            ->when($f['date_to'] ?? null, fn ($q, $v) => $q->whereDate('usage_date', '<=', $v))
            ->orderByDesc('usage_date')->orderByDesc('id')
            ->paginate(15);

        return response()->json($this->paginated($usages, fn ($u) => $this->present($u, $actor)));
    }

    public function show(Request $request, Usage $usage): JsonResponse
    {
        Gate::authorize('view', $usage);

        return response()->json(['data' => $this->present($usage->load(['location', 'creator', 'canceller', 'items.item', 'logs.user']), $request->user(), true)]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', Usage::class);
        $actor = $request->user();
        $data = $request->validate([
            'location_id' => ['nullable', 'integer'],
            'usage_date' => ['required', 'date', 'before_or_equal:today', 'after_or_equal:'.now()->subDays(7)->toDateString()],
            'note' => ['nullable', 'string', 'max:1000'],
        ], [
            'usage_date.before_or_equal' => 'Tanggal pemakaian tidak boleh di masa depan.',
            'usage_date.after_or_equal' => 'Pemakaian hanya bisa dicatat maksimal 7 hari ke belakang.',
        ]);
        $items = LineItems::validate($request);

        $fields = Location::whereIn('id', $actor->assignedLocationIds())->where('type', LocationType::Field->value)->get();
        $field = ! empty($data['location_id']) ? $fields->firstWhere('id', $data['location_id']) : ($fields->count() === 1 ? $fields->first() : null);
        if (! $field) {
            throw ValidationException::withMessages(['location_id' => [$fields->isEmpty() ? 'Akun Anda belum ditugaskan ke lapangan. Hubungi Admin.' : 'Pilih lapangan.']]);
        }
        LineItems::assertWarehouse($items, $field->parent_id);

        $usage = DB::transaction(function () use ($data, $items, $actor, $field) {
            $usage = Usage::create([
                'location_id' => $field->id,
                'usage_date' => $data['usage_date'],
                'note' => $data['note'] ?? null,
                'created_by' => $actor->id,
            ]);
            $usage->items()->createMany($items);
            foreach ($items as $i => $line) {
                StockService::move($field->id, $line['item_id'], -$line['quantity'], MovementType::Usage,
                    $data['usage_date'], $usage, $actor, $line['note'], "items.{$i}.quantity");
            }
            $usage->addLog($actor, 'created', ['items' => count($items)]);

            return $usage;
        });

        return response()->json(['data' => $this->present($usage->load(['location', 'creator', 'items.item']), $actor)], 201);
    }

    /** Batalkan salah input (hari yang sama). Saldo dikembalikan lewat mutasi pembalik. */
    public function cancel(Request $request, Usage $usage): JsonResponse
    {
        $actor = $request->user();

        DB::transaction(function () use ($usage, $actor) {
            $u = Usage::lockForUpdate()->findOrFail($usage->id);
            Gate::authorize('cancel', $u);
            foreach ($u->items as $line) {
                StockService::move($u->location_id, $line->item_id, $line->quantity, MovementType::UsageCancel,
                    $u->usage_date, $u, $actor, 'Pembatalan '.$u->number);
            }
            $u->update(['cancelled_at' => now(), 'cancelled_by' => $actor->id]);
            $u->addLog($actor, 'cancelled');
        });

        return response()->json(['data' => $this->present($usage->refresh()->load(['location', 'creator', 'canceller', 'items.item']), $actor)]);
    }

    private function present(Usage $u, User $actor, bool $full = false): array
    {
        return [
            'id' => $u->id,
            'number' => $u->number,
            'location' => $this->locationRef($u->location),
            'usage_date' => $u->usage_date->toDateString(),
            'note' => $u->note,
            'creator' => $this->userRef($u->creator),
            'cancelled_at' => $u->cancelled_at,
            'canceller' => $u->relationLoaded('canceller') ? $this->userRef($u->canceller) : null,
            'created_at' => $u->created_at,
            'items' => $u->items->map(fn ($l) => $this->line($l, ['quantity' => $l->quantity]))->values(),
            ...($full ? ['logs' => $this->logs($u)] : []),
            'can' => ['cancel' => $actor->can('cancel', $u)],
        ];
    }
}
