<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Satu laporan = stok harian satu jenis (bahan/barang) yang dicatat satu user.
        Schema::create('stock_reports', function (Blueprint $table) {
            $table->id();
            $table->string('type', 10);            // bahan | barang (App\Enums\StockType)
            $table->date('report_date');
            $table->string('status', 20)->default('draft'); // App\Enums\StockStatus
            $table->text('note')->nullable();

            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('submitted_at')->nullable();           // dikirim user -> operation

            $table->foreignId('operation_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('operation_submitted_at')->nullable(); // dikirim operation -> co-admin

            $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('completed_at')->nullable();           // ditandai selesai co-admin

            $table->timestamps();

            $table->unique(['type', 'report_date', 'created_by']);
            $table->index(['status', 'type']);
            $table->index('report_date');
        });

        Schema::create('stock_report_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_report_id')->constrained()->cascadeOnDelete();
            $table->string('name', 150);
            $table->string('unit', 30);
            $table->decimal('quantity', 14, 3);
            $table->string('note', 255)->nullable();
            $table->timestamps();

            $table->index('name');
        });

        // Riwayat aktivitas (siapa membuat, mengubah, mengirim, mengekspor).
        Schema::create('stock_report_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('stock_report_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action', 30);
            $table->json('detail')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('stock_report_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_report_logs');
        Schema::dropIfExists('stock_report_items');
        Schema::dropIfExists('stock_reports');
    }
};
