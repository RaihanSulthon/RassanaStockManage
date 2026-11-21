<?php

namespace App\Http\Controllers;

use App\Enums\LocationType;
use App\Enums\MovementType;
use App\Enums\Role;
use App\Enums\TransferStatus;
use App\Http\Controllers\Concerns\PresentsDocuments;
use App\Models\Location;
use App\Models\Transfer;
use App\Models\TransferItem;
use App\Models\User;
use App\Models\UserRequest;
use App\Support\DocumentExport;
use App\Support\Fmt;
use App\Support\LineItems;
use App\Support\Notifier;
use App\Support\StockService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Pengiriman gudang -> lapangan.
 *  1. Logistic mengirim: stok gudang berkurang sebanyak yang DIKIRIM (stok sebelum/sesudah dicatat).
 *  2. Operation1 / User mencatat jumlah DITERIMA (tidak boleh melebihi yang dikirim): stok lapangan bertambah.
 *  3. Selisih kurang -> Logistic menindaklanjuti: hilang / belum terkirim (kembali ke gudang) / tertinggal di perjalanan.
 *  4. Barang tertinggal yang akhirnya sampai dicatat lapangan sebagai terima susulan.
 */
class TransferController extends Controller
{
    use PresentsDocuments;

    public const RESOLUTIONS = [
        'lost' => 'Hilang',
        'returned' => 'Belum terkirim (kembali ke stok gudang)',
        'in_transit' => 'Tertinggal di perjalanan (menyusul)',
    ];

    public const SHORTAGE_LABELS = [
        'open' => 'Menunggu tindak lanjut Logistic',
        'in_transit' => 'Tertinggal di perjalanan, menunggu barang susulan',
        'lost' => 'Hilang',
        'returned' => 'Belum terkirim, dikembalikan ke stok gudang',
        'arrived' => 'Susulan sudah diterima lengkap',
    ];

    public function index(Request $request): JsonResponse
    {
        $transfers = $this->filtered($request)->withCount('items')->paginate(15);
        $actor = $request->user();

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
        LineItems::assertWarehouse($items, $from->id);
        if (! empty($data['user_request_id'])) {
            $ur = UserRequest::find($data['user_request_id']);
            if (! $ur || ! $actor->can('process', $ur) || $ur->field_id !== $to->id) {
                throw ValidationException::withMessages(['user_request_id' => ['UR tidak sesuai dengan lapangan tujuan.']]);
            }
        }

        $transfer = DB::transaction(function () use ($data, $items, $actor, $from, $to) {
            $t = Transfer::create([...$data, 'status' => TransferStatus::Sent, 'sent_by' => $actor->id]);

            foreach ($items as $i => $line) {
                $after = StockService::move($from->id, $line['item_id'], -$line['quantity_sent'], MovementType::TransferOut,
                    $data['transfer_date'], $t, $actor, "Kirim ke {$to->name}", "items.{$i}.quantity_sent");
                $t->items()->create([...$line, 'stock_before' => round($after + $line['quantity_sent'], 3), 'stock_after' => $after]);
            }
            $t->addLog($actor, 'sent', ['to' => $to->name, 'items' => count($items)]);
            $t->userRequest?->addLog($actor, 'transfer_sent', ['transfer' => $t->number]);

            $this->notifyField($t, "Barang dikirim: {$t->number}",
                "Gudang {$from->name} mengirim ".count($items).' barang. Hitung barang yang datang lalu catat penerimaannya.');

            return $t;
        });

        return response()->json(['data' => $this->present($this->load($transfer), $actor)], 201);
    }

    /** Operation1 / User mencatat jumlah aktual yang diterima di lapangan. */
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

            $shortages = [];
            foreach ($lines as $line) {
                $qty = round((float) $given[$line->id]['quantity_received'], 3);
                if ($qty > $line->quantity_sent + 0.0005) {
                    $i = $given->keys()->search($line->id);
                    throw ValidationException::withMessages(["items.{$i}.quantity_received" => [
                        "{$line->item->name}: jumlah diterima tidak boleh melebihi yang dikirim (".Fmt::qty($line->quantity_sent).' '.$line->item->unit.').',
                    ]]);
                }
                $short = round($line->quantity_sent - $qty, 3);
                $line->update(['quantity_received' => $qty, 'shortage_status' => $short > 0.0005 ? 'open' : null]);
                StockService::move($t->to_location_id, $line->item_id, $qty, MovementType::TransferIn,
                    now()->toDateString(), $t, $actor, "Terima dari {$t->from->name}");
                if ($short > 0.0005) {
                    $shortages[] = "{$line->item->name}: dikirim ".Fmt::qty($line->quantity_sent).', diterima '.Fmt::qty($qty).', selisih '.Fmt::qty($short)." {$line->item->unit}";
                }
            }

