<?php

namespace App\Models;

use App\Enums\TransferStatus;
use App\Models\Concerns\IsDocument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Pengiriman barang dari gudang ke lapangan. */
class Transfer extends Model
{
    use IsDocument;

    public const NUMBER_PREFIX = 'TF';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => TransferStatus::class,
            'transfer_date' => 'date',
            'received_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(TransferItem::class)->orderBy('id');
    }

    public function from(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'from_location_id');
    }

    public function to(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'to_location_id');
    }

    public function userRequest(): BelongsTo
    {
        return $this->belongsTo(UserRequest::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}
