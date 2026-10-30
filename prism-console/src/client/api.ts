import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { http } from '@pterodactyl/sdk';
import type { LayoutId, QuickCommand, TerminalSettings } from './config';
import type { HighlightSettings, Level, LevelChoice } from './lib/lines';

export type WidgetId = 'terminal' | 'power' | 'info' | 'tiles' | 'charts';
export type Area = 'top' | 'main' | 'side' | 'bottom' | 'hidden';

/** A person's own arrangement: each widget's area, in order. */
export type CustomLayout = { widget: WidgetId; area: Area }[];

export interface Preferences {
    layout?: LayoutId | 'custom';
    custom?: CustomLayout;
    terminal?: Partial<TerminalSettings>;
    highlights?: HighlightSettings;
    /** The levels the pills turn off. */
    hiddenLevels?: Level[];
    /** The level the switch shows. */
    level?: LevelChoice;
}

export interface History {
    commands: string[];
}

interface ConsoleData {
    preferences: Preferences | [];
    history: History;
    quickCommands: QuickCommand[];
    config: Record<string, unknown>;
}

const base = (server: string) => `/api/client/servers/${server}/extensions/prism-console`;

export const consoleKey = (server: string) => ['prism-console', server, 'console'] as const;

export function useConsoleData(server: string) {
    return useQuery({
        queryKey: consoleKey(server),
        queryFn: async () => (await http.get<ConsoleData>(`${base(server)}/console`)).data,
        staleTime: 60_000,
        // Fetched again each time the console opens, for the admin's current settings.
        refetchOnMount: 'always',
        retry: 1,
    });
}

/** The person's preferences, saved a moment after the last change. */
export function usePreferences(server: string) {
    const data = useConsoleData(server);
    const queryClient = useQueryClient();
    const timer = useRef<number>(undefined);
    const preferences: Preferences = Array.isArray(data.data?.preferences) ? {} : (data.data?.preferences ?? {});

    const update = (change: Partial<Preferences>) => {
        const next = { ...preferences, ...change };
        patch(queryClient, server, { preferences: next });
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
    const history: History = data.data?.history ?? { commands: [] };

    const set = (next: History) => patch(queryClient, server, { history: next });

    const record = useMutation({
        mutationFn: async (command: string) => {
            set({ commands: [command, ...history.commands.filter((item) => item !== command)] });
            if (sync) set((await http.post<{ history: History }>(`${base(server)}/history`, { command })).data.history);
        },
    });

    const clear = useMutation({
        mutationFn: async () => {
            set({ commands: [] });
            if (sync) await http.delete(`${base(server)}/history`);
        },
    });

    return { history, record: record.mutate, clear: clear.mutate };
}

export type QuickCommandInput = Omit<QuickCommand, 'id'>;

/** The server's quick commands, shared by everyone who can use its console. */
export function useQuickCommands(server: string) {
    const data = useConsoleData(server);
    const queryClient = useQueryClient();
    const set = (quickCommands: QuickCommand[]) => patch(queryClient, server, { quickCommands });

    return {
        commands: data.data?.quickCommands ?? [],
        add: async (command: QuickCommandInput) => set((await http.post<{ quickCommands: QuickCommand[] }>(`${base(server)}/quick-commands`, command)).data.quickCommands),
        update: async (id: number, command: QuickCommandInput) => set((await http.patch<{ quickCommands: QuickCommand[] }>(`${base(server)}/quick-commands/${id}`, command)).data.quickCommands),
        remove: async (id: number) => set((await http.delete<{ quickCommands: QuickCommand[] }>(`${base(server)}/quick-commands/${id}`)).data.quickCommands),
    };
}

/** Changes part of the cached console data, once it has loaded (an empty config would hide the admin's settings). */
function patch(queryClient: QueryClient, server: string, part: Partial<ConsoleData>): void {
    queryClient.setQueryData(consoleKey(server), (current: ConsoleData | undefined) => (current ? { ...current, ...part } : current));
}
