<?php

use Illuminate\Support\Facades\Route;
use McSuite\Http\Controllers\InfoController;
use McSuite\Http\Controllers\PropertiesController;
use McSuite\Http\Controllers\VersionsController;

// Every route is under /api/client/servers/{server}/extensions/mc-suite.

Route::get('/info', [InfoController::class, 'show'])->name('info');
Route::get('/status', [InfoController::class, 'status'])->name('status');

Route::get('/properties', [PropertiesController::class, 'show'])->name('properties');
Route::patch('/properties', [PropertiesController::class, 'update'])->name('properties.update');
Route::put('/properties/icon', [PropertiesController::class, 'updateIcon'])->name('properties.icon');
Route::delete('/properties/icon', [PropertiesController::class, 'deleteIcon'])->name('properties.icon.delete');

Route::get('/versions', [VersionsController::class, 'index'])->name('versions');
Route::post('/versions/install', [VersionsController::class, 'install'])->name('versions.install');
Route::get('/versions/{type}', [VersionsController::class, 'versions'])->where('type', '[A-Za-z0-9_]+')->name('versions.type');
Route::get('/versions/{type}/{version}', [VersionsController::class, 'builds'])->where(['type' => '[A-Za-z0-9_]+', 'version' => '[A-Za-z0-9._+-]+'])->name('versions.builds');
