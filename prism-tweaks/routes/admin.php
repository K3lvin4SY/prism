<?php

use Illuminate\Support\Facades\Route;
use PrismTweaks\Http\Controllers\UsersController;

// Under /api/admin/extensions/prism-tweaks.

Route::get('/users', [UsersController::class, 'index'])->name('users');
