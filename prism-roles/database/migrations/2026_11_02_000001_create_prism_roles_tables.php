<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A named set of subuser permissions. Without an owner it is panel-wide, kept by the admins.
        Schema::create('prism_roles_roles', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('owner_id')->nullable();
            $table->string('name', 48);
            $table->string('description', 255)->default('');
            $table->string('color', 7)->nullable();
            $table->json('permissions');
            $table->timestamps();
            $table->index('owner_id');
            $table->foreign('owner_id')->references('id')->on('users')->cascadeOnDelete();
        });

        // Which role a subuser was given, by whom, and the permissions it gave them. A subuser
        // whose permissions were changed by hand afterwards is customised and is left alone.
        Schema::create('prism_roles_assignments', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('subuser_id')->unique();
            $table->unsignedBigInteger('role_id');
            $table->unsignedInteger('assigned_by')->nullable();
            $table->json('applied');
            $table->boolean('customised')->default(false);
            $table->timestamps();
            $table->foreign('subuser_id')->references('id')->on('subusers')->cascadeOnDelete();
            $table->foreign('role_id')->references('id')->on('prism_roles_roles')->cascadeOnDelete();
            $table->foreign('assigned_by')->references('id')->on('users')->nullOnDelete();
        });

        $viewer = ['websocket.connect', 'activity.read', 'file.read', 'backup.read', 'schedule.read', 'startup.read', 'allocation.read', 'database.read'];
        $moderator = [...$viewer, 'control.console', 'control.start', 'control.restart', 'user.read'];
        $builder = [...$moderator, 'control.stop', 'file.read-content', 'file.create', 'file.update', 'file.delete', 'file.archive', 'file.sftp', 'backup.create'];
        $now = now();
        DB::table('prism_roles_roles')->insert([
            ['name' => 'Viewer', 'description' => 'Watches the console and looks around, changes nothing.', 'color' => '#64748b', 'permissions' => json_encode($viewer), 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Moderator', 'description' => 'Runs console commands, starts and restarts the server.', 'color' => '#3b82f6', 'permissions' => json_encode($moderator), 'created_at' => $now, 'updated_at' => $now],
            ['name' => 'Builder', 'description' => 'A moderator who also edits files, uses SFTP and makes backups.', 'color' => '#f59e0b', 'permissions' => json_encode($builder), 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_roles_assignments');
        Schema::dropIfExists('prism_roles_roles');
    }
};
