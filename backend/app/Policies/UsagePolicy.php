<?php

namespace App\Policies;

use App\Enums\Role;
use App\Models\Usage;
use App\Models\User;

class UsagePolicy
{
    public function create(User $actor): bool
    {
        return $actor->role->isFieldRole();
    }

    public function view(User $actor, Usage $usage): bool
    {
        return $actor->canSeeLocation($usage->location_id);
    }

    /** Salah input hanya bisa dibatalkan oleh pencatatnya pada hari yang sama. */
    public function cancel(User $actor, Usage $usage): bool
    {
        return $usage->created_by === $actor->id
            && $usage->cancelled_at === null
            && $usage->created_at->isToday();
    }
}
