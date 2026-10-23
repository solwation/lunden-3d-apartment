async () => {
  // #1558 route: after warm.done, touch start; lap = four 5 s 360° turns (kitchen + fridge, hall + front door, living, patio).
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  while (!window.__app?.warm) await wait(100);
  const app = window.__app, { renderer, scene, player, camera, hitch } = app, gl = renderer.getContext();
  const tStart = performance.now();
  while (!app.warm.done) await wait(200);
  const warmMs = performance.now() - tStart;
  hitch.quiet = true;
  const DIAG = !!window.__diag || location.search.includes('diag1558');
  // per-frame GL capture (diagnosis only): what was uploaded, by data identity
  let cur = [];
  if (DIAG) {
    const wrap = (name, f) => { const o = gl[name]; gl[name] = function (...a) { f(a); return o.apply(gl, a); }; };
    wrap('bufferData', (a) => cur.push({ k: 'buf', bytes: a[1]?.byteLength ?? a[1], data: a[1] }));
    wrap('texImage2D', (a) => cur.push({ k: 'tex', src: a[a.length - 1], w: a.length >= 8 ? a[3] : a[a.length - 1]?.width, h: a.length >= 8 ? a[4] : a[a.length - 1]?.height }));
    wrap('texStorage2D', (a) => cur.push({ k: 'texStorage', w: a[3], h: a[4], levels: a[1], fmt: a[2] }));
    wrap('texSubImage2D', (a) => cur.push({ k: 'texSub', src: a[a.length - 1], w: a.length >= 9 ? a[4] : a[a.length - 1]?.width, h: a.length >= 9 ? a[5] : a[a.length - 1]?.height }));
    wrap('createFramebuffer', () => cur.push({ k: 'fbo' }));
    wrap('renderbufferStorageMultisample', (a) => cur.push({ k: 'rbms', w: a[3], h: a[4] }));
  }
  const recs = []; let label = '', lapNo = 0;
  const end = hitch.end.bind(hitch);
  hitch.end = function (...a) { const r = end(...a); if (lapNo && r) recs.push({ lap: lapNo, label, t: performance.now(), ms: r.ms, phases: r.phases, delta: r.delta, mirror: r.mirror, shadow: r.shadow, gl: DIAG && cur.length ? cur : null }); cur = []; return r; };
  document.getElementById('start-touch').click();
  for (let i = 0; i < 90; i++) await raf();
  const spin = async (name, x, z, yaw, ms, events = []) => {
    label = name; player.spawn(x, z, yaw * Math.PI / 180); camera.rotation.x = 0;
    const t0 = performance.now(); let ev = 0;
    for (;;) {
      await raf();
      const f = (performance.now() - t0) / ms;
      while (ev < events.length && f >= events[ev][0]) { try { events[ev][1](); } catch (e) { recs.push({ err: String(e) }); } ev++; }
      if (f >= 1) break;
      camera.rotation.y = (yaw + 360 * f) * Math.PI / 180;
    }
  };
  const fridge = app.world.lids.find((l) => l.kind === 'fridge' && !l.freezer);
  const door = app.world.doors.find((d) => d.name === 'ytterdörren' && Math.abs(d.object.getWorldPosition(new d.object.position.constructor()).z) < 0.5);
  const laps = [];
  for (let l = 1; l <= 2; l++) {
    lapNo = l; hitch.intervals.start();
    await spin('kitchen', 3.5, 3, 0, 5000, [[0.2, () => fridge.toggle()], [0.6, () => fridge.toggle()]]);
    await spin('hall', 2.9, 0.8, 0, 5000, [[0.2, () => app.useDoor(door)], [0.6, () => app.useDoor(door)]]);
    await spin('living', 2.8, 9, 180, 5000);
    await spin('patio', 2.9, 16, 180, 5000);
    const ex = hitch.intervals.stop(); lapNo = 0;
    laps.push({ summary: ex.summary, active: ex.byState.active, intervals: ex.records.map((r) => +r.intervalMs.toFixed(1)), tags: ex.records.map((r) => r.tags.join('+')), metadata: ex.metadata });
    for (let i = 0; i < 60; i++) await raf();
  }
  // resolve uploads to objects (diagnosis)
  let resolved = null;
  if (DIAG) {
    const arr = new Map(), img = new Map();
    const path = (o) => { let n = o.name || o.type, p = o.parent; for (let i = 0; i < 6 && p; i++, p = p.parent) n = (p.name || p.type) + '/' + n; return n; };
    scene.traverse((o) => {
      const g = o.geometry;
      if (g?.attributes) { for (const [k, a] of Object.entries(g.attributes)) arr.set(a.array ?? a.data?.array, `${path(o)} .${k} vis=${o.visible} layers=${o.layers.mask}`); if (g.index) arr.set(g.index.array, `${path(o)} .index vis=${o.visible}`); }
      if (o.isInstancedMesh) { arr.set(o.instanceMatrix.array, `${path(o)} .instanceMatrix`); if (o.instanceColor) arr.set(o.instanceColor.array, `${path(o)} .instanceColor`); }
      for (const m of [o.material].flat()) if (m) for (const [k, v] of Object.entries(m)) if (v?.isTexture && v.image) img.set(v.image, `${path(o)} mat=${m.name || m.type}.${k} tex=${v.name}`);
    });
    resolved = recs.filter((r) => r.gl).map((r) => ({ lap: r.lap, label: r.label, ms: r.ms, phases: r.phases, delta: r.delta, mirror: r.mirror,
      gl: r.gl.map((c) => ({ k: c.k, bytes: c.bytes, w: c.w, h: c.h, who: c.data ? (arr.get(c.data) ?? `? ${c.data?.constructor?.name}[${c.data?.length}]`) : c.src ? (img.get(c.src) ?? `? ${c.src?.constructor?.name} ${c.src?.width}x${c.src?.height}`) : '' })) }));
  }
  const glr = gl.getExtension('WEBGL_debug_renderer_info');
  return { warmMs, programs: renderer.info.programs.length, renderer: glr ? gl.getParameter(glr.UNMASKED_RENDERER_WEBGL) : '', size: [innerWidth, innerHeight, devicePixelRatio, renderer.domElement.width, renderer.domElement.height], quality: app.quality.level,
    laps, frames: recs.map(({ gl, ...r }) => r), resolved };
}
