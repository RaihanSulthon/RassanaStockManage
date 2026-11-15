<?php

namespace App\Http\Controllers;

use App\Enums\LocationType;
use App\Models\Location;
use App\Models\PurchaseOrder;
use App\Models\Vendor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Vendor (Purchasing/Finance/Admin). Satu vendor bisa melayani beberapa gudang;
 * vendor dikelola dari halaman gudang dan hanya vendor gudang itu yang bisa dipilih di PO-nya.
 */
class VendorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate(['warehouse_id' => ['nullable', 'integer']]);
        $search = trim((string) $request->query('search', ''));

        $vendors = Vendor::query()
            ->with('warehouses:id,name')
            ->withCount('purchaseOrders')
            ->when($request->query('warehouse_id'), fn ($q, $wid) => $q->whereHas('warehouses', fn ($w) => $w->whereKey($wid)))
            ->when($search !== '', fn ($q) => $q->where('name', 'ilike', "%{$search}%"))
            ->when(! $request->boolean('all'), fn ($q) => $q->where('is_active', true))
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $vendors->map(fn (Vendor $v) => $this->present($v))]);
    }

    /** Tambah vendor baru; jika warehouse_id diisi, langsung dipetakan ke gudang itu. */
    public function store(Request $request): JsonResponse
    {
        $warehouse = $request->filled('warehouse_id') ? $this->warehouse($request->input('warehouse_id')) : null;
        $vendor = Vendor::create($this->validated($request));
        $warehouse?->vendors()->syncWithoutDetaching([$vendor->id]);

        return response()->json(['data' => $this->present($vendor->load('warehouses:id,name'))], 201);
    }

    public function update(Request $request, Vendor $vendor): JsonResponse
    {
        $vendor->update($this->validated($request, $vendor));

        return response()->json(['data' => $this->present($vendor->load('warehouses:id,name'))]);
    }

    public function destroy(Vendor $vendor): JsonResponse
    {
        if (PurchaseOrder::where('vendor_id', $vendor->id)->exists()) {
            throw ValidationException::withMessages(['vendor' => ['Vendor sudah dipakai di PO. Nonaktifkan saja.']]);
        }

        $vendor->delete();

        return response()->json(['message' => 'Vendor dihapus.']);
    }

    /** Petakan vendor yang sudah ada ke gudang. */
    public function attach(Request $request, Location $location): JsonResponse
    {
        $warehouse = $this->warehouse($location->id);
        $request->validate(['vendor_id' => ['required', 'integer', 'exists:vendors,id']], ['vendor_id.required' => 'Pilih vendor.']);
        $warehouse->vendors()->syncWithoutDetaching([(int) $request->input('vendor_id')]);

        return response()->json(['message' => 'Vendor ditambahkan ke gudang.']);
    }

    /**
     * Lepas vendor dari gudang. Jika vendor tidak lagi melayani gudang mana pun dan belum pernah dipakai di PO,
     * datanya sekalian dihapus agar tidak menumpuk.
     */
    public function detach(Location $location, Vendor $vendor): JsonResponse
    {
        $warehouse = $this->warehouse($location->id);
        $warehouse->vendors()->detach($vendor->id);

        if (! $vendor->warehouses()->exists() && ! PurchaseOrder::where('vendor_id', $vendor->id)->exists()) {
            $vendor->delete();

            return response()->json(['message' => "Vendor \"{$vendor->name}\" dihapus."]);
        }

        return response()->json(['message' => "Vendor \"{$vendor->name}\" dilepas dari Gudang {$warehouse->name}."]);
    }

    private function warehouse(mixed $id): Location
    {
        $warehouse = Location::where('type', LocationType::Warehouse->value)->find($id);
        if (! $warehouse) {
            throw ValidationException::withMessages(['warehouse_id' => ['Gudang tidak ditemukan.']]);
        }

        return $warehouse;
    }

    private function validated(Request $request, ?Vendor $vendor = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:150', Rule::unique('vendors')->ignore($vendor?->id)],
            'contact_person' => ['nullable', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:150'],
            'address' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
        ], ['name.unique' => 'Nama vendor sudah ada. Pilih dari "Vendor yang sudah ada" untuk menambahkannya ke gudang ini.']);
    }

    private function present(Vendor $v): array
    {
        return [
            ...$v->only(['id', 'name', 'contact_person', 'phone', 'email', 'address', 'note', 'is_active']),
            'warehouses' => $v->relationLoaded('warehouses') ? $v->warehouses->map(fn ($w) => $w->only(['id', 'name']))->values() : [],
            'purchase_orders_count' => $v->purchase_orders_count ?? null,
        ];
    }
}
