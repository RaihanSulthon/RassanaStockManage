<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Location;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

trait PresentsDocuments
{
    protected function userRef(?User $u): ?array
    {
        return $u ? ['id' => $u->id, 'name' => $u->name] : null;
    }

    protected function locationRef(?Location $l): ?array
    {
        return $l ? ['id' => $l->id, 'name' => $l->name, 'type' => $l->type->value] : null;
    }

    /** Baris barang standar: item_id + info barang + jumlah. */
    protected function line(Model $line, array $extra = []): array
    {
        return [
            'id' => $line->id,
            'item_id' => $line->item_id,
            'name' => $line->item?->name,
            'unit' => $line->item?->unit,
            'category' => $line->item?->category->value,
            'note' => $line->note,
            ...$extra,
        ];
    }

    protected function logs(Model $doc): array
    {
        return $doc->logs->map->toApi()->values()->all();
    }

    /** Pagination metadata ringkas untuk FE. */
    protected function paginated($paginator, callable $map): array
    {
        return [
            'data' => collect($paginator->items())->map($map)->values(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ];
    }

    protected function exportFormat(string $format): string
    {
        abort_unless(in_array($format, ['pdf', 'excel'], true), 404);

        return $format;
    }

    protected function dateFilters(Request $request): array
    {
        return $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'string', 'max:30'],
        ]);
    }
}