            $t->update(['received_by' => $actor->id, 'received_at' => now(), 'received_note' => $data['note'] ?? null]);
            $this->refreshStatus($t);
            $t->addLog($actor, 'received', ['diffs' => $shortages]);

            $this->notifyLogistic($t, $shortages ? "Selisih kiriman: {$t->number}" : "Kiriman diterima: {$t->number}",
                $shortages
                    ? "{$t->to->name} menerima kurang dari yang dikirim. Perlu tindak lanjut: ".implode('; ', $shortages)
                    : "{$t->to->name} menerima semua barang sesuai kiriman.");
        });

        return response()->json(['data' => $this->present($this->load($transfer->refresh()), $actor)]);
    }

    /** Logistic menindaklanjuti selisih: hilang / belum terkirim (kembali ke gudang) / tertinggal di perjalanan. */
    public function resolve(Request $request, Transfer $transfer): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['required', 'integer', 'distinct'],
            'items.*.resolution' => ['required', Rule::in(array_keys(self::RESOLUTIONS))],
            'items.*.note' => ['nullable', 'string', 'max:255'],
        ], [
            'items.*.resolution.required' => 'Pilih tindak lanjut.',
        ]);

        DB::transaction(function () use ($transfer, $actor, $data) {
            $t = Transfer::lockForUpdate()->findOrFail($transfer->id);
            Gate::authorize('resolve', $t);
            $lines = $t->items()->with('item')->where('shortage_status', 'open')->get()->keyBy('id');
            $summary = [];
            $inTransit = [];

            foreach ($data['items'] as $i => $row) {
                $line = $lines->get($row['id']);
                if (! $line) {
                    throw ValidationException::withMessages(["items.{$i}.id" => ['Barang ini tidak punya selisih yang perlu ditindaklanjuti.']]);
                }
                $qty = $line->outstanding();
                if ($row['resolution'] === 'returned') {
                    StockService::move($t->from_location_id, $line->item_id, $qty, MovementType::TransferReturn,
                        now()->toDateString(), $t, $actor, "Selisih kiriman ke {$t->to->name} kembali ke gudang");
                }
                if ($row['resolution'] === 'in_transit') {
                    $inTransit[] = "{$line->item->name} ".Fmt::qty($qty)." {$line->item->unit}";
                }
                $line->update([
                    'shortage_status' => $row['resolution'],
                    'shortage_note' => $row['note'] ?? null,
                    'shortage_resolved_by' => $actor->id,
                    'shortage_resolved_at' => now(),
                ]);
                $summary[] = "{$line->item->name} ".Fmt::qty($qty)." {$line->item->unit}: ".self::RESOLUTIONS[$row['resolution']];
            }

            $this->refreshStatus($t);
            $t->addLog($actor, 'shortage_resolved', ['diffs' => $summary]);

            if ($inTransit) {
                $this->notifyField($t, "Barang susulan: {$t->number}",
                    'Barang berikut tertinggal di perjalanan dan akan menyusul. Catat terima susulan saat barang sampai: '.implode('; ', $inTransit));
            }
        });

        return response()->json(['data' => $this->present($this->load($transfer->refresh()), $actor)]);
    }

    /** Lapangan mencatat barang susulan (selisih yang ditandai "tertinggal di perjalanan"). */
    public function receiveLate(Request $request, Transfer $transfer): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['required', 'integer', 'distinct'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0', 'max:99999999'],
        ], ['items.*.quantity.gt' => 'Jumlah harus lebih dari 0.']);

        DB::transaction(function () use ($transfer, $actor, $data) {
            $t = Transfer::lockForUpdate()->findOrFail($transfer->id);
            Gate::authorize('receiveLate', $t);
            $lines = $t->items()->with('item')->where('shortage_status', 'in_transit')->get()->keyBy('id');
            $summary = [];

            foreach ($data['items'] as $i => $row) {
                $line = $lines->get($row['id']);
                if (! $line) {
                    throw ValidationException::withMessages(["items.{$i}.id" => ['Barang ini tidak sedang menunggu susulan.']]);
                }
                $qty = round((float) $row['quantity'], 3);
                $outstanding = $line->outstanding();
                if ($qty > $outstanding + 0.0005) {
                    throw ValidationException::withMessages(["items.{$i}.quantity" => [
                        "Maksimal ".Fmt::qty($outstanding)." {$line->item->unit} (sisa yang belum sampai).",
                    ]]);
                }
                $received = round($line->quantity_received + $qty, 3);
                $line->update([
                    'quantity_received' => $received,
                    // Lengkap -> selesai; masih kurang -> kembali ke Logistic untuk ditindaklanjuti.
                    'shortage_status' => $received + 0.0005 >= $line->quantity_sent ? 'arrived' : 'open',
                ]);
                StockService::move($t->to_location_id, $line->item_id, $qty, MovementType::TransferIn,
                    now()->toDateString(), $t, $actor, "Terima susulan dari {$t->from->name}");
                $summary[] = "{$line->item->name} +".Fmt::qty($qty)." {$line->item->unit}";
            }

            $this->refreshStatus($t);
            $t->addLog($actor, 'received_late', ['diffs' => $summary]);
            $this->notifyLogistic($t, "Barang susulan diterima: {$t->number}", "{$t->to->name} menerima susulan: ".implode('; ', $summary));
        });

        return response()->json(['data' => $this->present($this->load($transfer->refresh()), $actor)]);
    }

    /** Dokumen satu pengiriman (PDF/Excel). */
    public function export(Request $request, Transfer $transfer, string $format)
    {
        Gate::authorize('export', $transfer);
        $this->exportFormat($format);
        $t = $this->load($transfer);
        $showStock = ! $request->user()->role->isFieldRole();

        $doc = (new DocumentExport('Laporan Pengiriman Barang', "pengiriman-{$t->number}"));
        $this->documentMeta($doc, $t);
        $doc->table('Rincian barang', $this->lineColumns($showStock), $t->items->values()->map(fn ($l, $i) => $this->lineRow($l, $i, $showStock))->all());

        return $doc->download($format, $request->user());
    }

    /** Rekap pengiriman (per dokumen) untuk filter yang sama dengan daftar. */
    public function exportRecap(Request $request, string $format)
    {
        $this->exportFormat($format);
        $f = $this->dateFilters($request);
        $transfers = $this->filtered($request)->with(['items.item', 'items.resolver:id,name'])->limit(500)->get();
        $showStock = ! $request->user()->role->isFieldRole();

        $doc = (new DocumentExport('Rekap Pengiriman Gudang ke Lapangan', 'rekap-pengiriman-'.($f['date_from'] ?? 'semua').'-'.($f['date_to'] ?? 'semua')))
            ->meta('Periode', $this->periodLabel($f))
            ->meta('Status', TransferStatus::tryFrom($f['status'] ?? '')?->label() ?? 'Semua')
            ->meta('Jumlah pengiriman', $transfers->count())
            ->table('Ringkasan per pengiriman', [
                ['label' => 'No', 'type' => 'int'], ['label' => 'Nomor'], ['label' => 'Tgl Kirim'], ['label' => 'Dari Gudang'],
                ['label' => 'Ke Lapangan'], ['label' => 'Jml Barang', 'type' => 'int'], ['label' => 'Barang Selisih', 'type' => 'int'],
                ['label' => 'Status'], ['label' => 'Dikirim oleh'], ['label' => 'Diterima oleh'], ['label' => 'Tgl Diterima'],
            ], $transfers->values()->map(fn ($t, $i) => [
                $i + 1, $t->number, Fmt::date($t->transfer_date), $t->from->name, $t->to->name, $t->items->count(),
                $t->items->filter(fn ($l) => $l->shortage_status !== null)->count(),
                $t->status->label(), $t->sender?->name, $t->receiver?->name, Fmt::datetime($t->received_at),
            ])->all());

        foreach ($transfers as $t) {
            $doc->table(
                "{$t->number} · ".Fmt::date($t->transfer_date)." · {$t->from->name} → {$t->to->name} · {$t->status->label()}",
                $this->lineColumns($showStock),
                $t->items->values()->map(fn ($l, $i) => $this->lineRow($l, $i, $showStock))->all(),
            );
        }

        return $doc->download($format, $request->user());
    }

    // ---------------------------------------------------------------------

    /** Query daftar sesuai role + filter (dipakai daftar dan rekap). */
    private function filtered(Request $request): Builder
    {
        $f = $this->dateFilters($request);
        $actor = $request->user();
        $search = trim((string) ($f['search'] ?? ''));

        $query = Transfer::query()
            ->with(['from:id,name,type', 'to:id,name,type', 'sender:id,name', 'receiver:id,name', 'userRequest:id,number']);

        match (true) {
            $actor->hasRole(Role::Logistic) => $query->whereIn('from_location_id', $actor->assignedLocationIds()),
            $actor->role->isFieldRole() => $query->whereIn('to_location_id', $actor->assignedLocationIds()),
            default => $query,
        };

        return $query
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['date_from'] ?? null, fn ($q, $v) => $q->whereDate('transfer_date', '>=', $v))
            ->when($f['date_to'] ?? null, fn ($q, $v) => $q->whereDate('transfer_date', '<=', $v))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('number', 'ilike', "%{$search}%")
                ->orWhereHas('items.item', fn ($i) => $i->where('name', 'ilike', "%{$search}%"))))
            ->orderByDesc('transfer_date')->orderByDesc('id');
    }

    /** Status mengikuti selisih yang masih terbuka. */
    private function refreshStatus(Transfer $t): void
    {
        $pending = $t->items()->whereIn('shortage_status', ['open', 'in_transit'])->exists();
        $t->update(['status' => $pending ? TransferStatus::Discrepancy : TransferStatus::Received]);
    }

    private function notifyField(Transfer $t, string $title, string $message): void
    {
        foreach ([Role::Operation1, Role::User] as $role) {
            Notifier::role($role, $title, $message, "/transfers/{$t->id}", $t->to_location_id);
        }
    }

    private function notifyLogistic(Transfer $t, string $title, string $message): void
    {
        Notifier::role(Role::Logistic, $title, $message, "/transfers/{$t->id}", $t->from_location_id);
    }

    private function documentMeta(DocumentExport $doc, Transfer $t): void
    {
        $doc->meta('Nomor', $t->number)
            ->meta('Status', $t->status->label())
            ->meta('Dari gudang', $t->from->name)
            ->meta('Ke lapangan', $t->to->name)
            ->meta('Tanggal kirim', Fmt::date($t->transfer_date))
            ->meta('Dikirim oleh', $t->sender?->name)
            ->meta('Diterima oleh', $t->receiver?->name)
            ->meta('Waktu diterima', Fmt::datetime($t->received_at))
            ->meta('UR', $t->userRequest?->number)
            ->meta('Catatan kirim', $t->note)
            ->meta('Catatan terima', $t->received_note);
    }

    private function lineColumns(bool $showStock): array
    {
        return [
            ['label' => 'No', 'type' => 'int'], ['label' => 'Nama Barang'], ['label' => 'Satuan'],
            ...($showStock ? [['label' => 'Stok Gudang Sebelum', 'type' => 'qty']] : []),
            ['label' => 'Dikirim', 'type' => 'qty'],
            ...($showStock ? [['label' => 'Stok Gudang Sesudah', 'type' => 'qty']] : []),
            ['label' => 'Diterima', 'type' => 'qty'], ['label' => 'Selisih', 'type' => 'qty'], ['label' => 'Tindak Lanjut Selisih'],
        ];
    }

    private function lineRow(TransferItem $l, int $i, bool $showStock): array
    {
        $diff = $l->quantity_received === null ? null : round($l->quantity_received - $l->quantity_sent, 3);
        $follow = $l->shortage_status ? self::SHORTAGE_LABELS[$l->shortage_status].($l->shortage_note ? " ({$l->shortage_note})" : '') : null;

        return [
            $i + 1, $l->item->name, $l->item->unit,
            ...($showStock ? [$l->stock_before] : []),
            $l->quantity_sent,
            ...($showStock ? [$l->stock_after] : []),
            $l->quantity_received, $diff, $follow,
        ];
    }

    private function periodLabel(array $f): string
    {
        $from = $f['date_from'] ?? null;
        $to = $f['date_to'] ?? null;

        return match (true) {
            ! $from && ! $to => 'Semua tanggal',
            $from === $to => Fmt::date($from),
            default => ($from ? Fmt::date($from) : '...').' s/d '.($to ? Fmt::date($to) : '...'),
        };
    }

    private function load(Transfer $t): Transfer
    {
        return $t->load(['items.item', 'items.resolver:id,name', 'from', 'to', 'sender:id,name', 'receiver:id,name', 'userRequest:id,number', 'logs.user']);
    }

    private function present(Transfer $t, User $actor, bool $full = true): array
    {
        $showStock = ! $actor->role->isFieldRole();

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
                    'outstanding' => $l->outstanding(),
                    ...($showStock ? ['stock_before' => $l->stock_before, 'stock_after' => $l->stock_after] : []),
                    'shortage_status' => $l->shortage_status,
                    'shortage_label' => $l->shortage_status ? self::SHORTAGE_LABELS[$l->shortage_status] : null,
                    'shortage_note' => $l->shortage_note,
                    'shortage_resolver' => $this->userRef($l->resolver),
                    'shortage_resolved_at' => $l->shortage_resolved_at,
                ]))->values(),
                'logs' => $this->logs($t),
            ] : []),
            'can' => [
                'receive' => $actor->can('receive', $t),
                'receive_late' => $full && $actor->can('receiveLate', $t),
                'resolve' => $full && $actor->can('resolve', $t),
                'export' => $actor->can('export', $t),
            ],
        ];
    }
}
