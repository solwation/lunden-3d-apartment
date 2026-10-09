// The Spider-Man suit (#597, SPIDER in config): our own drawing (a red top with black web lines and a small black spider,
// blue below; no licensed artwork), folded in the second drawer of Walter & Kian's MALM (Sovrum 2, furniture.js names the
// drawer 'spidersuit-drawer'). Open the drawer, E on it puts it on (the jetpack's flow, jetpack.js): the hands turn red
// and blue (hand.js `suitHands`). E with nothing else to do (touch: the action button "Ta av dig dräkten") lays it down
// folded in front of you, indoors or out, and it stays there (keep.js keeps the spot across a page-made reload); E on it
// again. F sends it home to its drawer. With it on, outdoors only, player.js climbs façades (`player.suit` = this,
// `climb`); the webs are here: a click with nothing in focus and empty hands (touch: the 🕸 button) shoots a strand to
// what the crosshair hits within SPIDER.web.range m and leaves a web splat there for `life` s; at most `max` at once.
// Draw calls: the folded suit (1–2), the strand while it flies (1), each splat (1).
import * as THREE from 'three';
import { SPIDER as S } from './config.js';
import { sfx } from './audio.js';
import { crosses } from './player.js';
import { suitHands } from './hand.js';

const FOLD = { w: 0.32, h: 0.07, d: 0.24 }; // the folded suit (*guess*: a child's suit folded in four)

