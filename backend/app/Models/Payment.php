<?php

namespace App\Models;

use App\Enums\PaymentStatus;
use App\Models\Concerns\IsDocument;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Pembayaran tagihan vendor oleh Finance (Pak Fauzan). */
class Payment extends Model
{
    use IsDocument;

    public const NUMBER_PREFIX = 'PAY';

    public const METHODS = ['transfer' => 'Transfer Bank', 'tunai' => 'Tunai', 'lainnya' => 'Lainnya'];

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'status' => PaymentStatus::class,
            'invoice_date' => 'date',
            'invoice_amount' => 'float',
            'paid_date' => 'date',
            'paid_at' => 'datetime',
        ];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function preparer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'prepared_by');
    }

    public function payer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'paid_by');
    }
}
