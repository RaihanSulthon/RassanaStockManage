<?php

namespace App\Support;

use App\Models\Item;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/** Validasi baris barang yang dipakai semua dokumen (UR, PR, PO, pengiriman, pemakaian). */
class LineItems
{
    /**
     * @param  array<string, mixed>  $extraRules  aturan tambahan per baris, mis. ['unit_price' => [...]]
     * @return array<int, array<string, mixed>>
     */
    public static function validate(Request $request, array $extraRules = [], string $qtyField = 'quantity', bool $allowZero = false): array
    {
        $rules = [
            'items' => ['required', 'array', 'min:1', 'max:300'],
            'items.*.item_id' => ['required', 'integer', 'exists:items,id'],
            "items.*.{$qtyField}" => ['required', 'numeric', $allowZero ? 'min:0' : 'gt:0', 'max:99999999'],
            'items.*.note' => ['nullable', 'string', 'max:255'],
        ];
        foreach ($extraRules as $field => $r) {
            $rules["items.*.{$field}"] = $r;
        }

        $data = $request->validate($rules, [
            'items.required' => 'Tambahkan minimal 1 barang.',
            'items.min' => 'Tambahkan minimal 1 barang.',
            'items.*.item_id.required' => 'Pilih barang.',
            'items.*.item_id.exists' => 'Barang tidak ditemukan.',
            "items.*.{$qtyField}.required" => 'Jumlah wajib diisi.',
            "items.*.{$qtyField}.numeric" => 'Jumlah harus berupa angka.',
            "items.*.{$qtyField}.gt" => 'Jumlah harus lebih dari 0.',
            "items.*.{$qtyField}.min" => 'Jumlah tidak boleh negatif.',
        ]);

        $seen = [];
        $inactive = Item::whereIn('id', array_column($data['items'], 'item_id'))->where('is_active', false)->pluck('name', 'id');
        foreach ($data['items'] as $i => $line) {
            if (isset($seen[$line['item_id']])) {
                throw ValidationException::withMessages(["items.{$i}.item_id" => ['Barang ini sudah ada di daftar.']]);
            }
            if ($inactive->has($line['item_id'])) {
                throw ValidationException::withMessages(["items.{$i}.item_id" => ["{$inactive[$line['item_id']]} sudah tidak aktif."]]);
            }
            $seen[$line['item_id']] = true;
        }

        return array_map(fn ($l) => [
            ...$l,
            'item_id' => (int) $l['item_id'],
            $qtyField => round((float) $l[$qtyField], 3),
            'note' => isset($l['note']) && trim($l['note']) !== '' ? trim($l['note']) : null,
        ], $data['items']);
    }

    /** Daftar perubahan yang mudah dibaca untuk riwayat. @return array<int, string> */
    public static function diff($oldLines, array $newLines, string $qtyField = 'quantity'): array
    {
        $names = Item::whereIn('id', [...collect($oldLines)->pluck('item_id'), ...array_column($newLines, 'item_id')])->get()->keyBy('id');
        $old = collect($oldLines)->keyBy('item_id');
        $new = collect($newLines)->keyBy('item_id');
        $label = fn ($id) => $names[$id]->name ?? "#{$id}";
        $unit = fn ($id) => $names[$id]->unit ?? '';

        $changes = [];
        foreach ($new as $id => $line) {
            if (! $old->has($id)) {
                $changes[] = "Tambah {$label($id)}: ".Fmt::qty($line[$qtyField])." {$unit($id)}";

                continue;
            }
            $before = (float) $old[$id][$qtyField];
            if (abs($before - (float) $line[$qtyField]) > 0.0005) {
                $changes[] = "{$label($id)}: ".Fmt::qty($before).' → '.Fmt::qty($line[$qtyField])." {$unit($id)}";
            }
            if (isset($line['unit_price']) && abs((float) $old[$id]['unit_price'] - (float) $line['unit_price']) > 0.005) {
                $changes[] = "Harga {$label($id)}: ".Fmt::money($old[$id]['unit_price']).' → '.Fmt::money($line['unit_price']);
            }
        }
        foreach ($old as $id => $line) {
            if (! $new->has($id)) {
                $changes[] = "Hapus {$label($id)}";
            }
        }

        return $changes;
    }
}
