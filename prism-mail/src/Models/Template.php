<?php

declare(strict_types=1);

namespace PrismMail\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * The admin's wording for one of the panel's emails.
 *
 * @property int $id
 * @property string $notification
 * @property string|null $subject
 * @property string|null $greeting
 * @property string|null $intro
 * @property string|null $action
 * @property string|null $outro
 */
class Template extends Model
{
    public const array FIELDS = ['subject', 'greeting', 'intro', 'action', 'outro'];

    protected $table = 'prism_mail_templates';

    protected $guarded = ['id'];
}
