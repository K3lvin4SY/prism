<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A schedule: when it runs, what must hold first, and its steps as a tree (If/Else nests).
        Schema::create('prism_schedules', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->string('name', 100);
            $table->boolean('enabled')->default(true);
            $table->json('trigger');
            $table->json('conditions')->nullable();
            $table->json('steps');
            $table->string('color', 16)->nullable();
            $table->timestamp('paused_until')->nullable();
            $table->timestamp('next_run_at')->nullable()->index();
            $table->timestamp('last_run_at')->nullable();
            $table->string('last_status', 16)->nullable();
            $table->timestamps();
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });

        // Each run, step by step, with where it has got to.
        Schema::create('prism_schedule_runs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('schedule_id');
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('user_id')->nullable();
            $table->string('status', 16)->default('running');
            $table->string('trigger', 32);
            $table->json('log');
            $table->json('state');
            $table->timestamp('started_at');
            $table->timestamp('finished_at')->nullable();
            $table->index(['schedule_id', 'started_at']);
            $table->foreign('schedule_id')->references('id')->on('prism_schedules')->cascadeOnDelete();
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_schedule_runs');
        Schema::dropIfExists('prism_schedules');
    }
};
