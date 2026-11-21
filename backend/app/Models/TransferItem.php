<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TransferItem extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['quantity_sent' => 'float', 'quantity_received' => 'float', 'stock_before' => 'float', 'stock_after' => 'float', 'shortage_resolved_at' => 'datetime'];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(Item::class);
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'shortage_resolved_by');
    }

    /** Jumlah yang belum sampai di lapangan. */
    public function outstanding(): float
    {
        return $this->quantity_received === null ? 0.0 : max(0.0, round($this->quantity_sent - $this->quantity_received, 3));
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Transfer::class, 'transfer_id');
    }
}
