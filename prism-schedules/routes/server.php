<?php

use Illuminate\Support\Facades\Route;
use PrismSchedules\Http\Controllers\SchedulesController;

// Every route is under /api/client/servers/{server}/extensions/prism-schedules.

Route::get('/state', [SchedulesController::class, 'state'])->name('state');
Route::post('/cron', [SchedulesController::class, 'cron'])->name('cron');
Route::post('/schedules', [SchedulesController::class, 'store'])->name('schedules.store');

Route::prefix('/schedules/{schedule}')->whereNumber('schedule')->group(function () {
    Route::put('/', [SchedulesController::class, 'update'])->name('schedules.update');
    Route::delete('/', [SchedulesController::class, 'destroy'])->name('schedules.destroy');
    Route::post('/run', [SchedulesController::class, 'run'])->name('schedules.run');
    Route::post('/pause', [SchedulesController::class, 'pause'])->name('schedules.pause');
    Route::post('/copy', [SchedulesController::class, 'copy'])->name('schedules.copy');
    Route::get('/runs', [SchedulesController::class, 'runs'])->name('schedules.runs');
});

Route::get('/runs/{run}', [SchedulesController::class, 'showRun'])->whereNumber('run')->name('runs.show');
Route::post('/runs/{run}/stop', [SchedulesController::class, 'stop'])->whereNumber('run')->name('runs.stop');
