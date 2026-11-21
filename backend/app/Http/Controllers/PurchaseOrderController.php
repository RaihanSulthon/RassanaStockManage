<?php

namespace App\Http\Controllers;

use App\Enums\MovementType;
use App\Enums\PoStatus;
use App\Enums\RequestStatus;
use App\Enums\Role;
use App\Http\Controllers\Concerns\PresentsDocuments;
use App\Models\GoodsReceipt;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequisition;
use App\Models\User;
use App\Models\Vendor;
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

/**
 * PO: Purchasing membuat dari PR + menentukan harga -> Finance approve/tolak (revisi)
 * -> Purchasing kirim ke vendor -> Logistic mencatat penerimaan di gudang (bisa bertahap).
 */
class PurchaseOrderController extends Controller
{
    use PresentsDocuments;

    public function index(Request $request): JsonResponse
    {
        $f = $this->dateFilters($request);
        $request->validate(['vendor_id' => ['nullable', 'integer']]);
        $actor = $request->user();
        $search = trim((string) ($f['search'] ?? ''));

        $query = PurchaseOrder::query()
            ->with(['vendor:id,name', 'warehouse:id,name,type', 'creator:id,name', 'purchaseRequisition:id,number'])
            ->withCount('items');

        match (true) {
            $actor->hasRole(Role::Logistic) => $query->whereIn('warehouse_id', $actor->assignedLocationIds())
                ->whereNotIn('status', [PoStatus::Draft->value, PoStatus::PendingApproval->value, PoStatus::Revision->value]),
            $actor->hasRole(Role::Purchasing) => $query,
            default => $query->where('status', '!=', PoStatus::Draft->value),
        };

        $pos = $query
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($request->query('vendor_id'), fn ($q, $v) => $q->where('vendor_id', $v))
            ->when($f['date_from'] ?? null, fn ($q, $v) => $q->whereDate('order_date', '>=', $v))
            ->when($f['date_to'] ?? null, fn ($q, $v) => $q->whereDate('order_date', '<=', $v))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('number', 'ilike', "%{$search}%")
                ->orWhereHas('vendor', fn ($v) => $v->where('name', 'ilike', "%{$search}%"))))
            ->orderByDesc('id')
            ->paginate(15);

        return response()->json($this->paginated($pos, fn ($po) => $this->present($po, $actor, false)));
    }

    public function show(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        Gate::authorize('view', $purchaseOrder);

        return response()->json(['data' => $this->present($this->load($purchaseOrder), $request->user())]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', PurchaseOrder::class);
        $actor = $request->user();
        $data = $this->validated($request);

        $request->validate(['purchase_requisition_id' => ['required', 'integer', 'exists:purchase_requisitions,id']]);
        $pr = PurchaseRequisition::with('purchaseOrder')->findOrFail($request->input('purchase_requisition_id'));
        if ($pr->status !== RequestStatus::Submitted || $pr->purchaseOrder) {
            throw ValidationException::withMessages(['purchase_requisition_id' => ['PR ini sudah dibuatkan PO atau belum dikirim.']]);
        }
        $this->assertWarehouse($data, $pr->warehouse_id);

        $po = DB::transaction(function () use ($data, $pr, $actor) {
            $po = PurchaseOrder::create([
                'purchase_requisition_id' => $pr->id,
                'vendor_id' => $data['vendor_id'],
                'warehouse_id' => $pr->warehouse_id,
                'order_date' => $data['order_date'],
                'expected_date' => $data['expected_date'] ?? null,
                'note' => $data['note'] ?? null,
                'status' => PoStatus::Draft,
                'total' => $this->total($data['items']),
                'created_by' => $actor->id,
            ]);
            $po->items()->createMany($this->lines($data['items']));
            $po->addLog($actor, 'created', ['from' => $pr->number]);

            $pr->update(['status' => RequestStatus::Processed, 'processed_at' => now()]);
            $pr->addLog($actor, 'processed', ['po' => $po->number]);

            return $po;
        });

        return response()->json(['data' => $this->present($this->load($po), $actor)], 201);
    }

    public function update(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $actor = $request->user();

        DB::transaction(function () use ($request, $purchaseOrder, $actor) {
            $po = PurchaseOrder::lockForUpdate()->findOrFail($purchaseOrder->id);
            Gate::authorize('update', $po);
            $data = $this->validated($request);
            $this->assertWarehouse($data, $po->warehouse_id, $po->vendor_id);

            $changes = LineItems::diff($po->items()->get(), $data['items']);
            if ((int) $data['vendor_id'] !== $po->vendor_id) {
                $changes[] = 'Vendor: '.$po->vendor->name.' → '.Vendor::find($data['vendor_id'])->name;
            }

            $po->update([
                'vendor_id' => $data['vendor_id'],
                'order_date' => $data['order_date'],
                'expected_date' => $data['expected_date'] ?? null,
                'note' => $data['note'] ?? null,
                'total' => $this->total($data['items']),
            ]);
            $po->items()->delete();
            $po->items()->createMany($this->lines($data['items']));
            if ($changes) {
                $po->addLog($actor, 'edited', ['changes' => $changes]);
            }
        });

        return response()->json(['data' => $this->present($this->load($purchaseOrder->refresh()), $actor)]);
    }

    /** Kirim Surat PO ke Finance untuk validasi & verifikasi. */
    public function submit(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $actor = $request->user();

        DB::transaction(function () use ($purchaseOrder, $actor) {
            $po = PurchaseOrder::lockForUpdate()->findOrFail($purchaseOrder->id);
            Gate::authorize('submit', $po);
            $resubmit = $po->status === PoStatus::Revision;

            $po->update(['status' => PoStatus::PendingApproval, 'submitted_at' => now()]);
            $po->addLog($actor, $resubmit ? 'resubmitted' : 'submitted', ['to' => 'finance']);

            Notifier::role(Role::Finance, ($resubmit ? 'Revisi PO: ' : 'PO perlu approval: ').$po->number,
                "{$actor->name} mengirim {$po->number} ke {$po->vendor->name} senilai ".Fmt::money($po->total).'.', "/po/{$po->id}");
        });

        return response()->json(['data' => $this->present($this->load($purchaseOrder->refresh()), $actor)]);
    }

    public function approve(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $actor = $request->user();

        DB::transaction(function () use ($purchaseOrder, $actor) {
            $po = PurchaseOrder::lockForUpdate()->findOrFail($purchaseOrder->id);
            Gate::authorize('approve', $po);

            $po->update(['status' => PoStatus::Approved, 'approved_by' => $actor->id, 'approved_at' => now(), 'revision_note' => null]);
            $po->addLog($actor, 'approved');

            // Notifikasi ke Purchasing (PO valid) dan Logistic gudang (PO sudah dibuat dari PR-nya).
            Notifier::users([$po->creator], "PO disetujui: {$po->number}",
                'PO sudah valid dan dapat dikirim ke vendor.', "/po/{$po->id}");
            Notifier::role(Role::Logistic, "PO dibuat dari {$po->purchaseRequisition->number}",
                "PO {$po->number} ke {$po->vendor->name} sudah disetujui. Barang akan dikirim vendor ke gudang.",
                "/po/{$po->id}", $po->warehouse_id);
        });

        return response()->json(['data' => $this->present($this->load($purchaseOrder->refresh()), $actor)]);
    }

    public function reject(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate(['note' => ['required', 'string', 'max:1000']], ['note.required' => 'Tuliskan alasan / hal yang perlu direvisi.']);

        DB::transaction(function () use ($purchaseOrder, $actor, $data) {
            $po = PurchaseOrder::lockForUpdate()->findOrFail($purchaseOrder->id);
            Gate::authorize('approve', $po);

            $po->update(['status' => PoStatus::Revision, 'revision_note' => $data['note']]);
            $po->addLog($actor, 'rejected', ['note' => $data['note']]);

            Notifier::users([$po->creator], "PO perlu revisi: {$po->number}", $data['note'], "/po/{$po->id}");
        });

        return response()->json(['data' => $this->present($this->load($purchaseOrder->refresh()), $actor)]);
    }

    /** Purchasing menandai PO sudah dikirim ke vendor (proses vendor di luar sistem). */
    public function send(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $actor = $request->user();

        DB::transaction(function () use ($purchaseOrder, $actor) {
            $po = PurchaseOrder::lockForUpdate()->findOrFail($purchaseOrder->id);
            Gate::authorize('send', $po);

            $po->update(['status' => PoStatus::Sent, 'sent_at' => now()]);
            $po->addLog($actor, 'sent_to_vendor');

            Notifier::role(Role::Logistic, "PO {$po->number} dikirim ke vendor",
                "Siapkan penerimaan barang dari {$po->vendor->name} di gudang {$po->warehouse->name}.",
                "/po/{$po->id}", $po->warehouse_id);
        });

        return response()->json(['data' => $this->present($this->load($purchaseOrder->refresh()), $actor)]);
    }

    /** Logistic mencatat barang + surat jalan dari vendor (bisa bertahap), termasuk stok gudang sebelum/sesudah. */
    public function receive(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'delivery_note_number' => ['required', 'string', 'max:100'],
            'received_date' => ['required', 'date', 'before_or_equal:today'],
            'note' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.purchase_order_item_id' => ['required', 'integer', 'distinct'],
            'items.*.quantity_received' => ['required', 'numeric', 'min:0', 'max:99999999'],
            'items.*.note' => ['nullable', 'string', 'max:255'],
        ], [
            'delivery_note_number.required' => 'Nomor surat jalan wajib diisi.',
            'received_date.before_or_equal' => 'Tanggal terima tidak boleh di masa depan.',
            'items.*.quantity_received.required' => 'Isi jumlah diterima (0 jika tidak ada).',
        ]);

        $lines = array_values(array_filter($data['items'], fn ($l) => (float) $l['quantity_received'] > 0));
        if (! $lines) {
            throw ValidationException::withMessages(['items' => ['Isi jumlah diterima minimal untuk 1 barang.']]);
        }

        DB::transaction(function () use ($purchaseOrder, $actor, $data, $lines) {
            $po = PurchaseOrder::lockForUpdate()->findOrFail($purchaseOrder->id);
            Gate::authorize('receive', $po);
            $poItems = $po->items()->with('item')->get()->keyBy('id');

            $receipt = GoodsReceipt::create([
                'purchase_order_id' => $po->id,
                'warehouse_id' => $po->warehouse_id,
                'delivery_note_number' => trim($data['delivery_note_number']),
                'received_date' => $data['received_date'],
                'note' => $data['note'] ?? null,
                'received_by' => $actor->id,
            ]);

            $diffs = [];
            foreach ($lines as $i => $line) {
                $poItem = $poItems->get($line['purchase_order_item_id']);
                if (! $poItem) {
                    throw ValidationException::withMessages(["items.{$i}.purchase_order_item_id" => ['Barang tidak ada di PO ini.']]);
                }
                $qty = round((float) $line['quantity_received'], 3);

                $poItem->update(['quantity_received' => round($poItem->quantity_received + $qty, 3)]);

                $after = StockService::move($po->warehouse_id, $poItem->item_id, $qty, MovementType::VendorReceipt,
                    $data['received_date'], $receipt, $actor, "Surat jalan {$receipt->delivery_note_number} ({$po->number})");
                $receipt->items()->create([
                    'purchase_order_item_id' => $poItem->id,
                    'item_id' => $poItem->item_id,
                    'quantity_received' => $qty,
                    'stock_before' => round($after - $qty, 3),
                    'stock_after' => $after,
                    'note' => $line['note'] ?? null,
                ]);

                $remaining = round($poItem->quantity - $poItem->quantity_received, 3);
                if (abs($remaining) > 0.0005) {
                    $diffs[] = $poItem->item->name.': '.($remaining > 0
                        ? 'kurang '.Fmt::qty($remaining)
                        : 'lebih '.Fmt::qty(-$remaining)).' '.$poItem->item->unit;
                }
            }

            $complete = $po->items()->get()->every(fn ($i) => $i->quantity_received + 0.0005 >= $i->quantity);
            $po->update(['status' => $complete ? PoStatus::Received : PoStatus::PartiallyReceived]);

            $detail = ['receipt' => $receipt->number, 'delivery_note' => $receipt->delivery_note_number, 'diffs' => $diffs];
            $po->addLog($actor, 'received', $detail);
            $receipt->addLog($actor, 'created', $detail);

            $msg = "Gudang {$po->warehouse->name} menerima barang ({$receipt->delivery_note_number}). "
                .($complete ? 'PO sudah diterima lengkap.' : 'Masih ada selisih dengan PO.');
            Notifier::role(Role::Purchasing, "Barang diterima: {$po->number}", $msg, "/po/{$po->id}");
            Notifier::role(Role::Finance, "Barang diterima: {$po->number}", $msg, "/po/{$po->id}");
        });

        return response()->json(['data' => $this->present($this->load($purchaseOrder->refresh()), $actor)]);
    }

    public function close(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate(['note' => ['required', 'string', 'max:1000']], ['note.required' => 'Tuliskan alasan PO ditutup.']);

        DB::transaction(function () use ($purchaseOrder, $actor, $data) {
            $po = PurchaseOrder::lockForUpdate()->findOrFail($purchaseOrder->id);
            Gate::authorize('close', $po);
            $po->update(['status' => PoStatus::Closed, 'closed_at' => now(), 'closed_note' => $data['note']]);
            $po->addLog($actor, 'closed', ['note' => $data['note']]);
        });

        return response()->json(['data' => $this->present($this->load($purchaseOrder->refresh()), $actor)]);
    }

    public function destroy(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        Gate::authorize('delete', $purchaseOrder);

        DB::transaction(function () use ($purchaseOrder, $request) {
            $pr = $purchaseOrder->purchaseRequisition;
            $purchaseOrder->logs()->delete();
            $purchaseOrder->delete();
            // PR kembali menunggu PO.
            $pr->update(['status' => RequestStatus::Submitted, 'processed_at' => null]);
            $pr->addLog($request->user(), 'po_deleted', ['po' => $purchaseOrder->number]);
        });

        return response()->json(['message' => 'PO dihapus.']);
    }

    public function export(Request $request, PurchaseOrder $purchaseOrder, string $format)
    {
        Gate::authorize('export', $purchaseOrder);
        $this->exportFormat($format);
        $po = $this->load($purchaseOrder);

        return (new DocumentExport('Purchase Order (PO)', $po->number))
            ->meta('Nomor PO', $po->number)
            ->meta('Status', $po->status->label())
            ->meta('Vendor', $po->vendor->name)
            ->meta('Kontak vendor', collect([$po->vendor->contact_person, $po->vendor->phone, $po->vendor->email])->filter()->implode(' · '))
            ->meta('Alamat vendor', $po->vendor->address)
            ->meta('Kirim ke', 'Gudang '.$po->warehouse->name.($po->warehouse->address ? ', '.$po->warehouse->address : ''))
            ->meta('Tanggal PO', Fmt::date($po->order_date))
            ->meta('Estimasi tiba', Fmt::date($po->expected_date))
            ->meta('Berdasarkan PR', $po->purchaseRequisition->number)
            ->meta('Dibuat oleh', $po->creator->name)
            ->meta('Disetujui oleh', $po->approver ? $po->approver->name.' ('.Fmt::datetime($po->approved_at).')' : '-')
            ->meta('Catatan', $po->note)
            ->table(null, [
                ['label' => 'No', 'type' => 'int'], ['label' => 'Nama Barang'], ['label' => 'Satuan'],
                ['label' => 'Jumlah', 'type' => 'qty'], ['label' => 'Harga Satuan', 'type' => 'money'],
                ['label' => 'Subtotal', 'type' => 'money'], ['label' => 'Catatan'],
            ], $po->items->values()->map(fn ($l, $i) => [
                $i + 1, $l->item->name, $l->item->unit, $l->quantity, $l->unit_price, $l->subtotal, $l->note,
            ])->all(), [null, 'TOTAL', null, null, null, $po->total, null])
            ->download($format, $request->user());
    }

    /** Riwayat penerimaan bertahap + selisih per barang terhadap PO. */
    public function exportReceipts(Request $request, PurchaseOrder $purchaseOrder, string $format)
    {
        Gate::authorize('exportReceipts', $purchaseOrder);
        $this->exportFormat($format);
        $po = $this->load($purchaseOrder);
        $prices = $request->user()->can('viewPrices', PurchaseOrder::class);

        $summaryCols = [
            ['label' => 'No', 'type' => 'int'], ['label' => 'Nama Barang'], ['label' => 'Satuan'],
            ['label' => 'Dipesan', 'type' => 'qty'], ['label' => 'Diterima', 'type' => 'qty'],
            ['label' => 'Selisih', 'type' => 'qty'], ['label' => 'Keterangan'],
        ];
        if ($prices) {
            array_push($summaryCols, ['label' => 'Harga Satuan', 'type' => 'money'], ['label' => 'Nilai Diterima', 'type' => 'money']);
        }

        $doc = (new DocumentExport('Riwayat Penerimaan Barang', "penerimaan-{$po->number}"))
            ->meta('Nomor PO', $po->number)
            ->meta('Status', $po->status->label())
            ->meta('Vendor', $po->vendor->name)
            ->meta('Gudang', $po->warehouse->name)
            ->meta('Jumlah penerimaan', $po->receipts->count().' kali')
            ->table('Ringkasan per barang', $summaryCols, $po->items->values()->map(function ($l, $i) use ($prices) {
                $diff = round($l->quantity_received - $l->quantity, 3);
                $row = [$i + 1, $l->item->name, $l->item->unit, $l->quantity, $l->quantity_received, $diff,
                    $diff < 0 ? 'Kurang' : ($diff > 0 ? 'Lebih' : 'Sesuai')];
                if ($prices) {
                    array_push($row, $l->unit_price, round($l->quantity_received * $l->unit_price, 2));
                }

                return $row;
            })->all());

        foreach ($po->receipts as $r) {
            $doc->table(
                "{$r->number} · Surat jalan {$r->delivery_note_number} · ".Fmt::date($r->received_date)." · diterima {$r->receiver->name}",
                [['label' => 'No', 'type' => 'int'], ['label' => 'Nama Barang'], ['label' => 'Satuan'], ['label' => 'Jumlah Diterima', 'type' => 'qty'], ['label' => 'Catatan']],
                $r->items->values()->map(fn ($l, $i) => [$i + 1, $l->item->name, $l->item->unit, $l->quantity_received, $l->note])->all(),
            );
        }

        return $doc->download($format, $request->user());
    }

    // ---------------------------------------------------------------------

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'vendor_id' => ['required', 'integer', Rule::exists('vendors', 'id')->where('is_active', true)],
            'order_date' => ['required', 'date'],
            'expected_date' => ['nullable', 'date', 'after_or_equal:order_date'],
            'note' => ['nullable', 'string', 'max:1000'],
        ], ['vendor_id.required' => 'Pilih vendor.', 'vendor_id.exists' => 'Vendor tidak ditemukan atau tidak aktif.']);
        $data['items'] = LineItems::validate($request, [
            'unit_price' => ['required', 'numeric', 'min:0', 'max:9999999999999'],
        ]);

        return $data;
    }

    /** Barang harus milik gudang PO dan vendor harus melayani gudang itu (vendor lama di PO tetap boleh). */
    private function assertWarehouse(array $data, int $warehouseId, ?int $currentVendorId = null): void
    {
        LineItems::assertWarehouse($data['items'], $warehouseId);

        $vendorId = (int) $data['vendor_id'];
        if ($vendorId !== $currentVendorId && ! DB::table('vendor_warehouse')->where(['vendor_id' => $vendorId, 'warehouse_id' => $warehouseId])->exists()) {
            throw ValidationException::withMessages(['vendor_id' => ['Vendor ini belum terdaftar untuk gudang tujuan PO. Tambahkan dulu di menu Gudang → Vendor.']]);
        }
    }

    private function lines(array $items): array
    {
        return array_map(fn ($l) => [
            'item_id' => $l['item_id'],
            'quantity' => $l['quantity'],
            'unit_price' => round((float) $l['unit_price'], 2),
            'subtotal' => round($l['quantity'] * (float) $l['unit_price'], 2),
            'note' => $l['note'],
        ], $items);
    }

    private function total(array $items): float
    {
        return round(array_sum(array_map(fn ($l) => $l['quantity'] * (float) $l['unit_price'], $items)), 2);
    }

    private function load(PurchaseOrder $po): PurchaseOrder
    {
        return $po->load(['items.item', 'vendor', 'warehouse', 'creator:id,name', 'approver:id,name',
            'purchaseRequisition.userRequest:id,number', 'receipts.items.item', 'receipts.receiver:id,name',
            'payments.preparer:id,name', 'payments.payer:id,name', 'logs.user']);
    }

    private function present(PurchaseOrder $po, User $actor, bool $full = true): array
    {
        $prices = $actor->can('viewPrices', PurchaseOrder::class);

        $data = [
            'id' => $po->id,
            'number' => $po->number,
            'status' => $po->status->value,
            'status_label' => $po->status->label(),
            'vendor' => $po->vendor?->only(['id', 'name']),
            'warehouse' => $this->locationRef($po->warehouse),
            'order_date' => $po->order_date->toDateString(),
            'expected_date' => $po->expected_date?->toDateString(),
            'note' => $po->note,
            'revision_note' => $po->revision_note,
            'closed_note' => $po->closed_note,
            'creator' => $this->userRef($po->creator),
            'items_count' => $po->items_count ?? $po->items->count(),
            'purchase_requisition' => $po->purchaseRequisition?->only(['id', 'number']),
            'submitted_at' => $po->submitted_at,
            'approved_at' => $po->approved_at,
            'sent_at' => $po->sent_at,
            'closed_at' => $po->closed_at,
            'created_at' => $po->created_at,
            ...($prices ? ['total' => $po->total] : []),
            'can' => [
                'update' => $actor->can('update', $po),
                'submit' => $actor->can('submit', $po),
                'delete' => $actor->can('delete', $po),
                'approve' => $actor->can('approve', $po),
                'send' => $actor->can('send', $po),
                'receive' => $actor->can('receive', $po),
                'close' => $actor->can('close', $po),
                'pay' => $full && $actor->can('pay', $po),
                'export' => $full && $actor->can('export', $po),
                'export_receipts' => $full && $actor->can('exportReceipts', $po),
                'view_prices' => $prices,
            ],
        ];

        if (! $full) {
            return $data;
        }

        $data['vendor'] = $po->vendor->only(['id', 'name', 'contact_person', 'phone', 'email', 'address']);
        $data['user_request'] = $po->purchaseRequisition?->userRequest?->only(['id', 'number']);
        $data['approver'] = $this->userRef($po->approver);
        $data['items'] = $po->items->map(fn ($l) => $this->line($l, [
            'quantity' => $l->quantity,
            'quantity_received' => $l->quantity_received,
            'remaining' => round($l->quantity - $l->quantity_received, 3),
            ...($prices ? ['unit_price' => $l->unit_price, 'subtotal' => $l->subtotal] : []),
        ]))->values();
        $data['receipts'] = $po->receipts->map(fn ($r) => [
            'id' => $r->id,
            'number' => $r->number,
            'delivery_note_number' => $r->delivery_note_number,
            'received_date' => $r->received_date->toDateString(),
            'note' => $r->note,
            'receiver' => $this->userRef($r->receiver),
            'created_at' => $r->created_at,
            'items' => $r->items->map(fn ($l) => $this->line($l, [
                'purchase_order_item_id' => $l->purchase_order_item_id,
                'quantity_received' => $l->quantity_received,
                'stock_before' => $l->stock_before,
                'stock_after' => $l->stock_after,
            ]))->values(),
        ])->values();
        $data['logs'] = $this->logs($po);

        if ($prices) {
            $data['summary'] = [
                'total' => $po->total,
                'received_value' => $po->receivedValue(),
                'invoice_total' => round($po->payments->sum('invoice_amount'), 2),
                'paid_total' => $po->paidAmount(),
            ];
            $data['payments'] = $po->payments->map(fn ($p) => PaymentController::presentRow($p, $actor))->values();
        }

        return $data;
    }
}
