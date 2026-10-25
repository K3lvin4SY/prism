import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Dialog, Input, Select, Switch, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import type { EditorSettings, Keybinds } from '../config';

export interface EditorPreferences {
    editor?: Partial<EditorSettings>;
    keybinds?: Partial<Keybinds>;
}

const KEYBIND_LABELS: Record<keyof Keybinds, string> = {
    save: 'Save',
    saveAll: 'Save all',
    quickOpen: 'Go to file',
    commandPalette: 'Command palette',
    closeTab: 'Close tab',
    reopenTab: 'Reopen closed tab',
    toggleExplorer: 'Show or hide the explorer',
    goToLine: 'Go to line',
};

const THEMES: { value: EditorSettings['theme']; label: string }[] = [
    { value: 'auto', label: "Follow the panel's scheme" },
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'contrast', label: 'High contrast' },
];

const AUTOSAVE: { value: EditorSettings['autosave']; label: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'delay', label: 'A moment after typing stops' },
    { value: 'focus', label: 'When the editor loses focus' },
];

const SWITCHES: { key: 'wordWrap' | 'minimap' | 'stickyScroll' | 'bracketColors'; label: string; description: string }[] = [
    { key: 'wordWrap', label: 'Wrap long lines', description: 'Long lines continue on the next line instead of scrolling sideways.' },
    { key: 'minimap', label: 'Minimap', description: 'A small overview of the file beside the scrollbar.' },
    { key: 'stickyScroll', label: 'Sticky scroll', description: 'The enclosing blocks stay at the top while you scroll.' },
    { key: 'bracketColors', label: 'Bracket colors', description: 'Matching brackets share a color, with guides between them.' },
];

/** A key press as the chord the editor understands, such as Ctrl+Shift+P; null while only modifiers are held. */
function chordOf(event: KeyboardEvent): string | null {
    const key = event.key;
    let name: string | null = null;
    if (/^[a-z0-9]$/i.test(key)) name = key.toUpperCase();
    else if (/^F\d{1,2}$/.test(key)) name = key;
    if (!name) return null;

    return [event.ctrlKey || event.metaKey ? 'Ctrl' : '', event.shiftKey ? 'Shift' : '', event.altKey ? 'Alt' : '', name].filter(Boolean).join('+');
}

/** Keeps only what differs from the defaults, so a later change to a default still reaches everything left alone. */
function changesFrom<T extends object>(values: T, defaults: T): Partial<T> {
    return Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== defaults[key as keyof T])) as Partial<T>;
}

function Row({ label, description, changed, onReset, children }: { label: string; description?: string; changed: boolean; onReset: () => void; children: ReactNode }) {
    return (
        <div className={'pfl:flex pfl:flex-wrap pfl:items-center pfl:gap-x-4 pfl:gap-y-2 pfl:py-3'}>
            <div className={'pfl:min-w-40 pfl:flex-1'}>
                <p className={'pfl:text-sm pfl:font-medium'}>{label}</p>
                {description && <p className={'pfl:text-xs pfl:text-muted-foreground'}>{description}</p>}
            </div>
            <div className={'pfl:flex pfl:items-center pfl:gap-2'}>
                {children}
                <button
                    type={'button'}
                    onClick={onReset}
                    title={'Back to the default'}
                    aria-label={`Reset ${label} to the default`}
                    className={cn('pfl:flex pfl:size-7 pfl:cursor-pointer pfl:items-center pfl:justify-center pfl:rounded-md pfl:text-muted-foreground pfl:hover:bg-muted pfl:hover:text-foreground', !changed && 'pfl:invisible')}
                >
                    <NamedIcon name={'rotate-ccw'} size={14} />
                </button>
            </div>
        </div>
    );
}

/** Records the next key combination pressed in it; Backspace clears the keybind, Escape keeps it. */
function KeyRecorder({ value, onChange, label }: { value: string; onChange: (chord: string) => void; label: string }) {
    const [recording, setRecording] = useState(false);

    return (
        <button
            type={'button'}
            aria-label={`${label}: ${value || 'none'}. Press to record a new combination.`}
            onClick={() => setRecording(true)}
            onBlur={() => setRecording(false)}
            onKeyDown={(event) => {
                if (!recording) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.key === 'Escape') return setRecording(false);
                if (event.key === 'Backspace' || event.key === 'Delete') {
                    onChange('');

                    return setRecording(false);
                }
                const chord = chordOf(event);
                if (chord) {
                    onChange(chord);
                    setRecording(false);
                }
            }}
            className={cn(
                'pfl:min-w-36 pfl:cursor-pointer pfl:rounded-md pfl:border pfl:px-3 pfl:py-1.5 pfl:text-center pfl:font-mono pfl:text-xs',
                recording ? 'pfl:border-primary pfl:bg-primary/10 pfl:text-primary' : 'pfl:border-border pfl:bg-muted/40 pfl:hover:border-primary/50'
            )}
        >
            {recording ? 'Press keys…' : value || 'None'}
        </button>
    );
}

/**
 * The person's own editor settings and keybinds, over the admin's defaults. Each change applies
 * to the open editor at once and is saved with their preferences.
 */
