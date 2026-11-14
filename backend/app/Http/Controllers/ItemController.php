<?php

namespace App\Http\Controllers;

use App\Enums\ItemCategory;
use App\Enums\Role;
use App\Models\Item;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Master barang. Semua role bisa melihat (untuk memilih barang),
 * tetapi harga hanya untuk Purchasing/Finance/Admin dan min/max hanya untuk Operation ke atas.
 * Tambah/ubah oleh Purchasing/Finance/Admin.
 */
class ItemController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'category' => ['nullable', Rule::enum(ItemCategory::class)],
            'search' => ['nullable', 'string', 'max:100'],
        ]);
        $search = trim((string) $request->query('search', ''));

        $items = Item::query()
            ->when($request->query('category'), fn ($q, $v) => $q->where('category', $v))
            ->when($search !== '', fn ($q) => $q->where('name', 'ilike', "%{$search}%"))
            ->when(! $request->boolean('all'), fn ($q) => $q->where('is_active', true))
            ->orderBy('category')->orderBy('name')
            ->get();

        return response()->json(['data' => $items->map(fn ($i) => $this->present($i, $request->user()))]);
    }

    public function store(Request $request): JsonResponse
    {
        $item = Item::create($this->validated($request));

        return response()->json(['data' => $this->present($item, $request->user())], 201);
    }

    public function update(Request $request, Item $item): JsonResponse
    {
        $data = $this->validated($request, $item);

        if ($data['unit'] !== $item->unit && $this->isUsed($item)) {
            throw ValidationException::withMessages(['unit' => ['Satuan tidak bisa diubah karena barang sudah dipakai di stok/dokumen.']]);
        }

        $item->update($data);

        return response()->json(['data' => $this->present($item, $request->user())]);
    }

    public function destroy(Item $item): JsonResponse
    {
        if ($this->isUsed($item)) {
            throw ValidationException::withMessages(['item' => ['Barang sudah dipakai di stok/dokumen. Nonaktifkan saja.']]);
        }

        $item->delete();

        return response()->json(['message' => 'Barang dihapus.']);
    }

    private function validated(Request $request, ?Item $item = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150', Rule::unique('items')->ignore($item?->id)],
            'category' => ['required', Rule::enum(ItemCategory::class)],
            'unit' => ['required', 'string', 'max:30'],
            'min_stock' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'max_stock' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'price' => ['nullable', 'numeric', 'min:0', 'max:9999999999999'],
            'note' => ['nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
        ], [
            'name.unique' => 'Nama barang sudah ada.',
        ]);
        if (isset($data['min_stock'], $data['max_stock']) && $data['max_stock'] < $data['min_stock']) {
            throw ValidationException::withMessages(['max_stock' => ['Stok maksimal harus lebih besar atau sama dengan stok minimal.']]);
        }
        $data['name'] = trim($data['name']);
        $data['unit'] = trim($data['unit']);

        return $data;
    }

    private function isUsed(Item $item): bool
    {
        return DB::table('stock_movements')->where('item_id', $item->id)->exists()
            || DB::table('user_request_items')->where('item_id', $item->id)->exists()
            || DB::table('purchase_requisition_items')->where('item_id', $item->id)->exists()
            || DB::table('purchase_order_items')->where('item_id', $item->id)->exists();
    }

    private function present(Item $i, User $actor): array
    {
        return [
            'id' => $i->id,
            'name' => $i->name,
            'category' => $i->category->value,
            'category_label' => $i->category->label(),
            'unit' => $i->unit,
            'note' => $i->note,
            'is_active' => $i->is_active,
            // Min/max acuan PR: terlihat oleh Operation ke atas.
            ...($actor->hasRole(Role::User) ? [] : ['min_stock' => $i->min_stock, 'max_stock' => $i->max_stock]),
            // Harga hanya Purchasing/Finance/Admin.
            ...($actor->role->isPrivileged() ? ['price' => $i->price] : []),
        ];
    }
}
