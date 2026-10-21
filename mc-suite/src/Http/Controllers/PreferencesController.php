<?php

declare(strict_types=1);

namespace McSuite\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use McSuite\Support\Settings;

/**
 * The signed-in user's own MC Suite preferences. A preference left unset follows the
 * default from the extension settings.
 */
class PreferencesController
{
    public function show(Request $request): JsonResponse
    {
        return new JsonResponse($this->preferences($request));
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['confirmInstalls' => ['present', 'nullable', 'boolean']]);
        $store = Settings::store()->forUser($request->user());

        if ($data['confirmInstalls'] === null) {
            $store->forget('confirm_installs');
        } else {
            $store->set('confirm_installs', (bool) $data['confirmInstalls']);
        }

        return new JsonResponse($this->preferences($request));
    }

    /** @return array{confirmInstalls: bool, confirmInstallsDefault: bool, confirmInstallsChosen: bool} */
    private function preferences(Request $request): array
    {
        $default = (bool) Settings::admin('confirm_installs', true);
        $chosen = Settings::store()->forUser($request->user())->get('confirm_installs');

        return [
            'confirmInstalls' => is_bool($chosen) ? $chosen : $default,
            'confirmInstallsDefault' => $default,
            'confirmInstallsChosen' => is_bool($chosen),
        ];
    }
}
