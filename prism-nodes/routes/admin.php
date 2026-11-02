<?php

use Illuminate\Support\Facades\Route;
use PrismNodes\Http\Controllers\MovesController;
use PrismNodes\Http\Controllers\NodesController;

// Under /api/admin/extensions/prism-nodes: node health, maintenance mode and moving servers.

Route::get('/nodes', [NodesController::class, 'index'])->name('nodes');
Route::put('/nodes/{node}/maintenance', [NodesController::class, 'maintenance'])->whereNumber('node')->name('nodes.maintenance');
Route::get('/nodes/{node}/servers', [NodesController::class, 'servers'])->whereNumber('node')->name('nodes.servers');

Route::get('/moves', [MovesController::class, 'index'])->name('moves');
Route::post('/moves', [MovesController::class, 'store'])->name('moves.store');
Route::delete('/moves/finished', [MovesController::class, 'clear'])->name('moves.clear');
Route::delete('/moves/{move}', [MovesController::class, 'cancel'])->whereNumber('move')->name('moves.cancel');
