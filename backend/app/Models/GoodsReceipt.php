<?php

namespace App\Models;

use App\Models\Concerns\IsDocument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Penerimaan barang vendor di gudang (satu per surat jalan). */
class GoodsReceipt extends Model
{
    use IsDocument;

    public const NUMBER_PREFIX = 'GR';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['received_date' => 'date'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(GoodsReceiptItem::class)->orderBy('id');
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'warehouse_id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}
