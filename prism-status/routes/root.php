<?php

use Illuminate\Support\Facades\Route;
use PrismStatus\Http\Controllers\PageController;

// Under /status, in the web group: public unless the admin asks for a signed-in visitor.

Route::get('/', [PageController::class, 'page'])->name('page');
Route::get('/api/summary', [PageController::class, 'summary'])->middleware('throttle:60,1,prism-status-summary')->name('summary');
