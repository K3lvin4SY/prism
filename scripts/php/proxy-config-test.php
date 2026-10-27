<?php
// Tests YamlLines and ProxyConfig against real config files in /tmp/mcs-proxytest. Prints PASS/FAIL lines.
require '/app/extensions/mc-suite/src/Support/YamlLines.php';
require '/app/extensions/mc-suite/src/Support/ProxyConfig.php';
use McSuite\Support\ProxyConfig;
use McSuite\Support\YamlLines;

$dir = '/tmp/mcs-proxytest';
$check = function (string $label, bool $ok, string $detail = '') { echo ($ok ? 'PASS ' : 'FAIL ').$label.($ok ? '' : " — $detail")."\n"; };

// Paper global: change three nested keys, nothing else.
$paper = file_get_contents("$dir/paper-global.yml");
$out = YamlLines::set($paper, ['proxies', 'velocity', 'enabled'], 'true');
$out = YamlLines::set($out, ['proxies', 'velocity', 'secret'], YamlLines::quote('s3cr3t'));
$check('paper velocity enabled', YamlLines::get($out, ['proxies', 'velocity', 'enabled']) === 'true', (string) YamlLines::get($out, ['proxies', 'velocity', 'enabled']));
$check('paper velocity secret', YamlLines::get($out, ['proxies', 'velocity', 'secret']) === 's3cr3t');
$check('paper bungee untouched', YamlLines::get($out, ['proxies', 'bungee-cord', 'online-mode']) === 'true');
$diff = array_diff_assoc(explode("\n", $out), explode("\n", $paper));
$check('paper only two lines changed', count($diff) === 2, json_encode(array_values($diff)));

// Empty file: the whole path is created.
$fresh = YamlLines::set('', ['proxies', 'velocity', 'enabled'], 'true');
$fresh = YamlLines::set($fresh, ['proxies', 'velocity', 'secret'], "'x'");
$check('fresh nested create', $fresh === "proxies:\n  velocity:\n    enabled: true\n    secret: 'x'\n", json_encode($fresh));

// spigot.yml with sibling keys.
$spigot = "config-version: 12\nsettings:\n  debug: false\n  bungeecord: false\n  sample-count: 12\nmessages:\n  whitelist: x\n";
$check('spigot bungeecord', YamlLines::get(YamlLines::set($spigot, ['settings', 'bungeecord'], 'true'), ['settings', 'bungeecord']) === 'true');
$missing = YamlLines::set("settings:\n  debug: false\nmessages:\n  a: b\n", ['settings', 'bungeecord'], 'true');
$check('spigot add missing key inside block', str_contains($missing, "settings:\n  debug: false\n  bungeecord: true\nmessages:"), json_encode($missing));

// Velocity default config: examples detected, then replaced.
$velocity = new ProxyConfig('velocity', file_get_contents("$dir/velocity.toml"));
$read = $velocity->read();
$check('velocity reads examples', array_keys($read['servers']) === ['lobby', 'factions', 'minigames'] && $read['order'] === ['lobby'] && count($read['forcedHosts']) === 3, json_encode($read));
$check('velocity examples detected', $velocity->hasOnlyExamples());
$velocity->write(['servers' => ['survival' => ['address' => 'mc.example.net:25590'], 'creative' => ['address' => '10.0.0.5:25566']], 'order' => ['survival'], 'forcedHosts' => ['play.example.com' => ['creative']]]);
$velocity->setVelocityValue('player-info-forwarding-mode', '"modern"');
$again = (new ProxyConfig('velocity', $velocity->text()))->read();
$check('velocity round trip servers', $again['servers'] === ['survival' => ['address' => 'mc.example.net:25590'], 'creative' => ['address' => '10.0.0.5:25566']], json_encode($again['servers']));
$check('velocity round trip order', $again['order'] === ['survival']);
$check('velocity forced host', $again['forcedHosts'] === ['play.example.com' => ['creative']], json_encode($again['forcedHosts']));
$check('velocity mode set', $velocity->velocityValue('player-info-forwarding-mode') === 'modern');
$check('velocity other sections kept', str_contains($velocity->text(), '[advanced]') && str_contains($velocity->text(), '[query]') && str_contains($velocity->text(), 'bind = "0.0.0.0:25565"'));

// BungeeCord config.
$bungee = new ProxyConfig('bungee', file_get_contents("$dir/config.yml"));
$read = $bungee->read();
$check('bungee reads example', ($read['servers']['lobby']['address'] ?? null) === 'localhost:25565' && $read['order'] === ['lobby'], json_encode($read));
$check('bungee examples detected', $bungee->hasOnlyExamples());
$bungee->write(['servers' => ['survival' => ['address' => 'host:25590', 'motd' => 'Survival', 'restricted' => false]], 'order' => ['survival'], 'forcedHosts' => []]);
$bungee->setBungeeValue('ip_forward', 'true');
$again = (new ProxyConfig('bungee', $bungee->text()))->read();
$check('bungee round trip', ($again['servers']['survival']['address'] ?? null) === 'host:25590' && $again['order'] === ['survival'], json_encode($again).' '.json_encode($bungee->text()));
$check('bungee ip_forward', $bungee->bungeeValue('ip_forward') === 'true');
$check('bungee listener kept', str_contains($bungee->text(), 'query_port: 25577') && str_contains($bungee->text(), 'online_mode: true'));
