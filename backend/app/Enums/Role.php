<?php

namespace App\Enums;

/**
 * Pembagian tugas:
 *  - User (orang lapangan/dapur) : terima barang dari gudang, pemakaian harian, stok lapangannya.
 *  - Operation1 (lapangan)       : buat UR, terima barang dari gudang, pemakaian harian, stok lapangan yang ditugaskan.
 *  - Logistic (gudang)           : master barang (tanpa harga), evaluasi UR, PR, terima barang vendor,
 *                                  kirim ke lapangan, tindak lanjut selisih kiriman, stok gudang yang ditugaskan.
 *  - Purchasing                  : validasi PR, PO + harga, harga barang, vendor.
 *  - Finance                     : approval PO, harga barang, pembayaran ke vendor.
 *  - Admin                       : kelola user & lokasi, lihat semua data.
 *  User & Operation1 tidak bisa melihat stok gudang sama sekali.
 *  Ubah stok gudang: Admin/Purchasing/Finance + Logistic (gudangnya). Stok lapangan hanya bertambah lewat kiriman gudang.
 */
enum Role: string
{
    case Admin = 'admin';
    case Purchasing = 'purchasing';
    case Finance = 'finance';
    case Logistic = 'logistic';
    case Operation1 = 'operation1';
    case User = 'user';

    public function label(): string
    {
        return match ($this) {
            self::Admin => 'Admin',
            self::Purchasing => 'Purchasing',
            self::Finance => 'Finance',
            self::Logistic => 'Logistic',
            self::Operation1 => 'Operation1',
            self::User => 'User',
        };
    }

    /** Role yang melihat semua lokasi dan harga. */
    public function isPrivileged(): bool
    {
        return in_array($this, [self::Admin, self::Purchasing, self::Finance], true);
    }

    /** Role yang bekerja di lapangan (ditugaskan ke lapangan, tidak melihat gudang). */
    public function isFieldRole(): bool
    {
        return in_array($this, [self::Operation1, self::User], true);
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
