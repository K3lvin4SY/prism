<?php

use Illuminate\Routing\Middleware\ValidateSignature;
use Illuminate\Support\Facades\Route;
use McSuite\Support\Relay;

// GET /extensions/mc-suite/relay/{token}: a file the Panel fetched for Wings. Only valid
// through the signed, expiring link an install plan hands to Wings.
Route::get('/relay/{token}', function (string $token) {
    $path = Relay::path($token);
    abort_if($path === null, 404);

    return response()->download($path, 'download.zip', ['Content-Type' => 'application/zip']);
})->middleware(ValidateSignature::class)->where('token', '[A-Za-z0-9]{48}')->name('relay');
