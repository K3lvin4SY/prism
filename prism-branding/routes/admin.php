<?php

use Illuminate\Support\Facades\Route;
use PrismBranding\Http\Controllers\RefreshController;

// Under /api/admin/extensions/prism-branding.

Route::post('/refresh', RefreshController::class)->name('refresh');
