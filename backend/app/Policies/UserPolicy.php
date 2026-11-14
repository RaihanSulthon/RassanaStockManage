<?php

namespace App\Policies;

use App\Enums\Role;
use App\Models\User;

class UserPolicy
{
    /** Melihat daftar user: hanya Admin. */
    public function viewAny(User $actor): bool
    {
        return $actor->hasRole(Role::Admin);
    }

    /** Melihat detail: diri sendiri, atau user yang boleh dikelola. */
    public function view(User $actor, User $target): bool
    {
        return $actor->is($target) || $this->manages($actor, $target);
    }

    public function create(User $actor): bool
    {
        return $actor->hasRole(Role::Admin);
    }

    public function update(User $actor, User $target): bool
    {
        return $this->manages($actor, $target);
    }

    /** Tidak boleh menghapus diri sendiri. */
    public function delete(User $actor, User $target): bool
    {
        return ! $actor->is($target) && $this->manages($actor, $target);
    }

    private function manages(User $actor, User $target): bool
    {
        return in_array($target->role, $actor->role->manageableRoles(), true);
    }
}
