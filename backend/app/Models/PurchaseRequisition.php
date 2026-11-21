<?php

namespace App\Models;

use App\Enums\RequestStatus;
use App\Models\Concerns\IsDocument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/** PR: permintaan pembelian dari gudang (Logistic) ke Purchasing. */
class PurchaseRequisition extends Model
{
    use IsDocument;

    public const NUMBER_PREFIX = 'PR';

    public const PERIODS = ['harian' => 'Harian', 'mingguan' => 'Mingguan', 'bulanan' => 'Bulanan'];

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
        return $this->hasMany(PurchaseRequisitionItem::class)->orderBy('id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'warehouse_id');
    }

    public function userRequest(): BelongsTo
    {
        return $this->belongsTo(UserRequest::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function purchaseOrder(): HasOne
    {
        return $this->hasOne(PurchaseOrder::class);
    }
}
