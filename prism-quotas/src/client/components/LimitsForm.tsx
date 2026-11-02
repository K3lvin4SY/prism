import { useState } from 'react';
import { Button, Input } from '@pterodactyl/sdk';
import type { Limits } from '../api';

const FIELDS: { key: keyof Limits; label: string; unit: string; min: number }[] = [
    { key: 'servers', label: 'Servers', unit: '', min: 0 },
    { key: 'memory', label: 'Memory in all', unit: 'MiB', min: 0 },
    { key: 'disk', label: 'Disk in all', unit: 'MiB', min: 0 },
    { key: 'cpu', label: 'CPU in all', unit: '%', min: 0 },
    { key: 'backups', label: 'Backups per server', unit: '', min: 0 },
    { key: 'databases', label: 'Databases per server', unit: '', min: 0 },
    { key: 'allocations', label: 'Ports per server', unit: '', min: 1 },
];

/** The seven numbers of a quota, with Save. */
export default function LimitsForm({ limits, saveLabel = 'Save', busy, onSave, children }: { limits: Limits; saveLabel?: string; busy: boolean; onSave: (limits: Limits) => void; children?: React.ReactNode }) {
    const [values, setValues] = useState<Limits>(limits);
    const changed = FIELDS.some((field) => values[field.key] !== limits[field.key]);

    return (
        <div className={'pqt:flex pqt:flex-col pqt:gap-3'}>
            <div className={'pqt:grid pqt:grid-cols-2 pqt:gap-3 pqt:sm:grid-cols-4 pqt:lg:grid-cols-7'}>
                {FIELDS.map((field) => (
                    <label key={field.key} className={'pqt:flex pqt:flex-col pqt:gap-1'}>
                        <span className={'pqt:text-xs pqt:text-muted-foreground'}>
                            {field.label}
                            {field.unit && ` (${field.unit})`}
                        </span>
                        <Input type={'number'} min={field.min} value={values[field.key]} onChange={(event) => setValues((all) => ({ ...all, [field.key]: Math.max(field.min, Math.floor(Number(event.target.value) || 0)) }))} />
                    </label>
                ))}
            </div>
            <div className={'pqt:flex pqt:items-center pqt:justify-end pqt:gap-2'}>
                {children}
                <Button size={'small'} disabled={!changed && saveLabel === 'Save'} isLoading={busy} onClick={() => onSave(values)}>
                    {saveLabel}
                </Button>
            </div>
        </div>
    );
}
