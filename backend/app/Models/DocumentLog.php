<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentLog extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'detail' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function toApi(): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action,
            'user' => $this->user?->only(['id', 'name']),
            'user_role' => $this->user?->role->label(),
            'detail' => $this->detail,
            'created_at' => $this->created_at,
        ];
    }
}
