<?php

use Illuminate\Support\Facades\Route;
use PrismCoreKeeper\Http\Controllers\InfoController;
use PrismCoreKeeper\Http\Controllers\MapController;
use PrismCoreKeeper\Http\Controllers\ModsController;
use PrismCoreKeeper\Http\Controllers\PlayersController;
use PrismCoreKeeper\Http\Controllers\PropertiesController;
use PrismCoreKeeper\Http\Controllers\ServerModController;
use PrismCoreKeeper\Http\Controllers\VersionsController;

// Every route is under /api/client/servers/{server}/extensions/prism-corekeeper.

Route::get('/info', [InfoController::class, 'show'])->name('info');

Route::get('/players', [PlayersController::class, 'index'])->name('players');
Route::put('/players/admins', [PlayersController::class, 'admins'])->name('players.admins');
Route::get('/players/{player}', [PlayersController::class, 'show'])->where('player', '\d{17}|name:[^/]{1,64}')->name('players.show');

Route::get('/properties', [PropertiesController::class, 'show'])->name('properties');
Route::patch('/properties', [PropertiesController::class, 'update'])->name('properties.update');
Route::get('/servermod', [ServerModController::class, 'show'])->name('servermod');
Route::put('/servermod', [ServerModController::class, 'update'])->name('servermod.update');

Route::get('/versions', [VersionsController::class, 'index'])->name('versions');
Route::post('/versions/install', [VersionsController::class, 'install'])->name('versions.install');

Route::get('/map', [MapController::class, 'show'])->name('map');
Route::get('/map/file', [MapController::class, 'file'])->name('map.file');

Route::get('/mods', [ModsController::class, 'index'])->name('mods');
Route::get('/mods/meta', [ModsController::class, 'meta'])->name('mods.meta');
Route::get('/mods/search', [ModsController::class, 'search'])->name('mods.search');
Route::get('/mods/updates', [ModsController::class, 'updates'])->name('mods.updates');
Route::get('/mods/item/{mod}', [ModsController::class, 'show'])->where('mod', '(modio|steam):\d{1,20}')->name('mods.show');
Route::post('/mods/install', [ModsController::class, 'install'])->name('mods.install');
Route::post('/mods/toggle', [ModsController::class, 'toggle'])->name('mods.toggle');
Route::post('/mods/remove', [ModsController::class, 'remove'])->name('mods.remove');
Route::post('/mods/repair', [ModsController::class, 'repair'])->name('mods.repair');
Route::post('/mods/restart', [ModsController::class, 'restart'])->name('mods.restart');
