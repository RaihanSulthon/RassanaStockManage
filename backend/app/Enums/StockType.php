<?php

namespace App\Enums;

enum StockType: string
{
    case Bahan = 'bahan';
    case Barang = 'barang';

    public function label(): string
    {
        return match ($this) {
            self::Bahan => 'Stok Bahan',
            self::Barang => 'Stok Barang',
        };
    }
}
