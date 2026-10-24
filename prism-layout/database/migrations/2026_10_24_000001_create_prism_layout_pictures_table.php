<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Banner card pictures: an egg's default, or a server's own in its place.
        Schema::create('prism_layout_pictures', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 8);
            $table->unsignedInteger('target_id');
            $table->string('file', 191);
            $table->timestamps();
            $table->unique(['kind', 'target_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_layout_pictures');
    }
};
