import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Button,
    ButtonStyle,
    CopyOnClick,
    DropdownMenu,
    DropdownMenuItem,
    Input,
    Label,
    Select,
    TextArea,
    TitledGreyBox,
    Tooltip,
    httpErrorToHuman,
    toast,
    useDebouncedCallback,
} from '@pterodactyl/sdk';
import { getStatus, keys } from '../api/client';
import { renameServer } from '../api/properties';
import { applyCode, insertAt } from '../lib/ampersand';
import {
    COLORS,
    STYLES,
    SYMBOLS,
    centerLine,
    fromAmpersand,
    normalizeMotd,
    rainbow,
    supportsHex,
    toAmpersand,
    toPropertiesValue,
} from '../lib/motd';
import IconUpload from './IconUpload';
import ServerListPreview from './ServerListPreview';

type OutputFormat = 'properties' | 'section' | 'ampersand';

interface Props {
    server: string;
    software: string | null;
    motd: string;
    icon: string | null;
    serverName: string;
    canRename: boolean;
    maxPlayers: number;
    onSave: (values: Record<string, string>) => Promise<void>;
    onIconChange: () => void;
}

const splitLines = (motd: string): [string, string] => {
    const [first = '', second = ''] = toAmpersand(motd).split('\n');

    return [first, second];
};

