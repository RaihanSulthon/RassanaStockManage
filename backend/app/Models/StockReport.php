<?php

namespace App\Models;

use App\Enums\Role;
use App\Enums\StockStatus;
use App\Enums\StockType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockReport extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'type' => StockType::class,
            'status' => StockStatus::class,
            'report_date' => 'date',
            'submitted_at' => 'datetime',
            'operation_submitted_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(StockReportItem::class)->orderBy('id');
    }

    public function logs(): HasMany
    {
        return $this->hasMany(StockReportLog::class)->orderBy('id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function operator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'operation_by');
    }

    public function completer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'completed_by');
    }

    /** Laporan yang boleh dilihat oleh user ini (mirror StockReportPolicy::view). */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return match ($user->role) {
            Role::Admin => $query,
            Role::Operation1 => $query->where('status', '!=', StockStatus::Draft->value),
            Role::CoAdmin => $query->whereIn('status', [
                StockStatus::PendingCoAdmin->value,
                StockStatus::Completed->value,
            ]),
            default => $query->where('created_by', $user->id),
        };
    }

    public function addLog(?User $user, string $action, ?array $detail = null): void
    {
        $this->logs()->create([
            'user_id' => $user?->id,
            'action' => $action,
            'detail' => $detail,
        ]);
    }
}
