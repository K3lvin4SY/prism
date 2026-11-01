import { Checkbox, bytesToString, formatDate } from '@pterodactyl/sdk';
import type { ShareBackup } from '../api';
import { NamedIcon } from '../icons';

/** The backups a link shares: each finished backup with a checkbox, and one for all of them. */
export default function BackupChooser({ backups, picked, disabled, onChange }: { backups: ShareBackup[]; picked: string[]; disabled?: boolean; onChange: (picked: string[]) => void }) {
    if (backups.length === 0) return <p className={'psh:text-xs psh:text-muted-foreground'}>This server has no finished backups yet.</p>;

    const count = backups.filter((backup) => picked.includes(backup.uuid)).length;

    return (
        <div className={'psh:overflow-hidden psh:rounded-lg psh:border psh:border-border psh:bg-background/40'}>
            {backups.length > 1 && (
                <label className={'psh:flex psh:cursor-pointer psh:items-center psh:gap-2 psh:border-b psh:border-border psh:px-3 psh:py-2 psh:text-sm'}>
                    <Checkbox checked={count === backups.length} indeterminate={count > 0 && count < backups.length} disabled={disabled} onChange={(on) => onChange(on ? backups.map((backup) => backup.uuid) : [])} />
                    <span className={'psh:flex-1'}>All backups</span>
                    <span className={'psh:text-xs psh:text-muted-foreground'}>
                        {count} of {backups.length}
                    </span>
                </label>
            )}
            <div className={'psh:flex psh:max-h-48 psh:flex-col psh:overflow-y-auto psh:py-1'}>
                {backups.map((backup) => (
                    <label key={backup.uuid} className={'psh:flex psh:cursor-pointer psh:items-center psh:gap-2 psh:px-3 psh:py-1.5 psh:text-sm psh:hover:bg-muted/50'}>
                        <Checkbox
                            checked={picked.includes(backup.uuid)}
                            disabled={disabled}
                            onChange={(on) => onChange(on ? [...picked, backup.uuid] : picked.filter((uuid) => uuid !== backup.uuid))}
                        />
                        <NamedIcon name={'archive'} size={14} className={'psh:shrink-0 psh:text-primary'} />
                        <span className={'psh:min-w-0 psh:flex-1 psh:truncate'}>{backup.name}</span>
                        <span className={'psh:shrink-0 psh:text-xs psh:text-muted-foreground'}>
                            {bytesToString(backup.size)}
                            {backup.completed_at && ` · ${formatDate(backup.completed_at, 'MMM D')}`}
                        </span>
                    </label>
                ))}
            </div>
        </div>
    );
}
