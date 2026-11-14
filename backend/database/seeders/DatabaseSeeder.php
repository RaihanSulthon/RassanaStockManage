<?php

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Membuat akun awal dari variabel .env (SEED_*_EMAIL / SEED_*_PASSWORD).
     * Akun yang email/password-nya tidak diisi akan dilewati.
     */
    public function run(): void
    {
        $accounts = [
            ['Admin', 'SEED_ADMIN', Role::Admin],
            ['Co-Admin 1', 'SEED_COADMIN1', Role::CoAdmin],
            ['Co-Admin 2', 'SEED_COADMIN2', Role::CoAdmin],
            ['User Biasa', 'SEED_USER', Role::User],
            ['Operation1', 'SEED_OPERATION1', Role::Operation1],
        ];

        foreach ($accounts as [$name, $prefix, $role]) {
            $email = env("{$prefix}_EMAIL");
            $password = env("{$prefix}_PASSWORD");

            if (! $email || ! $password) {
                $this->command?->warn("Lewati {$name}: {$prefix}_EMAIL / {$prefix}_PASSWORD belum diisi di .env");

                continue;
            }

            User::updateOrCreate(
                ['email' => $email],
                ['name' => $name, 'password' => $password, 'role' => $role],
            );
        }
    }
}
