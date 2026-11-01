// #1775: doors opened and closed are seen by the other players. Two real clients (A, B) and a late third (C) against the local Worker. Start both first:
//   python3 tools/devserve.py 8196 .      node cloudflare/dev.mjs 8197 testtoken
//   tools/browsertest.sh node tools/doorsynctest.cjs http://localhost:8196 http://localhost:8197 OUT_DIR
// Checks: A opens a flat's interior door and B sees the same leaf open within 0.5 s (and the opening is free for B to walk through, closed it was
// not); A shuts it and B sees that; a stair-core door (Hus L / A) and a förråd door in the garage sync the same way; a late C starts with them
// standing open; B's door changes reach A too; a closed local door still blocks; the door id lists are the same at every client.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8196', worker = 'http://localhost:8197', out = '/tmp/doorsync'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const setup = () => {
  const a = __app; a.renderer.setAnimationLoop(null); a.showOverlay(false); a.touch.enabled = true;
  window.T = { a, S: __doorSync,
    async pump(ms, dt = 0.05) { const end = performance.now() + ms; while (performance.now() < end) { a.step(dt); __ghosts.update(dt); await new Promise((r) => setTimeout(r, 40)); } },
    stand(x, z, yaw = 0) { a.player.spawn(x, z, yaw); a.step(0.05); },
    look(x, y, z) { const c = a.camera.position, dx = x - c.x, dz = z - c.z; a.camera.rotation.set(Math.atan2(y - c.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ'); a.camera.updateMatrixWorld(true); },
    ids() { return [...__doorSync.doors.keys()].join(','); },
    open(id) { return __doorSync.doors.get(id).isOpen(); },
    info(id) { const e = __doorSync.doors.get(id); return { open: e.isOpen(), t: e.door.t ?? e.door.door?.angle ?? null, name: e.door.name }; },
    // E on a door as the player does it: useDoor for the real doors, the cabinet-style ones through use()
    use(id) { const d = __doorSync.doors.get(id).door; if (typeof d.opening === 'function') a.useDoor(d); else a.use(d); } };
};
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const q = `${game}/?time=12&month=7&weather=clear&freeze&shot&cloud=${worker}&at=2.5,0,5,0`;
    const open = async (name) => {
      const r = await kit.open(browser, q, { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: name });
      r.page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await r.page.waitForFunction(() => window.__app?.renderer && window.__ghosts?.connected && window.__doorSync, null, { timeout: 900000 });
      await r.page.evaluate(setup); return r;
    };
    const A = await open('Alma'), B = await open('Bo');
    const pa = (f, ...x) => A.page.evaluate(f, ...x), pb = (f, ...x) => B.page.evaluate(f, ...x);
    const both = (ms) => Promise.all([pa((m) => T.pump(m), ms), pb((m) => T.pump(m), ms)]);
    const until = async (read, ms = 3000) => { const t0 = Date.now(); let v; while (!(v = await read()) && Date.now() - t0 < ms) await both(100); return { v, ms: Date.now() - t0 }; };
    const ids = await Promise.all([pa(() => T.ids()), pb(() => T.ids())]);
    check(ids[0] === ids[1] && ids[0].split(',').length > 20, 'both build the same door id list', { n: ids[0].split(',').length, groups: [...new Set(ids[0].split(',').map((s) => s[0]))].join('') });
    // the flat's interior door: a level-0 swing door in a plain wall
    const door = await pa(() => {
      // the interior door with the most room on both sides (a picture of B looking at the door with A beyond it needs room to stand)
      const room = (o, sgn) => { let k = 0.5; while (k < 4.5 && T.a.player.isFree(o.center[0] + o.normal[0] * sgn * k, o.center[1] + o.normal[1] * sgn * k)) k += 0.5; return k - 0.5; };
      const score = ([id, e]) => { if (id[0] !== 'w' || e.door.kind !== 'swing' || e.door.name !== 'dörren' || e.door.object.position.y > 1) return -1; const o = e.door.opening(); return Math.min(room(o, 1), room(o, -1)); };
      const d = [...__doorSync.doors].map((e) => [score(e), e]).sort((p, q) => q[0] - p[0])[0][1];
      const o = d[1].door.opening(); return { id: d[0], c: o.center, n: o.normal, room: score(d) };
    });
    const free = (id) => pb((id) => { const e = __doorSync.doors.get(id), o = e.door.opening(); return { free: T.a.player.isFree(o.center[0], o.center[1]), open: e.isOpen() }; }, id);
    const [cx, cz] = door.c, [nx, nz] = door.n;
    await pa(([x, z, yaw]) => T.stand(x, z, yaw), [cx + nx * 1.3, cz + nz * 1.3, Math.atan2(nx, nz)]);
    await pb(([x, z]) => { T.stand(x, z, 0); T.look(x + 0, 1.2, z); }, [cx - nx * Math.min(3, door.room), cz - nz * Math.min(3, door.room)]);
    await pb(([x, y, z]) => T.look(x, y, z), [cx, 1.2, cz]);
    await both(1500);
    const before = await free(door.id);
    check(before.open === false && before.free === false, `B: ${door.id} starts shut and blocks`, before);
    await pa((id) => T.use(id), door.id);
    const t0 = Date.now(), seen = await until(() => pb((id) => T.open(id), door.id), 3000);
    check(seen.v && seen.ms < 700, 'A opens it, B sees it open within ~0.5 s', seen);
    await both(1200); // the swing finishes
    const after = await free(door.id);
    check(after.open && after.free, 'B can walk through the opening (leaf out of the way)', after);
    await pb(([x, y, z]) => T.look(x, y, z), [cx, 1.4, cz]); await both(300);
    await pb(([x, y, z]) => T.look(x, y, z), [cx, 1.4, cz]);
    await kit.shot(B.page, `${out}/b-ser-dorren-oppen.png`);
    await pa((id) => T.use(id), door.id);
    const shut = await until(async () => !(await pb((id) => T.open(id), door.id)), 3000);
    await both(1200);
    const blocked = await free(door.id);
    check(shut.v && blocked.free === false, 'A shuts it, B sees it shut again and it blocks', { shut, blocked });
    // B -> A direction, and the stair core (Hus L, Hus A) and a förråd door in the garage
    const other = await pa(() => ['L0', 'A0', 'B0', 'C0', 'g0'].filter((i) => __doorSync.doors.has(i)));
    check(other.length === 5, 'door groups L, A, B, C and g exist', other);
    for (const id of other) {
      await pb((id) => T.use(id), id);
      const r = await until(() => pa((id) => T.open(id), id), 3000);
      check(r.v, `B opens ${id} (${(await pb((id) => T.info(id).name, id))}), A sees it open`, r);
    }
    // late C: starts with the doors that stand open (L0 A0 B0 C0 g0), the flat's door is shut
    const C = await open('Cleo'), pc = (f, ...x) => C.page.evaluate(f, ...x);
    await C.page.evaluate(() => T.pump(2500));
    const late = await pc(() => ['L0', 'A0', 'B0', 'C0', 'g0'].map((i) => T.open(i)));
    check(late.every(Boolean), 'late C sees the doors that stand open', late);
    const lateFlat = await pc((id) => T.open(id), door.id);
    check(lateFlat === false, 'late C sees the shut flat door shut', lateFlat);
    // a locally shut door still blocks, and a local use still works without the room echo breaking it
    await pa((id) => T.use(id), 'L0'); const back = await until(async () => !(await pb((id) => T.open(id), 'L0')) && !(await pc((id) => T.open(id), 'L0')), 3000);
    check(back.v, 'A shuts L0: B and C see it shut', back);
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
