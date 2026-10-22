<?php

declare(strict_types=1);

namespace McSuite\Support;

use RuntimeException;

/**
 * A read-only reader for the LevelDB database Bedrock worlds are stored in (Mojang's fork, which
 * compresses blocks with zlib or raw deflate). Only keys starting with a given prefix are read,
 * and only the table files whose key range can hold them are downloaded.
 */
final class LevelDb
{
    private const int MAX_FILE = 64 * 1024 * 1024;

    private const int LOG_BLOCK = 32768;

    /** @var array<string, array{seq: int, value: string|null}> */
    private array $entries = [];

    public function __construct(private readonly ServerFiles $files, private readonly string $folder) {}

    /**
     * Every live key that starts with $prefix, with its newest value.
     *
     * @return array<string, string>
     */
    public function scan(string $prefix): array
    {
        $this->entries = [];
        [$tables, $logNumber] = $this->liveFiles();

        foreach ($tables as $table) {
            // Skip tables whose key range cannot contain the prefix.
            if (strcmp($table['largest'], $prefix) < 0 || strcmp($table['smallest'], $prefix."\xff") > 0) {
                continue;
            }

            foreach (['ldb', 'sst'] as $extension) {
                $bytes = $this->files->read(sprintf('%s/%06d.%s', $this->folder, $table['number'], $extension), self::MAX_FILE);
                if ($bytes !== null) {
                    $this->readTable($bytes, $prefix);
                    break;
                }
            }
        }

        // Writes not yet compacted into tables live in the log files.
        foreach ($this->files->list($this->folder) as $name => $file) {
            if (preg_match('/^(\d+)\.log$/', $name, $match) && (int) $match[1] >= $logNumber) {
                $bytes = $this->files->read("{$this->folder}/$name", self::MAX_FILE);
                if ($bytes !== null) {
                    $this->readLog($bytes, $prefix);
                }
            }
        }

        $result = [];
        foreach ($this->entries as $key => $entry) {
            if ($entry['value'] !== null) {
                $result[$key] = $entry['value'];
            }
        }

        ksort($result);

        return $result;
    }

    /** @return array{0: list<array{number: int, smallest: string, largest: string}>, 1: int} */
    private function liveFiles(): array
    {
        $current = trim((string) $this->files->read("{$this->folder}/CURRENT", 1024));
        throw_unless(preg_match('/^MANIFEST-\d+$/', $current), RuntimeException::class, 'The world database has no manifest.');

        $manifest = $this->files->read("{$this->folder}/$current", self::MAX_FILE) ?? '';
        $tables = [];
        $logNumber = 0;

        foreach ($this->logRecords($manifest) as $record) {
            $offset = 0;
            $length = strlen($record);
            while ($offset < $length) {
                $tag = self::varint($record, $offset);
                switch ($tag) {
                    case 1: // comparator
                        self::slice($record, $offset);
                        break;
                    case 2: // log number
                        $logNumber = self::varint($record, $offset);
                        break;
                    case 3: // next file number
                    case 4: // last sequence
                    case 9: // previous log number
                        self::varint($record, $offset);
                        break;
                    case 5: // compact pointer
                        self::varint($record, $offset);
                        self::slice($record, $offset);
                        break;
                    case 6: // deleted file
                        self::varint($record, $offset);
                        unset($tables[self::varint($record, $offset)]);
                        break;
                    case 7: // new file
                        self::varint($record, $offset);
                        $number = self::varint($record, $offset);
                        self::varint($record, $offset);
                        $smallest = self::slice($record, $offset);
                        $largest = self::slice($record, $offset);
                        $tables[$number] = ['number' => $number, 'smallest' => substr($smallest, 0, -8), 'largest' => substr($largest, 0, -8)];
                        break;
                    default:
                        // An unknown tag: the rest of this record cannot be read.
                        $offset = $length;
                }
            }
        }

        return [array_values($tables), $logNumber];
    }

