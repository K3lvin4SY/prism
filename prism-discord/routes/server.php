<?php

use Illuminate\Support\Facades\Route;
use PrismDiscord\Http\Controllers\HooksController;

// Every route is under /api/client/servers/{server}/extensions/prism-discord.

Route::get('/hooks', [HooksController::class, 'index'])->name('hooks');
Route::post('/hooks', [HooksController::class, 'store'])->middleware('throttle:20,1,prism-discord-store')->name('hooks.store');
Route::patch('/hooks/{hook}', [HooksController::class, 'update'])->whereNumber('hook')->name('hooks.update');
Route::delete('/hooks/{hook}', [HooksController::class, 'destroy'])->whereNumber('hook')->name('hooks.destroy');
Route::post('/hooks/{hook}/test', [HooksController::class, 'test'])->whereNumber('hook')->middleware('throttle:10,1,prism-discord-test')->name('hooks.test');
