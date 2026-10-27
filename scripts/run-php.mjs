// Runs a local PHP file inside the Panel container, with any arguments, and prints its output.
// The file is sent base64-encoded, so quotes and backslashes arrive as written.
// Usage: node --env-file=.env scripts/run-php.mjs <file.php> [args...]
import { readFileSync } from 'node:fs';
import { exec } from './portainer.mjs';

const [file, ...args] = process.argv.slice(2);
if (!file) throw new Error('Usage: node --env-file=.env scripts/run-php.mjs <file.php> [args...]');

const encoded = readFileSync(file).toString('base64');
const quoted = args.map((arg) => `'${arg.replace(/'/g, `'\\''`)}'`).join(' ');
// As the Panel's own user: run as root, anything the script makes (such as the day's Laravel log)
// would be root's, and the queue worker (nginx) could no longer write to it.
const { output } = await exec(`echo ${encoded} | base64 -d > /tmp/prism-run.php && php /tmp/prism-run.php ${quoted}; rm -f /tmp/prism-run.php`, { user: 'nginx' });
console.log(output);
