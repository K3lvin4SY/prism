<?php

use Illuminate\Support\Facades\Route;
use PrismDatabase\Http\Controllers\DatabasesController;
use PrismDatabase\Http\Controllers\FilesController;
use PrismDatabase\Http\Controllers\QueryController;
use PrismDatabase\Http\Controllers\SharesController;
use PrismDatabase\Http\Controllers\TablesController;

// Every route is under /api/client/servers/{server}/extensions/prism-database.

Route::get('/databases', [DatabasesController::class, 'index'])->name('databases');

Route::prefix('/databases/{db}')->whereNumber('db')->group(function () {
    Route::get('/overview', [DatabasesController::class, 'overview'])->name('overview');

    Route::get('/tables', [TablesController::class, 'index'])->name('tables');
    Route::get('/tables/{table}/rows', [TablesController::class, 'rows'])->name('tables.rows');
    Route::get('/tables/{table}/structure', [TablesController::class, 'structure'])->name('tables.structure');
    Route::post('/tables/{table}/rows', [TablesController::class, 'insert'])->name('tables.insert');
    Route::patch('/tables/{table}/rows', [TablesController::class, 'update'])->name('tables.update');
    Route::post('/tables/{table}/rows/delete', [TablesController::class, 'delete'])->name('tables.delete');
    Route::post('/tables/{table}/empty', [TablesController::class, 'empty'])->name('tables.empty');
    Route::delete('/tables/{table}', [TablesController::class, 'drop'])->name('tables.drop');

    Route::post('/query', [QueryController::class, 'run'])->name('query');

    Route::get('/files', [FilesController::class, 'index'])->name('files');
    Route::post('/backups', [FilesController::class, 'backup'])->name('backups.create');
    Route::put('/schedule', [FilesController::class, 'schedule'])->name('schedule');
    Route::post('/import', [FilesController::class, 'import'])->name('import');
    Route::post('/export', [FilesController::class, 'export'])->name('export');
    Route::post('/files/{record}/lock', [FilesController::class, 'lock'])->whereNumber('record')->name('files.lock');
    Route::post('/files/{record}/restore', [FilesController::class, 'restore'])->whereNumber('record')->name('files.restore');
    Route::get('/files/{record}/download', [FilesController::class, 'download'])->whereNumber('record')->name('files.download');
    Route::delete('/files/{record}', [FilesController::class, 'destroy'])->whereNumber('record')->name('files.destroy');

    Route::get('/shares', [SharesController::class, 'candidates'])->name('shares');
    Route::post('/shares', [SharesController::class, 'store'])->name('shares.store');
    Route::delete('/shares/{target}', [SharesController::class, 'destroy'])->name('shares.destroy');
});
