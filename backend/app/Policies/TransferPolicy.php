<?php

namespace App\Policies;

use App\Enums\Role;
use App\Enums\TransferStatus;
use App\Models\Transfer;
use App\Models\User;

/**
 * Pengiriman gudang -> lapangan:
 *  - dikirim Logistic (gudang yang ditugaskan),
 *  - diterima Operation1 / User di lapangan tujuan (cukup salah satu),
 *  - selisih kurang ditindaklanjuti Logistic; barang "tertinggal di perjalanan" dicatat susulan oleh lapangan.
 */
class TransferPolicy
{
    public function create(User $actor): bool
    {
        return $actor->hasRole(Role::Logistic);
    }

    public function view(User $actor, Transfer $t): bool
    {
        return $actor->role->isPrivileged()
            || ($actor->hasRole(Role::Logistic) && $actor->isAssignedTo($t->from_location_id))
            || ($actor->role->isFieldRole() && $actor->isAssignedTo($t->to_location_id));
    }

    public function receive(User $actor, Transfer $t): bool
    {
        return $actor->role->isFieldRole()
            && $actor->isAssignedTo($t->to_location_id)
            && $t->status === TransferStatus::Sent;
    }

    /** Lapangan mencatat barang susulan (selisih yang ditandai Logistic "tertinggal di perjalanan"). */
    public function receiveLate(User $actor, Transfer $t): bool
    {
        return $actor->role->isFieldRole()
            && $actor->isAssignedTo($t->to_location_id)
            && $t->items()->where('shortage_status', 'in_transit')->exists();
    }

    /** Logistic menindaklanjuti selisih kiriman. */
    public function resolve(User $actor, Transfer $t): bool
    {
        return $actor->hasRole(Role::Logistic)
            && $actor->isAssignedTo($t->from_location_id)
            && $t->items()->where('shortage_status', 'open')->exists();
    }

    public function export(User $actor, Transfer $t): bool
    {
        return $this->view($actor, $t);
    }
}
