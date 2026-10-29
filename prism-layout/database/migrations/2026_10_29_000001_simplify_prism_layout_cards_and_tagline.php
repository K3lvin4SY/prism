<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const string TABLE = 'extension_settings';

    /**
     * Server cards came in seven styles, now rows or tiles with an optional picture: Banner becomes a
     * tile with the picture on, the others tiles. The sign-in tagline becomes the headline.
     */
    public function up(): void
    {
        $setting = fn (string $key) => DB::table(self::TABLE)->where('extension', 'prism-layout')->where('scope', 'global')->where('key', $key);

        $cards = $setting('cards')->value('value');
        $style = is_string($cards) ? json_decode($cards, true) : null;
        if (is_string($style) && ! in_array($style, ['rows', 'tile'], true)) {
            $setting('cards')->update(['value' => json_encode('tile'), 'updated_at' => now()]);
            if ($style === 'banner' && ! $setting('card_banner')->exists()) {
                DB::table(self::TABLE)->insert(['extension' => 'prism-layout', 'scope' => 'global', 'key' => 'card_banner', 'value' => json_encode(true), 'created_at' => now(), 'updated_at' => now()]);
            }
        }

        $tagline = $setting('login_tagline')->value('value');
        if ($tagline !== null) {
            if (! $setting('login_title')->exists()) {
                DB::table(self::TABLE)->insert(['extension' => 'prism-layout', 'scope' => 'global', 'key' => 'login_title', 'value' => $tagline, 'created_at' => now(), 'updated_at' => now()]);
            }
            $setting('login_tagline')->delete();
        }
    }

    public function down(): void
    {
        // The old values are not kept; rows and tiles are valid styles either way.
    }
};
