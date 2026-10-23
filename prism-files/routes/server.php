<?php

use Illuminate\Support\Facades\Route;
use PrismFiles\Http\Controllers\FilesController;

// Every route is under /api/client/servers/{server}/extensions/prism-files.

Route::get('/state', [FilesController::class, 'state'])->name('state');
Route::put('/preferences', [FilesController::class, 'preferences'])->name('preferences');

Route::post('/trash', [FilesController::class, 'trash'])->name('trash');
Route::post('/trash/restore', [FilesController::class, 'restore'])->name('trash.restore');
Route::post('/trash/purge', [FilesController::class, 'purge'])->name('trash.purge');
Route::post('/trash/empty', [FilesController::class, 'empty'])->name('trash.empty');
Route::post('/trash/ignore', [FilesController::class, 'ignore'])->name('trash.ignore');

Route::post('/delete', [FilesController::class, 'delete'])->name('delete');
Route::post('/rename', [FilesController::class, 'rename'])->name('rename');
Route::post('/write', [FilesController::class, 'write'])->name('write');
