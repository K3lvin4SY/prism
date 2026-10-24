<?php

declare(strict_types=1);

namespace PrismLayout\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use PrismLayout\Support\Pictures;
use Pterodactyl\Models\Egg;

/** Each egg's default card picture, set by the admin in Prism Properties. */
class EggPicturesController extends Controller
{
    public function index(): JsonResponse
    {
        $pictures = DB::table(Pictures::TABLE)->where('kind', 'egg')->get()->keyBy('target_id');
        $eggs = Egg::query()->with('tags')->withCount('servers')->orderBy('name')->get()->map(fn (Egg $egg): array => [
            'id' => $egg->id,
            'name' => $egg->name,
            'tags' => $egg->tagSlugs(),
            'servers' => $egg->servers_count,
            'url' => isset($pictures[$egg->id]) ? Pictures::url($pictures[$egg->id]) : null,
        ]);

        return new JsonResponse(['data' => $eggs]);
    }

    public function store(Request $request, int $egg): JsonResponse
    {
        $egg = Egg::query()->findOrFail($egg);
        $request->validate(['file' => Pictures::RULES]);
        Pictures::store('egg', $egg->id, $request->file('file'));

        return $this->index();
    }

    public function destroy(int $egg): JsonResponse
    {
        Pictures::remove('egg', Egg::query()->findOrFail($egg)->id);

        return $this->index();
    }
}
