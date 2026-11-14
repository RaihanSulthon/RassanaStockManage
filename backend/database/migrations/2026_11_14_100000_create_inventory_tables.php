<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ---------------- Master data ----------------

        // Gudang (warehouse) dan lapangan (field). Lapangan selalu berada di bawah satu gudang.
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('type', 10);
            $table->string('name', 100);
            $table->foreignId('parent_id')->nullable()->constrained('locations')->restrictOnDelete();
            $table->string('address', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['type', 'name']);
        });

        // Penugasan akun ke lokasi: Operation -> gudang, User -> lapangan.
        Schema::create('location_user', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('location_id')->constrained()->cascadeOnDelete();
            $table->primary(['user_id', 'location_id']);
        });

        Schema::create('items', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150)->unique();
            $table->string('category', 10);           // bahan | barang
            $table->string('unit', 30);
            $table->decimal('min_stock', 14, 3)->nullable();
            $table->decimal('max_stock', 14, 3)->nullable();
            $table->decimal('price', 15, 2)->nullable(); // harga satuan acuan (hanya Purchasing)
            $table->string('note', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('vendors', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150)->unique();
            $table->string('contact_person', 100)->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('email', 150)->nullable();
            $table->string('address', 255)->nullable();
            $table->string('note', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // ---------------- Stok ----------------

        Schema::create('stock_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('location_id')->constrained()->restrictOnDelete();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 14, 3)->default(0);
            $table->timestamps();

            $table->unique(['location_id', 'item_id']);
        });

        // Buku besar stok: setiap perubahan saldo tercatat di sini.
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('location_id')->constrained()->restrictOnDelete();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->string('type', 20);
            $table->decimal('quantity', 14, 3);       // bertanda: + masuk, - keluar
            $table->decimal('balance_after', 14, 3);
            $table->date('movement_date');
            $table->nullableMorphs('reference');
            $table->string('reference_number', 50)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('note', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['location_id', 'movement_date']);
            $table->index(['item_id', 'movement_date']);
        });

        // ---------------- Dokumen alur ----------------

        Schema::create('user_requests', function (Blueprint $table) {
            $table->id();
            $table->string('number', 30)->nullable()->unique();
            $table->foreignId('field_id')->constrained('locations')->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained('locations')->restrictOnDelete();
            $table->string('status', 20)->default('draft');
            $table->date('needed_date')->nullable();
            $table->text('note')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'warehouse_id']);
        });

        Schema::create('user_request_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 14, 3);
            $table->string('note', 255)->nullable();
        });

        Schema::create('purchase_requisitions', function (Blueprint $table) {
            $table->id();
            $table->string('number', 30)->nullable()->unique();
            $table->foreignId('warehouse_id')->constrained('locations')->restrictOnDelete();
            $table->foreignId('user_request_id')->nullable()->unique()->constrained()->restrictOnDelete();
            $table->string('period', 10);              // harian | mingguan | bulanan
            $table->string('status', 20)->default('draft');
            $table->date('needed_date')->nullable();
            $table->text('note')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'warehouse_id']);
        });

        Schema::create('purchase_requisition_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_requisition_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 14, 3);
            $table->string('note', 255)->nullable();
        });

        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->string('number', 30)->nullable()->unique();
            $table->foreignId('purchase_requisition_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('vendor_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained('locations')->restrictOnDelete();
            $table->string('status', 20)->default('draft');
            $table->date('order_date');
            $table->date('expected_date')->nullable();
            $table->text('note')->nullable();
            $table->decimal('total', 15, 2)->default(0);
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->text('revision_note')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->text('closed_note')->nullable();
            $table->timestamps();

            $table->index('status');
        });

        Schema::create('purchase_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 14, 3);
            $table->decimal('unit_price', 15, 2);
            $table->decimal('subtotal', 15, 2);
            $table->decimal('quantity_received', 14, 3)->default(0);
            $table->string('note', 255)->nullable();
        });

        // Penerimaan barang dari vendor di gudang (bisa bertahap, satu per surat jalan).
        Schema::create('goods_receipts', function (Blueprint $table) {
            $table->id();
            $table->string('number', 30)->nullable()->unique();
            $table->foreignId('purchase_order_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained('locations')->restrictOnDelete();
            $table->string('delivery_note_number', 100);
            $table->date('received_date');
            $table->text('note')->nullable();
            $table->foreignId('received_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });

        Schema::create('goods_receipt_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('goods_receipt_id')->constrained()->cascadeOnDelete();
            $table->foreignId('purchase_order_item_id')->constrained()->restrictOnDelete();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity_received', 14, 3);
            $table->string('note', 255)->nullable();
        });

        // Pengiriman gudang -> lapangan.
        Schema::create('transfers', function (Blueprint $table) {
            $table->id();
            $table->string('number', 30)->nullable()->unique();
            $table->foreignId('from_location_id')->constrained('locations')->restrictOnDelete();
            $table->foreignId('to_location_id')->constrained('locations')->restrictOnDelete();
            $table->foreignId('user_request_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 20)->default('sent');
            $table->date('transfer_date');
            $table->text('note')->nullable();
            $table->foreignId('sent_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('received_at')->nullable();
            $table->text('received_note')->nullable();
            $table->timestamps();
        });

        Schema::create('transfer_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transfer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity_sent', 14, 3);
            $table->decimal('quantity_received', 14, 3)->nullable();
            $table->string('note', 255)->nullable();
        });

        // Pemakaian harian di lapangan.
        Schema::create('usages', function (Blueprint $table) {
            $table->id();
            $table->string('number', 30)->nullable()->unique();
            $table->foreignId('location_id')->constrained()->restrictOnDelete();
            $table->date('usage_date');
            $table->text('note')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['location_id', 'usage_date']);
        });

        Schema::create('usage_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('usage_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity', 14, 3);
            $table->string('note', 255)->nullable();
        });

        // Pembayaran ke vendor (satu baris per tagihan).
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->string('number', 30)->nullable()->unique();
            $table->foreignId('purchase_order_id')->constrained()->restrictOnDelete();
            $table->string('status', 20)->default('prepared');
            $table->string('invoice_number', 100);
            $table->date('invoice_date');
            $table->decimal('invoice_amount', 15, 2);
            $table->string('method', 20)->nullable();   // transfer | tunai | lainnya
            $table->date('paid_date')->nullable();
            $table->string('reference_number', 100)->nullable();
            $table->text('note')->nullable();
            $table->foreignId('prepared_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('paid_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        // Riwayat aktivitas semua dokumen (UR, PR, PO, penerimaan, pengiriman, pemakaian, pembayaran).
        Schema::create('document_logs', function (Blueprint $table) {
            $table->id();
            $table->morphs('loggable');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action', 30);
            $table->json('detail')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        foreach ([
            'document_logs', 'payments', 'usage_items', 'usages', 'transfer_items', 'transfers',
            'goods_receipt_items', 'goods_receipts', 'purchase_order_items', 'purchase_orders',
            'purchase_requisition_items', 'purchase_requisitions', 'user_request_items', 'user_requests',
            'stock_movements', 'stock_balances', 'vendors', 'items', 'location_user', 'locations',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
