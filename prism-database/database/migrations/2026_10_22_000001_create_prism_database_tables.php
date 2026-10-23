<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A database shared with another server shows on that server's Databases page too.
        Schema::create('prism_database_shares', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('database_id');
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('created_by')->nullable();
            $table->timestamps();
            $table->unique(['database_id', 'server_id']);
            $table->foreign('database_id')->references('id')->on('databases')->cascadeOnDelete();
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });

        // Size and rows, sampled every hour for the 30 day chart.
        Schema::create('prism_database_usage', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('database_id');
            $table->unsignedBigInteger('size');
            $table->unsignedBigInteger('rows');
            $table->unsignedSmallInteger('tables');
            $table->timestamp('recorded_at')->index();
            $table->index(['database_id', 'recorded_at']);
            $table->foreign('database_id')->references('id')->on('databases')->cascadeOnDelete();
        });

        // Backups, imports and exports: each a file on the panel and a job with a status.
        Schema::create('prism_database_files', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('database_id');
            $table->string('type', 16);
            $table->string('status', 16)->default('pending');
            $table->string('label', 120)->nullable();
            $table->boolean('automatic')->default(false);
            $table->boolean('locked')->default(false);
            $table->string('path', 512)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->text('message')->nullable();
            $table->json('state')->nullable();
            $table->unsignedInteger('user_id')->nullable();
            $table->string('job', 64)->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
            $table->index(['database_id', 'type']);
            $table->foreign('database_id')->references('id')->on('databases')->cascadeOnDelete();
        });

        // Automatic backup schedules, one per database.
        Schema::create('prism_database_schedules', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('database_id')->unique();
            $table->boolean('enabled')->default(false);
            $table->string('interval', 16)->default('daily');
            $table->unsignedSmallInteger('keep')->default(7);
            $table->timestamp('next_at')->nullable();
            $table->timestamps();
            $table->foreign('database_id')->references('id')->on('databases')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_database_schedules');
        Schema::dropIfExists('prism_database_files');
        Schema::dropIfExists('prism_database_usage');
        Schema::dropIfExists('prism_database_shares');
    }
};
