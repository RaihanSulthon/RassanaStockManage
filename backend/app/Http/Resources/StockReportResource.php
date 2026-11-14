<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\StockReport */
class StockReportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $actor = $request->user();

        return [
            'id' => $this->id,
            'type' => $this->type->value,
            'type_label' => $this->type->label(),
            'report_date' => $this->report_date->toDateString(),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'note' => $this->note,
            'items_count' => $this->whenCounted('items'),
            'creator' => $this->whenLoaded('creator', fn () => $this->creator?->only(['id', 'name'])),
            'operator' => $this->whenLoaded('operator', fn () => $this->operator?->only(['id', 'name'])),
            'completer' => $this->whenLoaded('completer', fn () => $this->completer?->only(['id', 'name'])),
            'submitted_at' => $this->submitted_at,
            'operation_submitted_at' => $this->operation_submitted_at,
            'completed_at' => $this->completed_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'id' => $i->id,
                'name' => $i->name,
                'unit' => $i->unit,
                'quantity' => $i->quantity,
                'note' => $i->note,
            ])->values()),
            'logs' => $this->whenLoaded('logs', fn () => $this->logs->map(fn ($l) => [
                'id' => $l->id,
                'action' => $l->action,
                'user' => $l->user?->only(['id', 'name']),
                'user_role' => $l->user?->role->label(),
                'detail' => $l->detail,
                'created_at' => $l->created_at,
            ])->values()),
            // Memberi tahu FE tombol mana yang boleh tampil (BE tetap memvalidasi ulang).
            'can' => $this->when($actor !== null, fn () => [
                'update' => $actor->can('update', $this->resource),
                'submit' => $actor->can('submit', $this->resource),
                'submit_label' => $this->status->submitLabel(),
                'complete' => $actor->can('complete', $this->resource),
                'export' => $actor->can('export', $this->resource),
                'delete' => $actor->can('delete', $this->resource),
            ]),
        ];
    }
}
