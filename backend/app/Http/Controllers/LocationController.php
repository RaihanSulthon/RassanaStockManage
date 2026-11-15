<?php

namespace App\Http\Controllers;

use App\Enums\LocationType;
use App\Models\Location;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Gudang & lapangan. Daftar terlihat sesuai penugasan; tambah/ubah/hapus hanya Admin. */
class LocationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();
        $ids = $actor->visibleLocationIds();
        $search = trim((string) $request->query('search', ''));

        $locations = Location::query()
            ->with('parent:id,name')
            ->withCount(['users', 'items', 'vendors'])
            ->when($ids !== null, fn ($q) => $q->whereIn('id', $ids))
            ->when(! $request->boolean('all'), fn ($q) => $q->where('is_active', true))
            // Cari di nama/alamat lokasi, juga nama gudang induk (agar "Gudang X" ikut menampilkan lapangannya).
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q
                ->where('name', 'ilike', "%{$search}%")
                ->orWhere('address', 'ilike', "%{$search}%")
                ->orWhereHas('parent', fn ($p) => $p->where('name', 'ilike', "%{$search}%"))))
            ->orderBy('type', 'desc') // warehouse dulu
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $locations->map(fn (Location $l) => $this->present($l, $actor))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $location = Location::create($data);

        return response()->json(['data' => $this->present($location->load('parent'), $request->user())], 201);
    }

    public function update(Request $request, Location $location): JsonResponse
    {
        $data = $this->validated($request, $location);

        if ($data['type'] !== $location->type->value && $this->isUsed($location)) {
            throw ValidationException::withMessages(['type' => ['Jenis lokasi tidak bisa diubah karena sudah dipakai.']]);
        }
        // Barang lapangan adalah milik gudang induknya, jadi lapangan yang sudah dipakai tidak bisa pindah gudang.
        if (($data['parent_id'] ?? null) != $location->parent_id && $this->isUsed($location)) {
            throw ValidationException::withMessages(['parent_id' => ['Lapangan sudah punya stok/dokumen, tidak bisa dipindah ke gudang lain.']]);
        }

        $location->update($data);

        return response()->json(['data' => $this->present($location->load('parent'), $request->user())]);
    }

    public function destroy(Location $location): JsonResponse
    {
        if ($this->isUsed($location) || $location->children()->exists() || $location->items()->exists()) {
            throw ValidationException::withMessages([
                'location' => ['Lokasi sudah dipakai (punya barang, stok, dokumen, atau lapangan). Nonaktifkan saja.'],
            ]);
        }

        $location->delete();

        return response()->json(['message' => 'Lokasi dihapus.']);
    }

    private function validated(Request $request, ?Location $location = null): array
    {
        $data = $request->validate([
            'type' => ['required', Rule::enum(LocationType::class)],
            'name' => ['required', 'string', 'max:100', Rule::unique('locations')->where('type', $request->input('type'))->ignore($location?->id)],
            'parent_id' => [
                Rule::requiredIf($request->input('type') === LocationType::Field->value),
                'nullable', 'integer',
                Rule::exists('locations', 'id')->where('type', LocationType::Warehouse->value),
            ],
            'address' => ['nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
        ], [
            'parent_id.required' => 'Pilih gudang induk untuk lapangan ini.',
            'name.unique' => 'Nama lokasi sudah dipakai.',
        ]);

        if ($data['type'] === LocationType::Warehouse->value) {
            $data['parent_id'] = null;
        }

        return $data;
    }

    private function isUsed(Location $location): bool
    {
        return DB::table('stock_balances')->where('location_id', $location->id)->exists()
            || DB::table('user_requests')->where('field_id', $location->id)->orWhere('warehouse_id', $location->id)->exists()
            || DB::table('purchase_requisitions')->where('warehouse_id', $location->id)->exists()
            || DB::table('transfers')->where('from_location_id', $location->id)->orWhere('to_location_id', $location->id)->exists()
            || DB::table('usages')->where('location_id', $location->id)->exists();
    }

    private function present(Location $l, $actor): array
    {
        return [
            'id' => $l->id,
            'type' => $l->type->value,
            'type_label' => $l->type->label(),
            'name' => $l->name,
            'parent_id' => $l->parent_id,
            'parent' => $l->parent?->only(['id', 'name']),
            'address' => $l->address,
            'is_active' => $l->is_active,
            'users_count' => $l->users_count ?? null,
            'items_count' => $l->items_count ?? null,
            'vendors_count' => $l->vendors_count ?? null,
            'assigned' => $actor->isAssignedTo($l->id),
        ];
    }
}
