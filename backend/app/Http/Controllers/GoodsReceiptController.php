<?php

namespace App\Http\Controllers;

use App\Enums\Role;
use App\Http\Controllers\Concerns\PresentsDocuments;
use App\Models\GoodsReceipt;
use App\Models\User;
use App\Support\DocumentExport;
use App\Support\Fmt;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Rekap penerimaan barang dari vendor di gudang (satu dokumen per surat jalan).
 * Dicatat Logistic lewat PO; dilihat Logistic (gudangnya) dan Admin/Purchasing/Finance (semua).
 */
class GoodsReceiptController extends Controller
{
    use PresentsDocuments;

    public function index(Request $request): JsonResponse
    {
        $receipts = $this->filtered($request)->withCount('items')->paginate(15);

        return response()->json($this->paginated($receipts, fn ($r) => $this->present($r, false)));
    }

    public function show(Request $request, GoodsReceipt $goodsReceipt): JsonResponse
    {
        $this->authorizeView($request->user(), $goodsReceipt);

        return response()->json(['data' => $this->present($this->load($goodsReceipt))]);
    }

    public function export(Request $request, GoodsReceipt $goodsReceipt, string $format)
    {
        $this->authorizeView($request->user(), $goodsReceipt);
        $this->exportFormat($format);
        $r = $this->load($goodsReceipt);

        $doc = (new DocumentExport('Laporan Penerimaan Barang dari Vendor', "penerimaan-{$r->number}"))
            ->meta('Nomor', $r->number)
            ->meta('Surat jalan', $r->delivery_note_number)
            ->meta('PO', $r->purchaseOrder->number)
            ->meta('Vendor', $r->purchaseOrder->vendor?->name)
            ->meta('Gudang', $r->warehouse->name)
            ->meta('Tanggal terima', Fmt::date($r->received_date))
            ->meta('Diterima oleh', $r->receiver?->name)
            ->meta('Catatan', $r->note)
            ->table('Rincian barang', $this->lineColumns(), $r->items->values()->map(fn ($l, $i) => $this->lineRow($l, $i))->all());

        return $doc->download($format, $request->user());
    }

    public function exportRecap(Request $request, string $format)
    {
        $this->exportFormat($format);
        $f = $this->dateFilters($request);
        $receipts = $this->filtered($request)->with('items.item')->limit(500)->get();

        $doc = (new DocumentExport('Rekap Penerimaan Barang dari Vendor', 'rekap-penerimaan-vendor-'.($f['date_from'] ?? 'semua').'-'.($f['date_to'] ?? 'semua')))
            ->meta('Periode', $this->periodLabel($f))
            ->meta('Jumlah penerimaan', $receipts->count())
            ->table('Ringkasan per penerimaan', [
                ['label' => 'No', 'type' => 'int'], ['label' => 'Nomor'], ['label' => 'Tgl Terima'], ['label' => 'Gudang'],
                ['label' => 'Surat Jalan'], ['label' => 'PO'], ['label' => 'Vendor'], ['label' => 'Jml Barang', 'type' => 'int'], ['label' => 'Diterima oleh'],
            ], $receipts->values()->map(fn ($r, $i) => [
                $i + 1, $r->number, Fmt::date($r->received_date), $r->warehouse->name, $r->delivery_note_number,
                $r->purchaseOrder->number, $r->purchaseOrder->vendor?->name, $r->items->count(), $r->receiver?->name,
            ])->all());

        foreach ($receipts as $r) {
            $doc->table(
                "{$r->number} · ".Fmt::date($r->received_date)." · {$r->warehouse->name} · Surat jalan {$r->delivery_note_number} · {$r->purchaseOrder->number}",
                $this->lineColumns(),
                $r->items->values()->map(fn ($l, $i) => $this->lineRow($l, $i))->all(),
            );
        }

        return $doc->download($format, $request->user());
    }

    // ---------------------------------------------------------------------

    private function filtered(Request $request): Builder
    {
        $actor = $request->user();
        abort_unless($actor->role->isPrivileged() || $actor->hasRole(Role::Logistic), 403, 'Anda tidak punya akses ke penerimaan gudang.');
        $f = $this->dateFilters($request);
        $search = trim((string) ($f['search'] ?? ''));

        return GoodsReceipt::query()
            ->with(['warehouse:id,name,type', 'receiver:id,name', 'purchaseOrder:id,number,vendor_id', 'purchaseOrder.vendor:id,name'])
            ->when($actor->hasRole(Role::Logistic), fn ($q) => $q->whereIn('warehouse_id', $actor->assignedLocationIds()))
            ->when($f['date_from'] ?? null, fn ($q, $v) => $q->whereDate('received_date', '>=', $v))
            ->when($f['date_to'] ?? null, fn ($q, $v) => $q->whereDate('received_date', '<=', $v))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('number', 'ilike', "%{$search}%")
                ->orWhere('delivery_note_number', 'ilike', "%{$search}%")
                ->orWhereHas('purchaseOrder', fn ($p) => $p->where('number', 'ilike', "%{$search}%"))
                ->orWhereHas('items.item', fn ($i) => $i->where('name', 'ilike', "%{$search}%"))))
            ->orderByDesc('received_date')->orderByDesc('id');
    }

    private function authorizeView(User $actor, GoodsReceipt $r): void
    {
        abort_unless(
            $actor->role->isPrivileged() || ($actor->hasRole(Role::Logistic) && $actor->isAssignedTo($r->warehouse_id)),
            403,
            'Anda tidak punya akses ke penerimaan ini.',
        );
    }

    private function lineColumns(): array
    {
        return [
            ['label' => 'No', 'type' => 'int'], ['label' => 'Nama Barang'], ['label' => 'Satuan'],
            ['label' => 'Stok Gudang Sebelum', 'type' => 'qty'], ['label' => 'Diterima', 'type' => 'qty'],
            ['label' => 'Stok Gudang Sesudah', 'type' => 'qty'], ['label' => 'Catatan'],
        ];
    }

    private function lineRow($l, int $i): array
    {
        return [$i + 1, $l->item->name, $l->item->unit, $l->stock_before, $l->quantity_received, $l->stock_after, $l->note];
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

    private function load(GoodsReceipt $r): GoodsReceipt
    {
        return $r->load(['items.item', 'warehouse', 'receiver:id,name', 'purchaseOrder:id,number,vendor_id', 'purchaseOrder.vendor:id,name', 'logs.user']);
    }

    private function present(GoodsReceipt $r, bool $full = true): array
    {
        return [
            'id' => $r->id,
            'number' => $r->number,
            'delivery_note_number' => $r->delivery_note_number,
            'received_date' => $r->received_date->toDateString(),
            'note' => $r->note,
            'warehouse' => $this->locationRef($r->warehouse),
            'purchase_order' => $r->purchaseOrder?->only(['id', 'number']),
            'vendor' => $r->purchaseOrder?->vendor?->only(['id', 'name']),
            'receiver' => $this->userRef($r->receiver),
            'created_at' => $r->created_at,
            'items_count' => $r->items_count ?? $r->items->count(),
            ...($full ? [
                'items' => $r->items->map(fn ($l) => $this->line($l, [
                    'quantity_received' => $l->quantity_received,
                    'stock_before' => $l->stock_before,
                    'stock_after' => $l->stock_after,
                ]))->values(),
                'logs' => $this->logs($r),
            ] : []),
        ];
    }
}
