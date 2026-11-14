<?php

namespace App\Models;

use App\Models\Concerns\IsDocument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Pemakaian harian di lapangan. */
class Usage extends Model
{
    use IsDocument;

    public const NUMBER_PREFIX = 'PK';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'usage_date' => 'date',
            'cancelled_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(UsageItem::class)->orderBy('id');
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function canceller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }
}
