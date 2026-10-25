<?php

use Illuminate\Support\Facades\Route;
use PrismLayout\Http\Controllers\PicturesController;
use PrismLayout\Http\Controllers\TagsController;

// Under /api/client/extensions/prism-layout.

Route::get('/pictures', [PicturesController::class, 'index'])->name('pictures');
Route::get('/logos', [PicturesController::class, 'logos'])->name('logos');
Route::get('/tags', [TagsController::class, 'index'])->name('tags');
Route::get('/pictures/{picture}', [PicturesController::class, 'show'])->whereNumber('picture')->name('pictures.show');
