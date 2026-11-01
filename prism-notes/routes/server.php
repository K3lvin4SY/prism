<?php

use Illuminate\Support\Facades\Route;
use PrismNotes\Http\Controllers\NotesController;

// Every route is under /api/client/servers/{server}/extensions/prism-notes.

Route::get('/notes', [NotesController::class, 'index'])->name('notes');
Route::post('/notes', [NotesController::class, 'store'])->middleware('throttle:30,1,prism-notes-store')->name('notes.store');
Route::post('/notes/order', [NotesController::class, 'order'])->name('notes.order');
Route::patch('/notes/{note}', [NotesController::class, 'update'])->whereNumber('note')->name('notes.update');
Route::patch('/notes/{note}/items/{item}', [NotesController::class, 'tick'])->whereNumber('note')->where('item', '[A-Za-z0-9]{1,16}')->name('notes.tick');
Route::delete('/notes/{note}', [NotesController::class, 'destroy'])->whereNumber('note')->name('notes.destroy');
