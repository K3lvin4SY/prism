// Small Portainer client for running commands in, and copying files into, the Panel container.
// Usage: node scripts/portainer.mjs exec "<sh command>"   |   node scripts/portainer.mjs put <local.tar> <container dir>
import { readFileSync } from 'node:fs';

const BASE = process.env.PORTAINER_URL;
const ENDPOINT = process.env.PORTAINER_ENDPOINT ?? '2';
const CONTAINER = process.env.PANEL_CONTAINER ?? 'e449f86e3c203212c0d52595e4161d967188eca114f5b5f6fb1bb09d951261e6';
// An access token (Portainer > My account > Access tokens) acts as the user who created it.
const TOKEN = process.env.PORTAINER_API_TOKEN;

function docker(path, init = {}) {
    if (!BASE || !TOKEN) throw new Error('Set PORTAINER_URL and PORTAINER_API_TOKEN.');
    return fetch(`${BASE}/api/endpoints/${ENDPOINT}/docker${path}`, {
        ...init,
        headers: { 'X-API-Key': TOKEN, ...(init.headers ?? {}) },
    });
}

export async function exec(command, { user } = {}) {
    const create = await docker(`/containers/${CONTAINER}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ AttachStdout: true, AttachStderr: true, Tty: true, Cmd: ['/bin/sh', '-c', command], ...(user ? { User: user } : {}) }),
    });
    if (!create.ok) throw new Error(`exec create failed: ${create.status} ${await create.text()}`);
    const { Id } = await create.json();
    const start = await docker(`/exec/${Id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Detach: false, Tty: true }),
    });
    const output = await start.text();
    const inspect = await (await docker(`/exec/${Id}/json`)).json();
    return { output, exitCode: inspect.ExitCode };
}

export async function put(tarPath, directory) {
    const res = await docker(`/containers/${CONTAINER}/archive?path=${encodeURIComponent(directory)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/x-tar' },
        body: readFileSync(tarPath),
    });
    if (!res.ok) throw new Error(`archive upload failed: ${res.status} ${await res.text()}`);
}

if (process.argv[1]?.endsWith('portainer.mjs')) {
    const [cmd, ...args] = process.argv.slice(2);
    if (cmd === 'exec') {
        const { output, exitCode } = await exec(args.join(' '));
        process.stdout.write(output);
        process.exit(exitCode ?? 0);
    } else if (cmd === 'put') {
        await put(args[0], args[1]);
        console.log('uploaded');
    } else {
        console.error('usage: exec <command> | put <tar> <dir>');
        process.exit(2);
    }
}
