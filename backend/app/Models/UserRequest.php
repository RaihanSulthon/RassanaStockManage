<?php

namespace App\Models;

use App\Enums\RequestStatus;
use App\Models\Concerns\IsDocument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/** UR: permintaan barang dari lapangan (Pak Haryono) ke gudang (Pak Nurdin). */
class UserRequest extends Model
{
    use IsDocument;

    public const NUMBER_PREFIX = 'UR';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => RequestStatus::class,
            'needed_date' => 'date',
            'submitted_at' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(UserRequestItem::class)->orderBy('id');
    }

    public function field(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'field_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'warehouse_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function purchaseRequisition(): HasOne
    {
        return $this->hasOne(PurchaseRequisition::class);
    }

    public function transfers(): HasMany
    {
        return $this->hasMany(Transfer::class)->orderBy('id');
    }
}
