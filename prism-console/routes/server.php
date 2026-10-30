<?php

use Illuminate\Support\Facades\Route;
use PrismConsole\Http\Controllers\ConsoleController;

// Every route is under /api/client/servers/{server}/extensions/prism-console.

Route::get('/console', [ConsoleController::class, 'show'])->name('console');
Route::put('/preferences', [ConsoleController::class, 'preferences'])->name('preferences');
Route::post('/history', [ConsoleController::class, 'record'])->name('history.record');
Route::delete('/history', [ConsoleController::class, 'clear'])->name('history.clear');
Route::post('/quick-commands', [ConsoleController::class, 'storeQuick'])->middleware('throttle:30,1,prism-console-quick')->name('quick.store');
Route::patch('/quick-commands/{command}', [ConsoleController::class, 'updateQuick'])->whereNumber('command')->name('quick.update');
Route::delete('/quick-commands/{command}', [ConsoleController::class, 'destroyQuick'])->whereNumber('command')->name('quick.destroy');
