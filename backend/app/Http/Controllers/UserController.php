<?php

namespace App\Http\Controllers;

use App\Enums\Role;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
        ]);

        $user = User::create($data);

        return (new UserResource($user))->response()->setStatusCode(201);
    }

    public function show(User $user): UserResource
    {
        Gate::authorize('view', $user);

        return new UserResource($user);
    }

    public function update(Request $request, User $user): UserResource
    {
        Gate::authorize('update', $user);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['nullable', Password::min(8)],
            'role' => ['sometimes', 'required', Rule::in($request->user()->role->manageableRoleValues())],
        ]);

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

        return new UserResource($user->refresh());
    }

    public function destroy(User $user): JsonResponse
    {
        Gate::authorize('delete', $user);

        if ($user->role === Role::Admin) {
            $this->ensureNotLastAdmin();
        }

        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'User berhasil dihapus.']);
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
