<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A note or checklist on a server. A checklist's items live in `items`, each with who ticked it.
        Schema::create('prism_notes_notes', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('user_id')->nullable();
            $table->unsignedInteger('updated_by')->nullable();
            $table->string('kind', 16)->default('note');
            $table->string('title', 120);
            $table->text('body');
            $table->json('items');
            $table->boolean('pinned')->default(false);
            $table->string('color', 7)->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
            $table->index(['server_id', 'position']);
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_notes_notes');
    }
};
