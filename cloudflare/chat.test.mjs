// The chat's word filter (#719): coarse words become *** in the room for everybody, whole words only, any case.
//   node --test cloudflare/chat.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installRuntime, fakeNamespace } from './devws.mjs';
import worker, { PlayerRoom } from './worker.js';
import { censor, cleanTalk, ROUGH } from './players.js';
import { censor as clientCensor, ROUGH as CLIENT_ROUGH } from '../src/chatfilter.js';

installRuntime();
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (env) => { for (let i = 0; i < 4; i++) { await tick(); await env.PLAYERS.ctx('world').idle(); } await tick(); };

test('censor: whole words in any case become ***, other words with the same letters stay', () => {
  assert.equal(censor('Fuck dig, KUK! Hora?'), '*** dig, ***! ***?');
  assert.equal(censor('kukeliku, horisont, Bitchy, fittings, skuk'), 'kukeliku, horisont, Bitchy, fittings, skuk');
  assert.equal(censor('åh fitta.'), 'åh ***.');
  assert.equal(censor('hej'), 'hej');
  assert.equal(cleanTalk(JSON.stringify({ t: 'm', m: '  CUNT\u0000 ' })).m, '***', 'cleaned, then filtered');
  for (const w of ROUGH) assert.equal(censor(`a ${w} b`), 'a *** b', w);
});

test('the client filters the same list (src/chatfilter.js kept equal by hand)', () => {
  assert.deepEqual(CLIENT_ROUGH, ROUGH);
  for (const s of ['Fuck dig, KUK! Hora?', 'kukeliku horisont', 'nigga please']) assert.equal(clientCensor(s), censor(s));
});

test('the room passes the filtered line on', async () => {
  const env = { ADMIN_TOKEN: 'tok' };
  env.PLAYERS = fakeNamespace(PlayerRoom, env);
  const open = async (n) => {
    const r = await worker.fetch(new Request(`https://w/players?n=${n}`, { headers: { Upgrade: 'websocket', Origin: 'https://solwation.github.io' } }), env);
    const c = { ws: r.webSocket, got: [] };
    c.ws.addEventListener('message', (e) => c.got.push(e.data === 'q' ? 'q' : JSON.parse(e.data)));
    await settle(env);
    return c;
  };
  const a = await open('A'), b = await open('B');
  a.ws.send(JSON.stringify({ t: 'm', m: 'din FUCKING bitch' })); await settle(env);
  assert.equal(b.got.filter((m) => m.t === 'm').at(-1).m, 'din *** ***');
  a.ws.close(1000); b.ws.close(1000); await settle(env);
});
