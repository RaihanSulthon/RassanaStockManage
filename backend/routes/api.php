<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok']));

// Publik (dibatasi 5 percobaan per menit agar tahan brute force)
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1');

// Wajib login (token Bearer)
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Hanya Admin & Co-Admin. Aturan detail (siapa boleh mengelola siapa) ada di UserPolicy.
    Route::middleware('role:admin,co_admin')->group(function () {
        Route::apiResource('users', UserController::class);
    });
});
