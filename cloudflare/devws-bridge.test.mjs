// The dev bridge (devws.mjs) must drop a player whose TCP connection ends abruptly, also by half-close (FIN only) (#1484).
//   node --test cloudflare/devws-bridge.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { installRuntime, WebSocketPair, bridge } from './devws.mjs';

installRuntime();

async function run(how) {
  let closed;
  const gotClose = new Promise((r) => { closed = r; });
  const server = http.createServer().on('upgrade', (req, socket) => {
    const p = new WebSocketPair(), client = p[0], room = p[1];
    room.accept(); room.addEventListener('close', (e) => closed(e.code)); room.addEventListener('message', () => {});
    bridge(req, socket, client);
  });
  await new Promise((r) => server.listen(0, r));
  const c = net.connect(server.address().port);
  await new Promise((r) => c.once('connect', r));
  c.write('GET /players HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
  await new Promise((r) => c.once('data', r));
  if (how === 'half') c.end(); else c.destroy();
  c.on('error', () => {}); c.resume();
  const code = await Promise.race([gotClose, new Promise((r) => setTimeout(() => r('timeout'), 2000))]);
  c.destroy(); server.close(); server.closeAllConnections?.();
  return code;
}

test('half-closed (FIN only) client socket drops the player', async () => { assert.equal(await run('half'), 1006); });
test('destroyed client socket drops the player', async () => { assert.equal(await run('destroy'), 1006); });
