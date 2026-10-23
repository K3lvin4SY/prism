import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@pterodactyl/sdk';
import type { LayoutId, QuickCommand, TerminalSettings } from './config';
import type { HighlightSettings, Level } from './lib/lines';

export type WidgetId = 'terminal' | 'power' | 'info' | 'tiles' | 'charts' | 'quick';
export type Area = 'top' | 'main' | 'side' | 'bottom' | 'hidden';

/** A person's own arrangement: each widget's area, in order. */
export type CustomLayout = { widget: WidgetId; area: Area }[];

export interface Preferences {
    layout?: LayoutId | 'custom';
    custom?: CustomLayout;
    terminal?: Partial<TerminalSettings>;
    highlights?: HighlightSettings;
    quickCommands?: QuickCommand[];
    hiddenLevels?: Level[];
}

export interface History {
    commands: string[];
    pinned: string[];
}

const base = (server: string) => `/api/client/servers/${server}/extensions/prism-console`;

export const consoleKey = (server: string) => ['prism-console', server, 'console'] as const;

export function useConsoleData(server: string) {
    return useQuery({
        queryKey: consoleKey(server),
        queryFn: async () => (await http.get<{ preferences: Preferences | []; history: History }>(`${base(server)}/console`)).data,
        staleTime: Infinity,
        retry: 1,
    });
}

/** The person's preferences, saved a moment after the last change. */
export function usePreferences(server: string) {
    const data = useConsoleData(server);
    const queryClient = useQueryClient();
    const timer = useRef<number>(undefined);
    const preferences: Preferences = Array.isArray(data.data?.preferences) ? {} : (data.data?.preferences ?? {});

    const update = (patch: Partial<Preferences>) => {
        const next = { ...preferences, ...patch };
        queryClient.setQueryData(consoleKey(server), (current: { preferences: Preferences; history: History } | undefined) => ({ history: { commands: [], pinned: [] }, ...current, preferences: next }));
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
            http.put(`${base(server)}/preferences`, { preferences: next }).catch(() => undefined);
        }, 600);
    };

    useEffect(() => () => window.clearTimeout(timer.current), []);

    return { preferences, loaded: data.isSuccess || data.isError, update };
}

export function useHistory(server: string, sync: boolean) {
    const data = useConsoleData(server);
    const queryClient = useQueryClient();
    const history: History = data.data?.history ?? { commands: [], pinned: [] };

    const set = (next: History) => queryClient.setQueryData(consoleKey(server), (current: { preferences: Preferences; history: History } | undefined) => ({ preferences: {}, ...current, history: next }));

    const record = useMutation({
        mutationFn: async (command: string) => {
            set({ ...history, commands: [command, ...history.commands.filter((item) => item !== command)] });
            if (sync) set((await http.post<{ history: History }>(`${base(server)}/history`, { command })).data.history);
        },
    });

    const pin = useMutation({
        mutationFn: async ({ command, pinned }: { command: string; pinned: boolean }) => {
            set({ ...history, pinned: pinned ? [command, ...history.pinned.filter((item) => item !== command)] : history.pinned.filter((item) => item !== command) });
            if (sync) set((await http.put<{ history: History }>(`${base(server)}/history/pin`, { command, pinned })).data.history);
        },
    });

    const clear = useMutation({
        mutationFn: async () => {
            set({ commands: [], pinned: history.pinned });
            if (sync) await http.delete(`${base(server)}/history`);
        },
    });

    return { history, record: record.mutate, pin: pin.mutate, clear: clear.mutate };
}
