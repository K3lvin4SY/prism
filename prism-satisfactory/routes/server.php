<?php

use Illuminate\Support\Facades\Route;
use PrismSatisfactory\Http\Controllers\InfoController;
use PrismSatisfactory\Http\Controllers\ModsController;
use PrismSatisfactory\Http\Controllers\PlansController;
use PrismSatisfactory\Http\Controllers\PlayersController;
use PrismSatisfactory\Http\Controllers\PropertiesController;
use PrismSatisfactory\Http\Controllers\VersionsController;

// Every route is under /api/client/servers/{server}/extensions/prism-satisfactory.

Route::get('/info', [InfoController::class, 'show'])->name('info');

Route::get('/players', [PlayersController::class, 'index'])->name('players');
Route::get('/players/{player}', [PlayersController::class, 'show'])->where('player', '[^/]{1,64}')->name('players.show');

Route::get('/properties', [PropertiesController::class, 'show'])->name('properties');
Route::patch('/properties', [PropertiesController::class, 'update'])->name('properties.update');
Route::post('/properties/connect', [PropertiesController::class, 'connect'])->name('properties.connect');
Route::post('/properties/claim', [PropertiesController::class, 'claim'])->name('properties.claim');
Route::post('/properties/disconnect', [PropertiesController::class, 'disconnect'])->name('properties.disconnect');
Route::post('/properties/new-game', [PropertiesController::class, 'newGame'])->name('properties.new-game');
Route::post('/properties/save-game', [PropertiesController::class, 'saveGame'])->name('properties.save-game');

Route::get('/versions', [VersionsController::class, 'index'])->name('versions');
Route::post('/versions/install', [VersionsController::class, 'install'])->name('versions.install');

Route::post('/plans/{job}/advance', [PlansController::class, 'advance'])->where('job', '[0-9a-f-]{36}')->name('plans.advance');

Route::get('/mods', [ModsController::class, 'index'])->name('mods');
Route::get('/mods/meta', [ModsController::class, 'meta'])->name('mods.meta');
Route::get('/mods/search', [ModsController::class, 'search'])->name('mods.search');
Route::get('/mods/updates', [ModsController::class, 'updates'])->name('mods.updates');
Route::get('/mods/item/{mod}', [ModsController::class, 'show'])->where('mod', '[A-Za-z0-9_]{1,64}')->name('mods.show');
Route::post('/mods/install', [ModsController::class, 'install'])->name('mods.install');
Route::post('/mods/toggle', [ModsController::class, 'toggle'])->name('mods.toggle');
Route::post('/mods/remove', [ModsController::class, 'remove'])->name('mods.remove');
