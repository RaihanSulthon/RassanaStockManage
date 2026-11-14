<?php

namespace App\Http\Controllers;

use App\Enums\LocationType;
use App\Enums\MovementType;
use App\Enums\Role;
use App\Enums\TransferStatus;
use App\Http\Controllers\Concerns\PresentsDocuments;
use App\Models\Location;
use App\Models\Transfer;
use App\Models\User;
use App\Models\UserRequest;
use App\Support\Fmt;
use App\Support\LineItems;
use App\Support\Notifier;
use App\Support\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/** Pak Nurdin kirim barang gudang -> lapangan; Pak Haryono mencatat penerimaan. */
class TransferController extends Controller
{
    use PresentsDocuments;

    public function index(Request $request): JsonResponse
    {
        $f = $this->dateFilters($request);
        $actor = $request->user();
        $search = trim((string) ($f['search'] ?? ''));

        $query = Transfer::query()
            ->with(['from:id,name,type', 'to:id,name,type', 'sender:id,name', 'receiver:id,name', 'userRequest:id,number'])
            ->withCount('items');

        match (true) {
            $actor->hasRole(Role::Operation1) => $query->whereIn('from_location_id', $actor->assignedLocationIds()),
            $actor->hasRole(Role::User) => $query->whereIn('to_location_id', $actor->assignedLocationIds()),
            default => $query,
        };

        $transfers = $query
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['date_from'] ?? null, fn ($q, $v) => $q->whereDate('transfer_date', '>=', $v))
            ->when($f['date_to'] ?? null, fn ($q, $v) => $q->whereDate('transfer_date', '<=', $v))
            ->when($search !== '', fn ($q) => $q->where('number', 'ilike', "%{$search}%"))
            ->orderByDesc('id')
            ->paginate(15);

