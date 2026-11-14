<?php

namespace Database\Seeders;

use App\Enums\LocationType;
use App\Enums\MovementType;
use App\Enums\Role;
use App\Models\Item;
use App\Models\Location;
use App\Models\User;
use App\Models\Vendor;
use App\Support\StockService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Data contoh untuk mencoba alur: 2 gudang, 3 lapangan, barang, vendor, saldo awal,
 * dan penugasan akun Operation/User pertama. Aman dijalankan berulang (tidak menggandakan data).
 *
 * php artisan db:seed --class=DemoDataSeeder
 */
class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function () {
            $pusat = Location::firstOrCreate(['type' => LocationType::Warehouse->value, 'name' => 'Gudang Pusat'], ['address' => 'Jakarta']);
            $remote = Location::firstOrCreate(['type' => LocationType::Warehouse->value, 'name' => 'Gudang Site Kalimantan'], ['address' => 'Kalimantan Timur']);
            $lapA = Location::firstOrCreate(['type' => LocationType::Field->value, 'name' => 'Lapangan Proyek A'], ['parent_id' => $pusat->id]);
            Location::firstOrCreate(['type' => LocationType::Field->value, 'name' => 'Lapangan Proyek B'], ['parent_id' => $pusat->id]);
            Location::firstOrCreate(['type' => LocationType::Field->value, 'name' => 'Lapangan Site Kalimantan'], ['parent_id' => $remote->id]);

            $items = [
                // nama, jenis, satuan, min, max, harga
                ['Beras', 'bahan', 'kg', 100, 500, 13500],
                ['Telur Ayam', 'bahan', 'butir', 300, 1500, 2200],
                ['Minyak Goreng', 'bahan', 'liter', 40, 200, 17500],
                ['Gula Pasir', 'bahan', 'kg', 20, 100, 16000],
                ['Daging Ayam', 'bahan', 'kg', 50, 250, 38000],
                ['Bawang Merah', 'bahan', 'kg', 10, 60, 42000],
                ['Gas LPG 12 kg', 'barang', 'tabung', 5, 20, 210000],
                ['Kotak Makan', 'barang', 'pcs', 500, 3000, 1200],
                ['Sendok Plastik', 'barang', 'pack', 20, 100, 9500],
                ['Sabun Cuci Piring', 'barang', 'botol', 10, 50, 14500],
            ];
            foreach ($items as [$name, $cat, $unit, $min, $max, $price]) {
                Item::firstOrCreate(['name' => $name], [
                    'category' => $cat, 'unit' => $unit, 'min_stock' => $min, 'max_stock' => $max, 'price' => $price,
                ]);
            }

            Vendor::firstOrCreate(['name' => 'CV Sumber Pangan'], ['contact_person' => 'Bu Rina', 'phone' => '0812-0000-0001', 'address' => 'Pasar Induk, Jakarta']);
            Vendor::firstOrCreate(['name' => 'PT Kemasan Jaya'], ['contact_person' => 'Pak Dedi', 'phone' => '0812-0000-0002', 'address' => 'Tangerang']);
            Vendor::firstOrCreate(['name' => 'Agen Gas Makmur'], ['contact_person' => 'Pak Joko', 'phone' => '0812-0000-0003']);

            // Penugasan akun pertama per role (bila belum punya lokasi).
            $op = User::where('role', Role::Operation1->value)->orderBy('id')->first();
            if ($op && ! $op->locations()->exists()) {
                $op->locations()->sync([$pusat->id]);
            }
            $usr = User::where('role', Role::User->value)->orderBy('id')->first();
            if ($usr && ! $usr->locations()->exists()) {
                $usr->locations()->sync([$lapA->id]);
            }

            // Saldo awal (hanya jika lokasi belum punya mutasi).
            $admin = User::where('role', Role::Admin->value)->orderBy('id')->first();
            $opening = [
                $pusat->id => ['Beras' => 80, 'Telur Ayam' => 600, 'Minyak Goreng' => 50, 'Gula Pasir' => 25, 'Daging Ayam' => 30, 'Gas LPG 12 kg' => 8, 'Kotak Makan' => 1200, 'Sendok Plastik' => 30],
                $lapA->id => ['Beras' => 15, 'Telur Ayam' => 90, 'Minyak Goreng' => 6, 'Gas LPG 12 kg' => 2, 'Kotak Makan' => 150],
            ];
            foreach ($opening as $locationId => $rows) {
                if (DB::table('stock_movements')->where('location_id', $locationId)->exists()) {
                    continue;
                }
                foreach ($rows as $name => $qty) {
                    StockService::move($locationId, Item::where('name', $name)->value('id'), $qty, MovementType::Adjustment,
                        now()->subDays(1)->toDateString(), null, $admin, 'Saldo awal (data contoh)');
                }
            }
        });

        $this->command?->info('Data contoh siap: 2 gudang, 3 lapangan, 10 barang, 3 vendor, saldo awal.');
    }
}
