<?php

use Illuminate\Support\Facades\Route;
use PrismLayout\Http\Controllers\PicturesController;

// Under /api/client/extensions/prism-layout.

Route::get('/pictures', [PicturesController::class, 'index'])->name('pictures');
Route::get('/pictures/{picture}', [PicturesController::class, 'show'])->whereNumber('picture')->name('pictures.show');
