<?php

namespace App\Enums;

enum TransferStatus: string
{
    case Sent = 'sent';
    case Discrepancy = 'discrepancy';
    case Received = 'received';

    public function label(): string
    {
        return match ($this) {
            self::Sent => 'Dalam Pengiriman',
            self::Discrepancy => 'Ada Selisih',
            self::Received => 'Selesai',
        };
    }
}
