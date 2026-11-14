<?php

namespace App\Policies;

use App\Enums\RequestStatus;
use App\Enums\Role;
use App\Models\User;
use App\Models\UserRequest;

/** UR dibuat User (lapangan), dievaluasi Operation (gudang induk). */
class UserRequestPolicy
{
    public function create(User $actor): bool
    {
        return $actor->hasRole(Role::User);
    }

    public function view(User $actor, UserRequest $ur): bool
    {
        return ($actor->role->isPrivileged() && $ur->status !== RequestStatus::Draft)
            || ($actor->hasRole(Role::User) && $actor->isAssignedTo($ur->field_id))
            || ($actor->hasRole(Role::Operation1) && $actor->isAssignedTo($ur->warehouse_id) && $ur->status !== RequestStatus::Draft);
    }

    public function update(User $actor, UserRequest $ur): bool
    {
        return $actor->hasRole(Role::User)
            && $actor->isAssignedTo($ur->field_id)
            && $ur->status === RequestStatus::Draft;
    }

    public function submit(User $actor, UserRequest $ur): bool
    {
        return $this->update($actor, $ur);
    }

    public function delete(User $actor, UserRequest $ur): bool
    {
        return $this->update($actor, $ur);
    }

    /** Operation membuat PR dari UR ini, atau mengirim barang ke lapangan berdasarkan UR ini. */
    public function process(User $actor, UserRequest $ur): bool
    {
        return $actor->hasRole(Role::Operation1)
            && $actor->isAssignedTo($ur->warehouse_id)
            && $ur->status !== RequestStatus::Draft;
    }

    public function export(User $actor, UserRequest $ur): bool
    {
        return $this->view($actor, $ur);
    }
}
