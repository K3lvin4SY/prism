<?php

use Illuminate\Support\Facades\Route;
use PrismShare\Http\Controllers\GuestController;

// Under /share, in the web group: public. The guest's token comes in the X-Prism-Share header
// on every request, never in the address the server sees. Each limit has its own prefix:
// without one, every throttle on these routes counts against one shared total per address.

Route::get('/', [GuestController::class, 'page'])->name('page');

Route::prefix('/api')->group(function () {
    Route::get('/info', [GuestController::class, 'info'])->middleware('throttle:30,1,prism-share-info')->name('info');
    Route::get('/websocket', [GuestController::class, 'websocket'])->middleware('throttle:30,1,prism-share-websocket')->name('websocket');
    Route::post('/command', [GuestController::class, 'command'])->middleware('throttle:30,1,prism-share-command')->name('command');
    Route::post('/power', [GuestController::class, 'power'])->middleware('throttle:6,1,prism-share-power')->name('power');
    Route::get('/files', [GuestController::class, 'files'])->middleware('throttle:60,1,prism-share-files')->name('files');
    Route::get('/files/download', [GuestController::class, 'download'])->middleware('throttle:20,1,prism-share-download')->name('download');
    Route::get('/backups', [GuestController::class, 'backups'])->middleware('throttle:30,1,prism-share-backups')->name('backups');
    Route::get('/backups/{backup}/download', [GuestController::class, 'backupDownload'])->whereUuid('backup')->middleware('throttle:10,1,prism-share-backups-download')->name('backups.download');
});
