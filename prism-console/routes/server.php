<?php

use Illuminate\Support\Facades\Route;
use PrismConsole\Http\Controllers\ConsoleController;

// Every route is under /api/client/servers/{server}/extensions/prism-console.

Route::get('/console', [ConsoleController::class, 'show'])->name('console');
Route::put('/preferences', [ConsoleController::class, 'preferences'])->name('preferences');
Route::post('/history', [ConsoleController::class, 'record'])->name('history.record');
Route::put('/history/pin', [ConsoleController::class, 'pin'])->name('history.pin');
Route::delete('/history', [ConsoleController::class, 'clear'])->name('history.clear');
