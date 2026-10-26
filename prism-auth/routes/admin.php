<?php

use Illuminate\Support\Facades\Route;
use PrismAuth\Http\Controllers\ProvidersController;

// Under /api/admin/extensions/prism-auth.

Route::get('/providers', [ProvidersController::class, 'index'])->name('providers');
Route::post('/providers', [ProvidersController::class, 'store'])->name('providers.store');
Route::put('/providers/order', [ProvidersController::class, 'order'])->name('providers.order');
Route::patch('/providers/{provider}', [ProvidersController::class, 'update'])->whereNumber('provider')->name('providers.update');
Route::delete('/providers/{provider}', [ProvidersController::class, 'destroy'])->whereNumber('provider')->name('providers.destroy');
Route::post('/providers/{provider}/test', [ProvidersController::class, 'test'])->whereNumber('provider')->name('providers.test');
