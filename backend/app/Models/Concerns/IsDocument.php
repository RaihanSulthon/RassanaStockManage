<?php

namespace App\Models\Concerns;

use App\Models\DocumentLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * Dokumen alur: punya nomor otomatis (PREFIX-YYYYMM-00001) dan riwayat aktivitas.
 * Model wajib mendefinisikan const NUMBER_PREFIX.
 */
trait IsDocument
{
    public static function bootIsDocument(): void
    {
        static::created(function ($model) {
            if (! $model->number) {
                $model->number = sprintf('%s-%s-%05d', static::NUMBER_PREFIX, now()->format('Ym'), $model->id);
                $model->saveQuietly();
            }
        });
    }

    public function logs(): MorphMany
    {
        return $this->morphMany(DocumentLog::class, 'loggable')->orderBy('id');
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
