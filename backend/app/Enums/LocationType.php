<?php

namespace App\Enums;

enum LocationType: string
{
    case Warehouse = 'warehouse';
    case Field = 'field';

    public function label(): string
    {
        return match ($this) {
            self::Warehouse => 'Gudang',
            self::Field => 'Lapangan',
        };
    }
}
