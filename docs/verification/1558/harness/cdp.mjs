// Windows node.exe CDP driver (#1558): launch Windows Chrome (native GPU) off-screen, open URL, run a job, save its JSON.
// node.exe cdp.mjs <url> <jobfile.js> <outfile> [profileDir] [w] [h] [extra chrome flags...]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [url, jobFile, outFile, profile = `${process.env.TEMP}\\lunden1558-prof`, W = '1363', H = '849', ...extra] = process.argv.slice(2);
const PORT = 9358;
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const args = [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--window-position=-3000,-3000', `--window-size=${+W + 40},${+H + 160}`, '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-extensions', '--mute-audio', ...extra, 'about:blank'];
const proc = spawn(chrome, args, { stdio: 'ignore', detached: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 100 && !target; i++) {
  await sleep(300);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
if (!target) { console.error('no target'); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map(); const log = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.consoleAPICalled') log.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400));
  else if (m.method === 'Runtime.exceptionThrown') log.push('EXC: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 600));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
const ua = process.env.LUNDEN_UA; if (ua) await send('Emulation.setUserAgentOverride', { userAgent: ua });
await send('Page.navigate', { url });
for (let i = 0; i < 200; i++) { await sleep(200); const r = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }); if (String(r.result?.result?.value).startsWith('http')) break; }
await sleep(500);
const job = fs.readFileSync(jobFile, 'utf8');
const t0 = Date.now();
const res = await send('Runtime.evaluate', { expression: `(${job})()`, awaitPromise: true, returnByValue: true, timeout: 1500000 });
const value = res.result?.result?.value ?? { error: res.result?.exceptionDetails ?? res.error ?? res };
fs.writeFileSync(outFile, JSON.stringify({ wallMs: Date.now() - t0, url, value, console: log.slice(-300) }, null, 1));
console.log('done', outFile, Math.round((Date.now() - t0) / 1000) + ' s');
try { await send('Browser.close'); } catch {}
await sleep(1500); try { proc.kill(); } catch {}
process.exit(0);
