import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconPlayerPlay, IconPlayerStop, IconRotateClockwise } from '@tabler/icons-react';
import { parseAnsi } from '../../../prism-console/src/client/lib/ansi';
import { ended, formatBytes, refused, type Client, type ShareOption } from './api';

const MAX_LINES = 1000;

interface Stats {
    cpu: number;
    memory: number;
    rx: number;
    tx: number;
}

/**
 * The live console over the node's websocket. The socket only lets the guest watch: commands
 * and power go through the panel, which checks the link each time. Each new socket token is
 * asked for through the panel too, so a revoked link cannot reconnect.
 */
export default function Console({ api, options, onEnded }: { api: Client; options: ShareOption[]; onEnded: (message: string) => void }) {
    const [lines, setLines] = useState<string[]>([]);
    const [state, setState] = useState<string>('connecting');
    const [stats, setStats] = useState<Stats | null>(null);
    const [command, setCommand] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const output = useRef<HTMLDivElement>(null);
    const follow = useRef(true);

    useEffect(() => {
        let socket: WebSocket | null = null;
        let stopped = false;
        let retry = 0;
        let timer: number | undefined;

        const push = (line: string) => setLines((current) => [...current, line].slice(-MAX_LINES));
        const send = (event: string, args: unknown[] = [null]) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ event, args }));
        // The console was taken from the link: it closes, and files and backups stay.
        const lose = (error: unknown) => {
            stopped = true;
            socket?.close();
            setState('offline');
            setNotice(`${(error as Error).message} The console is closed.`);
        };
        const reauthenticate = async () => {
            try {
                send('auth', [(await api.websocket()).token]);
            } catch (error) {
                if (ended(error)) onEnded((error as Error).message);
                else if (refused(error)) lose(error);
            }
        };

        const connect = async () => {
            if (stopped) return;
            let credentials: { token: string; socket: string };
            try {
                credentials = await api.websocket();
            } catch (error) {
                if (ended(error)) return onEnded((error as Error).message);
                if (refused(error)) return lose(error);
                setState('offline');
                timer = window.setTimeout(connect, Math.min(30_000, 2_000 * 2 ** retry++));

                return;
            }

            socket = new WebSocket(credentials.socket);
            socket.onopen = () => send('auth', [credentials.token]);
            socket.onmessage = (message) => {
                let data: { event?: string; args?: unknown[] };
                try {
                    data = JSON.parse(String(message.data));
                } catch {
                    return;
                }
                const arg = typeof data.args?.[0] === 'string' ? (data.args[0] as string) : '';
                switch (data.event) {
                    case 'auth success':
                        retry = 0;
                        setLines([]);
                        send('send logs');
                        send('send stats');
                        break;
                    case 'console output':
                        push(arg);
                        break;
                    case 'status':
                        setState(arg);
                        break;
                    case 'stats':
                        try {
                            const raw = JSON.parse(arg) as { cpu_absolute?: number; memory_bytes?: number; network?: { rx_bytes?: number; tx_bytes?: number }; state?: string };
                            setStats({ cpu: raw.cpu_absolute ?? 0, memory: raw.memory_bytes ?? 0, rx: raw.network?.rx_bytes ?? 0, tx: raw.network?.tx_bytes ?? 0 });
                            if (raw.state) setState(raw.state);
                        } catch {
                            // A malformed frame is skipped; the next follows within seconds.
                        }
                        break;
                    case 'token expiring':
                        void reauthenticate();
                        break;
                    case 'token expired':
                    case 'jwt error':
                        socket?.close();
                        break;
                }
            };
            socket.onclose = () => {
                if (stopped) return;
                setState('offline');
                timer = window.setTimeout(connect, Math.min(30_000, 1_000 * 2 ** retry++));
            };
        };

        void connect();

        return () => {
            stopped = true;
            window.clearTimeout(timer);
            socket?.close();
        };
    }, [api, onEnded]);

    // Keeps the newest line in view unless the guest scrolled up to read.
    useEffect(() => {
        const element = output.current;
        if (element && follow.current) element.scrollTop = element.scrollHeight;
    }, [lines]);

    const act = async (action: () => Promise<void>, done: string) => {
        setBusy(true);
        setNotice(null);
        try {
            await action();
            setNotice(done);
        } catch (error) {
            if (ended(error)) onEnded((error as Error).message);
            else setNotice((error as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const text = command.trim();
        if (text === '' || busy) return;
        void act(() => api.command(text), '').then(() => setCommand(''));
    };

    const power = (['start', 'stop', 'restart'] as const).filter((signal) => options.includes(signal));
    const icons = { start: IconPlayerPlay, stop: IconPlayerStop, restart: IconRotateClockwise };

    return (
        <section className={'psh-card'}>
            <div className={'psh-row'}>
                <span className={`psh-state psh-state-${state}`}>{state}</span>
                {stats && (
                    <span className={'psh-muted'}>
                        CPU {stats.cpu.toFixed(1)}% · Memory {formatBytes(stats.memory)} · Network ↓{formatBytes(stats.rx)} ↑{formatBytes(stats.tx)}
                    </span>
                )}
                <span className={'psh-grow'} />
                {power.map((signal) => {
                    const Icon = icons[signal];

                    return (
                        <button key={signal} type={'button'} className={'psh-button'} disabled={busy} onClick={() => void act(() => api.power(signal), `Sent ${signal}.`)}>
                            <Icon size={16} /> {signal[0].toUpperCase() + signal.slice(1)}
                        </button>
                    );
                })}
            </div>
            {notice && <p className={'psh-muted'}>{notice}</p>}
            <div
                ref={output}
                className={'psh-terminal'}
                role={'log'}
                aria-live={'polite'}
                onScroll={(event) => {
                    const element = event.currentTarget;
                    follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
                }}
            >
                {lines.map((line, index) => (
                    <div key={index} className={'psh-line'}>
                        {parseAnsi(line).map((segment, part) => (
                            <span
                                key={part}
                                style={{
                                    color: segment.fg,
                                    background: segment.bg,
                                    fontWeight: segment.bold ? 700 : undefined,
                                    opacity: segment.dim ? 0.7 : undefined,
                                    fontStyle: segment.italic ? 'italic' : undefined,
                                    textDecoration: segment.underline ? 'underline' : undefined,
                                }}
                            >
                                {segment.text}
                            </span>
                        ))}
                    </div>
                ))}
            </div>
            {options.includes('command') && (
                <form className={'psh-row'} onSubmit={submit}>
                    <input className={'psh-input psh-grow'} value={command} maxLength={1000} placeholder={'Type a command…'} aria-label={'Console command'} onChange={(event) => setCommand(event.target.value)} />
                    <button type={'submit'} className={'psh-button'} disabled={busy || command.trim() === ''}>
                        Send
                    </button>
                </form>
            )}
        </section>
    );
}
