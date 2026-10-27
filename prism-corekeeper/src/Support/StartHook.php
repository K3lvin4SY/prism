<?php

declare(strict_types=1);

namespace PrismCoreKeeper\Support;

use Pterodactyl\Contracts\Servers\UpdatesServerStartup;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

/**
 * Work only the game server itself can do, run each time it starts, before Core Keeper:
 * switching the Steam branch and downloading Workshop mods. Steam gives Workshop files only to
 * its own clients, and the server already has SteamCMD from the egg.
 *
 * The server's own startup command (never the egg's) begins with `bash .cks/start.sh;`. A
 * wrapper around CoreKeeperServer would not do: the image's update on boot puts the binary back.
 *
 *  .cks/start.sh        this script, written by the Panel
 *  .cks/branch          the Steam branch the Versions tab chose
 *  .cks/workshop.txt    "<id> <time updated> <title>" per wanted Workshop mod, written by the Panel
 *  .cks/installed.txt   "<id> <time updated> <folder>" per downloaded mod, written by the script
 *  .cks/steam-login     user and password on two lines, written just before a start, deleted by the script
 */
final class StartHook
{
    public const string PREFIX = 'bash .cks/start.sh; ';

    public const string MODS = 'CoreKeeperServer_Data/StreamingAssets/Mods';

    public const string DATA = '.config/unity3d/Pugstorm/Core Keeper/DedicatedServer';

    public static function installed(Server $server): bool
    {
        return str_starts_with(ltrim((string) $server->startup), trim(self::PREFIX));
    }

    /** Puts the start step in front of the server's startup command, keeping the rest as it is. */
    public static function install(Server $server): void
    {
        if (self::installed($server)) {
            return;
        }

        app(UpdatesServerStartup::class)->update($server, [
            'startup' => self::PREFIX.ltrim((string) $server->startup),
            'skip_scripts' => (bool) $server->skip_scripts,
        ], User::USER_LEVEL_ADMIN);
    }

    /** Steps that write the script and make sure the startup runs it. */
    public static function steps(InstallPlan $plan): InstallPlan
    {
        return $plan->add('mkdir', ['path' => '.cks'])
            ->add('write', ['path' => '.cks/start.sh', 'content' => base64_encode(self::script())])
            ->add('start-hook');
    }

    /**
     * The Steam login for Workshop downloads, written right before a start when Prism
     * Properties has one, so it is on the server's disk only while the server starts.
     */
    public static function loginSteps(InstallPlan $plan): InstallPlan
    {
        $user = Settings::string('steam_username');
        $password = Settings::string('steam_password');
        if ($user === '' || $password === '') {
            return $plan;
        }

        return $plan->add('write', ['path' => '.cks/steam-login', 'content' => base64_encode($user."\n".$password."\n"), 'secret' => true]);
    }

    /** @param array<string, array<string, mixed>> $wanted keyed by Workshop id */
    public static function workshopList(array $wanted): string
    {
        $lines = ['# Workshop mods Prism Core Keeper downloads when the server starts: <id> <time updated> <title>'];
        foreach ($wanted as $id => $mod) {
            $title = trim((string) preg_replace('/[\x00-\x1F\x7F]+/', ' ', (string) ($mod['title'] ?? $id)));
            $lines[] = sprintf('%s %d %s', $id, (int) ($mod['updated'] ?? 0), $title);
        }

        return implode("\n", $lines)."\n";
    }

    public static function script(): string
    {
        return str_replace(['@MODS@', '@APP@', '@GAME@'], [self::MODS, (string) Settings::SERVER_APP, (string) Settings::GAME_APP], <<<'SH'
            #!/bin/bash
            # Prism Core Keeper start step, written by the panel: changes here are replaced.
            # Switches the Steam branch chosen on the Versions tab and downloads the Workshop mods
            # chosen on the Mods tab, then the server starts as the egg says.
            cd /home/container 2>/dev/null || cd "$(dirname "$0")/.." || exit 0
            say() { echo "[Prism Core Keeper] $*"; }
            STEAMCMD=./steamcmd/steamcmd.sh
            MODS="@MODS@"
            mkdir -p .cks "$MODS"

            LOGIN=(anonymous)
            if [ -f .cks/steam-login ]; then
                { read -r user; read -r pass; } < .cks/steam-login
                rm -f .cks/steam-login
                [ -n "$user" ] && LOGIN=("$user" "$pass")
            fi

            if [ ! -x "$STEAMCMD" ] && [ -f "$STEAMCMD" ]; then chmod +x "$STEAMCMD" ./steamcmd/linux32/steamcmd 2>/dev/null; fi

            # The branch: legacy builds are public Steam branches such as 1.2.1.5.
            want=$(tr -d ' \r\n' < .cks/branch 2>/dev/null)
            have=$(tr -d ' \r\n' < .cks/branch-installed 2>/dev/null)
            if [ -n "$want" ] && [ "$want" != "$have" ] && [ -f "$STEAMCMD" ]; then
                say "Switching to the $want build. This can take a few minutes..."
                if [ "$want" = "public" ]; then beta=(-beta public); else beta=(-beta "$want"); fi
                if "$STEAMCMD" +force_install_dir /home/container +login anonymous +app_update @APP@ "${beta[@]}" validate +quit > .cks/branch.log 2>&1 && grep -q "Success! App '@APP@'" .cks/branch.log; then
                    echo "$want" > .cks/branch-installed
                    say "Now on the $want build."
                else
                    say "Could not switch to $want:"
                    grep -iE "error|fail" .cks/branch.log | tail -n 3
                fi
            fi

            # Workshop mods: downloaded by SteamCMD, then copied into the mods folder.
            LIST=.cks/workshop.txt
            DONE=.cks/installed.txt
            touch "$DONE"
            if [ -s "$LIST" ] && [ -f "$STEAMCMD" ]; then
                while read -r id updated title; do
                    [[ $id =~ ^[0-9]+$ ]] || continue
                    grep -q "^$id $updated " "$DONE" && continue
                    say "Downloading $title from the Steam Workshop..."
                    "$STEAMCMD" +force_install_dir /home/container/.cks/steam +login "${LOGIN[@]}" +workshop_download_item @GAME@ "$id" validate +quit < /dev/null > .cks/download.log 2>&1
                    dir=.cks/steam/steamapps/workshop/content/@GAME@/$id
                    manifest=$(find "$dir" -maxdepth 3 -name ModManifest.json 2>/dev/null | head -n 1)
                    if [ -z "$manifest" ]; then
                        if grep -qiE "access denied|no subscription|login failure|invalid password|not logged on" .cks/download.log; then
                            say "Steam refused the download of $title. Add a Steam login in Prism Properties, or install it from mod.io."
                        else
                            say "Could not download $title:"
                        fi
                        grep -iE "error|fail|denied" .cks/download.log | tail -n 3
                        continue
                    fi

                    source=$(dirname "$manifest")
                    name=$(grep -o '"name"[[:space:]]*:[[:space:]]*"[^"]*"' "$manifest" | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/' | tr -cd 'A-Za-z0-9._-')
                    folder=${name:-workshop-$id}
                    old=$(grep "^$id " "$DONE" | head -n 1 | cut -d' ' -f3-)
                    [ -n "$old" ] && [ "$old" != "$folder" ] && rm -rf "${MODS:?}/$old"
                    rm -rf "${MODS:?}/$folder"
                    cp -r "$source" "$MODS/$folder"
                    sed -i "/^$id /d" "$DONE"
                    echo "$id $updated $folder" >> "$DONE"
                    say "Installed $title."
                done < "$LIST"
            fi
            exit 0

            SH);
    }
}
