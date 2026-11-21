<?php

namespace App\Enums;

/** Jenis mutasi stok. Jumlah di tabel mutasi bertanda: + masuk, - keluar. */
enum MovementType: string
{
    case Adjustment = 'adjustment';
    case VendorReceipt = 'vendor_receipt';
    case TransferOut = 'transfer_out';
    case TransferIn = 'transfer_in';
    case TransferReturn = 'transfer_return';
    case Usage = 'usage';
    case UsageCancel = 'usage_cancel';

    public function label(): string
    {
        return match ($this) {
            self::Adjustment => 'Penyesuaian (Ubah Stok)',
            self::VendorReceipt => 'Terima dari vendor',
            self::TransferOut => 'Kirim ke lapangan',
            self::TransferIn => 'Terima dari gudang',
            self::TransferReturn => 'Selisih kiriman kembali ke gudang',
            self::Usage => 'Pemakaian',
            self::UsageCancel => 'Pembatalan pemakaian',
        };
    }
}
