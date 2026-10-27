// Calls the Panel client API as the test user. Usage: MCS_KEY=ptlc_... node scripts/api.mjs GET <server>/extensions/prism-mc/info ['{"json":1}']
const [method, path, body] = process.argv.slice(2);
const base = process.env.PANEL_URL;
if (!base) throw new Error('Set PANEL_URL.');
const url = path.startsWith('api/') ? `${base}/${path}` : `${base}/api/client/servers/${path}`;
const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${process.env.MCS_KEY}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ?? undefined,
});
const text = await res.text();
let out = text;
try {
    out = JSON.stringify(JSON.parse(text), null, 1);
} catch {}
console.log(res.status, out.length > 4000 && !process.env.FULL ? out.slice(0, 4000) + '\n…' : out);
