<?php

namespace App\Policies;

use App\Enums\RequestStatus;
use App\Enums\Role;
use App\Models\PurchaseRequisition;
use App\Models\User;

/** PR dibuat Logistic (gudang), divalidasi Purchasing yang membuat PO. */
class PurchaseRequisitionPolicy
{
    public function create(User $actor): bool
    {
        return $actor->hasRole(Role::Logistic);
    }

    public function view(User $actor, PurchaseRequisition $pr): bool
    {
        if ($actor->hasRole(Role::Logistic)) {
            return $actor->isAssignedTo($pr->warehouse_id);
        }

        // Purchasing/Finance/Admin tidak perlu melihat draft yang belum dikirim.
        return $actor->role->isPrivileged() && $pr->status !== RequestStatus::Draft;
    }

    public function update(User $actor, PurchaseRequisition $pr): bool
    {
        return $actor->hasRole(Role::Logistic)
            && $actor->isAssignedTo($pr->warehouse_id)
            && $pr->status === RequestStatus::Draft;
    }

    public function submit(User $actor, PurchaseRequisition $pr): bool
    {
        return $this->update($actor, $pr);
    }

    public function delete(User $actor, PurchaseRequisition $pr): bool
    {
        return $this->update($actor, $pr);
    }

    public function export(User $actor, PurchaseRequisition $pr): bool
    {
        return $this->view($actor, $pr);
    }
}
