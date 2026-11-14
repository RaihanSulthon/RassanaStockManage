<?php

namespace App\Support;

use App\Enums\Role;
use App\Models\User;
use App\Notifications\WorkflowNotification;
use Illuminate\Support\Facades\Notification;

class Notifier
{
    /** Semua akun dengan role tertentu (opsional: hanya yang ditugaskan ke lokasi tertentu). */
    public static function role(Role $role, string $title, string $message, string $url, ?int $locationId = null, ?User $except = null): void
    {
        $users = User::where('role', $role->value)
            ->when($locationId, fn ($q) => $q->whereHas('locations', fn ($l) => $l->where('locations.id', $locationId)))
            ->when($except, fn ($q) => $q->where('id', '!=', $except->id))
            ->get();

        static::users($users, $title, $message, $url);
    }

    public static function users(iterable $users, string $title, string $message, string $url): void
    {
        $users = collect($users)->filter()->unique('id');
        if ($users->isNotEmpty()) {
            Notification::send($users, new WorkflowNotification($title, $message, $url));
        }
    }
}
