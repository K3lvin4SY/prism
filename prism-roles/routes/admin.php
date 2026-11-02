<?php

use Illuminate\Support\Facades\Route;
use PrismRoles\Http\Controllers\AdminRolesController;

// Under /api/admin/extensions/prism-roles: the panel-wide roles.

Route::get('/roles', [AdminRolesController::class, 'index'])->name('roles');
Route::post('/roles', [AdminRolesController::class, 'store'])->name('roles.store');
Route::patch('/roles/{role}', [AdminRolesController::class, 'update'])->whereNumber('role')->name('roles.update');
Route::delete('/roles/{role}', [AdminRolesController::class, 'destroy'])->whereNumber('role')->name('roles.destroy');