        return response()->json($this->paginated($transfers, fn ($t) => $this->present($t, $actor, false)));
    }

    public function show(Request $request, Transfer $transfer): JsonResponse
    {
        Gate::authorize('view', $transfer);

        return response()->json(['data' => $this->present($this->load($transfer), $request->user())]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', Transfer::class);
        $actor = $request->user();
        $data = $request->validate([
            'from_location_id' => ['required', 'integer'],
            'to_location_id' => ['required', 'integer'],
            'user_request_id' => ['nullable', 'integer'],
            'transfer_date' => ['required', 'date', 'before_or_equal:today'],
            'note' => ['nullable', 'string', 'max:1000'],
        ], ['to_location_id.required' => 'Pilih lapangan tujuan.']);
        $items = LineItems::validate($request, [], 'quantity_sent');

        $from = Location::find($data['from_location_id']);
        $to = Location::find($data['to_location_id']);
        if (! $from || $from->type !== LocationType::Warehouse || ! $actor->isAssignedTo($from->id)) {
            throw ValidationException::withMessages(['from_location_id' => ['Pilih gudang Anda.']]);
        }
        if (! $to || $to->type !== LocationType::Field || $to->parent_id !== $from->id) {
            throw ValidationException::withMessages(['to_location_id' => ['Lapangan tujuan harus berada di bawah gudang asal.']]);
        }
        if (! empty($data['user_request_id'])) {
            $ur = UserRequest::find($data['user_request_id']);
            if (! $ur || ! $actor->can('process', $ur) || $ur->field_id !== $to->id) {
                throw ValidationException::withMessages(['user_request_id' => ['UR tidak sesuai dengan lapangan tujuan.']]);
            }
        }

        $transfer = DB::transaction(function () use ($data, $items, $actor, $from, $to) {
            $t = Transfer::create([...$data, 'status' => TransferStatus::Sent, 'sent_by' => $actor->id]);
            $t->items()->createMany($items);

            foreach ($items as $i => $line) {
                StockService::move($from->id, $line['item_id'], -$line['quantity_sent'], MovementType::TransferOut,
                    $data['transfer_date'], $t, $actor, "Kirim ke {$to->name}", "items.{$i}.quantity_sent");
            }
            $t->addLog($actor, 'sent', ['to' => $to->name, 'items' => count($items)]);
            $t->userRequest?->addLog($actor, 'transfer_sent', ['transfer' => $t->number]);

            Notifier::role(Role::User, "Barang dikirim: {$t->number}",
                "Gudang {$from->name} mengirim ".count($items).' barang. Catat penerimaannya setelah barang sampai.',
                "/transfers/{$t->id}", $to->id);

            return $t;
        });

        return response()->json(['data' => $this->present($this->load($transfer), $actor)], 201);
    }

    /** Pak Haryono mencatat jumlah aktual yang diterima di lapangan. */
    public function receive(Request $request, Transfer $transfer): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['required', 'integer', 'distinct'],
            'items.*.quantity_received' => ['required', 'numeric', 'min:0', 'max:99999999'],
        ], ['items.*.quantity_received.required' => 'Isi jumlah diterima (0 jika tidak ada).']);

        DB::transaction(function () use ($transfer, $actor, $data) {
            $t = Transfer::lockForUpdate()->findOrFail($transfer->id);
            Gate::authorize('receive', $t);
            $lines = $t->items()->with('item')->get()->keyBy('id');
            $given = collect($data['items'])->keyBy('id');

            if ($lines->keys()->diff($given->keys())->isNotEmpty()) {
                throw ValidationException::withMessages(['items' => ['Isi jumlah diterima untuk semua barang.']]);
            }

            $diffs = [];
            foreach ($lines as $line) {
                $qty = round((float) $given[$line->id]['quantity_received'], 3);
                $line->update(['quantity_received' => $qty]);
                StockService::move($t->to_location_id, $line->item_id, $qty, MovementType::TransferIn,
                    now()->toDateString(), $t, $actor, "Terima dari {$t->from->name}");
                $d = round($qty - $line->quantity_sent, 3);
                if (abs($d) > 0.0005) {
                    $diffs[] = "{$line->item->name}: dikirim ".Fmt::qty($line->quantity_sent).", diterima ".Fmt::qty($qty)." {$line->item->unit}";
                }
            }

            $t->update(['status' => TransferStatus::Received, 'received_by' => $actor->id, 'received_at' => now(), 'received_note' => $data['note'] ?? null]);
            $t->addLog($actor, 'received', ['diffs' => $diffs]);

            Notifier::users([$t->sender], "Barang diterima lapangan: {$t->number}",
                $diffs ? 'Ada selisih: '.implode('; ', $diffs) : "{$t->to->name} menerima semua barang sesuai kiriman.", "/transfers/{$t->id}");
        });

        return response()->json(['data' => $this->present($this->load($transfer->refresh()), $actor)]);
    }

    private function load(Transfer $t): Transfer
    {
        return $t->load(['items.item', 'from', 'to', 'sender:id,name', 'receiver:id,name', 'userRequest:id,number', 'logs.user']);
    }

    private function present(Transfer $t, User $actor, bool $full = true): array
    {
        return [
            'id' => $t->id,
            'number' => $t->number,
            'status' => $t->status->value,
            'status_label' => $t->status->label(),
            'from' => $this->locationRef($t->from),
            'to' => $this->locationRef($t->to),
            'user_request' => $t->userRequest?->only(['id', 'number']),
            'transfer_date' => $t->transfer_date->toDateString(),
            'note' => $t->note,
            'sender' => $this->userRef($t->sender),
            'receiver' => $this->userRef($t->receiver),
            'received_at' => $t->received_at,
            'received_note' => $t->received_note,
            'created_at' => $t->created_at,
            'items_count' => $t->items_count ?? $t->items->count(),
            ...($full ? [
                'items' => $t->items->map(fn ($l) => $this->line($l, [
                    'quantity_sent' => $l->quantity_sent,
                    'quantity_received' => $l->quantity_received,
                ]))->values(),
                'logs' => $this->logs($t),
            ] : []),
            'can' => ['receive' => $actor->can('receive', $t)],
        ];
    }
}
