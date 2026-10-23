<?php

use Illuminate\Support\Facades\Route;
use PrismBackups\Http\Controllers\BackupsController;
use PrismBackups\Http\Controllers\FilesController;
use PrismBackups\Http\Controllers\ProfilesController;

// Every route is under /api/client/servers/{server}/extensions/prism-backups.

Route::get('/state', [BackupsController::class, 'state'])->name('state');

Route::prefix('/backups/{uuid}')->where(['uuid' => '[0-9a-f-]{36}'])->group(function () {
    Route::get('/browse', [BackupsController::class, 'browse'])->name('backups.browse');
    Route::post('/browse', [BackupsController::class, 'open'])->name('backups.open');
    Route::post('/restore-files', [BackupsController::class, 'restoreFiles'])->name('backups.restore-files');
});

Route::get('/jobs/{job}', [BackupsController::class, 'job'])->whereNumber('job')->name('jobs.show');

Route::post('/profiles', [ProfilesController::class, 'store'])->name('profiles.store');
Route::put('/profiles/{profile}', [ProfilesController::class, 'update'])->whereNumber('profile')->name('profiles.update');
Route::delete('/profiles/{profile}', [ProfilesController::class, 'destroy'])->whereNumber('profile')->name('profiles.destroy');

Route::get('/files', [FilesController::class, 'directory'])->name('files');
Route::get('/pteroignore', [FilesController::class, 'readIgnore'])->name('pteroignore');
Route::put('/pteroignore', [FilesController::class, 'writeIgnore'])->name('pteroignore.update');
