<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Barang & bahan kini milik satu gudang (min/max/harga per gudang), dan vendor dipetakan ke gudang yang dilayaninya.
 *
 * Data lama:
 * - Barang yang dipakai di beberapa gudang dipecah menjadi satu data per gudang; semua referensi
 *   (saldo, mutasi, UR/PR/PO/penerimaan/pengiriman/pemakaian) dipindahkan ke data milik gudangnya.
 * - Barang yang belum pernah dipakai di gudang mana pun dihapus (tidak ada referensi).
 * - Vendor dipetakan ke gudang dari PO yang pernah dibuat.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->after('id')->constrained('locations')->restrictOnDelete();
        });

        // lokasi -> gudang (gudang itu sendiri, atau gudang induk untuk lapangan)
        $warehouseOf = DB::table('locations')->get(['id', 'type', 'parent_id'])
            ->mapWithKeys(fn ($l) => [$l->id => $l->type === 'warehouse' ? $l->id : $l->parent_id])->all();

        // Semua tempat yang mereferensikan item_id: [tabel, query yang mengembalikan id baris, item_id, lokasi]
        $sources = [
            'stock_balances' => DB::table('stock_balances')->select('id', 'item_id', 'location_id as loc'),
            'stock_movements' => DB::table('stock_movements')->select('id', 'item_id', 'location_id as loc'),
            'user_request_items' => DB::table('user_request_items as x')->join('user_requests as d', 'd.id', '=', 'x.user_request_id')->select('x.id', 'x.item_id', 'd.warehouse_id as loc'),
            'purchase_requisition_items' => DB::table('purchase_requisition_items as x')->join('purchase_requisitions as d', 'd.id', '=', 'x.purchase_requisition_id')->select('x.id', 'x.item_id', 'd.warehouse_id as loc'),
            'purchase_order_items' => DB::table('purchase_order_items as x')->join('purchase_orders as d', 'd.id', '=', 'x.purchase_order_id')->select('x.id', 'x.item_id', 'd.warehouse_id as loc'),
            'goods_receipt_items' => DB::table('goods_receipt_items as x')->join('goods_receipts as d', 'd.id', '=', 'x.goods_receipt_id')->select('x.id', 'x.item_id', 'd.warehouse_id as loc'),
            'transfer_items' => DB::table('transfer_items as x')->join('transfers as d', 'd.id', '=', 'x.transfer_id')->select('x.id', 'x.item_id', 'd.from_location_id as loc'),
            'usage_items' => DB::table('usage_items as x')->join('usages as d', 'd.id', '=', 'x.usage_id')->select('x.id', 'x.item_id', 'd.location_id as loc'),
        ];

        // usage[item_id][warehouse_id][tabel] = [id baris, ...]
        $usage = [];
        foreach ($sources as $table => $query) {
            foreach ($query->get() as $row) {
                $wid = $warehouseOf[$row->loc] ?? null;
                if ($wid) {
                    $usage[$row->item_id][$wid][$table][] = $row->id;
                }
            }
        }

        foreach (DB::table('items')->orderBy('id')->get() as $item) {
            $perWarehouse = $usage[$item->id] ?? [];
            if (! $perWarehouse) {
                DB::table('items')->where('id', $item->id)->delete();

                continue;
            }
            ksort($perWarehouse);
            $first = true;
            foreach ($perWarehouse as $wid => $tables) {
                if ($first) {
                    DB::table('items')->where('id', $item->id)->update(['warehouse_id' => $wid]);
                    $first = false;

                    continue;
                }
                $copy = (array) $item;
                unset($copy['id']);
                $newId = DB::table('items')->insertGetId([...$copy, 'warehouse_id' => $wid, 'created_at' => now(), 'updated_at' => now()]);
                foreach ($tables as $table => $ids) {
                    DB::table($table)->whereIn('id', $ids)->update(['item_id' => $newId]);
                }
            }
        }

        Schema::table('items', function (Blueprint $table) {
            $table->dropUnique(['name']);
            $table->unique(['warehouse_id', 'name']);
        });
        DB::statement('ALTER TABLE items ALTER COLUMN warehouse_id SET NOT NULL');

        Schema::create('vendor_warehouse', function (Blueprint $table) {
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained('locations')->cascadeOnDelete();
            $table->primary(['vendor_id', 'warehouse_id']);
        });

        DB::table('vendor_warehouse')->insertUsing(
            ['vendor_id', 'warehouse_id'],
            DB::table('purchase_orders')->select('vendor_id', 'warehouse_id')->distinct(),
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('vendor_warehouse');

        Schema::table('items', function (Blueprint $table) {
            $table->dropUnique(['warehouse_id', 'name']);
            $table->dropConstrainedForeignId('warehouse_id');
        });
        // Catatan: unique(name) tidak dipulihkan karena nama yang sama bisa ada di beberapa gudang.
    }
};
