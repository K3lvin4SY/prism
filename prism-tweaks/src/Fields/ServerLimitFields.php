<?php

declare(strict_types=1);

namespace PrismTweaks\Fields;

use PrismTweaks\Support\Limits;
use Pterodactyl\Extensions\Fields;

/**
 * The server's own create limits on the admin server form. The panel stores them; empty uses
 * the number from Prism Properties, or the panel's.
 */
final class ServerLimitFields extends Fields
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        $rules = [];
        foreach (Limits::RESOURCES as $resource) {
            $rules[$resource['key']] = ['nullable', 'integer', 'min:1', 'max:'.Limits::HIGHEST_RESOURCE];
        }

        return $rules;
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        $names = [];
        foreach (Limits::RESOURCES as $resource) {
            $names[$resource['key']] = $resource['label'];
        }

        return $names;
    }
}
