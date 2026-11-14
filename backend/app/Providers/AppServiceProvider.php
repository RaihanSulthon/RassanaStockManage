<?php

namespace App\Providers;

use App\Models\GoodsReceipt;
use App\Models\Payment;
use App\Models\PurchaseOrder;
use App\Models\PurchaseRequisition;
use App\Models\Transfer;
use App\Models\Usage;
use App\Models\UserRequest;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Nama pendek untuk relasi polimorfik (riwayat dokumen & referensi mutasi stok).
        Relation::morphMap([
            'user_request' => UserRequest::class,
            'purchase_requisition' => PurchaseRequisition::class,
            'purchase_order' => PurchaseOrder::class,
            'goods_receipt' => GoodsReceipt::class,
            'transfer' => Transfer::class,
            'usage' => Usage::class,
            'payment' => Payment::class,
        ]);
    }
}
