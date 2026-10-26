<?php

declare(strict_types=1);

namespace PrismAuth\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use PrismAuth\Models\AuthProvider;
use PrismAuth\Models\Identity;
use PrismAuth\Support\Providers\OidcProvider;
use PrismAuth\Support\Providers\Providers;
use PrismAuth\Support\Providers\SignInFailed;
use Pterodactyl\Facades\Activity;

/** The sign-in providers, set up in Prism Properties. Secrets go in and never come back out. */
final class ProvidersController
{
    public const string MASK = '********';

    public function index(): JsonResponse
    {
        return response()->json(['data' => AuthProvider::query()->orderBy('sort')->orderBy('id')->get()->map($this->present(...))->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, null);
        $provider = new AuthProvider;
        $provider->fill($data);
        $provider->slug = $this->slug($request->string('slug')->toString() ?: null, $data['name']);
        $provider->sort = (int) AuthProvider::query()->max('sort') + 1;
        $provider->secret = $request->input('secret') ?: null;
        $provider->save();
        Activity::event('admin:prism-auth.provider.create')->property(['provider' => $provider->name])->log();

        return response()->json(['data' => $this->present($provider)], 201);
    }

    public function update(Request $request, int $provider): JsonResponse
    {
        $model = AuthProvider::query()->findOrFail($provider);
        $data = $this->validated($request, $model);
        $model->fill($data);
        $secret = $request->input('secret');
        // Left empty or as its mask, the stored secret stays.
        if (is_string($secret) && $secret !== '' && $secret !== self::MASK) {
            $model->secret = $secret;
        }
        $model->save();
        Activity::event('admin:prism-auth.provider.update')->property(['provider' => $model->name])->log();

        return response()->json(['data' => $this->present($model)]);
    }

    public function destroy(int $provider): Response
    {
        $model = AuthProvider::query()->findOrFail($provider);

        // People whose only way in is this provider would be locked out.
        $stranded = $model->identities()
            ->whereIn('user_id', DB::table('prism_auth_passwordless')->select('user_id'))
            ->whereNotIn('user_id', Identity::query()->where('provider_id', '!=', $model->id)->select('user_id'))
            ->count();
        if ($stranded > 0) {
            abort(422, sprintf('%d %s only sign in with %s. They need a password or another provider first; switch it off instead.', $stranded, $stranded === 1 ? 'account can' : 'accounts can', $model->name));
        }

        $model->delete();
        Activity::event('admin:prism-auth.provider.delete')->property(['provider' => $model->name])->log();

        return response()->noContent();
    }

    public function order(Request $request): Response
    {
        $ids = $request->validate(['ids' => ['required', 'array'], 'ids.*' => ['integer']])['ids'];
        foreach (array_values($ids) as $index => $id) {
            AuthProvider::query()->whereKey($id)->update(['sort' => $index]);
        }

        return response()->noContent();
    }

    /** Checks what can be checked without signing in: the OpenID Connect discovery document. */
    public function test(int $provider): JsonResponse
    {
        $model = AuthProvider::query()->findOrFail($provider);
        $problems = [];
        if ($model->type !== 'steam' && ! $model->client_id) {
            $problems[] = 'There is no client ID.';
        }
        if ($model->type !== 'steam' && ! $model->secret) {
            $problems[] = 'There is no client secret.';
        }

        $endpoints = null;
        $handler = Providers::for($model);
        if ($handler instanceof OidcProvider) {
            try {
                $document = $handler->discovery(fresh: true);
                $endpoints = ['issuer' => $document['issuer'] ?? null, 'authorize' => $document['authorization_endpoint'], 'userinfo' => $document['userinfo_endpoint'] ?? null];
            } catch (SignInFailed $failure) {
                $problems[] = $failure->getMessage();
            }
        }

        return response()->json(['data' => ['ok' => $problems === [], 'problems' => $problems, 'endpoints' => $endpoints, 'callback' => $model->callbackUrl()]]);
    }

    /** @return array<string, mixed> */
    private function present(AuthProvider $provider): array
    {
        return [
            'id' => $provider->id,
            ...$provider->toPublic(),
            'client_id' => $provider->client_id,
            'secret' => $provider->getRawOriginal('client_secret') ? self::MASK : '',
            'issuer' => $provider->issuer,
            'scopes' => $provider->scopes,
            'enabled' => $provider->enabled,
            'allow_signup' => $provider->allow_signup,
            'sort' => $provider->sort,
            'callback' => $provider->callbackUrl(),
        ];
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?AuthProvider $provider): array
    {
        $data = $request->validate([
            'type' => [$provider ? 'sometimes' : 'required', Rule::in(AuthProvider::TYPES)],
            'slug' => ['sometimes', 'nullable', 'string', 'max:48', 'regex:/^[a-z0-9][a-z0-9-]*$/', Rule::unique('prism_auth_providers', 'slug')->ignore($provider?->id)],
            'name' => [$provider ? 'sometimes' : 'required', 'string', 'between:1,64'],
            'label' => [$provider ? 'sometimes' : 'required', 'string', 'between:1,64'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:512', 'regex:#^(https://|/)#'],
            'color' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9a-fA-F]{3,8}$/'],
            'client_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'issuer' => ['sometimes', 'nullable', 'string', 'max:512', 'regex:#^https://#'],
            'scopes' => ['sometimes', 'nullable', 'string', 'max:255'],
            'enabled' => ['sometimes', 'boolean'],
            'allow_signup' => ['sometimes', 'boolean'],
        ], [
            'issuer.regex' => 'The issuer must start with https://.',
            'slug.regex' => 'The address name may only have lower-case letters, numbers and dashes.',
        ]);

        // The slug is in the redirect URL registered at the provider, so it only changes when asked.
        if ($provider !== null && array_key_exists('slug', $data)) {
            $data['slug'] = $data['slug'] ?: $provider->slug;
        } else {
            unset($data['slug']);
        }

        return $data;
    }

    private function slug(?string $wanted, string $name): string
    {
        $base = Str::slug($wanted ?: $name) ?: 'provider';
        $slug = $base;
        for ($i = 2; AuthProvider::query()->where('slug', $slug)->exists(); $i++) {
            $slug = $base.'-'.$i;
        }

        return $slug;
    }
}
