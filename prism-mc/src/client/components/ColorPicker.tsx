import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Button, Dialog, Input, Label, Tooltip, cn } from '@pterodactyl/sdk';
import { NamedIcon } from '../icons';
import { COLORS } from '../lib/motd';

const HEX = /^#?[0-9a-fA-F]{6}$/;

type Hsv = { h: number; s: number; v: number };

function hexToHsv(hex: string): Hsv {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.replace('#', '').padStart(7, '#').slice(at, at + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const span = max - Math.min(r, g, b);
    const h = span === 0 ? 0 : max === r ? ((g - b) / span + 6) % 6 : max === g ? (b - r) / span + 2 : (r - g) / span + 4;

    return { h: h * 60, s: max === 0 ? 0 : span / max, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
    const f = (n: number) => {
        const k = (n + h / 60) % 6;

        return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };

    return `#${[f(5), f(3), f(1)].map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Black or white, whichever reads better on the color. */
const inkOn = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

    return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#000000' : '#ffffff';
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Drags across an element, reporting where the pointer is in it from 0 to 1 on each axis. */
function useDrag(onMove: (x: number, y: number) => void) {
    const ref = useRef<HTMLDivElement>(null);
    const report = (event: PointerEvent<HTMLDivElement>) => {
        const box = ref.current!.getBoundingClientRect();
        onMove(clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height));
    };

    return {
        ref,
        onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.focus();
            report(event);
        },
        onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) report(event);
        },
    };
}

interface Props {
    value: string;
    onChange: (hex: string) => void;
    /** What the swatch does, for its tooltip and the window's title. */
    label: string;
    /** The button that takes the color. */
    confirm?: string;
    /** Something to show under the picker, such as what the color applies to. */
    hint?: ReactNode;
    className?: string;
    /** The pipette's size, for squares larger than the default. */
    iconSize?: number;
}

/**
 * A square filled with the color, with a pipette on it. Clicking it opens a window to pick a
 * color from a saturation and brightness square and a hue slider, or by typing its hex code.
 */
export default function ColorPicker({ value, onChange, label, confirm = 'Use this color', hint, className, iconSize = 15 }: Props) {
    const [open, setOpen] = useState(false);
    const hex = HEX.test(value) ? `#${value.replace('#', '').toLowerCase()}` : '#ffffff';

    return (
        <>
            <Tooltip content={label}>
                <button
                    type={'button'}
                    aria-label={`${label}, ${hex.toUpperCase()}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setOpen(true)}
                    className={cn('mcs:flex mcs:shrink-0 mcs:cursor-pointer mcs:items-center mcs:justify-center mcs:rounded-md mcs:shadow-[inset_0_0_0_1px_rgb(0_0_0/0.3)] mcs:transition-transform mcs:hover:scale-105', className ?? 'mcs:size-8')}
                    style={{ backgroundColor: hex, color: inkOn(hex) }}
                >
                    <NamedIcon name={'pipette'} size={iconSize} />
                </button>
            </Tooltip>
            {open && (
                <PickerDialog
                    initial={hex}
                    title={label}
                    confirm={confirm}
                    hint={hint}
                    onClose={() => setOpen(false)}
                    onPick={(picked) => {
                        setOpen(false);
                        onChange(picked);
                    }}
                />
            )}
        </>
    );
}

function PickerDialog({ initial, title, confirm, hint, onClose, onPick }: { initial: string; title: string; confirm: string; hint?: ReactNode; onClose: () => void; onPick: (hex: string) => void }) {
    // Hue and saturation are kept apart from the hex so they survive greys and black.
    const [hsv, setHsv] = useState(() => hexToHsv(initial));
    const [text, setText] = useState(initial.toUpperCase());
    const hex = hsvToHex(hsv);

    const set = (next: Hsv) => {
        setHsv(next);
        setText(hsvToHex(next).toUpperCase());
    };

    const type = (value: string) => {
        setText(value);
        if (HEX.test(value.trim())) setHsv(hexToHsv(`#${value.trim().replace('#', '')}`));
    };

    const area = useDrag((x, y) => set({ ...hsv, s: x, v: 1 - y }));
    const hue = useDrag((x) => set({ ...hsv, h: x * 360 }));

    const areaKeys = (event: KeyboardEvent) => {
        const step = event.shiftKey ? 0.1 : 0.02;
        const moves: Record<string, Partial<Hsv>> = { ArrowLeft: { s: clamp(hsv.s - step) }, ArrowRight: { s: clamp(hsv.s + step) }, ArrowUp: { v: clamp(hsv.v + step) }, ArrowDown: { v: clamp(hsv.v - step) } };
        if (moves[event.key]) {
            event.preventDefault();
            set({ ...hsv, ...moves[event.key] });
        }
    };

    const hueKeys = (event: KeyboardEvent) => {
        const step = event.shiftKey ? 30 : 3;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            set({ ...hsv, h: Math.min(360, Math.max(0, hsv.h + (event.key === 'ArrowLeft' ? -step : step))) });
        }
    };

    const valid = HEX.test(text.trim());
    const thumb = 'mcs:pointer-events-none mcs:absolute mcs:size-4 mcs:-translate-x-1/2 mcs:-translate-y-1/2 mcs:rounded-full mcs:border-2 mcs:border-white mcs:shadow-[0_0_0_1px_rgb(0_0_0/0.4),0_1px_3px_rgb(0_0_0/0.4)]';

    return (
        <Dialog open onClose={onClose} title={title}>
            <div className={'mcs:flex mcs:flex-col mcs:gap-4'}>
                {/* Saturation across, brightness up. */}
                <div
                    {...area}
                    role={'slider'}
                    tabIndex={0}
                    aria-label={'Saturation and brightness'}
                    aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
                    onKeyDown={areaKeys}
                    className={'mcs:relative mcs:h-48 mcs:w-full mcs:cursor-crosshair mcs:touch-none mcs:rounded-lg mcs:outline-none mcs:focus-visible:ring-2 mcs:focus-visible:ring-primary'}
                    style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h} 100% 50%)` }}
                >
                    <span className={thumb} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hex }} />
                </div>

                <div
                    {...hue}
                    role={'slider'}
                    tabIndex={0}
                    aria-label={'Hue'}
                    aria-valuemin={0}
                    aria-valuemax={360}
                    aria-valuenow={Math.round(hsv.h)}
                    onKeyDown={hueKeys}
                    className={'mcs:relative mcs:h-3 mcs:w-full mcs:cursor-pointer mcs:touch-none mcs:rounded-full mcs:outline-none mcs:focus-visible:ring-2 mcs:focus-visible:ring-primary'}
                    style={{ background: 'linear-gradient(90deg, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00)' }}
                >
                    <span className={cn(thumb, 'mcs:top-1/2')} style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h} 100% 50%)` }} />
                </div>

                <div className={'mcs:flex mcs:items-end mcs:gap-3'}>
                    {/* The color picked beside the one it replaces. */}
                    <div className={'mcs:flex mcs:h-10 mcs:w-20 mcs:shrink-0 mcs:overflow-hidden mcs:rounded-md mcs:shadow-[inset_0_0_0_1px_rgb(0_0_0/0.3)]'} aria-hidden>
                        <span className={'mcs:flex-1'} style={{ backgroundColor: initial }} title={'Before'} />
                        <span className={'mcs:flex-1'} style={{ backgroundColor: hex }} title={'New'} />
                    </div>
                    <div className={'mcs:flex-1'}>
                        <Label htmlFor={'mcs-color-hex'}>Hex</Label>
                        <Input id={'mcs-color-hex'} value={text} onChange={(event) => type(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && valid && onPick(hex)} maxLength={7} spellCheck={false} className={'mcs:font-mono'} />
                    </div>
                </div>
                {!valid && <p className={'mcs:-mt-2 mcs:text-xs mcs:text-destructive'}>Six hex digits, such as #54DAF4.</p>}

                <div>
                    <p className={'mcs:mb-1.5 mcs:text-xs mcs:font-medium mcs:text-muted-foreground'}>Minecraft colors</p>
                    <div className={'mcs:grid mcs:grid-cols-16 mcs:gap-1'}>
                        {COLORS.map((color) => (
                            <button key={color.code} type={'button'} aria-label={color.name} title={color.name} onClick={() => type(color.hex)} className={'mcs:aspect-square mcs:cursor-pointer mcs:rounded-sm mcs:shadow-[inset_0_0_0_1px_rgb(0_0_0/0.3)] mcs:transition-transform mcs:hover:scale-110'} style={{ backgroundColor: color.hex }} />
                        ))}
                    </div>
                </div>
                {hint && <p className={'mcs:text-xs mcs:text-muted-foreground'}>{hint}</p>}
            </div>
            <Dialog.Footer>
                <Button.Text onClick={onClose}>Cancel</Button.Text>
                <Button disabled={!valid} onClick={() => onPick(hex)}>
                    {confirm}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
