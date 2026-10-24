<?php

use Illuminate\Support\Facades\Route;
use PrismLayout\Http\Controllers\RefreshController;

// Under /api/admin/extensions/prism-layout.

Route::post('/refresh', RefreshController::class)->name('refresh');
