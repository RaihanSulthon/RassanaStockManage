<?php

namespace App\Models;

use App\Enums\LocationType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Location extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'type' => LocationType::class,
            'is_active' => 'boolean',
        ];
    }

    /** Gudang induk (untuk lapangan). */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    /** Lapangan di bawah gudang ini. */
    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('name');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class);
    }

    /** Barang & bahan milik gudang ini. */
    public function items(): HasMany
    {
        return $this->hasMany(Item::class, 'warehouse_id');
    }

    /** Vendor yang melayani gudang ini. */
    public function vendors(): BelongsToMany
    {
        return $this->belongsToMany(Vendor::class, 'vendor_warehouse', 'warehouse_id', 'vendor_id')->orderBy('name');
    }

    /** ID gudang untuk lokasi ini (gudang itu sendiri, atau gudang induk lapangan). */
    public function warehouseId(): ?int
    {
        return $this->type === LocationType::Warehouse ? $this->id : $this->parent_id;
    }

    public function isWarehouse(): bool
    {
        return $this->type === LocationType::Warehouse;
    }
}
