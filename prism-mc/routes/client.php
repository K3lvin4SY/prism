<?php

use Illuminate\Support\Facades\Route;
use PrismMc\Http\Controllers\PreferencesController;

// Every route is under /api/client/extensions/prism-mc and acts for the signed-in user.

Route::get('/preferences', [PreferencesController::class, 'show'])->name('preferences');
Route::put('/preferences', [PreferencesController::class, 'update'])->name('preferences.update');
