<?php

namespace App\Support;

use App\Enums\LocationType;
use App\Enums\MovementType;
use App\Models\Item;
use App\Models\Location;
use App\Models\StockBalance;
use App\Models\StockMovement;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Semua perubahan saldo stok lewat sini supaya saldo dan buku mutasi selalu konsisten.
 * Wajib dipanggil di dalam DB::transaction.
 */
class StockService
{
    /**
     * @param  float  $delta  + menambah, - mengurangi
     * @param  string|null  $errorKey  key validasi untuk pesan stok tidak cukup (mis. "items.0.quantity")
     */
    public static function move(
        int $locationId,
        int $itemId,
        float $delta,
        MovementType $type,
        CarbonInterface|string $date,
        ?Model $reference,
        ?User $user,
        ?string $note = null,
        ?string $errorKey = null,
    ): void {
        $delta = round($delta, 3);
        if ($delta == 0.0) {
            return;
        }

        $balance = StockBalance::firstOrCreate(['location_id' => $locationId, 'item_id' => $itemId], ['quantity' => 0]);
        $balance = StockBalance::whereKey($balance->id)->lockForUpdate()->first();

        $new = round($balance->quantity + $delta, 3);
        if ($new < 0) {
            $item = Item::find($itemId);
            $location = Location::find($locationId);
            throw ValidationException::withMessages([
                $errorKey ?? 'items' => [sprintf(
                    'Stok %s di %s tidak cukup. Tersedia %s %s.',
                    $item?->name, $location?->name, Fmt::qty($balance->quantity), $item?->unit,
                )],
            ]);
        }

        $balance->update(['quantity' => $new]);

        StockMovement::create([
            'location_id' => $locationId,
            'item_id' => $itemId,
            'type' => $type,
            'quantity' => $delta,
            'balance_after' => $new,
            'movement_date' => $date,
            'reference_type' => $reference?->getMorphClass(),
            'reference_id' => $reference?->getKey(),
            'reference_number' => $reference?->number ?? null,
            'user_id' => $user?->id,
            'note' => $note,
        ]);
    }

    /** @return array<int, float> item_id => saldo saat ini */
    public static function balances(int $locationId): array
    {
        return StockBalance::where('location_id', $locationId)
            ->pluck('quantity', 'item_id')
            ->map(fn ($q) => (float) $q)
            ->all();
    }

    /**
     * Rekap per barang untuk satu lokasi dan rentang tanggal:
     * saldo awal, masuk, keluar, saldo akhir (+ status terhadap min/max untuk gudang).
     */
    public static function report(Location $location, string $from, string $to): Collection
    {
        $sums = DB::table('stock_movements')
            ->where('location_id', $location->id)
            ->whereDate('movement_date', '<=', $to)
            ->groupBy('item_id')
            ->selectRaw('item_id,
                sum(case when movement_date < ? then quantity else 0 end) as opening,
                sum(case when movement_date >= ? and quantity > 0 then quantity else 0 end) as qty_in,
                sum(case when movement_date >= ? and quantity < 0 then -quantity else 0 end) as qty_out', [$from, $from, $from])
            ->get()
            ->keyBy('item_id');

        // Gudang menampilkan semua barang aktif miliknya yang sudah terdaftar pada akhir periode
        // (acuan min/max untuk PR); lapangan hanya yang pernah bergerak sampai akhir periode.
        $items = Item::query()
            ->where(function ($q) use ($sums, $location, $to) {
                $q->whereIn('id', $sums->keys());
                if ($location->type === LocationType::Warehouse) {
                    $q->orWhere(fn ($q) => $q->where('warehouse_id', $location->id)->where('is_active', true)
                        ->whereDate('created_at', '<=', $to));
                }
            })
            ->orderBy('category')->orderBy('name')
            ->get();

        return $items->map(function (Item $item) use ($sums, $location) {
            $s = $sums->get($item->id);
            $opening = round((float) ($s->opening ?? 0), 3);
            $in = round((float) ($s->qty_in ?? 0), 3);
            $out = round((float) ($s->qty_out ?? 0), 3);
            $closing = round($opening + $in - $out, 3);

            $status = null;
            if ($location->type === LocationType::Warehouse) {
                if ($item->min_stock !== null && $closing < $item->min_stock) {
                    $status = 'below_min';
                } elseif ($item->max_stock !== null && $closing > $item->max_stock) {
                    $status = 'above_max';
                } else {
                    $status = 'ok';
                }
            }

            return [
                'item_id' => $item->id,
                'name' => $item->name,
                'category' => $item->category->value,
                'unit' => $item->unit,
                'opening' => $opening,
                'in' => $in,
                'out' => $out,
                'closing' => $closing,
                'min_stock' => $item->min_stock,
                'max_stock' => $item->max_stock,
                'status' => $status,
            ];
        })->values();
    }

    /** Rentang tanggal untuk periode laporan. @return array{0: string, 1: string} */
    public static function periodRange(string $period, string $date, ?string $from = null, ?string $to = null): array
    {
        $d = \Illuminate\Support\Carbon::parse($date);

        return match ($period) {
            'mingguan' => [$d->copy()->startOfWeek()->toDateString(), $d->copy()->endOfWeek()->toDateString()],
            'bulanan' => [$d->copy()->startOfMonth()->toDateString(), $d->copy()->endOfMonth()->toDateString()],
            'custom' => [$from ?? $d->toDateString(), $to ?? $d->toDateString()],
            default => [$d->toDateString(), $d->toDateString()],
        };
    }
}
