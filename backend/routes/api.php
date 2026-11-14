<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\StockReportController;
use App\Http\Controllers\StockReportExportController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok']));

// Publik (dibatasi 5 percobaan per menit agar tahan brute force)
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

// Wajib login (token Bearer)
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Stok harian (bahan & barang). Hak akses per tahap ada di StockReportPolicy.
    Route::get('/stock-reports/summary', [StockReportController::class, 'summary']);
    Route::get('/stock-reports/suggestions', [StockReportController::class, 'suggestions']);
    Route::apiResource('stock-reports', StockReportController::class);
    Route::post('/stock-reports/{stock_report}/submit', [StockReportController::class, 'submit']);
    Route::post('/stock-reports/{stock_report}/complete', [StockReportController::class, 'complete']);
    Route::get('/stock-reports/{stock_report}/export/pdf', [StockReportExportController::class, 'pdf']);
    Route::get('/stock-reports/{stock_report}/export/excel', [StockReportExportController::class, 'excel']);

    // Hanya Admin & Co-Admin. Aturan detail (siapa boleh mengelola siapa) ada di UserPolicy.
    Route::middleware('role:admin,co_admin')->group(function () {
        Route::apiResource('users', UserController::class);
    });
});
