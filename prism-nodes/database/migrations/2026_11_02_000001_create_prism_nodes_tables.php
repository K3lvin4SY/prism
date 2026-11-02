<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // What a node's servers used, added up every few minutes, for the history graphs.
        Schema::create('prism_nodes_samples', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('node_id');
            $table->timestamp('taken_at');
            $table->float('cpu')->default(0);
            $table->unsignedBigInteger('memory_bytes')->default(0);
            $table->unsignedBigInteger('disk_bytes')->default(0);
            $table->unsignedSmallInteger('running')->default(0);
            $table->index(['node_id', 'taken_at']);
            $table->foreign('node_id')->references('id')->on('nodes')->cascadeOnDelete();
        });

        // Servers waiting to move to another node, moving, or moved. One moves at a time.
        Schema::create('prism_nodes_moves', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('from_node_id');
            $table->unsignedInteger('to_node_id');
            $table->unsignedInteger('requested_by')->nullable();
            $table->string('status', 12)->default('queued');
            $table->unsignedBigInteger('transfer_id')->nullable();
            $table->string('error', 500)->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
            $table->index('status');
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('to_node_id')->references('id')->on('nodes')->cascadeOnDelete();
            $table->foreign('requested_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_nodes_moves');
        Schema::dropIfExists('prism_nodes_samples');
    }
};
