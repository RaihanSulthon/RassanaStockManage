<?php

namespace App\Enums;

/**
 * Pembagian tugas (lihat activity diagram):
 *  - User (Pak Haryono)       : pemakaian harian, saldo lapangan, UR, terima barang dari gudang.
 *  - Operation1 (Pak Nurdin)  : evaluasi UR, hitung stok gudang, PR, terima barang vendor, kirim ke lapangan.
 *  - Purchasing (Pak Andi)    : validasi PR, PO + harga, master barang (min/max, harga), vendor.
 *  - Finance (Pak Fauzan)     : approval PO, pembayaran ke vendor.
 *  - Admin                    : kelola user, lihat semua data, penyesuaian stok.
 */
enum Role: string
{
    case Admin = 'admin';
    case Purchasing = 'purchasing';
    case Finance = 'finance';
    case Operation1 = 'operation1';
    case User = 'user';

    public function label(): string
    {
        return match ($this) {
            self::Admin => 'Admin',
            self::Purchasing => 'Purchasing',
            self::Finance => 'Finance',
            self::Operation1 => 'Operation1',
            self::User => 'User',
        };
    }

    /** Role yang melihat semua lokasi dan harga. */
    public function isPrivileged(): bool
    {
        return in_array($this, [self::Admin, self::Purchasing, self::Finance], true);
    }

    /**
     * Role-role yang boleh dikelola (dibuat/diubah/dihapus/diberikan) oleh role ini.
     * Hanya Admin yang mengelola akun.
     *
     * @return array<int, self>
     */
    public function manageableRoles(): array
    {
        return $this === self::Admin ? self::cases() : [];
    }

    /** @return array<int, string> */
    public function manageableRoleValues(): array
    {
        return array_map(fn (self $role) => $role->value, $this->manageableRoles());
    }
}
