<?php

namespace App\Models;

use App\Enums\ItemCategory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Item extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'category' => ItemCategory::class,
            'min_stock' => 'float',
            'max_stock' => 'float',
            'price' => 'float',
            'is_active' => 'boolean',
        ];
    }

    /** Gudang pemilik barang ini (min/max/harga berlaku untuk gudang ini). */
    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'warehouse_id');
    }
}
