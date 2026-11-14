<?php

namespace App\Enums;

enum Role: string
{
    case Admin = 'admin';
    case CoAdmin = 'co_admin';
    case User = 'user';
    case Operation1 = 'operation1';

    public function label(): string
    {
        return match ($this) {
            self::Admin => 'Admin',
            self::CoAdmin => 'Co-Admin',
            self::User => 'User',
            self::Operation1 => 'Operation1',
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
            self::Admin => [self::Admin, self::CoAdmin, self::User, self::Operation1],
            self::CoAdmin => [self::User, self::Operation1],
            self::User, self::Operation1 => [],
        };
    }

    /** @return array<int, string> */
    public function manageableRoleValues(): array
    {
        return array_map(fn (self $role) => $role->value, $this->manageableRoles());
    }
}
