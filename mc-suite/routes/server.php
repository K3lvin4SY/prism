<?php

use Illuminate\Support\Facades\Route;
use McSuite\Http\Controllers\ContentController;
use McSuite\Http\Controllers\CrossplayController;
use McSuite\Http\Controllers\InfoController;
use McSuite\Http\Controllers\MapController;
use McSuite\Http\Controllers\ModpacksController;
use McSuite\Http\Controllers\PatchBukkitController;
use McSuite\Http\Controllers\PlayersController;
use McSuite\Http\Controllers\ProxyController;
use McSuite\Http\Controllers\PropertiesController;
use McSuite\Http\Controllers\VersionsController;

// Every route is under /api/client/servers/{server}/extensions/mc-suite.

Route::get('/info', [InfoController::class, 'show'])->name('info');
Route::get('/status', [InfoController::class, 'status'])->name('status');

Route::get('/properties', [PropertiesController::class, 'show'])->name('properties');
Route::patch('/properties', [PropertiesController::class, 'update'])->name('properties.update');
Route::put('/properties/icon', [PropertiesController::class, 'updateIcon'])->name('properties.icon');
Route::delete('/properties/icon', [PropertiesController::class, 'deleteIcon'])->name('properties.icon.delete');

Route::get('/versions', [VersionsController::class, 'index'])->name('versions');
Route::post('/versions/install', [VersionsController::class, 'install'])->name('versions.install');
Route::get('/versions/{type}', [VersionsController::class, 'versions'])->where('type', '[A-Za-z0-9_]+')->name('versions.type');
Route::get('/versions/{type}/{version}', [VersionsController::class, 'builds'])->where(['type' => '[A-Za-z0-9_]+', 'version' => '[A-Za-z0-9._+-]+'])->name('versions.builds');

// Browsing works for modpacks too; installing them has its own routes below.
Route::prefix('/content/{kind}')->where(['kind' => 'plugins|mods|modpacks'])->group(function () {
    Route::get('/search', [ContentController::class, 'search'])->name('content.search');
    Route::get('/categories', [ContentController::class, 'categories'])->name('content.categories');
    Route::get('/projects/{project}', [ContentController::class, 'project'])->where('project', '[A-Za-z0-9_.-]+')->name('content.project');
});

Route::prefix('/content/{kind}')->where(['kind' => 'plugins|mods'])->group(function () {
    Route::get('/versions/{version}/dependencies', [ContentController::class, 'dependencies'])->where('version', '[A-Za-z0-9-]+')->name('content.dependencies');
    Route::get('/installed', [ContentController::class, 'installed'])->name('content.installed');
    Route::post('/install', [ContentController::class, 'install'])->name('content.install');
    Route::post('/updates', [ContentController::class, 'updates'])->name('content.updates');
    Route::post('/identify', [ContentController::class, 'identify'])->name('content.identify');
    Route::patch('/files/{file}', [ContentController::class, 'toggle'])->where('file', '[^/]+')->name('content.toggle');
    Route::delete('/files/{file}', [ContentController::class, 'destroy'])->where('file', '[^/]+')->name('content.destroy');
});

Route::get('/patchbukkit', [PatchBukkitController::class, 'show'])->name('patchbukkit');
Route::post('/patchbukkit', [PatchBukkitController::class, 'install'])->name('patchbukkit.install');

Route::get('/modpacks', [ModpacksController::class, 'current'])->name('modpacks');
Route::post('/modpacks/install', [ModpacksController::class, 'install'])->name('modpacks.install');

Route::get('/players', [PlayersController::class, 'index'])->name('players');
Route::post('/players/action', [PlayersController::class, 'action'])->name('players.action');
Route::put('/players/whitelist', [PlayersController::class, 'whitelist'])->name('players.whitelist');
Route::get('/players/skins/{key}', [PlayersController::class, 'skin'])->where('key', '[A-Za-z0-9_.*-]{1,40}')->name('players.skin');
Route::get('/players/bedrock/{xuid}', [PlayersController::class, 'bedrock'])->where('xuid', '[0-9]{1,20}')->name('players.bedrock');
Route::get('/players/{player}', [PlayersController::class, 'show'])->where('player', '[0-9a-fA-F-]{36}')->name('players.show');

Route::get('/map/{dimension}', [MapController::class, 'regions'])->where('dimension', 'overworld|the_nether|the_end')->name('map.regions');
Route::get('/map/{dimension}/{x}/{z}', [MapController::class, 'region'])->where(['dimension' => 'overworld|the_nether|the_end', 'x' => '-?\d+', 'z' => '-?\d+'])->name('map.region');

Route::get('/crossplay', [CrossplayController::class, 'show'])->name('crossplay');
Route::post('/crossplay', [CrossplayController::class, 'enable'])->name('crossplay.enable');
Route::delete('/crossplay', [CrossplayController::class, 'disable'])->name('crossplay.disable');

Route::get('/proxy', [ProxyController::class, 'show'])->name('proxy');
Route::get('/proxy/candidates', [ProxyController::class, 'candidates'])->name('proxy.candidates');
Route::post('/proxy/links', [ProxyController::class, 'link'])->name('proxy.link');
Route::patch('/proxy/links/{name}', [ProxyController::class, 'update'])->where('name', '[a-z0-9_-]{1,32}')->name('proxy.update');
Route::delete('/proxy/links/{name}', [ProxyController::class, 'unlink'])->where('name', '[a-z0-9_-]{1,32}')->name('proxy.unlink');
Route::patch('/proxy/settings', [ProxyController::class, 'settings'])->name('proxy.settings');
Route::post('/proxy/restart', [ProxyController::class, 'restart'])->name('proxy.restart');
