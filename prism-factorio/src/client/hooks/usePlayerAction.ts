import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { playerAction, type PlayerAction } from '../api/players';

const DONE: Record<PlayerAction, (name: string) => string> = {
    kick: (name) => `${name} is kicked.`,
    ban: (name) => `${name} is banned.`,
    unban: (name) => `${name} is no longer banned.`,
    promote: (name) => `${name} is an admin.`,
    demote: (name) => `${name} is no longer an admin.`,
    'whitelist-add': (name) => `${name} is on the whitelist.`,
    'whitelist-remove': (name) => `${name} is off the whitelist.`,
    whisper: (name) => `Sent to ${name}.`,
};

/** Runs a player action and refreshes the players, telling whether it applied now or at the next start. */
export function usePlayerAction(identifier: string) {
    const queryClient = useQueryClient();
    const [busy, setBusy] = useState(false);

    const act = async (action: PlayerAction, name: string, text?: string): Promise<boolean> => {
        setBusy(true);
        try {
            const applied = await playerAction(identifier, action, name, text);
            toast.success(applied === 'file' ? `${DONE[action](name)} It applies when the server starts.` : DONE[action](name));
            // The game writes its list files a moment after the command.
            window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['prism-factorio', identifier, 'players'] }), applied === 'command' ? 1500 : 0);

            return true;
        } catch (error) {
            toast.error(httpErrorToHuman(error));

            return false;
        } finally {
            setBusy(false);
        }
    };

    return { act, busy };
}
