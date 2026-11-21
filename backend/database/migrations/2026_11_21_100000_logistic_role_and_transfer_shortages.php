<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Role Logistic (pengelola gudang) + pencatatan stok sebelum/sesudah dan tindak lanjut selisih kiriman.
 *
 * - goods_receipt_items / transfer_items: stok gudang sebelum & sesudah aktivitas (rekap Logistic).
 * - transfer_items.shortage_*: selisih kiriman (dikirim > diterima) yang ditindaklanjuti Logistic:
 *     open       = menunggu tindak lanjut Logistic
 *     in_transit = tertinggal di perjalanan, lapangan bisa mencatat terima susulan
 *     lost       = hilang (selesai, stok tidak kembali)
 *     returned   = belum terkirim / masih di gudang (selesai, stok kembali ke gudang)
 *     arrived    = susulan sudah diterima lengkap (selesai)
 * - Operation1 sekarang bekerja di lapangan: penugasan gudang lama diganti lapangan-lapangan di bawahnya.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('goods_receipt_items', function (Blueprint $table) {
            $table->decimal('stock_before', 14, 3)->nullable();
            $table->decimal('stock_after', 14, 3)->nullable();
        });

        Schema::table('transfer_items', function (Blueprint $table) {
            $table->decimal('stock_before', 14, 3)->nullable();
            $table->decimal('stock_after', 14, 3)->nullable();
            $table->string('shortage_status', 20)->nullable();
            $table->string('shortage_note', 255)->nullable();
            $table->foreignId('shortage_resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('shortage_resolved_at')->nullable();
        });

        // Pengiriman lama yang diterima dengan selisih kurang -> perlu tindak lanjut Logistic.
        DB::table('transfer_items')
            ->whereNotNull('quantity_received')
            ->whereColumn('quantity_received', '<', 'quantity_sent')
            ->update(['shortage_status' => 'open']);
        $open = DB::table('transfer_items')->where('shortage_status', 'open')->distinct()->pluck('transfer_id');
        DB::table('transfers')->whereIn('id', $open)->update(['status' => 'discrepancy']);

        // Operation1: gudang -> semua lapangan di bawah gudang tersebut.
        $ops = DB::table('users')->where('role', 'operation1')->pluck('id');
        foreach ($ops as $userId) {
            $warehouseIds = DB::table('location_user')
                ->join('locations', 'locations.id', '=', 'location_user.location_id')
                ->where('location_user.user_id', $userId)->where('locations.type', 'warehouse')
                ->pluck('locations.id');
            if ($warehouseIds->isEmpty()) {
                continue;
            }
            $fieldIds = DB::table('locations')->whereIn('parent_id', $warehouseIds)->where('type', 'field')->pluck('id');
            DB::table('location_user')->where('user_id', $userId)->whereIn('location_id', $warehouseIds)->delete();
            $existing = DB::table('location_user')->where('user_id', $userId)->pluck('location_id');
            DB::table('location_user')->insert(
                $fieldIds->diff($existing)->map(fn ($id) => ['user_id' => $userId, 'location_id' => $id])->values()->all()
            );
        }
    }

    public function down(): void
    {
        DB::table('transfers')->where('status', 'discrepancy')->update(['status' => 'received']);

        Schema::table('transfer_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('shortage_resolved_by');
            $table->dropColumn(['stock_before', 'stock_after', 'shortage_status', 'shortage_note', 'shortage_resolved_at']);
        });

        Schema::table('goods_receipt_items', function (Blueprint $table) {
            $table->dropColumn(['stock_before', 'stock_after']);
        });
    }
};
