<?php

declare(strict_types=1);

namespace TerrariaSuite;

use TerrariaSuite\Support\Detector;

/**
 * Adds "Terraria Suite server type" to the admin egg form. Detector reads it to force or switch
 * off detection for every server using the egg.
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
        return ['type' => 'Terraria Suite server type'];
    }
}
