<?php

use Illuminate\Support\Facades\Route;
use PrismShare\Http\Controllers\LinksController;

// Every route is under /api/client/servers/{server}/extensions/prism-share.

Route::get('/links', [LinksController::class, 'index'])->name('links');
Route::post('/links', [LinksController::class, 'store'])->middleware('throttle:20,1,prism-share-links-store')->name('links.store');
Route::patch('/links/{link}', [LinksController::class, 'update'])->whereNumber('link')->name('links.update');
Route::delete('/links/{link}', [LinksController::class, 'destroy'])->whereNumber('link')->name('links.destroy');
