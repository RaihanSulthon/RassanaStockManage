<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Vendor extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    /** Gudang yang dilayani vendor ini. */
    public function warehouses(): BelongsToMany
    {
        return $this->belongsToMany(Location::class, 'vendor_warehouse', 'vendor_id', 'warehouse_id')->orderBy('name');
    }

    public function purchaseOrders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class);
    }
}