export default function SettingsDialog({
    editor,
    keybinds,
    defaults,
    onChange,
    onClose,
}: {
    editor: EditorSettings;
    keybinds: Keybinds;
    defaults: { editor: EditorSettings; keybinds: Keybinds };
    onChange: (preferences: EditorPreferences) => void;
    onClose: () => void;
}) {
    const setEditor = (patch: Partial<EditorSettings>) => onChange({ editor: changesFrom({ ...editor, ...patch }, defaults.editor), keybinds: changesFrom(keybinds, defaults.keybinds) });
    const setKeybind = (key: keyof Keybinds, chord: string) => onChange({ editor: changesFrom(editor, defaults.editor), keybinds: changesFrom({ ...keybinds, [key]: chord }, defaults.keybinds) });
    const changedAny = Object.keys(changesFrom(editor, defaults.editor)).length + Object.keys(changesFrom(keybinds, defaults.keybinds)).length > 0;
    const section = 'pfl:mt-4 pfl:mb-1 pfl:text-xs pfl:font-semibold pfl:tracking-wide pfl:text-muted-foreground pfl:uppercase';

    return (
        <Dialog open onClose={onClose} title={'Editor settings'} description={'Yours only, for every server. They apply at once.'}>
            <div className={'pfl:flex pfl:max-h-[65vh] pfl:flex-col pfl:overflow-y-auto pfl:pr-1'}>
                <p className={cn(section, 'pfl:mt-0')}>Look</p>
                <div className={'pfl:flex pfl:flex-col pfl:divide-y pfl:divide-border'}>
                    <Row label={'Theme'} changed={editor.theme !== defaults.editor.theme} onReset={() => setEditor({ theme: defaults.editor.theme })}>
                        <div className={'pfl:w-56'}>
                            <Select value={editor.theme} onChange={(value) => setEditor({ theme: value as EditorSettings['theme'] })} options={THEMES} />
                        </div>
                    </Row>
                    <Row label={'Text size'} changed={editor.fontSize !== defaults.editor.fontSize} onReset={() => setEditor({ fontSize: defaults.editor.fontSize })}>
                        <Button size={'small'} isSecondary aria-label={'Smaller text'} disabled={editor.fontSize <= 9} onClick={() => setEditor({ fontSize: editor.fontSize - 1 })}>
                            <NamedIcon name={'minus'} size={14} />
                        </Button>
                        <span className={'pfl:w-12 pfl:text-center pfl:font-mono pfl:text-sm pfl:tabular-nums'}>{editor.fontSize}px</span>
                        <Button size={'small'} isSecondary aria-label={'Larger text'} disabled={editor.fontSize >= 24} onClick={() => setEditor({ fontSize: editor.fontSize + 1 })}>
                            <NamedIcon name={'plus'} size={14} />
                        </Button>
                    </Row>
                    <Row label={'Tab size'} description={'Spaces per indent.'} changed={editor.tabSize !== defaults.editor.tabSize} onReset={() => setEditor({ tabSize: defaults.editor.tabSize })}>
                        <Input
                            type={'number'}
                            min={1}
                            max={8}
                            value={editor.tabSize}
                            onChange={(event) => {
                                const value = Number(event.target.value);
                                if (value >= 1 && value <= 8) setEditor({ tabSize: value });
                            }}
                            className={'pfl:w-20 pfl:text-center'}
                            aria-label={'Tab size'}
                        />
                    </Row>
                    {SWITCHES.map((item) => (
                        <Row key={item.key} label={item.label} description={item.description} changed={editor[item.key] !== defaults.editor[item.key]} onReset={() => setEditor({ [item.key]: defaults.editor[item.key] })}>
                            <Switch checked={editor[item.key]} onChange={(checked) => setEditor({ [item.key]: checked })} />
                        </Row>
                    ))}
                    <Row label={'Auto save'} changed={editor.autosave !== defaults.editor.autosave} onReset={() => setEditor({ autosave: defaults.editor.autosave })}>
                        <div className={'pfl:w-56'}>
                            <Select value={editor.autosave} onChange={(value) => setEditor({ autosave: value as EditorSettings['autosave'] })} options={AUTOSAVE} />
                        </div>
                    </Row>
                </div>

                <p className={section}>Keybinds</p>
                <p className={'pfl:text-xs pfl:text-muted-foreground'}>Click a combination and press the new one. Backspace leaves the action without one; Escape keeps it.</p>
                <div className={'pfl:flex pfl:flex-col pfl:divide-y pfl:divide-border'}>
                    {(Object.keys(KEYBIND_LABELS) as (keyof Keybinds)[]).map((key) => (
                        <Row key={key} label={KEYBIND_LABELS[key]} changed={keybinds[key] !== defaults.keybinds[key]} onReset={() => setKeybind(key, defaults.keybinds[key])}>
                            <KeyRecorder value={keybinds[key]} label={KEYBIND_LABELS[key]} onChange={(chord) => setKeybind(key, chord)} />
                        </Row>
                    ))}
                </div>
            </div>
            <Dialog.Footer>
                <Button.Text disabled={!changedAny} onClick={() => onChange({ editor: {}, keybinds: {} })}>
                    Use the defaults
                </Button.Text>
                <Button onClick={onClose}>Done</Button>
            </Dialog.Footer>
        </Dialog>
    );
}
