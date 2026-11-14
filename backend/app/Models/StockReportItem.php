<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockReportItem extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['quantity' => 'float'];
    }

    public function report(): BelongsTo
    {
        return $this->belongsTo(StockReport::class, 'stock_report_id');
    }
}
