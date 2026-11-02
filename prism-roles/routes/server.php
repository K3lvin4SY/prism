<?php

use Illuminate\Support\Facades\Route;
use PrismRoles\Http\Controllers\ServerRolesController;

// Under /api/client/servers/{server}/extensions/prism-roles.

Route::get('/roles', [ServerRolesController::class, 'roles'])->name('roles');
Route::put('/pending', [ServerRolesController::class, 'pending'])->name('pending');
Route::delete('/pending', [ServerRolesController::class, 'forgetPending'])->name('pending.forget');
Route::get('/assignments', [ServerRolesController::class, 'assignments'])->name('assignments');
Route::post('/assignments/{subuser}/reapply', [ServerRolesController::class, 'reapply'])->whereUuid('subuser')->name('assignments.reapply');
Route::delete('/assignments/{subuser}', [ServerRolesController::class, 'unlink'])->whereUuid('subuser')->name('assignments.unlink');
