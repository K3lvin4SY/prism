<?php

declare(strict_types=1);

namespace PrismTerraria\Support;

use Pterodactyl\Models\Server;

/**
 * tModLoader mods from the Workshop. Steam only hands Workshop files to its own clients, so
 * they are fetched on the server when it starts: tModLoaderServer is replaced by a wrapper
 * that runs DepotDownloader for each mod in .trs/workshop.txt, copies the .tmod built for
 * the installed tModLoader into mods/, and then starts tModLoader as the egg's script did.
 *
 *  .trs/workshop.txt   "<id> <time updated> <title>" per wanted mod, written by the Panel
 *  .trs/installed.txt  "<id> <time updated> <mod name>" per downloaded mod, written by the script
 *  .trs/tml-version    the tModLoader build, to pick the right .tmod
 */
final class WorkshopMods
{
    public const string DOWNLOADER_VERSION = '3.4.0';

    /** The self-contained build: DepotDownloader 3.4 needs .NET 9 and the tModLoader image has .NET 8. */
    public const string DOWNLOADER_URL = 'https://github.com/SteamRE/DepotDownloader/releases/download/DepotDownloader_3.4.0/DepotDownloader-linux-x64.zip';

    public const string DOWNLOADER_SIZE = '33442357';

    public const string MARKER = '# Prism Terraria wrapper';

    private const string RECORD = 'workshop';

    public function __construct(private readonly Server $server) {}

    public static function for(Server $server): self
    {
        return new self($server);
    }

    /**
     * The wanted mods, keyed by Workshop id.
     *
     * @return array<string, array{id: string, title: string, updated: int, icon: string|null, dependency: bool}>
     */
    public function wanted(): array
    {
        $record = Settings::server($this->server)->get(self::RECORD, []);

        return is_array($record) ? $record : [];
    }

    /**
     * Mods the start-up script has put in place: Workshop id → [updated, mod name].
     *
     * @return array<string, array{updated: int, name: string}>
     */
    public function downloaded(): array
    {
        $result = [];
        foreach (explode("\n", (string) ServerFiles::for($this->server)->read('.trs/installed.txt', 1_000_000)) as $line) {
            if (preg_match('/^(\d+) (\d+) (\S+)/', trim($line), $match) === 1) {
                $result[$match[1]] = ['updated' => (int) $match[2], 'name' => $match[3]];
            }
        }

        return $result;
    }

    /** @return list<string> mod names tModLoader loads, from mods/enabled.json */
    public function enabled(): array
    {
        $list = ServerFiles::for($this->server)->readJson('mods/enabled.json');

        return is_array($list) ? array_values(array_filter($list, 'is_string')) : [];
    }

    /** @param list<string> $names */
    public function setEnabled(array $names): void
    {
        ServerFiles::for($this->server)->writeJson('mods/enabled.json', array_values(array_unique($names)));
    }

    public function wrapperInstalled(): bool
    {
        return str_contains((string) ServerFiles::for($this->server)->read('tModLoaderServer', 100_000), self::MARKER);
    }

    public function downloaderInstalled(): bool
    {
        return ServerFiles::for($this->server)->size('.trs/DepotDownloader/DepotDownloader') !== null;
    }

    /**
     * Saves the wanted list and adds the steps that put the scripts and list in place.
     *
     * @param  array<string, array<string, mixed>>  $wanted
     */
    public function addSteps(InstallPlan $plan, array $wanted, ?string $tModLoaderBuild): InstallPlan
    {
        $plan->add('mkdir', ['path' => '.trs']);

        if ($wanted !== [] && ! $this->downloaderInstalled()) {
            $plan->add('mkdir', ['path' => '.trs/DepotDownloader'])
                ->add('pull', ['url' => self::DOWNLOADER_URL, 'dir' => '.trs/DepotDownloader', 'file' => 'DepotDownloader.zip', 'size' => self::DOWNLOADER_SIZE])
                ->add('unzip', ['dir' => '.trs/DepotDownloader', 'file' => 'DepotDownloader.zip'])
                ->add('delete', ['dir' => '.trs/DepotDownloader', 'files' => ['DepotDownloader.zip']])
                ->add('chmod', ['dir' => '.trs/DepotDownloader', 'files' => ['DepotDownloader'], 'mode' => '755']);
        }

        $plan->add('write', ['path' => '.trs/sync-mods.sh', 'content' => base64_encode(self::syncScript())])
            ->add('write', ['path' => '.trs/workshop.txt', 'content' => base64_encode(self::listFile($wanted))])
            ->add('record', ['key' => self::RECORD, 'value' => $wanted]);

        if ($tModLoaderBuild !== null && $tModLoaderBuild !== '') {
            $plan->add('write', ['path' => '.trs/tml-version', 'content' => base64_encode($tModLoaderBuild."\n")]);
        }

        return self::addWrapperSteps($plan);
    }

