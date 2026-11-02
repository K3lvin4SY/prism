<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // What someone may use across the servers they own. The row without a user is everyone's
        // default; a user's own row replaces it for them. Memory and disk in MiB, CPU in percent of a thread.
        Schema::create('prism_quotas_limits', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('user_id')->nullable()->unique();
            $table->unsignedInteger('servers')->default(0);
            $table->unsignedInteger('memory')->default(0);
            $table->unsignedInteger('disk')->default(0);
            $table->unsignedInteger('cpu')->default(0);
            $table->unsignedInteger('backups')->default(0);
            $table->unsignedInteger('databases')->default(0);
            $table->unsignedInteger('allocations')->default(1);
            $table->timestamps();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        // The eggs people may pick, under a friendlier name, with the image to run and where.
        Schema::create('prism_quotas_offers', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('egg_id');
            $table->string('label', 64);
            $table->string('description', 255)->default('');
            $table->string('image', 191);
            $table->json('locations');
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
            $table->foreign('egg_id')->references('id')->on('eggs')->cascadeOnDelete();
        });

        // Servers people made through Prism Quotas: only these can they delete themselves.
        Schema::create('prism_quotas_servers', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('server_id')->unique();
            $table->unsignedInteger('user_id');
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        $now = now();
        DB::table('prism_quotas_limits')->insert(['user_id' => null, 'servers' => 1, 'memory' => 2048, 'disk' => 10240, 'cpu' => 100, 'backups' => 1, 'databases' => 0, 'allocations' => 1, 'created_at' => $now, 'updated_at' => $now]);
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_quotas_servers');
        Schema::dropIfExists('prism_quotas_offers');
        Schema::dropIfExists('prism_quotas_limits');
    }
};
