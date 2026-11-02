<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The admin's own wording for one of the panel's emails. Empty fields keep the panel's text.
        Schema::create('prism_mail_templates', function (Blueprint $table) {
            $table->id();
            $table->string('notification', 191)->unique();
            $table->string('subject', 191)->nullable();
            $table->string('greeting', 191)->nullable();
            $table->text('intro')->nullable();
            $table->string('action', 64)->nullable();
            $table->text('outro')->nullable();
            $table->timestamps();
        });

        // Every email the panel handed to its mailer, and whether the mail server took it. No bodies:
        // some carry password reset links.
        Schema::create('prism_mail_log', function (Blueprint $table) {
            $table->id();
            $table->string('recipient', 255);
            $table->string('subject', 255)->default('');
            $table->string('notification', 191)->nullable();
            $table->string('status', 16)->default('sending');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('sent_at')->nullable();
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_mail_log');
        Schema::dropIfExists('prism_mail_templates');
    }
};
