<?php

declare(strict_types=1);

namespace PrismMc;

use PrismMc\Support\Detector;

/**
 * Adds "Prism MC server type" to the admin egg form. The Panel stores the value itself;
 * Detector reads it to force or switch off detection for every server using the egg.
 */
final class EggFields extends \Pterodactyl\Extensions\Fields
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return ['type' => ['nullable', 'string', 'in:'.implode(',', Detector::KINDS)]];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return ['type' => 'Prism MC server type'];
    }
}
