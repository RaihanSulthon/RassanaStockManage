<?php

namespace App\Policies;

use App\Enums\Role;
use App\Enums\TransferStatus;
use App\Models\Transfer;
use App\Models\User;

/** Pengiriman gudang -> lapangan: dikirim Operation, dikonfirmasi diterima oleh User lapangan. */
class TransferPolicy
{
    public function create(User $actor): bool
    {
        return $actor->hasRole(Role::Operation1);
    }

    public function view(User $actor, Transfer $t): bool
    {
        return $actor->role->isPrivileged()
            || ($actor->hasRole(Role::Operation1) && $actor->isAssignedTo($t->from_location_id))
            || ($actor->hasRole(Role::User) && $actor->isAssignedTo($t->to_location_id));
    }

    public function receive(User $actor, Transfer $t): bool
    {
        return $actor->hasRole(Role::User)
            && $actor->isAssignedTo($t->to_location_id)
            && $t->status === TransferStatus::Sent;
    }
}
