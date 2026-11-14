<?php

namespace App\Models;

use App\Enums\PaymentStatus;
use App\Enums\PoStatus;
use App\Models\Concerns\IsDocument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** PO: pesanan ke vendor, dibuat Purchasing (Pak Andi), disetujui Finance (Pak Fauzan). */
class PurchaseOrder extends Model
{
    use IsDocument;

    public const NUMBER_PREFIX = 'PO';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => PoStatus::class,
            'order_date' => 'date',
            'expected_date' => 'date',
            'total' => 'float',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
            'sent_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class)->orderBy('id');
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(GoodsReceipt::class)->orderBy('id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->orderBy('id');
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'warehouse_id');
    }

    public function purchaseRequisition(): BelongsTo
    {
        return $this->belongsTo(PurchaseRequisition::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /** Nilai barang yang sudah diterima (jumlah diterima x harga satuan PO). */
    public function receivedValue(): float
    {
        return round($this->items->sum(fn ($i) => $i->quantity_received * $i->unit_price), 2);
    }

    public function paidAmount(): float
    {
        return round($this->payments->where('status', PaymentStatus::Paid)->sum('invoice_amount'), 2);
    }
}
