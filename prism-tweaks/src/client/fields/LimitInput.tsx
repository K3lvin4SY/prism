import { Label, NumberInput } from '@pterodactyl/sdk';

interface Bound {
    id: string;
    value: number | null | undefined;
    setValue: (value: number | null) => void;
    error?: string | null;
}

/** One number on an admin form: empty means "use the number for everyone". */
export default function LimitInput({ field, label, help, min, max }: { field: Bound; label: string; help: string; min: number; max: number }) {
    return (
        <div>
            <Label htmlFor={field.id}>{label}</Label>
            <NumberInput id={field.id} value={field.value ?? null} min={min} max={max} onValueChange={(next) => field.setValue(typeof next === 'number' && Number.isFinite(next) && next > 0 ? Math.round(next) : null)} />
            <p className={'input-help'}>{help}</p>
            {field.error && <p className={'input-help error'}>{field.error}</p>}
        </div>
    );
}
