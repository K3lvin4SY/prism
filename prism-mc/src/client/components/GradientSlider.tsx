import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { NamedIcon, Tooltip, cn } from '@pterodactyl/sdk';
import { colourAt, type GradientStop } from '../lib/motd';
import ColorPicker from './ColorPicker';

/** Pixels a handle can be dragged off the line before letting go removes it. */
const TEAR_OFF = 36;

/**
 * A gradient as a slider: a line in the gradient's colours with a handle for each colour on it.
 * Click the line to add a colour there, drag a handle to move it, and select one to change its
 * colour beside the slider or to remove it (the bin, Delete, or dragging it off the line).
 * There are always at least two colours.
 */
export default function GradientSlider({ stops, onChange }: { stops: GradientStop[]; onChange: (stops: GradientStop[]) => void }) {
    const track = useRef<HTMLDivElement>(null);
    const [selected, setSelected] = useState(0);
    const [dragging, setDragging] = useState<{ index: number; off: boolean } | null>(null);
    const current = stops[Math.min(selected, stops.length - 1)];
    const sorted = [...stops].sort((a, b) => a.at - b.at);
    const background = `linear-gradient(90deg, ${sorted.map((stop) => `${stop.hex} ${(stop.at * 100).toFixed(1)}%`).join(', ')})`;

    const placeOf = (clientX: number) => {
        const box = track.current!.getBoundingClientRect();

        return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    };

    const update = (index: number, change: Partial<GradientStop>) => onChange(stops.map((stop, at) => (at === index ? { ...stop, ...change } : stop)));

    const remove = (index: number) => {
        if (stops.length <= 2) return;
        onChange(stops.filter((_, at) => at !== index));
        setSelected(Math.max(0, index - 1));
    };

    const add = (event: PointerEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        const at = placeOf(event.clientX);
        onChange([...stops, { at, hex: `#${colourAt(stops, at)}` }]);
        setSelected(stops.length);
    };

    const grab = (index: number) => (event: PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelected(index);
        setDragging({ index, off: false });
    };

    const move = (event: PointerEvent<HTMLButtonElement>) => {
        if (!dragging) return;
        const box = track.current!.getBoundingClientRect();
        const off = stops.length > 2 && Math.abs(event.clientY - (box.top + box.height / 2)) > TEAR_OFF;
        if (off !== dragging.off) setDragging({ ...dragging, off });
        update(dragging.index, { at: placeOf(event.clientX) });
    };

    const drop = () => {
        if (dragging?.off) remove(dragging.index);
        setDragging(null);
    };

    const keys = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
        const step = event.shiftKey ? 0.1 : 0.01;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            update(index, { at: Math.min(1, Math.max(0, stops[index].at + (event.key === 'ArrowLeft' ? -step : step))) });
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            remove(index);
        }
    };

    return (
        <div className={'mcs:flex mcs:flex-wrap mcs:items-center mcs:gap-3'}>
            <div className={'mcs:relative mcs:min-w-56 mcs:flex-1 mcs:py-3'}>
                {/* The line; clicking it adds a colour where it was clicked. */}
                <div ref={track} onPointerDown={add} className={'mcs:relative mcs:h-1.5 mcs:cursor-copy mcs:rounded-full'} style={{ background }} title={'Click to add a color here'}>
                    {stops.map((stop, index) => (
                        <button
                            key={index}
                            type={'button'}
                            aria-label={`Color ${index + 1} of ${stops.length}, ${stop.hex}, at ${Math.round(stop.at * 100)}%`}
                            aria-pressed={index === selected}
                            onPointerDown={grab(index)}
                            onPointerMove={move}
                            onPointerUp={drop}
                            onPointerCancel={() => setDragging(null)}
                            onKeyDown={keys(index)}
                            onFocus={() => setSelected(index)}
                            className={cn(
                                'mcs:absolute mcs:top-1/2 mcs:-translate-x-1/2 mcs:-translate-y-1/2 mcs:cursor-grab mcs:rounded-full mcs:border-2 mcs:shadow-md mcs:transition-[width,height,opacity] mcs:outline-none mcs:active:cursor-grabbing',
                                index === selected ? 'mcs:size-5 mcs:border-white mcs:ring-2 mcs:ring-primary' : 'mcs:size-4 mcs:border-white/80',
                                dragging?.index === index && dragging.off && 'mcs:opacity-40'
                            )}
                            style={{ left: `${stop.at * 100}%`, backgroundColor: stop.hex }}
                        />
                    ))}
                </div>
            </div>
            <div className={'mcs:flex mcs:items-center mcs:gap-1.5'}>
                <ColorPicker value={current.hex} onChange={(hex) => update(stops.indexOf(current), { hex })} label={'Color of the selected handle'} />
                <span className={'mcs:w-16 mcs:font-mono mcs:text-xs mcs:text-muted-foreground'}>{current.hex.toUpperCase()}</span>
                <Tooltip content={stops.length <= 2 ? 'A gradient needs two colors' : 'Remove this color (or drag it off the line)'}>
                    <button
                        type={'button'}
                        aria-label={'Remove the selected color'}
                        disabled={stops.length <= 2}
                        onClick={() => remove(stops.indexOf(current))}
                        className={'mcs:flex mcs:size-8 mcs:cursor-pointer mcs:items-center mcs:justify-center mcs:rounded-md mcs:text-muted-foreground mcs:hover:bg-destructive/15 mcs:hover:text-destructive mcs:disabled:cursor-not-allowed mcs:disabled:opacity-40'}
                    >
                        <NamedIcon name={'trash-2'} size={15} />
                    </button>
                </Tooltip>
            </div>
        </div>
    );
}
