<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ItemController;
use App\Http\Controllers\LocationController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PurchaseOrderController;
use App\Http\Controllers\PurchaseRequisitionController;
use App\Http\Controllers\StockController;
use App\Http\Controllers\TransferController;
use App\Http\Controllers\UsageController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\UserRequestController;
use App\Http\Controllers\VendorController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok']));

// Publik (dibatasi 5 percobaan per menit agar tahan brute force)
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

// Wajib login (token Bearer). Hak akses detail per dokumen ada di app/Policies.
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/dashboard', DashboardController::class);

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/read-all', [NotificationController::class, 'readAll']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'read']);

    // ---------- Master data: semua boleh melihat, ubah hanya Admin/Purchasing/Finance ----------
    Route::get('/locations', [LocationController::class, 'index']);
    Route::get('/items', [ItemController::class, 'index']);
    Route::middleware('role:admin,purchasing,finance')->group(function () {
        Route::apiResource('locations', LocationController::class)->only(['store', 'update', 'destroy']);
        Route::apiResource('items', ItemController::class)->only(['store', 'update', 'destroy']);
        Route::apiResource('vendors', VendorController::class)->except(['show']);
    });

    // ---------- Stok ----------
    Route::get('/stock/balances', [StockController::class, 'balances']);
    Route::get('/stock/report', [StockController::class, 'report']);
    Route::get('/stock/movements', [StockController::class, 'movements']);
    Route::get('/stock/report/export/{format}', [StockController::class, 'export']);
    Route::post('/stock/adjustments', [StockController::class, 'adjust']);

    // ---------- Pemakaian harian (lapangan) ----------
    Route::apiResource('usages', UsageController::class)->only(['index', 'store', 'show']);
    Route::post('/usages/{usage}/cancel', [UsageController::class, 'cancel']);

    // ---------- UR ----------
    Route::apiResource('user-requests', UserRequestController::class);
    Route::post('/user-requests/{user_request}/submit', [UserRequestController::class, 'submit']);
    Route::get('/user-requests/{user_request}/export/{format}', [UserRequestController::class, 'export']);

    // ---------- PR ----------
    Route::apiResource('purchase-requisitions', PurchaseRequisitionController::class);
    Route::post('/purchase-requisitions/{purchase_requisition}/submit', [PurchaseRequisitionController::class, 'submit']);
    Route::get('/purchase-requisitions/{purchase_requisition}/export/{format}', [PurchaseRequisitionController::class, 'export']);

    // ---------- PO + penerimaan + pembayaran ----------
    Route::apiResource('purchase-orders', PurchaseOrderController::class);
    Route::prefix('/purchase-orders/{purchase_order}')->group(function () {
        Route::post('/submit', [PurchaseOrderController::class, 'submit']);
        Route::post('/approve', [PurchaseOrderController::class, 'approve']);
        Route::post('/reject', [PurchaseOrderController::class, 'reject']);
        Route::post('/send', [PurchaseOrderController::class, 'send']);
        Route::post('/receipts', [PurchaseOrderController::class, 'receive']);
        Route::post('/close', [PurchaseOrderController::class, 'close']);
        Route::post('/payments', [PaymentController::class, 'store']);
        Route::get('/export/{format}', [PurchaseOrderController::class, 'export']);
        Route::get('/receipts/export/{format}', [PurchaseOrderController::class, 'exportReceipts']);
    });

    Route::get('/payments', [PaymentController::class, 'index']);
    Route::put('/payments/{payment}', [PaymentController::class, 'update']);
    Route::delete('/payments/{payment}', [PaymentController::class, 'destroy']);
    Route::post('/payments/{payment}/pay', [PaymentController::class, 'pay']);
    Route::get('/payments/{payment}/export/{format}', [PaymentController::class, 'export']);

    // ---------- Pengiriman gudang -> lapangan ----------
    Route::apiResource('transfers', TransferController::class)->only(['index', 'store', 'show']);
    Route::post('/transfers/{transfer}/receive', [TransferController::class, 'receive']);

    // ---------- Kelola user: hanya Admin ----------
    Route::middleware('role:admin')->group(function () {
        Route::apiResource('users', UserController::class);
    });
});
