<?php

namespace App\Http\Controllers;

use App\Enums\Role;
use App\Http\Resources\UserResource;
use App\Enums\LocationType;
use App\Models\Location;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rules\Password;

class UserController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('viewAny', User::class);

        $search = trim((string) $request->query('search', ''));

        $users = User::query()
            ->with('locations:id,name,type')
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'ilike', "%{$search}%")
                        ->orWhere('email', 'ilike', "%{$search}%");
                });
            })
            ->orderBy('id')
            ->paginate(10);

        return UserResource::collection($users);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', User::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', Password::min(8)],
            // Role yang boleh diberikan tergantung role pembuatnya.
            'role' => ['required', Rule::in($request->user()->role->manageableRoleValues())],
            'location_ids' => ['nullable', 'array'],
            'location_ids.*' => ['integer'],
        ]);
        $locationIds = $this->locationIds($data['role'], $data['location_ids'] ?? []);
        unset($data['location_ids']);

        $user = DB::transaction(function () use ($data, $locationIds) {
            $user = User::create($data);
            $user->locations()->sync($locationIds);

            return $user;
        });

        return (new UserResource($user->load('locations')))->response()->setStatusCode(201);
    }

    public function show(User $user): UserResource
    {
        Gate::authorize('view', $user);

        return new UserResource($user->load('locations'));
    }

    public function update(Request $request, User $user): UserResource
    {
        Gate::authorize('update', $user);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['nullable', Password::min(8)],
            'role' => ['sometimes', 'required', Rule::in($request->user()->role->manageableRoleValues())],
            'location_ids' => ['sometimes', 'nullable', 'array'],
            'location_ids.*' => ['integer'],
        ]);

        $role = $data['role'] ?? $user->role->value;
        if (array_key_exists('location_ids', $data) || isset($data['role'])) {
            $user->locations()->sync($this->locationIds($role, $data['location_ids'] ?? $user->assignedLocationIds()));
        }
        unset($data['location_ids']);

        if (empty($data['password'])) {
            unset($data['password']);
        }

        if (isset($data['role']) && $user->role === Role::Admin && $data['role'] !== Role::Admin->value) {
            $this->ensureNotLastAdmin();
        }

        $user->update($data);

        // Kalau password/role diubah, paksa user itu login ulang.
        if (isset($data['password']) || isset($data['role'])) {
            $user->tokens()->delete();
        }

        return new UserResource($user->refresh()->load('locations'));
    }

    public function destroy(User $user): JsonResponse
    {
        Gate::authorize('delete', $user);

        if ($user->role === Role::Admin) {
            $this->ensureNotLastAdmin();
        }

        try {
            DB::transaction(function () use ($user) {
                $user->tokens()->delete();
                $user->delete();
            });
        } catch (QueryException) {
            // Masih direferensikan dokumen (UR/PR/PO/penerimaan/pengiriman/pemakaian/pembayaran).
            throw ValidationException::withMessages([
                'user' => ['User ini sudah tercatat di dokumen stok sehingga tidak bisa dihapus.'],
            ]);
        }

        return response()->json(['message' => 'User berhasil dihapus.']);
    }

    /**
     * Penugasan lokasi sesuai role:
     *  - Logistic   -> gudang (boleh lebih dari satu)
     *  - Operation1 -> lapangan (boleh lebih dari satu)
     *  - User       -> tepat satu lapangan
     * Role lain tidak ditugaskan ke lokasi (melihat semua).
     *
     * @return array<int, int>
     */
    private function locationIds(string $role, array $ids): array
    {
        $type = match ($role) {
            Role::Logistic->value => LocationType::Warehouse,
            Role::Operation1->value, Role::User->value => LocationType::Field,
            default => null,
        };
        if (! $type) {
            return [];
        }

        $valid = Location::whereIn('id', $ids)->where('type', $type->value)->pluck('id')->all();
        if (count($valid) !== count(array_unique($ids))) {
            throw ValidationException::withMessages(['location_ids' => [
                $type === LocationType::Warehouse ? 'Logistic hanya bisa ditugaskan ke gudang.' : 'Operation dan User hanya bisa ditugaskan ke lapangan.',
            ]]);
        }
        if ($role === Role::User->value && count($valid) > 1) {
            throw ValidationException::withMessages(['location_ids' => ['User hanya bisa ditugaskan ke satu lapangan.']]);
        }

        return $valid;
    }

    private function ensureNotLastAdmin(): void
    {
        if (User::where('role', Role::Admin->value)->count() <= 1) {
            throw ValidationException::withMessages([
                'role' => ['Tidak bisa mengubah/menghapus Admin terakhir.'],
            ]);
        }
    }
}
