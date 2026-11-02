<?php

use Illuminate\Support\Facades\Route;
use PrismRoles\Http\Controllers\MyRolesController;

// Under /api/client/extensions/prism-roles: the signed-in user's own roles.

Route::get('/roles', [MyRolesController::class, 'index'])->name('roles');
Route::post('/roles', [MyRolesController::class, 'store'])->middleware('throttle:30,1,prism-roles-store')->name('roles.store');
Route::patch('/roles/{role}', [MyRolesController::class, 'update'])->whereNumber('role')->name('roles.update');
Route::delete('/roles/{role}', [MyRolesController::class, 'destroy'])->whereNumber('role')->name('roles.destroy');
