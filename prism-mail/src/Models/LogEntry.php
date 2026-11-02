<?php

declare(strict_types=1);

namespace PrismMail\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;

/**
 * One email handed to the mailer.
 *
 * @property int $id
 * @property string $recipient
 * @property string $subject
 * @property string|null $notification
 * @property string $status sending or sent
 * @property CarbonImmutable $created_at
 * @property CarbonImmutable|null $sent_at
 */
class LogEntry extends Model
{
    public const null UPDATED_AT = null;

    protected $table = 'prism_mail_log';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['created_at' => 'immutable_datetime', 'sent_at' => 'immutable_datetime'];
    }
}
