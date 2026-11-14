<?php

namespace App\Enums;

enum PaymentStatus: string
{
    case Prepared = 'prepared';
    case Paid = 'paid';

    public function label(): string
    {
        return match ($this) {
            self::Prepared => 'Disiapkan',
            self::Paid => 'Dibayar',
        };
    }
}
