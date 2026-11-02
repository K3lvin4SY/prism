<?php

use Illuminate\Support\Facades\Route;
use PrismQuotas\Http\Controllers\MyServersController;

// Under /api/client/extensions/prism-quotas: the signed-in person's own quota and servers. Not {server}:
// the panel binds that name to a server's identifier on client routes.

Route::get('/me', [MyServersController::class, 'show'])->name('me');
Route::post('/servers', [MyServersController::class, 'store'])->middleware('throttle:5,1,prism-quotas-create')->name('servers.store');
Route::delete('/servers/{id}', [MyServersController::class, 'destroy'])->whereNumber('id')->middleware('throttle:10,1,prism-quotas-delete')->name('servers.destroy');
