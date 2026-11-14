<?php

namespace App\Http\Controllers;

use App\Models\Vendor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Master vendor (Purchasing/Finance/Admin). */
class VendorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));

        $vendors = Vendor::query()
            ->when($search !== '', fn ($q) => $q->where('name', 'ilike', "%{$search}%"))
            ->when(! $request->boolean('all'), fn ($q) => $q->where('is_active', true))
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $vendors]);
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json(['data' => Vendor::create($this->validated($request))], 201);
    }

    public function update(Request $request, Vendor $vendor): JsonResponse
    {
        $vendor->update($this->validated($request, $vendor));

        return response()->json(['data' => $vendor]);
    }

    public function destroy(Vendor $vendor): JsonResponse
    {
        if (\App\Models\PurchaseOrder::where('vendor_id', $vendor->id)->exists()) {
            throw ValidationException::withMessages(['vendor' => ['Vendor sudah dipakai di PO. Nonaktifkan saja.']]);
        }

        $vendor->delete();

        return response()->json(['message' => 'Vendor dihapus.']);
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
        ], ['name.unique' => 'Nama vendor sudah ada.']);
    }
}
