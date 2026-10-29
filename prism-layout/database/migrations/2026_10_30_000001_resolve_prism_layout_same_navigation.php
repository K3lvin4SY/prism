<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const string TABLE = 'extension_settings';

    /** The defaults each device had, for a saved "same" whose source was never saved. */
    private const array DEFAULTS = ['bars' => 'sidebar_top', 'bars_tablet' => 'top_dock'];

    /**
     * Tablets and phones could follow the next size up ("same"); now each device names its own
     * navigation, so a saved "same" becomes the navigation it was following.
     */
    public function up(): void
    {
        $setting = fn (string $key) => DB::table(self::TABLE)->where('extension', 'prism-layout')->where('scope', 'global')->where('key', $key);
        $read = function (string $key) use ($setting): ?string {
            $value = $setting($key)->value('value');
            $decoded = is_string($value) ? json_decode($value, true) : null;

            return is_string($decoded) ? $decoded : null;
        };

        $computers = $read('bars') ?? self::DEFAULTS['bars'];
        $tablets = $read('bars_tablet');
        if ($tablets === 'same') {
            $setting('bars_tablet')->update(['value' => json_encode($computers), 'updated_at' => now()]);
            $tablets = $computers;
        }

        if ($read('bars_mobile') === 'same') {
            $setting('bars_mobile')->update(['value' => json_encode($tablets ?? self::DEFAULTS['bars_tablet']), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        // Each device keeps its own navigation either way.
    }
};
