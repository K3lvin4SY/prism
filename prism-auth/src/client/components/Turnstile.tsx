import { useEffect, useRef } from 'react';

interface TurnstileApi {
    render(element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; theme?: string }): string;
    remove(id: string): void;
}

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    loading ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load.')));
        script.onerror = () => {
            loading = null;
            reject(new Error('Turnstile did not load.'));
        };
        document.head.appendChild(script);
    });

    return loading;
}

/** Cloudflare Turnstile's check, which hands back a token for the server to confirm. */
export default function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
    const box = useRef<HTMLDivElement>(null);
    const callback = useRef(onToken);
    callback.current = onToken;

    useEffect(() => {
        let id: string | null = null;
        let gone = false;
        void load()
            .then((api) => {
                if (gone || !box.current) return;
                id = api.render(box.current, {
                    sitekey: siteKey,
                    callback: (token) => callback.current(token),
                    'expired-callback': () => callback.current(''),
                    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'auto',
                });
            })
            .catch(() => callback.current(''));

        return () => {
            gone = true;
            if (id) window.turnstile?.remove(id);
        };
    }, [siteKey]);

    return <div ref={box} className={'pau:min-h-16'} />;
}
