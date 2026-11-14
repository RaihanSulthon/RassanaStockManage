<?php

namespace App\Http\Controllers;

use App\Enums\PaymentStatus;
use App\Enums\Role;
use App\Http\Controllers\Concerns\PresentsDocuments;
use App\Models\Payment;
use App\Models\PurchaseOrder;
use App\Models\User;
use App\Support\DocumentExport;
use App\Support\Fmt;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Pak Fauzan: cek PO + surat jalan + penerimaan gudang -> siapkan pembayaran -> lakukan pembayaran.
 * Satu baris pembayaran = satu tagihan vendor (PO yang dikirim bertahap bisa punya beberapa tagihan).
 */
class PaymentController extends Controller
{
    use PresentsDocuments;

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->role->isPrivileged(), 403);
        $f = $this->dateFilters($request);
        $search = trim((string) ($f['search'] ?? ''));

        $payments = Payment::query()
            ->with(['purchaseOrder:id,number,vendor_id,total', 'purchaseOrder.vendor:id,name', 'preparer:id,name', 'payer:id,name'])
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['date_from'] ?? null, fn ($q, $v) => $q->whereDate('invoice_date', '>=', $v))
            ->when($f['date_to'] ?? null, fn ($q, $v) => $q->whereDate('invoice_date', '<=', $v))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('invoice_number', 'ilike', "%{$search}%")
                ->orWhere('number', 'ilike', "%{$search}%")
                ->orWhereHas('purchaseOrder', fn ($p) => $p->where('number', 'ilike', "%{$search}%"))
                ->orWhereHas('purchaseOrder.vendor', fn ($v) => $v->where('name', 'ilike', "%{$search}%"))))
            ->orderByDesc('id')
            ->paginate(15);

        return response()->json($this->paginated($payments, fn ($p) => static::presentRow($p, $request->user()) + [
            'purchase_order' => $p->purchaseOrder?->only(['id', 'number']),
            'vendor' => $p->purchaseOrder?->vendor?->only(['id', 'name']),
        ]));
    }

    /** Siapkan pembayaran: catat tagihan vendor untuk PO ini. */
    public function store(Request $request, PurchaseOrder $purchaseOrder): JsonResponse
    {
        Gate::authorize('pay', $purchaseOrder);
        $actor = $request->user();
        $data = $this->validated($request);

        $payment = DB::transaction(function () use ($purchaseOrder, $actor, $data) {
            $payment = $purchaseOrder->payments()->create([
                ...$data,
                'status' => PaymentStatus::Prepared,
                'prepared_by' => $actor->id,
            ]);
            $detail = ['payment' => $payment->number, 'invoice' => $payment->invoice_number, 'amount' => $payment->invoice_amount];
            $payment->addLog($actor, 'prepared', $detail);
            $purchaseOrder->addLog($actor, 'payment_prepared', $detail);

            return $payment;
        });

        return response()->json(['data' => static::presentRow($payment->load('preparer'), $actor)], 201);
    }

    public function update(Request $request, Payment $payment): JsonResponse
    {
        Gate::authorize('update', $payment);
        $payment->update($this->validated($request));
        $payment->addLog($request->user(), 'edited');

        return response()->json(['data' => static::presentRow($payment->load('preparer', 'payer'), $request->user())]);
    }

    /** Lakukan pembayaran. */
    public function pay(Request $request, Payment $payment): JsonResponse
    {
        $actor = $request->user();
        $data = $request->validate([
            'method' => ['required', Rule::in(array_keys(Payment::METHODS))],
            'paid_date' => ['required', 'date', 'before_or_equal:today'],
            'reference_number' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:1000'],
        ], ['method.required' => 'Pilih metode pembayaran.', 'paid_date.before_or_equal' => 'Tanggal bayar tidak boleh di masa depan.']);

        DB::transaction(function () use ($payment, $actor, $data) {
            $p = Payment::lockForUpdate()->findOrFail($payment->id);
            Gate::authorize('pay', $p);
            $p->update([
                ...$data,
                'note' => $data['note'] ?? $p->note,
                'status' => PaymentStatus::Paid,
                'paid_by' => $actor->id,
                'paid_at' => now(),
            ]);
            $detail = ['payment' => $p->number, 'invoice' => $p->invoice_number, 'amount' => $p->invoice_amount, 'method' => Payment::METHODS[$p->method]];
            $p->addLog($actor, 'paid', $detail);
            $p->purchaseOrder->addLog($actor, 'paid', $detail);

            Notifier::role(Role::Purchasing, "Pembayaran {$p->purchaseOrder->number}",
                "Tagihan {$p->invoice_number} sebesar ".Fmt::money($p->invoice_amount).' sudah dibayar.', "/po/{$p->purchase_order_id}");
        });

        return response()->json(['data' => static::presentRow($payment->refresh()->load('preparer', 'payer'), $actor)]);
    }

    public function destroy(Request $request, Payment $payment): JsonResponse
    {
        Gate::authorize('delete', $payment);
        $payment->purchaseOrder->addLog($request->user(), 'payment_deleted', ['payment' => $payment->number, 'invoice' => $payment->invoice_number]);
        $payment->logs()->delete();
        $payment->delete();

        return response()->json(['message' => 'Data pembayaran dihapus.']);
    }

    /** Bukti pembayaran: tagihan vs total PO vs nilai barang diterima. */
    public function export(Request $request, Payment $payment, string $format)
    {
        Gate::authorize('export', $payment);
        $this->exportFormat($format);
        $payment->load(['purchaseOrder.vendor', 'purchaseOrder.items.item', 'purchaseOrder.receipts', 'purchaseOrder.payments', 'preparer', 'payer']);
        $po = $payment->purchaseOrder;
        $received = $po->receivedValue();

        return (new DocumentExport('Bukti Pembayaran', $payment->number))
            ->meta('Nomor pembayaran', $payment->number)
            ->meta('Status', $payment->status->label())
            ->meta('Nomor PO', $po->number)
            ->meta('Vendor', $po->vendor->name)
            ->meta('No. tagihan vendor', $payment->invoice_number)
            ->meta('Tanggal tagihan', Fmt::date($payment->invoice_date))
            ->meta('Nominal tagihan', Fmt::money($payment->invoice_amount))
            ->meta('Total PO', Fmt::money($po->total))
            ->meta('Nilai barang diterima', Fmt::money($received))
            ->meta('Selisih tagihan vs barang diterima', Fmt::money(round($payment->invoice_amount - $received, 2)))
            ->meta('Surat jalan', $po->receipts->pluck('delivery_note_number')->implode(', '))
            ->meta('Metode', $payment->method ? Payment::METHODS[$payment->method] : '-')
            ->meta('Tanggal bayar', Fmt::date($payment->paid_date))
            ->meta('No. referensi', $payment->reference_number)
            ->meta('Disiapkan oleh', $payment->preparer?->name)
            ->meta('Dibayar oleh', $payment->payer?->name)
            ->meta('Catatan', $payment->note)
            ->table('Rincian barang PO', [
                ['label' => 'No', 'type' => 'int'], ['label' => 'Nama Barang'], ['label' => 'Satuan'],
                ['label' => 'Dipesan', 'type' => 'qty'], ['label' => 'Diterima', 'type' => 'qty'],
                ['label' => 'Harga Satuan', 'type' => 'money'], ['label' => 'Nilai Diterima', 'type' => 'money'],
            ], $po->items->values()->map(fn ($l, $i) => [
                $i + 1, $l->item->name, $l->item->unit, $l->quantity, $l->quantity_received, $l->unit_price,
                round($l->quantity_received * $l->unit_price, 2),
            ])->all(), [null, 'TOTAL', null, null, null, null, $received])
            ->download($format, $request->user());
    }

    // ---------------------------------------------------------------------

    private function validated(Request $request): array
    {
        return $request->validate([
            'invoice_number' => ['required', 'string', 'max:100'],
            'invoice_date' => ['required', 'date', 'before_or_equal:today'],
            'invoice_amount' => ['required', 'numeric', 'gt:0', 'max:9999999999999'],
            'note' => ['nullable', 'string', 'max:1000'],
        ], [
            'invoice_number.required' => 'Nomor tagihan vendor wajib diisi.',
            'invoice_amount.gt' => 'Nominal tagihan harus lebih dari 0.',
        ]);
    }

    public static function presentRow(Payment $p, User $actor): array
    {
        return [
            'id' => $p->id,
            'number' => $p->number,
            'purchase_order_id' => $p->purchase_order_id,
            'status' => $p->status->value,
            'status_label' => $p->status->label(),
            'invoice_number' => $p->invoice_number,
            'invoice_date' => $p->invoice_date->toDateString(),
            'invoice_amount' => $p->invoice_amount,
            'method' => $p->method,
            'method_label' => $p->method ? Payment::METHODS[$p->method] : null,
            'paid_date' => $p->paid_date?->toDateString(),
            'reference_number' => $p->reference_number,
            'note' => $p->note,
            'preparer' => $p->preparer?->only(['id', 'name']),
            'payer' => $p->payer?->only(['id', 'name']),
            'paid_at' => $p->paid_at,
            'can' => [
                'update' => $actor->can('update', $p),
                'pay' => $actor->can('pay', $p),
                'delete' => $actor->can('delete', $p),
                'export' => $actor->can('export', $p),
            ],
        ];
    }
}
