<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Role Co-Admin dipecah menjadi Purchasing dan Finance.
     * Akun co_admin lama dijadikan Purchasing; ubah ke Finance lewat menu Kelola User bila perlu.
     */
    public function up(): void
    {
        DB::table('users')->where('role', 'co_admin')->update(['role' => 'purchasing']);
    }

    public function down(): void
    {
        DB::table('users')->whereIn('role', ['purchasing', 'finance'])->update(['role' => 'co_admin']);
    }
};
