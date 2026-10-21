// Builds the extension, uploads it to the Panel container, lints the PHP, then installs and enables it.
// Usage: PORTAINER_PASS=... node scripts/deploy.mjs [--skip-build] [--doctor]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec, put } from './portainer.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extension = join(root, 'mc-suite');
const args = new Set(process.argv.slice(2));
const remote = '/tmp/mcs-deploy';

if (!args.has('--skip-build')) {
    execFileSync('npm', ['run', 'build'], { cwd: extension, stdio: 'inherit', shell: true });
}

const work = mkdtempSync(join(tmpdir(), 'mcs-'));
const tar = join(work, 'mc-suite.tar');
try {
    execFileSync(
        'tar',
        ['-cf', tar, '--exclude=node_modules', '--exclude=.github', '--exclude=*.pteroext', '--exclude=src/client', '-C', root, 'mc-suite'],
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
    await step('lint', `cd ${remote}/mc-suite && find . -name '*.php' -not -path './vendor/*' -print0 | xargs -0 -n1 php -l | grep -v '^No syntax errors' || true`);
    if (args.has('--doctor')) {
        await step('doctor', `cd /app && php artisan p:extension:doctor ${remote}/mc-suite`);
    }
    await step('install', `cd /app && php artisan p:extension:install ${remote}/mc-suite --enable --no-interaction`);
    await step('permissions', 'chown -R nginx:nginx /app/extensions/mc-suite /app/public/assets/extensions/mc-suite && rm -rf ' + remote);
    await step('state', 'cd /app && php artisan p:extension:list | grep -E "ID|mc-suite"');
} finally {
    rmSync(work, { recursive: true, force: true });
}
