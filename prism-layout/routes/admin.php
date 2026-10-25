<?php

use Illuminate\Support\Facades\Route;
use PrismLayout\Http\Controllers\EggPicturesController;
use PrismLayout\Http\Controllers\RefreshController;

// Under /api/admin/extensions/prism-layout.

Route::post('/refresh', RefreshController::class)->name('refresh');

Route::get('/pictures/eggs', [EggPicturesController::class, 'index'])->name('pictures.eggs');
Route::post('/pictures/eggs/{egg}', [EggPicturesController::class, 'store'])->whereNumber('egg')->name('pictures.eggs.store');
Route::delete('/pictures/eggs/{egg}', [EggPicturesController::class, 'destroy'])->whereNumber('egg')->name('pictures.eggs.destroy');
Route::post('/pictures/eggs/{egg}/logo', [EggPicturesController::class, 'storeLogo'])->whereNumber('egg')->name('pictures.eggs.logo.store');
Route::delete('/pictures/eggs/{egg}/logo', [EggPicturesController::class, 'destroyLogo'])->whereNumber('egg')->name('pictures.eggs.logo.destroy');
