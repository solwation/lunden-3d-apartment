// Run the Worker locally without Cloudflare (tests, tools/cloudtest.html): an in-memory KV, plain Node ≥ 18.
//   node cloudflare/dev.mjs [port=8144] [admin token]
// then open the site with &cloud=http://localhost:8144
import http from 'node:http';
import worker from './worker.js';

const port = Number(process.argv[2] ?? 8144);
const store = new Map();
const LUNDEN = {
  async get(k, type) { const e = store.get(k); if (!e) return null; return type === 'json' ? JSON.parse(e.v) : e.v; },
  async getWithMetadata(k) { const e = store.get(k); return { value: e ? e.v : null, metadata: e?.meta ?? null }; },
  async put(k, v, opts = {}) { store.set(k, { v: typeof v === 'string' ? v : v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength), meta: opts.metadata }); },
  async delete(k) { store.delete(k); },
};
const env = { LUNDEN, ADMIN_TOKEN: process.argv[3] };

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
  const r = await worker.fetch(request, env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(`lunden worker on http://localhost:${port}`));
