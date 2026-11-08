<?php

namespace App\Enums;

enum Role: string
{
    case Admin = 'admin';
    case CoAdmin = 'co_admin';
    case User = 'user';

    public function label(): string
    {
        return match ($this) {
            self::Admin => 'Admin',
            self::CoAdmin => 'Co-Admin',
            self::User => 'User',
        };
    }

    /**
     * Role-role yang boleh dikelola (dibuat/diubah/dihapus/diberikan) oleh role ini.
     *
     * @return array<int, self>
     */
    public function manageableRoles(): array
    {
        return match ($this) {
            self::Admin => [self::Admin, self::CoAdmin, self::User],
            self::CoAdmin => [self::User],
            self::User => [],
        };
    }

    /** @return array<int, string> */
    public function manageableRoleValues(): array
    {
        return array_map(fn (self $role) => $role->value, $this->manageableRoles());
    }
}
