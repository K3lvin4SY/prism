<?php

use Illuminate\Support\Facades\Route;
use PrismMail\Http\Controllers\EmailsController;
use PrismMail\Http\Controllers\LogController;

// Under /api/admin/extensions/prism-mail: the panel's emails and the delivery log.

Route::get('/emails', [EmailsController::class, 'index'])->name('emails');
Route::put('/emails/{email}', [EmailsController::class, 'update'])->where('email', '[a-z-]+')->name('emails.update');
Route::post('/emails/{email}/preview', [EmailsController::class, 'preview'])->where('email', '[a-z-]+')->name('emails.preview');
Route::post('/emails/{email}/test', [EmailsController::class, 'test'])->where('email', '[a-z-]+')->middleware('throttle:6,1')->name('emails.test');

Route::get('/log', [LogController::class, 'index'])->name('log');
Route::delete('/log', [LogController::class, 'clear'])->name('log.clear');
