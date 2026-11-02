<?php

use Illuminate\Support\Facades\Route;
use PrismStatus\Http\Controllers\ComponentsController;
use PrismStatus\Http\Controllers\IncidentsController;

// Under /api/admin/extensions/prism-status: what the page shows and the incidents.

Route::get('/components', [ComponentsController::class, 'index'])->name('components');
Route::get('/candidates', [ComponentsController::class, 'candidates'])->name('candidates');
Route::post('/components', [ComponentsController::class, 'store'])->name('components.store');
Route::put('/components/order', [ComponentsController::class, 'order'])->name('components.order');
Route::patch('/components/{component}', [ComponentsController::class, 'update'])->whereNumber('component')->name('components.update');
Route::delete('/components/{component}', [ComponentsController::class, 'destroy'])->whereNumber('component')->name('components.destroy');

Route::get('/incidents', [IncidentsController::class, 'index'])->name('incidents');
Route::post('/incidents', [IncidentsController::class, 'store'])->name('incidents.store');
Route::post('/incidents/{incident}/updates', [IncidentsController::class, 'post'])->whereNumber('incident')->name('incidents.post');
Route::delete('/incidents/{incident}', [IncidentsController::class, 'destroy'])->whereNumber('incident')->name('incidents.destroy');