    /** The egg's install script writes its own tModLoaderServer; these steps put the wrapper back. */
    public static function addWrapperSteps(InstallPlan $plan): InstallPlan
    {
        return $plan->add('write', ['path' => 'tModLoaderServer', 'content' => base64_encode(self::wrapper())])
            ->add('chmod', ['dir' => '', 'files' => ['tModLoaderServer'], 'mode' => '755']);
    }

    /** @param array<string, array<string, mixed>> $wanted */
    public static function listFile(array $wanted): string
    {
        $lines = ['# Workshop mods Prism Terraria downloads when the server starts: <id> <time updated> <title>'];
        foreach ($wanted as $id => $mod) {
            $title = trim((string) preg_replace('/[\x00-\x1F\x7F]+/', ' ', (string) ($mod['title'] ?? $id)));
            $lines[] = sprintf('%s %d %s', $id, (int) ($mod['updated'] ?? 0), $title);
        }

        return implode("\n", $lines)."\n";
    }

    public static function wrapper(): string
    {
        return <<<'SH'
            #!/bin/bash
            # Prism Terraria wrapper
            # Downloads the Workshop mods chosen in the panel (.trs/sync-mods.sh), then starts
            # tModLoader as the egg's own script does.
            cd "$(dirname "$0")" || exit 1
            if [ -f .trs/sync-mods.sh ]; then
                bash .trs/sync-mods.sh || echo "[Prism Terraria] Mod downloads failed; starting with the mods already in place."
            fi
            exec dotnet tModLoader.dll -server "$@"

            SH;
    }

    public static function syncScript(): string
    {
        return <<<'SH'
            #!/bin/bash
            # Written by Prism Terraria. Downloads the Workshop mods in .trs/workshop.txt and copies
            # the .tmod built for this tModLoader into mods/. Mods already up to date are skipped.
            cd "$(dirname "$0")/.." || exit 1
            LIST=.trs/workshop.txt
            DONE=.trs/installed.txt
            DD=.trs/DepotDownloader/DepotDownloader
            [ -s "$LIST" ] || exit 0
            if [ ! -f "$DD" ]; then
                echo "[Prism Terraria] DepotDownloader is missing; open the Mods tab in the panel to set it up again."
                exit 0
            fi
            [ -x "$DD" ] || chmod +x "$DD"
            mkdir -p mods .trs/workshop
            touch "$DONE"

            # The tModLoader build, such as 2026.08.3.0, as year*100+month: each Workshop upload
            # has a folder per build it was made for, and the newest one not past ours is used.
            tml=0
            if [[ $(cat .trs/tml-version 2>/dev/null) =~ ^v?([0-9]+)\.([0-9]+) ]]; then
                tml=$((10#${BASH_REMATCH[1]} * 100 + 10#${BASH_REMATCH[2]}))
            fi

            enable() {
                local file=mods/enabled.json
                if [ ! -s "$file" ] || [ "$(tr -d ' \r\n\t' < "$file")" = "[]" ] || ! grep -q '\[' "$file"; then
                    printf '[\n  "%s"\n]\n' "$1" > "$file"
                elif ! grep -q "\"$1\"" "$file"; then
                    sed -i "0,/\[/s//[\n  \"$1\",/" "$file"
                fi
            }

            while read -r id updated title; do
                [[ $id =~ ^[0-9]+$ ]] || continue
                grep -q "^$id $updated " "$DONE" && continue
                echo "[Prism Terraria] Downloading $title from the Workshop..."
                dir=.trs/workshop/$id
                if ! "$DD" -app 1281930 -pubfile "$id" -dir "$dir" -max-downloads 4 < /dev/null > .trs/download.log 2>&1; then
                    echo "[Prism Terraria] Could not download $title:"
                    tail -n 5 .trs/download.log
                    continue
                fi

                best=""
                best_build=-1
                for folder in "$dir"/*/; do
                    name=$(basename "$folder")
                    [[ $name =~ ^([0-9]+)\.([0-9]+)$ ]] || continue
                    build=$((10#${BASH_REMATCH[1]} * 100 + 10#${BASH_REMATCH[2]}))
                    if { [ "$tml" -eq 0 ] || [ "$build" -le "$tml" ]; } && [ "$build" -gt "$best_build" ]; then
                        best=$folder
                        best_build=$build
                    fi
                done

                file=$(ls "${best:-$dir/}"*.tmod 2>/dev/null | head -n 1)
                if [ -z "$file" ]; then
                    echo "[Prism Terraria] $title has no version for this tModLoader. Try a newer tModLoader on the Versions tab."
                    continue
                fi

                mod=$(basename "$file" .tmod)
                cp -f "$file" "mods/$mod.tmod"
                grep -q "^$id " "$DONE" || enable "$mod"
                sed -i "/^$id /d" "$DONE"
                echo "$id $updated $mod" >> "$DONE"
                echo "[Prism Terraria] Installed $title ($mod)."
            done < "$LIST"
            exit 0

            SH;
    }
}