export default function MotdEditor({ server, software, motd, icon, serverName, canRename, maxPlayers, onSave, onIconChange }: Props) {
    const [lines, setLines] = useState<[string, string]>(() => splitLines(motd));
    const [focused, setFocused] = useState<0 | 1>(0);
    const [hex, setHex] = useState('#54DAF4');
    const [format, setFormat] = useState<OutputFormat>('properties');
    const [paste, setPaste] = useState('');
    const [name, setName] = useState(serverName);
    const [previewOnline, setPreviewOnline] = useState<number | null>(null);
    const [max, setMax] = useState(String(maxPlayers));
    const inputs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
    const hexAllowed = supportsHex(software);

    const status = useQuery({ queryKey: keys.status(server), queryFn: () => getStatus(server), staleTime: 15_000 });
    const canonical = useMemo(() => fromAmpersand(lines.join('\n')), [lines]);

    useEffect(() => {
        // Only follow outside changes; our own saves come back equal and must not move the cursor.
        setLines((current) => (fromAmpersand(current.join('\n')) === motd ? current : splitLines(motd)));
    }, [motd]);

    const saveMotd = useDebouncedCallback((value: string) => {
        onSave({ motd: value }).catch((error) => toast.error(httpErrorToHuman(error)));
    }, 800);

    const saveMax = useDebouncedCallback((value: string) => {
        if (/^\d+$/.test(value) && Number(value) >= 1) {
            onSave({ 'max-players': value }).catch((error) => toast.error(httpErrorToHuman(error)));
        }
    }, 800);

    const update = (next: [string, string]) => {
        setLines(next);
        saveMotd(fromAmpersand(next.join('\n')));
    };

    const setLine = (line: 0 | 1, value: string) => update(line === 0 ? [value, lines[1]] : [lines[0], value]);

    /** Runs an edit against the focused line's selection and puts the cursor back. */
    const edit = (change: (text: string, start: number, end: number) => { text: string; cursor: number }) => {
        const input = inputs[focused].current;
        const text = lines[focused];
        const start = input?.selectionStart ?? text.length;
        const end = input?.selectionEnd ?? text.length;
        const result = change(text, start, end);
        setLine(focused, result.text);
        requestAnimationFrame(() => {
            input?.focus();
            input?.setSelectionRange(result.cursor, result.cursor);
        });
    };

    const applyRainbow = () =>
        edit((text, start, end) => {
            const [from, to] = start === end ? [0, text.length] : [start, end];
            const coloured = toAmpersand(rainbow(fromAmpersand(text.slice(from, to)), hexAllowed));

            return { text: text.slice(0, from) + coloured + '&r' + text.slice(to), cursor: from + coloured.length + 2 };
        });

    const center = (line: 0 | 1) => setLine(line, toAmpersand(centerLine(fromAmpersand(lines[line]))));

    const output =
        format === 'properties' ? `motd=${toPropertiesValue(canonical)}` : format === 'section' ? canonical.replace(/\n/g, '\\n') : toAmpersand(canonical).replace(/\n/g, '\\n');

    const readPaste = (value: string) => {
        setPaste(value);
        if (value.trim() !== '') {
            update(splitLines(normalizeMotd(value)));
        }
    };

    const rename = async () => {
        const trimmed = name.trim();
        if (trimmed === '' || trimmed === serverName) return;

        try {
            await renameServer(server, trimmed);
            toast.success('Server renamed.');
        } catch (error) {
            toast.error(httpErrorToHuman(error));
        }
    };

    const online = previewOnline ?? status.data?.status?.online ?? 0;

    return (
        <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
            <ServerListPreview
                name={name}
                motd={canonical}
                icon={icon}
                online={online}
                max={Number(max) || maxPlayers}
                onLineClick={(line) => {
                    setFocused(line as 0 | 1);
                    inputs[line].current?.focus();
                }}
            />

            <div className={'mcs:grid mcs:gap-4 mcs:xl:grid-cols-2'}>
                <TitledGreyBox title={'Editor'}>
                    <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                        <div>
                            <Label>Colours</Label>
                            <div className={'mcs:flex mcs:flex-wrap mcs:gap-1.5 mcs:mt-1'}>
                                {COLORS.map((color) => (
                                    <Tooltip key={color.code} content={`${color.name} · &${color.code}`}>
                                        <button
                                            type={'button'}
                                            aria-label={color.name}
                                            onMouseDown={(event) => event.preventDefault()}
                                            onClick={() => edit((text, start, end) => applyCode(text, start, end, color.code))}
                                            className={'mcs:size-7 mcs:rounded mcs:border mcs:border-border mcs:cursor-pointer'}
                                            style={{ backgroundColor: color.hex }}
                                        />
                                    </Tooltip>
                                ))}
                            </div>
                            <div className={'mcs:flex mcs:gap-2 mcs:mt-2 mcs:items-center'}>
                                <input
                                    type={'color'}
                                    value={hex}
                                    disabled={!hexAllowed}
                                    onChange={(event) => setHex(event.target.value.toUpperCase())}
                                    className={'mcs:h-9 mcs:w-11 mcs:rounded mcs:border mcs:border-border mcs:bg-transparent'}
                                    aria-label={'Hex colour'}
                                />
                                <Input value={hex} disabled={!hexAllowed} onChange={(event) => setHex(event.target.value)} className={'mcs:max-w-32'} />
                                <Button
                                    size={'small'}
                                    isSecondary
                                    disabled={!hexAllowed || !/^#[0-9a-fA-F]{6}$/.test(hex)}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => edit((text, start, end) => applyCode(text, start, end, hex.toLowerCase()))}
                                >
                                    Add hex
                                </Button>
                            </div>
                            {!hexAllowed && <p className={'mcs:text-xs mcs:text-muted-foreground mcs:mt-1'}>Hex colours need Paper, Purpur or Spigot.</p>}
                        </div>

                        <div>
                            <Label>Formatting</Label>
                            <div className={'mcs:flex mcs:flex-wrap mcs:gap-1.5 mcs:mt-1'}>
                                {STYLES.map((style) => (
                                    <Button
                                        key={style.code}
                                        size={'small'}
                                        isSecondary
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => edit((text, start, end) => applyCode(text, start, end, style.code))}
                                    >
                                        {style.name} <span className={'mcs:text-muted-foreground mcs:ml-1'}>&amp;{style.code}</span>
                                    </Button>
                                ))}
                                <Button size={'small'} isSecondary onMouseDown={(event) => event.preventDefault()} onClick={() => edit((text, start, end) => insertAt(text, start, end, '&r'))}>
                                    Reset <span className={'mcs:text-muted-foreground mcs:ml-1'}>&amp;r</span>
                                </Button>
                                <Button size={'small'} isSecondary onMouseDown={(event) => event.preventDefault()} onClick={applyRainbow}>
                                    Rainbow
                                </Button>
                                <DropdownMenu triggerContent={<ButtonStyle as={'span'} size={'small'} isSecondary>Symbols</ButtonStyle>}>
                                    <div className={'mcs:grid mcs:grid-cols-8 mcs:gap-1 mcs:p-1'}>
                                        {SYMBOLS.map((symbol) => (
                                            <DropdownMenuItem key={symbol} onClick={() => edit((text, start, end) => insertAt(text, start, end, symbol))}>
                                                <span className={'mcs:text-lg'}>{symbol}</span>
                                            </DropdownMenuItem>
                                        ))}
                                    </div>
                                </DropdownMenu>
                            </div>
                        </div>

                        {([0, 1] as const).map((line) => (
                            <div key={line}>
                                <div className={'mcs:flex mcs:items-center mcs:justify-between'}>
                                    <Label htmlFor={`mcs-motd-${line}`}>{line === 0 ? 'First line' : 'Second line'}</Label>
                                    <Button.Text size={'xsmall'} onClick={() => center(line)}>
                                        Centre
                                    </Button.Text>
                                </div>
                                <Input
                                    id={`mcs-motd-${line}`}
                                    ref={inputs[line]}
                                    value={lines[line]}
                                    onFocus={() => setFocused(line)}
                                    onChange={(event) => setLine(line, event.target.value)}
                                    className={'mcs:font-mono'}
                                    spellCheck={false}
                                />
                            </div>
                        ))}

                        <div>
                            <Label>Server icon</Label>
                            <IconUpload server={server} icon={icon} onChange={onIconChange} />
                        </div>
                    </div>
                </TitledGreyBox>

                <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                    <TitledGreyBox title={'Output'}>
                        <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                            <Select
                                value={format}
                                onChange={(value) => setFormat(value as OutputFormat)}
                                options={[
                                    { value: 'properties', label: 'server.properties line' },
                                    { value: 'section', label: '§ codes' },
                                    { value: 'ampersand', label: '& codes' },
                                ]}
                            />
                            <CopyOnClick text={output}>
                                <pre className={'mcs:text-xs mcs:font-mono mcs:whitespace-pre-wrap mcs:break-all mcs:bg-sunken mcs:rounded mcs:p-3 mcs:cursor-pointer'}>{output}</pre>
                            </CopyOnClick>
                            <div>
                                <Label htmlFor={'mcs-motd-paste'}>Paste a MOTD</Label>
                                <TextArea
                                    id={'mcs-motd-paste'}
                                    rows={2}
                                    value={paste}
                                    placeholder={'Any of the three formats, from any generator'}
                                    onChange={(event) => readPaste(event.target.value)}
                                    className={'mcs:font-mono'}
                                />
                                <p className={'mcs:text-xs mcs:text-muted-foreground mcs:mt-1'}>
                                    The preview follows along and it is saved a moment after you stop typing.
                                </p>
                            </div>
                        </div>
                    </TitledGreyBox>

                    <TitledGreyBox title={'Preview settings'}>
                        <div className={'mcs:flex mcs:flex-col mcs:gap-3'}>
                            <div>
                                <Label htmlFor={'mcs-server-name'}>Server name</Label>
                                <Input id={'mcs-server-name'} value={name} disabled={!canRename} onChange={(event) => setName(event.target.value)} onBlur={rename} maxLength={191} />
                                <p className={'mcs:text-xs mcs:text-muted-foreground mcs:mt-1'}>Renames the server in the Panel as well.</p>
                            </div>
                            <div className={'mcs:grid mcs:grid-cols-2 mcs:gap-3'}>
                                <div>
                                    <Label htmlFor={'mcs-preview-online'}>Players online</Label>
                                    <Input
                                        id={'mcs-preview-online'}
                                        inputMode={'numeric'}
                                        value={String(online)}
                                        onChange={(event) => setPreviewOnline(Number(event.target.value.replace(/\D/g, '')) || 0)}
                                    />
                                    <p className={'mcs:text-xs mcs:text-muted-foreground mcs:mt-1'}>Only used for this preview.</p>
                                </div>
                                <div>
                                    <Label htmlFor={'mcs-preview-max'}>Max players</Label>
                                    <Input
                                        id={'mcs-preview-max'}
                                        inputMode={'numeric'}
                                        value={max}
                                        onChange={(event) => {
                                            const value = event.target.value.replace(/\D/g, '');
                                            setMax(value);
                                            saveMax(value);
                                        }}
                                    />
                                    <p className={'mcs:text-xs mcs:text-muted-foreground mcs:mt-1'}>Saved as max-players.</p>
                                </div>
                            </div>
                        </div>
                    </TitledGreyBox>
                </div>
            </div>
        </div>
    );
}
