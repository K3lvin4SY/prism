<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A panel user and the Discord account their slash commands come from, linked with a /link code.
        Schema::create('prism_discord_links', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('user_id')->unique();
            $table->string('discord_id', 24)->unique();
            $table->string('discord_name', 64)->default('');
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_discord_links');
    }
};
