<?php

use Illuminate\Support\Facades\Route;
use TerrariaSuite\Http\Controllers\InfoController;
use TerrariaSuite\Http\Controllers\PlayersController;
use TerrariaSuite\Http\Controllers\SettingsController;
use TerrariaSuite\Http\Controllers\VersionsController;

// Every route is under /api/client/servers/{server}/extensions/terraria-suite.

Route::get('/info', [InfoController::class, 'show'])->name('info');

Route::get('/settings', [SettingsController::class, 'show'])->name('settings');
Route::patch('/settings', [SettingsController::class, 'update'])->name('settings.update');

Route::get('/versions', [VersionsController::class, 'index'])->name('versions');
Route::post('/versions/install', [VersionsController::class, 'install'])->name('versions.install');

Route::get('/players', [PlayersController::class, 'index'])->name('players');
Route::post('/players/action', [PlayersController::class, 'action'])->name('players.action');
Route::get('/players/accounts/{account}', [PlayersController::class, 'show'])->where('account', '[0-9]+')->name('players.show');
