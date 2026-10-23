<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // What a backup includes: everything except some patterns, or only what was picked.
        Schema::create('prism_backup_profiles', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->string('name', 64);
            $table->string('mode', 16)->default('exclude');
            $table->text('patterns');
            $table->boolean('apply_pteroignore')->default(false);
            $table->boolean('lock_backups')->default(false);
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->unique(['server_id', 'name']);
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });

        // The profile a backup was made with, shown beside it in the list.
        Schema::create('prism_backup_meta', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->char('backup_uuid', 36)->unique();
            $table->string('profile', 64)->nullable();
            $table->timestamps();
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });

        // Browsing a backup and restoring files from it: each a job with a status.
        Schema::create('prism_backup_jobs', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('user_id')->nullable();
            $table->char('backup_uuid', 36)->index();
            $table->string('type', 16);
            $table->string('status', 16)->default('pending');
            $table->unsignedTinyInteger('progress')->default(0);
            $table->string('message', 1000)->nullable();
            $table->json('payload')->nullable();
            $table->json('state')->nullable();
            $table->timestamps();
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_backup_jobs');
        Schema::dropIfExists('prism_backup_meta');
        Schema::dropIfExists('prism_backup_profiles');
    }
};
