<?php

declare(strict_types=1);

namespace PrismMail\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use PrismMail\Models\Template;
use PrismMail\Support\Catalogue;
use PrismMail\Support\Current;
use PrismMail\Support\Render;
use Pterodactyl\Models\User;
use Throwable;

/** The panel's emails on the admin "Emails" page: their wording, a preview and a test send. Only root admins reach it. */
final class EmailsController
{
    public function index(Request $request): JsonResponse
    {
        /** @var User $admin */
        $admin = $request->user();
        $saved = Template::query()->get()->keyBy('notification');

        $emails = array_map(static function (array $email) use ($admin, $saved): array {
            $template = $saved->get($email['notification']);

            return [
                'key' => Catalogue::key($email['notification']),
                'label' => $email['label'],
                'about' => $email['about'],
                'placeholders' => $email['placeholders'],
                'panel' => self::panelText($email['notification'], $admin),
                'template' => array_map(static fn (string $field): string => (string) ($template?->{$field} ?? ''), array_combine(Template::FIELDS, Template::FIELDS)),
            ];
        }, Catalogue::list());

        return response()->json(['data' => $emails]);
    }

    /** Saves the wording; all fields empty forgets it. */
    public function update(Request $request, string $email): JsonResponse
    {
        $class = Catalogue::classFor($email) ?? abort(404);
        $fields = self::validated($request);

        if (array_filter($fields, static fn (?string $value): bool => $value !== null) === []) {
            Template::query()->where('notification', $class)->delete();
        } else {
            Template::query()->updateOrCreate(['notification' => $class], $fields);
        }

        return response()->json(['data' => array_map(static fn (?string $value): string => (string) $value, $fields)]);
    }

    /** The email as it would look with the wording in the editor, filled with made-up details. */
    public function preview(Request $request, string $email): JsonResponse
    {
        $class = Catalogue::classFor($email) ?? abort(404);
        /** @var User $admin */
        $admin = $request->user();
        $notification = Catalogue::sample($class, $admin) ?? abort(404);
        $draft = new Template(self::validated($request));

        Current::set($notification, $admin, $draft);
        try {
            $message = $notification->toMail($admin);
            $subject = (Render::enabled() ? Render::subject($draft) : null) ?? $message->subject ?? Catalogue::defaultSubject($notification);

            return response()->json(['data' => ['subject' => $subject, 'html' => (string) $message->render()]]);
        } finally {
            Current::clear();
        }
    }

    /** Sends the email, with made-up details, to the admin who asked. */
    public function test(Request $request, string $email): JsonResponse
    {
        $class = Catalogue::classFor($email) ?? abort(404);
        /** @var User $admin */
        $admin = $request->user();
        $notification = Catalogue::sample($class, $admin) ?? abort(404);

        try {
            $admin->notifyNow($notification);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['errors' => [['code' => 'MailFailed', 'status' => '422', 'detail' => 'The mail server did not take the email: '.$exception->getMessage()]]], 422);
        }

        return response()->json(['data' => ['to' => $admin->email]]);
    }

    /** @return array<string, string|null> */
    private static function validated(Request $request): array
    {
        $data = $request->validate([
            'subject' => ['nullable', 'string', 'max:191'],
            'greeting' => ['nullable', 'string', 'max:191'],
            'intro' => ['nullable', 'string', 'max:5000'],
            'action' => ['nullable', 'string', 'max:64'],
            'outro' => ['nullable', 'string', 'max:5000'],
        ]);

        $fields = [];
        foreach (Template::FIELDS as $field) {
            $value = trim((string) ($data[$field] ?? ''));
            $fields[$field] = $value === '' ? null : $value;
        }

        return $fields;
    }

    /** The panel's own text for the email, with made-up details, shown under the editor's fields. */
    private static function panelText(string $class, User $admin): array
    {
        $notification = Catalogue::sample($class, $admin);
        $message = $notification !== null ? rescue(static fn () => $notification->toMail($admin), null, false) : null;
        if (! $message instanceof MailMessage || ! $notification instanceof Notification) {
            return ['subject' => '', 'greeting' => '', 'intro' => '', 'action' => '', 'outro' => ''];
        }

        return [
            'subject' => $message->subject ?? Catalogue::defaultSubject($notification),
            'greeting' => (string) ($message->greeting ?? ''),
            'intro' => implode("\n", array_map('strval', $message->introLines)),
            'action' => (string) ($message->actionText ?? ''),
            'outro' => implode("\n", array_map('strval', $message->outroLines)),
        ];
    }
}
