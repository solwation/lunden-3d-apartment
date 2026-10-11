// Stand-ins for the Workers runtime's WebSocket pieces on plain Node (#666), for dev.mjs and the tests — not deployed
// (worker.js does not import it): WebSocketPair, a 101 Response with `webSocket`, hibernatable acceptWebSocket with
// attachments and the auto-response, and a Durable Object namespace whose objects can be "hibernated" (memory dropped,
// storage kept). Delivery is asynchronous and in order; a room's events run one at a time like the runtime's input gate.
import { createHash } from 'node:crypto';

export class FakeSocket {
  constructor() { this.readyState = 1; this.peer = null; this.listeners = { message: [], close: [] }; this.pending = []; this.attachment = null; this.room = null; }
  accept() { this.readyState = 1; }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
    queueMicrotask(() => { const p = this.pending; this.pending = []; for (const [t, e] of p) this.emit(t, e); });
  }
  emit(type, ev) { if (this.listeners.message.length || this.listeners.close.length) for (const fn of this.listeners[type] ?? []) fn(ev); else this.pending.push([type, ev]); }
  send(data) {
    if (this.readyState !== 1) throw new Error('WebSocket is closed');
    const peer = this.peer;
    queueMicrotask(() => peer.receive(String(data)));
  }
  close(code = 1000, reason = '') {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    const peer = this.peer;
    queueMicrotask(() => peer.closed(code, reason));
  }
  serializeAttachment(v) { this.attachment = structuredClone(v); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  receive(data) {
    if (this.readyState !== 1) return;
    if (this.room) this.room.deliver(this, data); else this.emit('message', { data });
  }
  closed(code, reason) {
    const wasOpen = this.readyState === 1;
    this.readyState = 3;
    if (this.room) { if (wasOpen) this.room.deliverClose(this, code, reason); } else this.emit('close', { code, reason });
  }
}

export class WebSocketPair {
  constructor() { const a = new FakeSocket(), b = new FakeSocket(); a.peer = b; b.peer = a; this[0] = a; this[1] = b; }
}
export class WebSocketRequestResponsePair { constructor(request, response) { this.request = request; this.response = response; } }

/** Install the globals (WebSocketPair, WebSocketRequestResponsePair, a Response that allows 101). */
export function installRuntime() {
  globalThis.WebSocketPair = WebSocketPair;
  globalThis.WebSocketRequestResponsePair = WebSocketRequestResponsePair;
  const Base = globalThis.Response;
  if (Base.__runtime) return;
  class RuntimeResponse extends Base {
    constructor(body, init = {}) {
      if (init?.status !== 101) { super(body, init); return; }
      super(null, { ...init, status: 200 });
      Object.defineProperty(this, 'status', { value: 101 });
      this.webSocket = init.webSocket ?? null;
    }
  }
  RuntimeResponse.__runtime = true;
  globalThis.Response = RuntimeResponse;
}

/** A Durable Object's ctx: Map storage, hibernatable sockets, auto-response. */
export function fakeCtx(data = new Map()) {
  let gate = Promise.resolve(), auto = null;
  const sockets = new Set();
  const ctx = {
    room: null, data,
    storage: { get: async (k) => structuredClone(data.get(k)), put: async (k, v) => { data.set(k, structuredClone(v)); }, delete: async (k) => data.delete(k) },
    blockConcurrencyWhile(fn) { const r = gate.then(fn); gate = r.catch(() => {}); return r; },
    acceptWebSocket(ws) { ws.accept(); sockets.add(ws); ws.room = ctx; },
    getWebSockets() { return [...sockets].filter((ws) => ws.readyState === 1); },
    setWebSocketAutoResponse(pair) { auto = pair; },
    getWebSocketAutoResponseTimestamp(ws) { return ws.autoAt ?? null; },
    deliver(ws, data) {
      if (auto && data === auto.request) { ws.autoAt = new Date(Date.now()); ws.send(auto.response); return; } // never wakes the object
      ctx.blockConcurrencyWhile(() => ctx.room.webSocketMessage(ws, data));
    },
    deliverClose(ws, code, reason) { sockets.delete(ws); ctx.blockConcurrencyWhile(() => ctx.room.webSocketClose(ws, code, reason, true)); },
    idle: () => gate,
  };
  return ctx;
}

/** A namespace binding: get(idFromName(x)).fetch(request); hibernate(x) rebuilds the object (memory lost, storage and sockets kept). */
export function fakeNamespace(Class, env = {}) {
  const objects = new Map();
  const make = (name, ctx = fakeCtx()) => { const o = new Class(ctx, env); ctx.room = o; objects.set(name, { o, ctx }); return objects.get(name); };
  return {
    idFromName: (name) => name,
    get: (name) => ({ fetch: (req) => (objects.get(name) ?? make(name)).o.fetch(req) }),
    hibernate(name) { const e = objects.get(name); if (e) make(name, e.ctx); },
    ctx: (name) => (objects.get(name) ?? make(name)).ctx,
    object: (name) => (objects.get(name) ?? make(name)).o,
  };
}

// --- a minimal RFC 6455 server side for dev.mjs: text frames, close, ping; the client's frames are masked ---
const frame = (op, payload) => {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | op, len]) : len < 65536 ? Buffer.from([0x80 | op, 126, len >> 8, len & 255]) : null;
  if (!head) { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); return Buffer.concat([h, payload]); }
  return Buffer.concat([head, payload]);
};

/** Finish the HTTP upgrade of `socket` and wire it to `ws` (the client end of a WebSocketPair). */
export function bridge(req, socket, ws) {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  let buf = Buffer.alloc(0), done = false;
  const end = (code, reason = '') => {
    if (done) return; done = true;
    const p = Buffer.alloc(2 + Buffer.byteLength(reason)); p.writeUInt16BE(code); p.write(reason, 2);
    try { socket.write(frame(8, p)); socket.end(); } catch { /* gone */ }
  };
  ws.addEventListener('message', (e) => { if (!done) socket.write(frame(1, Buffer.from(e.data))); });
  ws.addEventListener('close', (e) => end(e.code, e.reason));
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15, masked = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      const mask = masked ? buf.subarray(off, off + 4) : null, data = Buffer.from(buf.subarray(need - len, need));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(need);
      if (op === 1 || op === 2) { try { ws.send(data.toString()); } catch { /* closed */ } } else if (op === 8) {
        const code = data.length >= 2 ? data.readUInt16BE(0) : 1005;
        ws.close(code, data.subarray(2).toString()); end(code === 1005 ? 1000 : code);
      } else if (op === 9) socket.write(frame(10, data));
    }
  });
  const gone = () => { if (!done) { done = true; ws.close(1006, 'gone'); } };
  socket.on('close', gone); socket.on('error', gone);
}
