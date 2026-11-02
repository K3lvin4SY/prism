<?php

use Illuminate\Support\Facades\Route;
use PrismQuotas\Http\Controllers\AdminQuotasController;

// Under /api/admin/extensions/prism-quotas: the limits and the eggs on offer.

Route::get('/overview', [AdminQuotasController::class, 'overview'])->name('overview');
Route::put('/limits/default', [AdminQuotasController::class, 'saveDefault'])->name('limits.default');
Route::put('/limits/{user}', [AdminQuotasController::class, 'saveUser'])->whereNumber('user')->name('limits.user');
Route::delete('/limits/{user}', [AdminQuotasController::class, 'removeUser'])->whereNumber('user')->name('limits.remove');
Route::get('/users', [AdminQuotasController::class, 'users'])->name('users');
Route::post('/offers', [AdminQuotasController::class, 'storeOffer'])->name('offers.store');
Route::patch('/offers/{offer}', [AdminQuotasController::class, 'updateOffer'])->whereNumber('offer')->name('offers.update');
Route::delete('/offers/{offer}', [AdminQuotasController::class, 'destroyOffer'])->whereNumber('offer')->name('offers.destroy');
