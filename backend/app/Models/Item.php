<?php

namespace App\Models;

use App\Enums\ItemCategory;
use Illuminate\Database\Eloquent\Model;

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
}
