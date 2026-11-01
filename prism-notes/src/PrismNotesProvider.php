<?php

declare(strict_types=1);

namespace PrismNotes;

use Pterodactyl\Extensions\ExtensionProvider;
use Pterodactyl\Services\Extensions\ExtensionSettingDefinition as Setting;
use Pterodactyl\Services\Extensions\ExtensionSettingsDefinition;

class PrismNotesProvider extends ExtensionProvider
{
    public function boot(): void
    {
        $this->registerApiRoutes();

        $this->registerPermissions('Notes and checklists from Prism Notes.', [
            'read' => 'See the server\'s notes and tick checklist items.',
            'manage' => 'Write, change, pin, reorder and delete notes.',
        ]);

        $this->registerSettings(new ExtensionSettingsDefinition($this->settings(), [
            Setting::make('enabled', 'enabled', true, ['required', 'boolean'])->label('Use notes')->help('Off, the Notes page is hidden. Notes already written are kept.')->tab('General')->field('toggle')->frontend(),
            Setting::make('max_notes', 'max_notes', 50, ['required', 'integer', 'min:1', 'max:200'])->label('Most notes a server may have')->tab('General')->field('number')->frontend(),
            Setting::make('console_pinned', 'console_pinned', true, ['required', 'boolean'])->label('Show pinned notes above the console')->help('Everyone who may read notes sees them there.')->tab('General')->field('toggle')->frontend(),
        ]));
    }
}
