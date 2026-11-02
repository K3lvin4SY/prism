<?php

use Illuminate\Support\Facades\Route;
use PrismAudit\Http\Controllers\AlertsController;
use PrismAudit\Http\Controllers\EventsController;

// Under /api/admin/extensions/prism-audit: the timeline, its export and the alerts.

Route::get('/events', [EventsController::class, 'index'])->name('events');
Route::get('/events/export', [EventsController::class, 'export'])->middleware('throttle:10,1')->name('events.export');
Route::get('/filters', [EventsController::class, 'filters'])->name('filters');
Route::get('/lookup', [EventsController::class, 'lookup'])->name('lookup');

Route::get('/alerts', [AlertsController::class, 'index'])->name('alerts');
Route::post('/alerts/read', [AlertsController::class, 'read'])->name('alerts.read');
