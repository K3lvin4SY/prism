<?php

use Illuminate\Support\Facades\Route;
use PrismLayout\Http\Controllers\ServerPictureController;

// Under /api/client/servers/{server}/extensions/prism-layout.

Route::get('/picture', [ServerPictureController::class, 'show'])->name('picture');
Route::post('/picture', [ServerPictureController::class, 'store'])->name('picture.store');
Route::delete('/picture', [ServerPictureController::class, 'destroy'])->name('picture.destroy');
