<?php

use Illuminate\Support\Facades\Route;
use PrismFactorio\Http\Controllers\InfoController;
use PrismFactorio\Http\Controllers\ModsController;
use PrismFactorio\Http\Controllers\PlansController;
use PrismFactorio\Http\Controllers\PlayersController;
use PrismFactorio\Http\Controllers\PropertiesController;
use PrismFactorio\Http\Controllers\VersionsController;

// Every route is under /api/client/servers/{server}/extensions/prism-factorio.

Route::get('/info', [InfoController::class, 'show'])->name('info');

Route::get('/players', [PlayersController::class, 'index'])->name('players');
Route::post('/players/action', [PlayersController::class, 'action'])->name('players.action');
Route::post('/players/console-log', [PlayersController::class, 'consoleLog'])->name('players.console-log');
Route::get('/players/{player}', [PlayersController::class, 'show'])->where('player', '[A-Za-z0-9_.-]{1,60}')->name('players.show');

Route::get('/properties', [PropertiesController::class, 'show'])->name('properties');
Route::patch('/properties', [PropertiesController::class, 'update'])->name('properties.update');

Route::get('/versions', [VersionsController::class, 'index'])->name('versions');
Route::post('/versions/install', [VersionsController::class, 'install'])->name('versions.install');

Route::post('/plans/{job}/advance', [PlansController::class, 'advance'])->where('job', '[0-9a-f-]{36}')->name('plans.advance');

Route::get('/mods', [ModsController::class, 'index'])->name('mods');
Route::get('/mods/meta', [ModsController::class, 'meta'])->name('mods.meta');
Route::get('/mods/search', [ModsController::class, 'search'])->name('mods.search');
Route::get('/mods/updates', [ModsController::class, 'updates'])->name('mods.updates');
Route::get('/mods/item/{mod}', [ModsController::class, 'show'])->where('mod', '[A-Za-z0-9_. -]{1,100}')->name('mods.show');
Route::post('/mods/install', [ModsController::class, 'install'])->name('mods.install');
Route::post('/mods/toggle', [ModsController::class, 'toggle'])->name('mods.toggle');
Route::post('/mods/remove', [ModsController::class, 'remove'])->name('mods.remove');
