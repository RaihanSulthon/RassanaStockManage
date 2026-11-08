<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\User */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $actor = $request->user();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'role_label' => $this->role->label(),
            'created_at' => $this->created_at,
            // Memberi tahu FE tombol mana yang boleh ditampilkan (BE tetap memvalidasi ulang).
            'can' => $this->when($actor !== null, fn () => [
                'update' => $actor->can('update', $this->resource),
                'delete' => $actor->can('delete', $this->resource),
            ]),
        ];
    }
}
