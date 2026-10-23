<?php

declare(strict_types=1);

namespace PrismBranding\Http\Controllers;

use Illuminate\Http\Response;
use Pterodactyl\Services\Extensions\ExtensionHeadTags;

/** Drops the cached favicon tags so a new favicon shows on the next page load, not a minute later. */
final class RefreshController
{
    public function __invoke(ExtensionHeadTags $headTags): Response
    {
        $headTags->forget('prism-branding');

        return response()->noContent();
    }
}
