import { useState, type ReactNode } from 'react';
import { Button, Dialog } from '@pterodactyl/sdk';

/**
 * A dialog over the link dialog for picking what a link shares (files or backups). It works on a
 * copy: Done hands the picks back, Cancel leaves them as they were.
 */
export default function PickDialog<T>({
    title,
    description,
    initial,
    done,
    onDone,
    onCancel,
    children,
}: {
    title: string;
    description: string;
    initial: T[];
    /** The Done button's words for these picks. */
    done: (picked: T[]) => string;
    onDone: (picked: T[]) => void;
    onCancel: () => void;
    children: (picked: T[], setPicked: (picked: T[]) => void) => ReactNode;
}) {
    const [picked, setPicked] = useState<T[]>(initial);

    return (
        <Dialog open onClose={onCancel} preventExternalClose title={title} description={description}>
            <div className={'psh-pick-dialog'}>{children(picked, setPicked)}</div>
            <Dialog.Footer>
                <Button.Text onClick={onCancel}>Cancel</Button.Text>
                <Button disabled={picked.length === 0} onClick={() => onDone(picked)}>
                    {done(picked)}
                </Button>
            </Dialog.Footer>
        </Dialog>
    );
}
