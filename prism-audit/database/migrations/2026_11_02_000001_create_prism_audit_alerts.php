<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Something risky an alert rule spotted in the activity log. The activity entry may be pruned
        // by the panel later, so the alert keeps its own summary.
        Schema::create('prism_audit_alerts', function (Blueprint $table) {
            $table->id();
            $table->string('rule', 32);
            $table->unsignedBigInteger('activity_log_id')->nullable();
            $table->unsignedInteger('user_id')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('summary', 500);
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('read_at')->nullable();
            $table->index(['rule', 'ip', 'created_at']);
            $table->index('read_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_audit_alerts');
    }
};
