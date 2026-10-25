<?php

declare(strict_types=1);

namespace PrismLayout\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Pterodactyl\Models\Tag;

/** Each tag's color as the panel shows it, so cards and filters match the Tags page. */
class TagsController extends Controller
{
    public function index(): JsonResponse
    {
        $colors = [];
        foreach (Tag::query()->get() as $tag) {
            $color = $tag->effectiveColor();
            if (is_string($color) && $color !== '') {
                $colors[$tag->slug] = $color;
            }
        }

        return new JsonResponse(['data' => (object) $colors]);
    }
}
