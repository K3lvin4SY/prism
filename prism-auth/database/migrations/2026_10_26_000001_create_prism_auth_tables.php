<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The sign-in providers an admin has set up, in the order their buttons show.
        Schema::create('prism_auth_providers', function (Blueprint $table) {
            $table->id();
            $table->string('type', 16);
            $table->string('slug', 48)->unique();
            $table->string('name', 64);
            $table->string('label', 64);
            $table->string('icon', 512)->nullable();
            $table->string('color', 16)->nullable();
            $table->string('client_id', 255)->nullable();
            $table->text('client_secret')->nullable();
            $table->string('issuer', 512)->nullable();
            $table->string('scopes', 255)->nullable();
            $table->boolean('enabled')->default(false);
            $table->boolean('allow_signup')->default(true);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });

        // An account at a provider, linked to a panel user.
        Schema::create('prism_auth_identities', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('user_id');
            $table->unsignedBigInteger('provider_id');
            $table->string('subject', 191);
            $table->string('email', 191)->nullable();
            $table->string('display_name', 191)->nullable();
            $table->string('avatar', 512)->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
            $table->unique(['provider_id', 'subject']);
            $table->unique(['user_id', 'provider_id']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('provider_id')->references('id')->on('prism_auth_providers')->cascadeOnDelete();
        });

        // A sign-up waiting for its email link; the account is made when the link is opened.
        Schema::create('prism_auth_verifications', function (Blueprint $table) {
            $table->id();
            $table->char('token', 64)->unique();
            $table->string('email', 191)->index();
            $table->string('username', 191);
            $table->string('name_first', 191);
            $table->string('name_last', 191);
            $table->string('password', 255)->nullable();
            $table->unsignedBigInteger('provider_id')->nullable();
            $table->string('subject', 191)->nullable();
            $table->json('profile')->nullable();
            $table->string('ip', 45)->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamps();
        });

        // Accounts made through a provider: they have a password nobody knows until it is changed.
        Schema::create('prism_auth_passwordless', function (Blueprint $table) {
            $table->unsignedInteger('user_id')->primary();
            $table->timestamps();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prism_auth_passwordless');
        Schema::dropIfExists('prism_auth_verifications');
        Schema::dropIfExists('prism_auth_identities');
        Schema::dropIfExists('prism_auth_providers');
    }
};