/** The folded suit's top: red, black web lines from the centre, the spider in the middle, the mask's eyes at one end. */
function topTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192;
  const g = c.getContext('2d'), red = `#${new THREE.Color(S.colors.red).getHexString()}`, line = '#140a0a';
  g.fillStyle = red; g.fillRect(0, 0, 256, 192);
  g.strokeStyle = line; g.lineWidth = 2;
  const cx = 128, cy = 96;
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 200, cy + Math.sin(a) * 200); g.stroke(); }
  for (let r = 22; r < 200; r += 22) {
    g.beginPath();
    for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i) g.quadraticCurveTo(cx + Math.cos(a - Math.PI / 16) * r * 0.9, cy + Math.sin(a - Math.PI / 16) * r * 0.9, x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  g.fillStyle = line; // the spider: a body, a head, eight legs
  g.beginPath(); g.ellipse(cx, cy + 6, 9, 15, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx, cy - 13, 6, 0, Math.PI * 2); g.fill();
  g.lineWidth = 3;
  for (const s of [-1, 1]) for (const [a, b] of [[-0.9, -1.5], [-0.3, -0.6], [0.3, 0.5], [0.9, 1.4]]) {
    g.beginPath(); g.moveTo(cx + s * 6, cy + a * 8); g.lineTo(cx + s * 24, cy + a * 14); g.lineTo(cx + s * 34, cy + b * 22); g.stroke();
  }
  for (const s of [-1, 1]) { // the mask's eyes, at the far end
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(cx + s * 34, 26, 22, 13, s * 0.35, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4f4f4'; g.beginPath(); g.ellipse(cx + s * 34, 26, 17, 9, s * 0.35, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** A web splat: radial strands and rings, white on transparent. */
function webTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.strokeStyle = 'rgba(245,248,250,0.95)'; g.lineWidth = 3;
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + (i % 2) * 0.1; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); g.stroke(); }
  g.lineWidth = 2.2;
  for (let r = 12; r < 62; r += 12) { g.beginPath(); for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 2; const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const Z = new THREE.Vector3(0, 0, 1);

export class SpiderSuit {
  /** `drawer` = the MALM drawer's box (Object3D named 'spidersuit-drawer'); `button` = the touch 🕸 button. */
  constructor({ scene, camera, player, drawer, button }) {
    Object.assign(this, { scene, camera, player, drawerBox: drawer, button, state: 'drawer' });
    this.drawer = drawer?.userData.door ?? null; // its Openable (open / shut)
    this.onWear = null; // (put on, main.js: a badge)
    // the folded suit: a red top with the drawing, blue under it (one box, two materials)
    const red = new THREE.MeshStandardMaterial({ color: S.colors.red, roughness: 0.75 });
    const top = new THREE.MeshStandardMaterial({ map: topTexture(), roughness: 0.75 });
    const blue = new THREE.MeshStandardMaterial({ color: S.colors.blue, roughness: 0.8 });
    const geo = new THREE.BoxGeometry(FOLD.w, FOLD.h, FOLD.d).translate(0, FOLD.h / 2, 0);
    this.model = new THREE.Group();
    this.model.userData.moving = true; // (it moves while you may stand still, detail.js #267)
    const body = new THREE.Mesh(geo, [red, red, top, blue, red, blue]);
    body.raycast = () => {};
    body.castShadow = true;
    this.model.add(body);
    for (const y of [0.022, 0.046]) { // the folds: blue edges showing along the front
      const fold = new THREE.Mesh(new THREE.BoxGeometry(FOLD.w + 0.004, 0.006, FOLD.d + 0.004).translate(0, y, 0), blue);
      fold.raycast = () => {};
      this.model.add(fold);
    }
    const pick = new THREE.Mesh(new THREE.BoxGeometry(FOLD.w + 0.04, 0.12, FOLD.d + 0.04), new THREE.MeshBasicMaterial());
    pick.position.y = 0.06; pick.visible = false;
    // only a target where it can be reached: never through the shut drawer's carcass
    pick.raycast = (rc, hits) => { if (this.reachable) THREE.Mesh.prototype.raycast.call(pick, rc, hits); };
    this.model.add(pick);
    this.target = { name: 'Spindelmannendräkten', kind: 'spidersuit', verb: 'ta på dig', pickable: pick, toggle: () => this.putOn() };
    pick.userData.door = this.target;
    this.dropTarget = { name: 'dräkten', kind: 'spidersuit', verb: 'ta av dig', toggle: () => this.takeOff() };

    // the webs: one strand (a line, while it flies) and up to `max` splats
    this.strand = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)),
      new THREE.LineBasicMaterial({ color: 0xf2f5f7, transparent: true, opacity: 0.9 }));
    this.strand.frustumCulled = false; this.strand.visible = false; this.strand.raycast = () => {};
    scene.add(this.strand);
    this.webTex = webTexture();
    this.webs = [];
    this.shot = null; // { from, to, t, len, hit }
    this.ray = new THREE.Raycaster();
    if (button) button.addEventListener('pointerdown', (e) => { e.preventDefault(); this.shoot(); });
    this.goHome();
  }

  get worn() { return this.state === 'worn'; }
  /** The pick box answers only in the open drawer or lying out. */
  get reachable() { return this.state === 'ground' || (this.state === 'drawer' && (this.drawer?.t ?? 1) > 0.6); }

  /** What E can aim at: the suit while it is not on. */
  targets() { return this.worn ? [] : [this.target.pickable]; }

  goHome() {
    this.state = 'drawer';
    if (this.drawerBox) {
      this.drawerBox.add(this.model);
      const depth = this.drawerBox.userData.depth ?? 0.42;
      this.model.position.set(0, 0.03, -0.018 - depth / 2);
      this.model.rotation.set(0, 0, 0);
      this.model.visible = true;
    } else this.model.visible = false;
    this.wearOff();
  }

  putOn() {
    this.state = 'worn';
    this.model.visible = false;
    this.player.suit = this;
    suitHands(true, S.colors.red, S.colors.blue);
    if (this.button) this.button.hidden = false; // (.touch-only: shown on touch only)
    this.onWear?.();
  }

  /** Can it be laid down now (standing on something, not on a wall or in the air)? */
  get canTakeOff() {
    const p = this.player;
    return this.worn && !p.climb && !p.flying && !p.fall && p.pos.y <= p.groundAt(p.pos.x, p.pos.z, p.pos.y) + 0.02;
  }

  /** Lay it down folded: a step in front of the feet when that is clear and level, else at the feet. */
  takeOff(at = null) {
    const p = this.player, yaw = at?.yaw ?? this.camera.rotation.y;
    let x = at?.x ?? p.pos.x, z = at?.z ?? p.pos.z, y = at?.y ?? p.pos.y;
    if (!at) {
      const fx = x - Math.sin(yaw) * S.drop, fz = z - Math.cos(yaw) * S.drop, gy = p.groundAt(fx, fz, y + 0.1);
      const [stat, dyn] = p.segments();
      if (Math.abs(gy - y) < 0.12 && ![...stat, ...dyn].some((s) => crosses(x, z, fx, fz, s))) { x = fx; z = fz; y = gy; }
    }
    this.state = 'ground';
    this.scene.add(this.model);
    this.model.position.set(x, y, z);
    this.model.rotation.set(0, yaw, 0);
    this.model.visible = true;
    this.model.updateMatrixWorld(true);
    this.wearOff();
  }

  wearOff() {
    if (this.player.suit === this) { this.player.letGo(); this.player.suit = null; }
    suitHands(false);
    if (this.button) this.button.hidden = true;
  }

  /** Shoot a web along the look direction: the strand flies out, a splat sticks where it hits (#597). */
  shoot() {
    if (!this.worn) return null;
    const cam = this.camera;
    cam.updateMatrixWorld();
    this.ray.setFromCamera({ x: 0, y: 0 }, cam);
    this.ray.far = S.web.range;
    this.ray.layers.mask = cam.layers.mask;
    const hit = this.ray.intersectObjects(this.scene.children, true).find((h) => this.solid(h.object));
    const from = new THREE.Vector3(0.18, -0.22, -0.3).applyMatrix4(cam.matrixWorld); // the right wrist
    const to = hit ? hit.point.clone() : this.ray.ray.at(S.web.range, new THREE.Vector3());
    let normal = null;
    if (hit?.face) normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (normal && normal.dot(this.ray.ray.direction) > 0) normal.negate();
    this.shot = { from, to, t: 0, len: from.distanceTo(to), hit: !!hit, normal: normal ?? this.ray.ray.direction.clone().negate() };
    this.strand.visible = true;
    this.strand.material.opacity = 0.9;
    sfx.thwip?.();
    this.onShot?.();
    return hit ? to : null;
  }

  /** Something a web sticks to: a drawn, solid mesh (not lines, points, sprites, see-through effects, our own webs). */
  solid(o) {
    if (!o.isMesh) return false;
    if (o.userData.web || o === this.strand) return false;
    for (let q = o; q; q = q.parent) if (!q.visible) return false;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    return !(m?.transparent && m.opacity < 0.5) && !(m?.blending === THREE.AdditiveBlending);
  }

  /** A splat at `p` facing `n`; the oldest goes when there are `max`. */
  stick(p, n) {
    let w = this.webs.length >= S.web.max ? this.webs.shift() : null;
    if (!w) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(S.web.size, S.web.size),
        new THREE.MeshBasicMaterial({ map: this.webTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      mesh.userData.web = true; mesh.raycast = () => {};
      this.scene.add(mesh);
      w = { mesh, t: 0 };
    }
    w.t = 0;
    w.mesh.visible = true;
    w.mesh.material.opacity = 1;
    w.mesh.position.copy(p).addScaledVector(n, 0.01);
    w.mesh.quaternion.setFromUnitVectors(Z, n);
    w.mesh.rotateZ(Math.random() * Math.PI);
    const s = 0.8 + Math.random() * 0.4; w.mesh.scale.set(s, s, 1);
    w.mesh.updateMatrixWorld(true);
    this.webs.push(w);
  }

  update(dt) {
    // the strand: out from the wrist at web.speed, then a splat where it hit, the strand fading
    const sh = this.shot;
    if (sh) {
      sh.t += dt;
      const k = Math.min(1, sh.t * S.web.speed / Math.max(sh.len, 0.01));
      const pos = this.strand.geometry.attributes.position;
      const from = this.worn ? new THREE.Vector3(0.18, -0.22, -0.3).applyMatrix4(this.camera.matrixWorld) : sh.from;
      const end = from.clone().lerp(sh.to, k);
      pos.setXYZ(0, from.x, from.y, from.z); pos.setXYZ(1, end.x, end.y, end.z); pos.needsUpdate = true;
      if (k >= 1 && !sh.stuck) { sh.stuck = true; sh.at = sh.t; if (sh.hit) this.stick(sh.to, sh.normal); }
      if (sh.stuck) {
        const f = 1 - (sh.t - sh.at) / 0.5;
        this.strand.material.opacity = 0.9 * Math.max(0, f);
        if (f <= 0) { this.shot = null; this.strand.visible = false; }
      }
    }
    // the splats fade at the end of their life
    for (let i = this.webs.length - 1; i >= 0; i--) {
      const w = this.webs[i];
      w.t += dt;
      const left = S.web.life - w.t;
      w.mesh.material.opacity = Math.min(1, left / 1.5);
      if (left <= 0) { w.mesh.visible = false; this.webs.splice(i, 1); this.scene.remove(w.mesh); w.mesh.geometry.dispose(); w.mesh.material.dispose(); }
    }
  }

  /** keep.js (#277): where it is (null = in its drawer). */
  saveState() {
    const r = (v) => Math.round(v * 1000) / 1000, m = this.model.position;
    if (this.state === 'ground') return { s: 'ground', p: [r(m.x), r(m.y), r(m.z)], yaw: r(this.model.rotation.y) };
    return this.state === 'worn' ? { s: 'worn' } : null;
  }

  loadState(s) {
    if (s?.s === 'ground' && Array.isArray(s.p) && s.p.length === 3 && s.p.every(Number.isFinite)) {
      this.takeOff({ x: s.p[0], y: s.p[1], z: s.p[2], yaw: Number(s.yaw) || 0 });
    } else if (s?.s === 'worn') this.putOn();
  }
}
