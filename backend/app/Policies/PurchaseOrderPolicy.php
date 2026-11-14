<?php

namespace App\Policies;

use App\Enums\PoStatus;
use App\Enums\Role;
use App\Models\PurchaseOrder;
use App\Models\User;

/**
 * PO: Purchasing membuat & mengirim ke vendor, Finance menyetujui/menolak & membayar,
 * Operation (gudang tujuan) mencatat penerimaan barang.
 */
class PurchaseOrderPolicy
{
    public function create(User $actor): bool
    {
        return $actor->hasRole(Role::Purchasing);
    }

    public function view(User $actor, PurchaseOrder $po): bool
    {
        if ($actor->hasRole(Role::Operation1)) {
            // Gudang melihat PO yang sudah disetujui (untuk cek barang datang), tanpa harga.
            return $actor->isAssignedTo($po->warehouse_id)
                && ! in_array($po->status, [PoStatus::Draft, PoStatus::PendingApproval, PoStatus::Revision], true);
        }

        if ($actor->hasRole(Role::Finance, Role::Admin)) {
            return $po->status !== PoStatus::Draft;
        }

        return $actor->hasRole(Role::Purchasing);
    }

    public function viewPrices(User $actor): bool
    {
        return $actor->role->isPrivileged();
    }

    public function update(User $actor, PurchaseOrder $po): bool
    {
        return $actor->hasRole(Role::Purchasing) && $po->status->editable();
    }

    public function submit(User $actor, PurchaseOrder $po): bool
    {
        return $this->update($actor, $po);
    }

    public function delete(User $actor, PurchaseOrder $po): bool
    {
        return $actor->hasRole(Role::Purchasing) && $po->status === PoStatus::Draft;
    }

    public function approve(User $actor, PurchaseOrder $po): bool
    {
        return $actor->hasRole(Role::Finance) && $po->status === PoStatus::PendingApproval;
    }

    public function send(User $actor, PurchaseOrder $po): bool
    {
        return $actor->hasRole(Role::Purchasing) && $po->status === PoStatus::Approved;
    }

    public function receive(User $actor, PurchaseOrder $po): bool
    {
        return $actor->hasRole(Role::Operation1)
            && $actor->isAssignedTo($po->warehouse_id)
            && $po->status->receivable();
    }

    /** Tutup PO yang tidak akan dikirim lengkap oleh vendor. */
    public function close(User $actor, PurchaseOrder $po): bool
    {
        return $actor->hasRole(Role::Purchasing) && $po->status->receivable();
    }

    /** Finance mencatat tagihan setelah ada barang diterima gudang. */
    public function pay(User $actor, PurchaseOrder $po): bool
    {
        return $actor->hasRole(Role::Finance)
            && in_array($po->status, [PoStatus::PartiallyReceived, PoStatus::Received, PoStatus::Closed], true)
            && $po->receipts()->exists();
    }

    /** PDF/Excel PO memuat harga. */
    public function export(User $actor, PurchaseOrder $po): bool
    {
        return $actor->role->isPrivileged() && $this->view($actor, $po);
    }

    /** Riwayat penerimaan boleh di-export semua yang bisa melihat PO (harga disembunyikan untuk gudang). */
    public function exportReceipts(User $actor, PurchaseOrder $po): bool
    {
        return $this->view($actor, $po) && $po->receipts()->exists();
    }
}
