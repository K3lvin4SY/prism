<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A Discord webhook a server posts to, and which of its events it posts. The address is encrypted.
        Schema::create('prism_discord_hooks', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('user_id')->nullable();
            $table->string('name', 64);
            $table->text('webhook');
            $table->json('events');
            $table->json('templates');
            $table->string('mention_role', 24)->nullable();
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_sent_at')->nullable();
            $table->string('last_error', 255)->nullable();
            $table->timestamps();
            $table->index(['server_id', 'enabled']);
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_discord_hooks');
    }
};
