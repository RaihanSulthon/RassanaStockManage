<?php

namespace App\Policies;

use App\Enums\Role;
use App\Enums\StockStatus;
use App\Models\StockReport;
use App\Models\User;

/**
 * Aturan akses laporan stok per tahap:
 *  - User         : membuat, mengedit, dan mengirim laporannya sendiri selama Draft.
 *  - Operation1   : melihat semua laporan terkirim; edit + kirim saat "Menunggu Operation".
 *  - Co-Admin     : melihat laporan yang sudah dikirim Operation; edit, selesaikan, dan ekspor
 *                   saat "Menunggu Co-Admin" (ekspor tetap bisa setelah Selesai).
 *  - Admin        : semua tahap (kecuali edit setelah Selesai).
 */
class StockReportPolicy
{
    public function create(User $actor): bool
    {
        return $actor->hasRole(Role::User, Role::Admin);
    }

    public function view(User $actor, StockReport $report): bool
    {
        return match ($actor->role) {
            Role::Admin => true,
            Role::Operation1 => $report->status !== StockStatus::Draft,
            Role::CoAdmin => in_array($report->status, [StockStatus::PendingCoAdmin, StockStatus::Completed], true),
            default => $report->created_by === $actor->id,
        };
    }

    /** Mengubah isi laporan (item, catatan). */
    public function update(User $actor, StockReport $report): bool
    {
        return match ($actor->role) {
            Role::Admin => $report->status !== StockStatus::Completed,
            Role::User => $report->created_by === $actor->id && $report->status === StockStatus::Draft,
            Role::Operation1 => $report->status === StockStatus::PendingOperation,
            Role::CoAdmin => $report->status === StockStatus::PendingCoAdmin,
        };
    }

    /** Meneruskan ke tahap berikutnya (User/Admin -> Operation, Operation/Admin -> Co-Admin). */
    public function submit(User $actor, StockReport $report): bool
    {
        return match ($report->status) {
            StockStatus::Draft => $actor->hasRole(Role::Admin)
                || ($actor->hasRole(Role::User) && $report->created_by === $actor->id),
            StockStatus::PendingOperation => $actor->hasRole(Role::Admin, Role::Operation1),
            default => false,
        };
    }

    /** Menandai selesai (mengunci laporan). */
    public function complete(User $actor, StockReport $report): bool
    {
        return $report->status === StockStatus::PendingCoAdmin
            && $actor->hasRole(Role::Admin, Role::CoAdmin);
    }

    /** Generate PDF / Excel. */
    public function export(User $actor, StockReport $report): bool
    {
        return $actor->hasRole(Role::Admin, Role::CoAdmin)
            && in_array($report->status, [StockStatus::PendingCoAdmin, StockStatus::Completed], true);
    }

    public function delete(User $actor, StockReport $report): bool
    {
        if ($actor->hasRole(Role::Admin)) {
            return true;
        }

        return $actor->hasRole(Role::User)
            && $report->created_by === $actor->id
            && $report->status === StockStatus::Draft;
    }
}
