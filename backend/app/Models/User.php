<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\LocationType;
use App\Enums\Role;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'role'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => Role::class,
        ];
    }

    public function hasRole(Role ...$roles): bool
    {
        return in_array($this->role, $roles, true);
    }

    /** Lokasi yang ditugaskan: gudang (Logistic) atau lapangan (Operation1 / User). */
    public function locations(): BelongsToMany
    {
        return $this->belongsToMany(Location::class)->orderBy('name');
    }

    /** @var array<int, int>|null */
    private ?array $assignedLocationIds = null;

    /** @return array<int, int> */
    public function assignedLocationIds(): array
    {
        return $this->assignedLocationIds ??= $this->locations()->pluck('locations.id')->map(fn ($id) => (int) $id)->all();
    }

    /**
     * ID lokasi yang boleh dilihat user ini; null berarti semua lokasi.
     * Logistic melihat gudangnya + semua lapangan di bawahnya.
     * Operation1 / User hanya lapangan yang ditugaskan (tidak pernah gudang).
     *
     * @return array<int, int>|null
     */
    public function visibleLocationIds(): ?array
    {
        if ($this->role->isPrivileged()) {
            return null;
        }

        $own = $this->assignedLocationIds();
        if ($this->role === Role::Logistic) {
            $children = Location::whereIn('parent_id', $own)->pluck('id')->map(fn ($id) => (int) $id)->all();

            return array_values(array_unique([...$own, ...$children]));
        }

        return Location::whereIn('id', $own)->where('type', LocationType::Field->value)->pluck('id')->map(fn ($id) => (int) $id)->all();
    }

    public function canSeeLocation(?int $locationId): bool
    {
        $ids = $this->visibleLocationIds();

        return $ids === null || in_array((int) $locationId, $ids, true);
    }

    /** Lokasi yang ditugaskan langsung (untuk aksi: Logistic di gudangnya, Operation1/User di lapangannya). */
    public function isAssignedTo(?int $locationId): bool
    {
        return in_array((int) $locationId, $this->assignedLocationIds(), true);
    }

    public function forgetLocationCache(): void
    {
        $this->assignedLocationIds = null;
    }
}
