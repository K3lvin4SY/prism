<?php

use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken;
use Illuminate\Support\Facades\Route;
use PrismDiscord\Http\Controllers\InteractionsController;

// Under /discord, in the web group: public. Discord posts here and signs every request, which
// the controller checks, so the browser CSRF check is left out.

Route::post('/interactions', InteractionsController::class)
    ->withoutMiddleware([PreventRequestForgery::class, ValidateCsrfToken::class, VerifyCsrfToken::class])
    ->middleware('throttle:120,1,prism-discord-interactions')
    ->name('interactions');