    private function readTable(string $bytes, string $prefix): void
    {
        $footer = substr($bytes, -48);
        $offset = 0;
        self::varint($footer, $offset);
        self::varint($footer, $offset);
        $indexOffset = self::varint($footer, $offset);
        $indexSize = self::varint($footer, $offset);

        $index = $this->block($bytes, $indexOffset, $indexSize);
        foreach ($this->blockEntries($index) as [$separator, $handle]) {
            // Index keys are at least as large as every key in their block.
            if (strcmp(substr($separator, 0, -8), $prefix) < 0) {
                continue;
            }

            $position = 0;
            $blockOffset = self::varint($handle, $position);
            $blockSize = self::varint($handle, $position);
            $data = $this->block($bytes, $blockOffset, $blockSize);
            $past = false;

            foreach ($this->blockEntries($data) as [$internalKey, $value]) {
                $key = substr($internalKey, 0, -8);
                if (! str_starts_with($key, $prefix)) {
                    $past = $past || strcmp($key, $prefix) > 0;
                    continue;
                }

                $trailer = unpack('P', substr($internalKey, -8))[1];
                $this->remember($key, $trailer >> 8, ($trailer & 0xFF) === 1 ? $value : null);
            }

            if ($past) {
                return;
            }
        }
    }

    private function readLog(string $bytes, string $prefix): void
    {
        foreach ($this->logRecords($bytes) as $batch) {
            if (strlen($batch) < 12) {
                continue;
            }

            $sequence = unpack('P', substr($batch, 0, 8))[1];
            $count = unpack('V', substr($batch, 8, 4))[1];
            $offset = 12;

            for ($i = 0; $i < $count && $offset < strlen($batch); $i++) {
                $type = ord($batch[$offset++]);
                $key = self::slice($batch, $offset);
                $value = $type === 1 ? self::slice($batch, $offset) : null;
                if (str_starts_with($key, $prefix)) {
                    $this->remember($key, $sequence + $i, $value);
                }
            }
        }
    }

    private function remember(string $key, int $sequence, ?string $value): void
    {
        if (! isset($this->entries[$key]) || $this->entries[$key]['seq'] < $sequence) {
            $this->entries[$key] = ['seq' => $sequence, 'value' => $value];
        }
    }

    /** Joins the physical records of a log or manifest file into logical records. */
    private function logRecords(string $bytes): iterable
    {
        $offset = 0;
        $length = strlen($bytes);
        $pending = '';

        while ($offset + 7 <= $length) {
            $left = self::LOG_BLOCK - ($offset % self::LOG_BLOCK);
            if ($left < 7) {
                $offset += $left;
                continue;
            }

            $size = unpack('v', substr($bytes, $offset + 4, 2))[1];
            $type = ord($bytes[$offset + 6]);
            $payload = substr($bytes, $offset + 7, $size);
            $offset += 7 + $size;

            if ($type === 0 && $size === 0) {
                // Preallocated zeros: skip to the next block.
                $offset += self::LOG_BLOCK - ($offset % self::LOG_BLOCK);
                continue;
            }

            match ($type) {
                1 => yield $payload,
                2 => $pending = $payload,
                3 => $pending .= $payload,
                4 => yield $pending.$payload,
                default => null,
            };
        }
    }

    /** A table block, decompressed by the type byte in its trailer. */
    private function block(string $bytes, int $offset, int $size): string
    {
        $raw = substr($bytes, $offset, $size);
        $type = ord($bytes[$offset + $size] ?? "\0");

        $data = match ($type) {
            0 => $raw,
            2 => @gzuncompress($raw),
            4 => @gzinflate($raw),
            default => throw new RuntimeException('The world database uses a compression MC Suite cannot read.'),
        };

        throw_if($data === false, RuntimeException::class, 'A world database block could not be decompressed.');

        return $data;
    }

    /** @return iterable<array{0: string, 1: string}> */
    private function blockEntries(string $block): iterable
    {
        $restarts = unpack('V', substr($block, -4))[1];
        $end = strlen($block) - 4 - $restarts * 4;
        $offset = 0;
        $key = '';

        while ($offset < $end) {
            $shared = self::varint($block, $offset);
            $unshared = self::varint($block, $offset);
            $valueLength = self::varint($block, $offset);
            $key = substr($key, 0, $shared).substr($block, $offset, $unshared);
            $offset += $unshared;
            $value = substr($block, $offset, $valueLength);
            $offset += $valueLength;

            yield [$key, $value];
        }
    }

    private static function varint(string $bytes, int &$offset): int
    {
        $result = 0;
        $shift = 0;
        do {
            throw_if($offset >= strlen($bytes), RuntimeException::class, 'The world database ended early.');
            $byte = ord($bytes[$offset++]);
            $result |= ($byte & 0x7F) << $shift;
            $shift += 7;
        } while ($byte & 0x80 && $shift < 64);

        return $result;
    }

    private static function slice(string $bytes, int &$offset): string
    {
        $length = self::varint($bytes, $offset);
        $value = substr($bytes, $offset, $length);
        $offset += $length;

        return $value;
    }
}
