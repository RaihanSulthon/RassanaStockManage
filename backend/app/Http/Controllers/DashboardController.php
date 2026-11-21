<?php

namespace App\Http\Controllers;

use App\Enums\LocationType;
use App\Enums\PaymentStatus;
use App\Enums\PoStatus;
use App\Enums\RequestStatus;
use App\Enums\Role;
use App\Enums\TransferStatus;
use App\Models\Item;
use App\Models\Location;
use App\Models\Payment;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequisition;
use App\Models\StockBalance;
use App\Models\Transfer;
use App\Models\Usage;
use App\Models\UserRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Daftar "tugas saya" per role untuk Dashboard. */
class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $u = $request->user();
        $mine = $u->assignedLocationIds();
        $tasks = [];

        switch ($u->role) {
            case Role::User:
            case Role::Operation1:
                $tasks[] = ['label' => 'Pemakaian hari ini', 'count' => Usage::whereIn('location_id', $mine)->whereDate('usage_date', today())->whereNull('cancelled_at')->count(), 'url' => '/usage', 'info' => true];
                $tasks[] = ['label' => 'Kiriman gudang perlu dicatat penerimaannya', 'count' => Transfer::whereIn('to_location_id', $mine)->where('status', TransferStatus::Sent->value)->count(), 'url' => '/transfers?status=sent'];
                $tasks[] = ['label' => 'Barang susulan ditunggu', 'count' => Transfer::whereIn('to_location_id', $mine)->whereHas('items', fn ($q) => $q->where('shortage_status', 'in_transit'))->count(), 'url' => '/transfers?status=discrepancy'];
                if ($u->role === Role::Operation1) {
                    $tasks[] = ['label' => 'UR masih draft', 'count' => UserRequest::whereIn('field_id', $mine)->where('status', RequestStatus::Draft->value)->count(), 'url' => '/ur?status=draft'];
                }
                break;
            case Role::Logistic:
                $tasks[] = ['label' => 'UR menunggu evaluasi', 'count' => UserRequest::whereIn('warehouse_id', $mine)->where('status', RequestStatus::Submitted->value)->doesntHave('purchaseRequisition')->count(), 'url' => '/ur?status=submitted'];
                $tasks[] = ['label' => 'Selisih kiriman perlu ditindaklanjuti', 'count' => Transfer::whereIn('from_location_id', $mine)->whereHas('items', fn ($q) => $q->where('shortage_status', 'open'))->count(), 'url' => '/transfers?status=discrepancy'];
                $tasks[] = ['label' => 'PO menunggu barang datang', 'count' => PurchaseOrder::whereIn('warehouse_id', $mine)->whereIn('status', [PoStatus::Sent->value, PoStatus::PartiallyReceived->value])->count(), 'url' => '/po?status=sent'];
                $tasks[] = ['label' => 'PR masih draft', 'count' => PurchaseRequisition::whereIn('warehouse_id', $mine)->where('status', RequestStatus::Draft->value)->count(), 'url' => '/pr?status=draft'];
                $tasks[] = ['label' => 'Barang di bawah stok minimal', 'count' => $this->belowMin($mine), 'url' => '/warehouses'];
                break;
            case Role::Purchasing:
                $tasks[] = ['label' => 'PR menunggu dibuatkan PO', 'count' => PurchaseRequisition::where('status', RequestStatus::Submitted->value)->count(), 'url' => '/pr?status=submitted'];
                $tasks[] = ['label' => 'PO perlu revisi', 'count' => PurchaseOrder::where('status', PoStatus::Revision->value)->count(), 'url' => '/po?status=revision'];
                $tasks[] = ['label' => 'PO disetujui, belum dikirim ke vendor', 'count' => PurchaseOrder::where('status', PoStatus::Approved->value)->count(), 'url' => '/po?status=approved'];
                $tasks[] = ['label' => 'Barang tanpa harga', 'count' => Item::where('is_active', true)->whereNull('price')->count(), 'url' => '/warehouses'];
                break;
            case Role::Finance:
                $tasks[] = ['label' => 'PO menunggu approval', 'count' => PurchaseOrder::where('status', PoStatus::PendingApproval->value)->count(), 'url' => '/po?status=pending_approval'];
                $tasks[] = ['label' => 'PO sudah diterima, belum ada tagihan', 'count' => PurchaseOrder::whereIn('status', [PoStatus::PartiallyReceived->value, PoStatus::Received->value, PoStatus::Closed->value])->doesntHave('payments')->count(), 'url' => '/po?status=received'];
                $tasks[] = ['label' => 'Pembayaran disiapkan, belum dibayar', 'count' => Payment::where('status', PaymentStatus::Prepared->value)->count(), 'url' => '/payments?status=prepared'];
                break;
            case Role::Admin:
                $tasks[] = ['label' => 'PO menunggu approval', 'count' => PurchaseOrder::where('status', PoStatus::PendingApproval->value)->count(), 'url' => '/po?status=pending_approval', 'info' => true];
                $tasks[] = ['label' => 'Akun Logistic/Operation/User belum punya lokasi', 'count' => \App\Models\User::whereIn('role', [Role::Logistic->value, Role::Operation1->value, Role::User->value])->doesntHave('locations')->count(), 'url' => '/users'];
                break;
        }

        $locations = Location::query()
            ->when($u->visibleLocationIds() !== null, fn ($q) => $q->whereIn('id', $u->visibleLocationIds()))
            ->where('is_active', true)->get(['id', 'name', 'type']);

        return response()->json(['tasks' => $tasks, 'locations' => $locations->map(fn ($l) => ['id' => $l->id, 'name' => $l->name, 'type' => $l->type->value])]);
    }

    private function belowMin(array $warehouseIds): int
    {
        $warehouseIds = Location::whereIn('id', $warehouseIds)->where('type', LocationType::Warehouse->value)->pluck('id');
        $count = 0;
        $items = Item::whereIn('warehouse_id', $warehouseIds)->where('is_active', true)->whereNotNull('min_stock')->get(['id', 'warehouse_id', 'min_stock']);
        $balances = StockBalance::whereIn('location_id', $warehouseIds)->whereIn('item_id', $items->pluck('id'))->pluck('quantity', 'item_id');
        foreach ($items as $item) {
            if ((float) ($balances[$item->id] ?? 0) < $item->min_stock) {
                $count++;
            }
        }

        return $count;
    }
}
