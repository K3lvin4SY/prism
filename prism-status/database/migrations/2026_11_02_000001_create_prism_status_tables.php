<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A node or server shown on the status page under a name the admin chose. Its current
        // state is kept here; the history is counted per day below.
        Schema::create('prism_status_components', function (Blueprint $table) {
            $table->id();
            $table->string('type', 8);
            $table->unsignedInteger('ref_id');
            $table->string('label', 64);
            $table->string('group', 64)->default('');
            $table->unsignedInteger('sort')->default(0);
            $table->string('state', 12)->default('unknown');
            $table->timestamp('checked_at')->nullable();
            $table->timestamp('changed_at')->nullable();
            $table->timestamps();
            $table->unique(['type', 'ref_id']);
        });

        // Minutes checked and minutes up, per component and day.
        Schema::create('prism_status_days', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('component_id');
            $table->date('day');
            $table->unsignedSmallInteger('checks')->default(0);
            $table->unsignedSmallInteger('up')->default(0);
            $table->unique(['component_id', 'day']);
            $table->foreign('component_id')->references('id')->on('prism_status_components')->cascadeOnDelete();
        });

        Schema::create('prism_status_incidents', function (Blueprint $table) {
            $table->id();
            $table->string('title', 120);
            $table->string('impact', 12);
            $table->string('status', 16);
            $table->json('components');
            // What was written to Prism Layout's announcement, and what it said before, to undo it.
            $table->json('announcement')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
            $table->index('resolved_at');
        });

        Schema::create('prism_status_updates', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('incident_id');
            $table->string('status', 16);
            $table->text('body');
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('incident_id')->references('id')->on('prism_status_incidents')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_status_updates');
        Schema::dropIfExists('prism_status_incidents');
        Schema::dropIfExists('prism_status_days');
        Schema::dropIfExists('prism_status_components');
    }
};
