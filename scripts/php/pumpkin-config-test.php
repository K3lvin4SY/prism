<?php
// Tests TomlLines and PumpkinConfig against a real pumpkin.toml in /tmp/mcs-pumpkin. Prints PASS/FAIL lines.
require '/app/extensions/mc-suite/src/Support/TomlLines.php';
require '/app/extensions/mc-suite/src/Support/PumpkinConfig.php';
use McSuite\Support\PumpkinConfig;
use McSuite\Support\TomlLines;

$check = function (string $label, bool $ok, string $detail = '') { echo ($ok ? 'PASS ' : 'FAIL ').$label.($ok ? '' : " — $detail")."\n"; };
$toml = file_get_contents('/tmp/mcs-pumpkin/pumpkin.toml');

$config = new PumpkinConfig($toml);
$all = $config->all();
$check('motd read', $all['motd'] === 'A blazingly fast Pumpkin server!', $all['motd'] ?? 'missing');
$check('difficulty lower-cased', $all['difficulty'] === 'normal', $all['difficulty'] ?? 'missing');
$check('gamemode lower-cased', $all['gamemode'] === 'survival');
$check('max-players from networking.java', $all['max-players'] === '1000');
$check('pvp from [pvp]', $all['pvp'] === 'true');
$check('log-ips is inverse of scrub_ips', $all['log-ips'] === 'false');
$check('tps as whole number', $all['tps'] === '20');
$check('bedrock motd not mistaken for java', TomlLines::get($toml, 'networking.bedrock', 'motd') === '"A blazingly fast Pumpkin server!"');

$config->set('motd', "§aHello \"world\"");
$config->set('difficulty', 'hard');
$config->set('white-list', 'true');
$config->set('view-distance', '12');
$config->set('log-ips', 'true');
$config->set('tps', '25');
$out = $config->toString();
$diff = array_values(array_diff_assoc(explode("\n", $out), explode("\n", $toml)));
$check('only six lines changed', count($diff) === 6, json_encode($diff));
$check('motd escaped', str_contains($out, 'motd = "§aHello \\"world\\""'), json_encode($diff));
$check('java motd changed, bedrock kept', TomlLines::get($out, 'networking.bedrock', 'motd') === '"A blazingly fast Pumpkin server!"');
$check('difficulty capitalised', str_contains($out, "default_difficulty = \"Hard\"\n"));
$check('tps written as float', str_contains($out, "tps = 25.0\n"));
$check('scrub_ips flipped', str_contains($out, "scrub_ips = false\n"));
$again = new PumpkinConfig($out);
$check('round trip motd', $again->get('motd') === "§aHello \"world\"", (string) $again->get('motd'));
$check('round trip view distance', $again->get('view-distance') === '12');

// Missing keys and tables are added, existing ones keep their place.
$added = TomlLines::set($toml, 'networking.rcon', 'enabled', 'true');
$check('new table appended', str_ends_with(rtrim($added), "[networking.rcon]\nenabled = true"));
$inserted = TomlLines::set($toml, 'pvp', 'new_key', '1');
$check('new key inside its table', str_contains($inserted, "swing = true\nnew_key = 1\n\n[server_links]"), json_encode(substr($inserted, strpos($inserted, '[pvp]'), 120)));
$top = TomlLines::set($toml, '', 'favicon_path', '"server-icon.png"');
$check('top-level key before the first table', strpos($top, 'favicon_path') < strpos($top, '[logging]'));
$check('remove key', TomlLines::get(TomlLines::remove($top, '', 'favicon_path'), '', 'favicon_path') === null);
$check('remove leaves the rest', TomlLines::remove($top, '', 'favicon_path') === $toml);

// Proxy tables.
$proxy = TomlLines::set($toml, 'networking.proxy.velocity', 'secret', TomlLines::string('abc'));
$check('velocity secret', TomlLines::scalar(TomlLines::get($proxy, 'networking.proxy.velocity', 'secret')) === 'abc');
$check('bungeecord secret untouched', TomlLines::get($proxy, 'networking.proxy.bungeecord', 'secret') === '""');
