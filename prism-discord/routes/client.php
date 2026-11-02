<?php

use Illuminate\Support\Facades\Route;
use PrismDiscord\Http\Controllers\AccountController;

// Under /api/client/extensions/prism-discord: the signed-in user's Discord link.

Route::get('/account', [AccountController::class, 'show'])->name('account');
Route::post('/account/link', [AccountController::class, 'link'])->middleware('throttle:10,1,prism-discord-link')->name('account.link');
Route::delete('/account/link', [AccountController::class, 'unlink'])->name('account.unlink');
