<?php

use Illuminate\Support\Facades\Route;
use PrismAuth\Http\Controllers\SignInController;
use PrismAuth\Http\Controllers\SignupController;

// Under /prism-auth, in the web group: public, with the session, for the browser's redirects
// and the sign-in page.

Route::get('/providers', [SignInController::class, 'providers'])->name('providers');
Route::get('/result', [SignInController::class, 'result'])->name('result');
Route::get('/pending', [SignInController::class, 'pending'])->name('pending');
Route::delete('/pending', [SignInController::class, 'forgetPending'])->name('pending.forget');

Route::post('/signup', [SignupController::class, 'store'])->middleware('throttle:10,1')->name('signup');
Route::post('/resend', [SignupController::class, 'resend'])->middleware('throttle:5,1')->name('resend');
// The emailed link only leads to a page that asks; the POST makes the account.
Route::get('/verify/{token}', [SignupController::class, 'open'])->where('token', '[A-Za-z0-9]{40}')->middleware('throttle:20,1')->name('verify');
Route::post('/verify/preview', [SignupController::class, 'preview'])->middleware('throttle:20,1')->name('verify.preview');
Route::post('/verify', [SignupController::class, 'verify'])->middleware('throttle:20,1')->name('verify.confirm');

Route::get('/{slug}/redirect', [SignInController::class, 'redirect'])->where('slug', '[a-z0-9-]+')->name('redirect');
Route::get('/{slug}/callback', [SignInController::class, 'callback'])->where('slug', '[a-z0-9-]+')->middleware('throttle:30,1')->name('callback');
