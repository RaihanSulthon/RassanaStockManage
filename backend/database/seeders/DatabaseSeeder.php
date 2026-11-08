<?php

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Akun contoh untuk DEVELOPMENT saja. Ganti/hapus sebelum production.
     */
    public function run(): void
    {
        $accounts = [
            ['Admin', 'admin@example.com', Role::Admin],
            ['Co-Admin', 'coadmin@example.com', Role::CoAdmin],
            ['User Biasa', 'user@example.com', Role::User],
        ];

        foreach ($accounts as [$name, $email, $role]) {
            User::updateOrCreate(
                ['email' => $email],
                ['name' => $name, 'password' => 'password123', 'role' => $role],
            );
        }
    }
}
