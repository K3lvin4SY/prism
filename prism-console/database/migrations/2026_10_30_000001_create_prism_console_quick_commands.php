<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A server's quick command buttons, shared by everyone on it and gone with the server.
        Schema::create('prism_console_quick_commands', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('user_id')->nullable();
            $table->string('label', 48)->nullable();
            $table->string('command', 1000);
            $table->boolean('confirm')->default(false);
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_console_quick_commands');
    }
};
