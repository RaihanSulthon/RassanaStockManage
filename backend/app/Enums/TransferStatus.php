<?php

namespace App\Enums;

enum TransferStatus: string
{
    case Sent = 'sent';
    case Received = 'received';

    public function label(): string
    {
        return match ($this) {
            self::Sent => 'Dalam Pengiriman',
            self::Received => 'Diterima Lapangan',
        };
    }
}
