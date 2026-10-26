<?php

use Illuminate\Support\Facades\Route;
use PrismAuth\Http\Controllers\IdentitiesController;

// Under /api/client/extensions/prism-auth.

Route::get('/identities', [IdentitiesController::class, 'index'])->name('identities');
Route::delete('/identities/{identity}', [IdentitiesController::class, 'destroy'])->whereNumber('identity')->name('identities.destroy');
