<?php

namespace App\Enums;

/**
 * Alur laporan: Draft (user) -> Operation -> Co-Admin -> Selesai.
 */
enum StockStatus: string
{
    case Draft = 'draft';
    case PendingOperation = 'pending_operation';
    case PendingCoAdmin = 'pending_coadmin';
    case Completed = 'completed';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::PendingOperation => 'Menunggu Operation',
            self::PendingCoAdmin => 'Menunggu Co-Admin',
            self::Completed => 'Selesai',
        };
    }

    /** Status berikutnya saat "kirim", atau null jika tidak ada. */
    public function next(): ?self
    {
        return match ($this) {
            self::Draft => self::PendingOperation,
            self::PendingOperation => self::PendingCoAdmin,
            default => null,
        };
    }

    /** Label tombol kirim pada status ini. */
    public function submitLabel(): ?string
    {
        return match ($this) {
            self::Draft => 'Kirim ke Operation',
            self::PendingOperation => 'Kirim ke Co-Admin',
            default => null,
        };
    }
}
