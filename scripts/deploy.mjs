// Builds the extension, uploads it to the Panel container, lints the PHP, then installs and enables it.
// Usage: PORTAINER_PASS=... node scripts/deploy.mjs [--ext <folder>] [--skip-build] [--doctor]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec, put } from './portainer.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
// The folder of the extension to deploy; its id is the same as the folder name.
const id = argv.includes('--ext') ? argv[argv.indexOf('--ext') + 1] : 'prism-mc';
if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid extension folder: ${id}`);
const extension = join(root, id);
const args = new Set(argv);
const remote = `/tmp/${id}-deploy`;

if (!args.has('--skip-build')) {
    execFileSync('npm', ['run', 'build'], { cwd: extension, stdio: 'inherit', shell: true });
}

const work = mkdtempSync(join(tmpdir(), `${id}-`));
const tar = join(work, `${id}.tar`);
try {
    execFileSync(
        // Git Bash's GNU tar reads "C:" as a remote host, so use the bsdtar Windows ships.
        process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar',
        ['-cf', tar, '--exclude=node_modules', '--exclude=.github', '--exclude=*.pteroext', '--exclude=src/client', '-C', root, id],
        { stdio: 'inherit' }
    );

    const step = async (label, command) => {
        const { output, exitCode } = await exec(command);
        process.stdout.write(`--- ${label}\n${output}`);
        if (exitCode !== 0) {
            throw new Error(`${label} failed (exit ${exitCode})`);
        }
    };

    await step('prepare', `rm -rf ${remote} && mkdir -p ${remote}`);
    await put(tar, remote);
    await step('lint', `cd ${remote}/${id} && find . -name '*.php' -not -path './vendor/*' -print0 | xargs -0 -n1 php -l | grep -v '^No syntax errors' || true`);
    if (args.has('--doctor')) {
        await step('doctor', `cd /app && php artisan p:extension:doctor ${remote}/${id}`);
    }
    await step('install', `cd /app && php artisan p:extension:install ${remote}/${id} --enable --replace --no-interaction`);
    await step('permissions', `chown -R nginx:nginx /app/extensions/${id} && { [ ! -d /app/public/assets/extensions/${id} ] || chown -R nginx:nginx /app/public/assets/extensions/${id}; } && rm -rf ${remote}`);
    await step('state', `cd /app && php artisan p:extension:list | grep -E "ID|${id}"`);
} finally {
    rmSync(work, { recursive: true, force: true });
}
