<?php

use Illuminate\Support\Facades\Route;
use TerrariaSuite\Http\Controllers\InfoController;
use TerrariaSuite\Http\Controllers\ModsController;
use TerrariaSuite\Http\Controllers\PlayersController;
use TerrariaSuite\Http\Controllers\PluginsController;
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

Route::get('/mods', [ModsController::class, 'index'])->name('mods');
Route::get('/mods/search', [ModsController::class, 'search'])->name('mods.search');
Route::get('/mods/updates', [ModsController::class, 'updates'])->name('mods.updates');
Route::get('/mods/workshop/{item}', [ModsController::class, 'show'])->where('item', '[0-9]{1,20}')->name('mods.show');
Route::post('/mods/install', [ModsController::class, 'install'])->name('mods.install');
Route::post('/mods/toggle', [ModsController::class, 'toggle'])->name('mods.toggle');
Route::post('/mods/remove', [ModsController::class, 'remove'])->name('mods.remove');
Route::post('/mods/repair', [ModsController::class, 'repair'])->name('mods.repair');

Route::get('/plugins', [PluginsController::class, 'index'])->name('plugins');
Route::get('/plugins/catalog', [PluginsController::class, 'catalog'])->name('plugins.catalog');
Route::post('/plugins/install', [PluginsController::class, 'install'])->name('plugins.install');
Route::post('/plugins/toggle', [PluginsController::class, 'toggle'])->name('plugins.toggle');
Route::post('/plugins/remove', [PluginsController::class, 'remove'])->name('plugins.remove');
