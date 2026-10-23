import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOULE as B, COURTYARD } from './config.js';
import { BoulePhysics } from './boulephysics.js';
import { BouleRules, TEAM_NAMES } from './boulerules.js';
import { sfx } from './audio.js';

// #1370: a local pétanque game on the courtyard's boule court. Stand in the throwing circle at the court's north end,
// aim at the gravel and use E / the touch action button (the normal focus/use path, like the playroom's billiards): the
// jack or the next boule flies to just short of the aimed spot and rolls on (BoulePhysics); BouleRules keeps turns and
// points to 13. A lectern (pulpet) east of the court carries one canvas scoreboard with two real buttons ("Ny omgång",
// "Nytt parti"). Three visible draws (lectern + circle, instanced boules + jack, the board); no lights or textures
// beyond the board's canvas; the group is hidden and frozen beyond BOULE.near. Local only, no network.
const STEEL = 0xc4c9cf, BRONZE = 0xa8703f, JACK = 0xf0ad2c, TEAM_CSS = ['#c4c9cf', '#c98a4f'];
function paint(g, hex) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new T.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new T.BufferAttribute(a, 3)); g.deleteAttribute('uv');
  return g;
}
export class Boule {
  constructor() {
    const k = COURTYARD.boule, D = B.desk, Y = B.surface;
    this.court = k; this.physics = new BoulePhysics({ ...B, court: k }); this.rules = new BouleRules(B.balls, B.target);
    this.circle = { x: (k.x0 + k.x1) / 2, z: k.z0 + B.circle.dz };
    this.object = new T.Group(); this.object.name = 'boule';
    // the lectern (local: reader at +z) turned to face the court (west), and the throwing circle on the gravel
    const deskM = new T.Matrix4().makeRotationY(-Math.PI / 2).setPosition(D.x, 0, D.z), parts = [];
    const add = (g, hex) => parts.push(paint(g.applyMatrix4(deskM), hex));
    add(new T.BoxGeometry(0.42, 0.04, 0.36).translate(0, 0.02, 0), 0x2b2d2f);
    add(new T.BoxGeometry(0.08, D.h - 0.06, 0.08).translate(0, (D.h - 0.06) / 2, 0), 0x2b2d2f);
    add(new T.BoxGeometry(D.w, 0.04, D.d).rotateX(D.tilt).translate(0, D.h, 0), 0x6b4a2f);
    parts.push(paint(new T.RingGeometry(B.circle.r - 0.012, B.circle.r, 32).rotateX(-Math.PI / 2).translate(this.circle.x, Y + 0.002, this.circle.z), 0xf2efe6));
    this.static = new T.Mesh(mergeGeometries(parts), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    this.static.name = 'boule-desk'; this.object.add(this.static);
    // boules + jack: one instanced sphere, scaled per object
    this.mesh = new T.InstancedMesh(new T.SphereGeometry(1, 16, 12), new T.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 }), this.physics.objects.length);
    this.mesh.name = 'boule-balls'; this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.boundingSphere = new T.Sphere(new T.Vector3((k.x0 + k.x1) / 2, 1, (k.z0 + k.z1) / 2), Math.hypot(k.x1 - k.x0, k.z1 - k.z0));
    this.physics.objects.forEach((o, i) => this.mesh.setColorAt(i, new T.Color(o.id ? [STEEL, BRONZE][o.team] : JACK)));
    this.object.add(this.mesh);
    // the scoreboard on the lectern's slanted top, texture "up" away from the reader
    this.canvas = document.createElement('canvas'); [this.canvas.width, this.canvas.height] = D.canvas; this.ctx = this.canvas.getContext('2d');
    this.texture = new T.CanvasTexture(this.canvas); this.texture.colorSpace = T.SRGBColorSpace;
    const face = this.face = new T.Group(), n = new T.Vector3(0, Math.cos(D.tilt), Math.sin(D.tilt));
    face.position.set(0, D.h, 0).addScaledVector(n, 0.022).applyMatrix4(deskM); face.rotation.set(D.tilt - Math.PI / 2, -Math.PI / 2, 0, 'YXZ');
    const [BW, BH] = D.board;
    this.board = new T.Mesh(new T.PlaneGeometry(BW, BH), new T.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    this.board.name = 'boule-scoreboard'; face.add(this.board); this.object.add(face);
    const self = this;
    this.target = { kind: 'boule', name: 'boulebanan', get verb() { const t = TEAM_NAMES[self.rules.turn]; return { jack: `kasta lillen (${t}) på`, ball: `kasta ett klot (${t}) på`, collect: 'samla in kloten på' }[self.rules.next] ?? 'kasta på'; } };
    const pick = this.target.pickable = new T.Mesh(new T.BoxGeometry(k.x1 - k.x0, 0.1, k.z1 - k.z0), new T.MeshBasicMaterial({ visible: false }));
    pick.position.set((k.x0 + k.x1) / 2, 0.05, (k.z0 + k.z1) / 2); pick.userData.door = this.target; this.object.add(pick);
    this.meneTarget = { kind: 'bouleMene', name: 'poängtavlan', verb: 'starta en ny omgång på' };
    this.gameTarget = { kind: 'bouleGame', name: 'poängtavlan', verb: 'starta ett nytt parti på' };
    this.controlPickables = [[this.meneTarget, -1], [this.gameTarget, 1]].map(([t, side]) => {
      const p = new T.Mesh(new T.BoxGeometry(BW / 2 - 0.02, BH * D.buttonH, 0.04), new T.MeshBasicMaterial({ visible: false }));
      p.position.set(side * BW / 4, -BH * D.buttonY, 0.01); p.userData.door = t; t.pickable = p; face.add(p); return p;
    });
    // the lectern's foot blocks the player (the courtyard's outdoor segments)
    const h = 0.22, c = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, z]) => [D.x + x, D.z + z]);
    this.segments = c.map((p, i) => [...p, ...c[(i + 1) % 4]]);
    this.physics.onHit = (kind, x, z, speed) => { if (this.active) sfx.billiard?.(this.soundPoint.set(x, Y + B.ballR, z), kind === 'edge' ? 'rail' : 'ball', speed / 2); };
    this.soundPoint = new T.Vector3(); this.random = Math.random; this.onEvent = null;
    this.flight = null; this.settling = null; this.active = true; this.dirty = true; this.acc = 0;
    this.rotations = this.physics.objects.map(() => new T.Quaternion()); this.last = this.physics.objects.map(() => [0, 0]);
    this.matrix = new T.Matrix4(); this.pos = new T.Vector3(); this.scale = new T.Vector3(); this.axis = new T.Vector3(); this.spin = new T.Quaternion(); this.ray = new T.Vector3();
    this.update(0, null);
  }
  /** Within `margin` m of the court's rectangle. */
  near(p, margin = 2) { const k = this.court; return p.x > k.x0 - margin && p.x < k.x1 + margin && p.z > k.z0 - margin && p.z < k.z1 + margin; }
  inCircle(p) { return Math.hypot(p.x - this.circle.x, p.z - this.circle.z) <= B.circle.reach; }
  get busy() { return !!this.flight || !!this.settling || this.physics.moving; }
  /** Collect everything from the court (boules back in the hand). */
  clear() { this.physics.reset(); this.flight = null; this.settling = null; this.rotations.forEach((q) => q.identity()); this.dirty = true; }
  /** "Ny omgång" on the board. */
  newMene() { this.clear(); return this.rules.restartMene(); }
  /** "Nytt parti" on the board. */
  newGame() { this.clear(); this.rules.reset(); this.dirty = true; return this.rules.message; }
  /** E on the court: throw the jack or the next boule at `point` (the aimed spot on the gravel). Returns text to show. */
  throw(camera, point) {
    const r = this.rules, next = r.next;
    if (next === null) return 'Partiet är slut – välj Nytt parti på pulpeten';
    if (this.busy) return 'Vänta tills klotet ligger still';
    if (next === 'collect') { this.clear(); r.collect(); this.dirty = true; return r.message; }
    if (!this.inCircle(camera.position)) return 'Ställ dig i kastringen vid banans norra ände';
    let tx = point?.x, tz = point?.z;
    if (!Number.isFinite(tx) || !Number.isFinite(tz)) { // no aimed point: along the gaze to the gravel, else straight ahead
      camera.getWorldDirection(this.ray); const s = this.ray.y < -0.05 ? (B.surface - camera.position.y) / this.ray.y : 6;
      tx = camera.position.x + this.ray.x * s; tz = camera.position.z + this.ray.z * s;
    }
    if (next === 'jack') this.clear();
    const o = next === 'jack' ? this.physics.jack : this.physics.nextBall(r.turn); if (!o) return r.message;
    const b = this.physics.bounds(o.r); tx = Math.min(b.x1, Math.max(b.x0, tx)); tz = Math.min(b.z1, Math.max(b.z0, tz));
    let dx = tx - this.circle.x, dz = tz - this.circle.z; const dist = Math.hypot(dx, dz);
    if (dist < 1e-3) { dx = 0; dz = 1; } else { dx /= dist; dz /= dist; }
    const land = Math.max(B.minLand, dist - B.roll), roll = Math.max(0, dist - land), spread = B.scatter * dist;
    const g = () => Math.sqrt(-2 * Math.log(1 - this.random() * 0.999)) * Math.cos(2 * Math.PI * this.random()); // Box–Muller
    const lx = this.circle.x + dx * land + g() * spread, lz = this.circle.z + dz * land + g() * spread, v = Math.sqrt(2 * B.friction * roll);
    camera.getWorldDirection(this.ray);
    const from = camera.position.clone().addScaledVector(this.ray, 0.3); from.y -= 0.45;
    this.flight = { o, from, to: new T.Vector3(lx, B.surface + o.r, lz), t: 0, T: B.flight + B.flightPerM * dist, h: B.arc * dist, vx: dx * v, vz: dz * v, kind: next };
    this.dirty = true;
    return next === 'jack' ? `${TEAM_NAMES[r.turn]} kastar lillen` : `${TEAM_NAMES[r.turn]} kastar`;
  }
  settle() {
    const s = this.settling; this.settling = null; this.dirty = true;
    let text;
    if (s === 'jack') {
      const j = this.physics.jack, d = Math.hypot(j.x - this.circle.x, j.z - this.circle.z);
      text = this.rules.jackThrown(d >= B.jackMin && d <= B.jackMax);
      if (this.rules.next === 'jack') text += ` (${B.jackMin}–${B.jackMax} m från ringen)`;
    } else text = this.rules.ballThrown(this.physics.distances());
    this.onEvent?.(text);
  }
  /** Per frame: `playerPos` decides whether the court is drawn and simulated at all. */
  update(dt, playerPos) {
    const k = this.court, cx = (k.x0 + k.x1) / 2, cz = (k.z0 + k.z1) / 2;
    this.active = !playerPos || Math.hypot(playerPos.x - cx, playerPos.z - cz) < B.near;
    this.object.visible = this.active;
    if (!this.active) return;
    const f = this.flight;
    if (f) {
      f.t += dt;
      if (f.t >= f.T) { this.physics.land(f.o, f.to.x, f.to.z, f.vx, f.vz); this.flight = null; this.settling = f.kind; this.physics.onHit?.('edge', f.to.x, f.to.z, 1); } // (a soft landing knock)
    }
    this.acc = Math.min(this.acc + dt, 0.1); const STEP = 1 / 120;
    while (this.acc >= STEP) { this.physics.step(STEP); this.acc -= STEP; }
    if (this.settling && !this.physics.moving) this.settle();
    this.physics.objects.forEach((o, i) => {
      const last = this.last[i], flying = this.flight?.o === o;
      if (flying) {
        const u = Math.min(1, this.flight.t / this.flight.T);
        this.pos.lerpVectors(this.flight.from, this.flight.to, u); this.pos.y += 4 * this.flight.h * u * (1 - u);
      } else {
        const dx = o.x - last[0], dz = o.z - last[1], d = Math.hypot(dx, dz);
        if (o.active && d > 1e-8 && d < 1) { this.axis.set(dz, 0, -dx).normalize(); this.rotations[i].premultiply(this.spin.setFromAxisAngle(this.axis, d / o.r)); }
        this.pos.set(o.x, B.surface + o.r, o.z);
      }
      last[0] = o.x; last[1] = o.z;
      this.scale.setScalar(o.active || flying ? o.r : 0);
      this.mesh.setMatrixAt(i, this.matrix.compose(this.pos, this.rotations[i], this.scale));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.dirty) this.drawBoard();
  }
  drawBoard() {
    this.dirty = false;
    const g = this.ctx, w = this.canvas.width, h = this.canvas.height, r = this.rules, pad = w * 0.035;
    g.fillStyle = '#1d2b22'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d9c38a'; g.lineWidth = pad / 3; g.strokeRect(pad / 2, pad / 2, w - pad, h - pad);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const line = (text, x, y, size, color = '#f3efe2', width = w - 2 * pad) => { g.font = `600 ${Math.round(h * size)}px sans-serif`; g.fillStyle = color; g.fillText(text, x, y, width); };
    line(`Boule · Omgång ${r.mene} · till ${r.target}`, w / 2, h * 0.11, 0.075, '#d9c38a');
    for (let i = 0; i < 2; i++) {
      const x = w * (i + 0.5) / 2, turn = !r.over && r.turn === i && r.next !== 'collect';
      if (turn) { g.fillStyle = 'rgba(217,195,138,0.18)'; g.fillRect(x - w / 4 + pad, h * 0.18, w / 2 - 2 * pad, h * 0.44); }
      line(TEAM_NAMES[i] + (r.winner === i ? ' vinner!' : ''), x, h * 0.24, 0.07, TEAM_CSS[i], w / 2 - 2 * pad);
      line(String(r.scores[i]), x, h * 0.4, 0.2, '#ffffff');
      const left = r.phase === 'done' || r.over ? 0 : r.left[i], R = h * 0.028;
      for (let j = 0; j < r.balls; j++) {
        g.beginPath(); g.arc(x + (j - (r.balls - 1) / 2) * R * 3, h * 0.55, R, 0, Math.PI * 2);
        if (j < left) { g.fillStyle = TEAM_CSS[i]; g.fill(); } else { g.strokeStyle = TEAM_CSS[i]; g.lineWidth = 2; g.stroke(); }
      }
    }
    const what = r.over ? 'Partiet är slut' : r.next === 'collect' ? 'Tryck på banan för nästa omgång'
      : `Tur: ${TEAM_NAMES[r.turn]} – ${r.next === 'jack' ? 'kasta lillen' : 'kasta klot'}`;
    line(what, w / 2, h * 0.645, 0.065);
    line(r.message, w / 2, h * 0.725, 0.055, '#bcd3c0');
    const D = B.desk, top = h * (0.5 + D.buttonY - D.buttonH / 2), bh = h * D.buttonH;
    ['Ny omgång', 'Nytt parti'].forEach((text, i) => {
      g.fillStyle = '#3d5a45'; g.fillRect(i * w / 2 + pad, top, w / 2 - 2 * pad, bh);
      line(text, w * (i + 0.5) / 2, top + bh / 2, 0.07, '#ffffff', w / 2 - 3 * pad);
    });
    this.texture.needsUpdate = true;
  }
}
