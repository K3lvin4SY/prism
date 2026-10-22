<?php
// Read-only: prints the last MC Suite install failures from the Panel log.
foreach (glob('/app/storage/logs/*.log') as $file) {
    foreach (file($file) as $line) {
        if (str_contains($line, 'MC Suite install failed')) $found[] = $line;
    }
}
foreach (array_slice($found ?? [], -2) as $line) echo mb_substr($line, 0, 1200), "\n";
