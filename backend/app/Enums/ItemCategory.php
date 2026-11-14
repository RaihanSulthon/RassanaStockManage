<?php

namespace App\Enums;

enum ItemCategory: string
{
    case Bahan = 'bahan';
    case Barang = 'barang';

    public function label(): string
    {
        return match ($this) {
            self::Bahan => 'Bahan',
            self::Barang => 'Barang',
        };
    }
}
