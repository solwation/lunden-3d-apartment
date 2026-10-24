import * as THREE from 'three';
import { BASKET as B, LEVELS, OUTDOOR, GARAGE, SITE } from './config.js';
import { sfx } from './audio.js';
import { Holdable, setHeld } from './holdable.js';
import { badge } from './stats.js';
import { groundY } from './surroundings.js';

// Tilly's basketball (BASKET): it rests in a wall holder over her daybed (Sovrum 4). Taken, a click shoots it
// (touch: the action button), right click / the 🏀 button bounces it on the floor in front of you (dribbling). Out
// of the hand it is a ball: gravity, bounces off every surface of the world (the raycast meshes marks.js has, glass
// and doors included), rolls out and lies still; it comes back into the hand by itself when it passes close to it
// (a dribble, a throw at a wall that comes back), or with E on it. While it is out of its holder a portable hoop
// stands on the asphalt in front of Hus L (it rises out of the ground like the Nerf target, #144): a ball going
// down through the rim scores ("Korg!", a three-pointer from beyond B.three m).

const up = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), seg = new THREE.Vector3();

/** The ball's model: orange with the black seams (a canvas texture), radius B.ball.r, origin in the centre. */
function ballModel() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8661f'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,40,10' : '255,170,110'},0.18)`; g.fillRect(Math.random() * 256, Math.random() * 128, 1.5, 1.5); } // the pebbled grip
  g.strokeStyle = '#1b1410'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.stroke();                                   // the equator
  for (const x of [64, 192]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }     // a meridian round
  for (const s of [-1, 1]) { g.beginPath(); for (let x = 0; x <= 256; x += 4) { const y = 64 + s * (40 * Math.cos((x / 256) * Math.PI * 2) + 6); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } // the curved seams
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(B.ball.r, 28, 18), new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 }));
  m.castShadow = true;
  const g2 = new THREE.Group(); g2.add(m);
  g2.userData.moving = true; // it bounces and rolls while the visitor stands still (detail culler, #267)
  return g2;
}

/** The holder on the wall: a back plate and three prongs that cup the ball from below. Built facing +x with the wall at
 * x = wallX (the ball centre c); basketHolderFrame() turns it into the picture-like frame Möblera om places (local +z out). */
function holderParts(c, wallX) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.5, metalness: 0.3 });
  const r = B.ball.r, parts = [];
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.09), mat);
  plate.position.set(wallX + 0.006, c.y - r * 0.55, c.z);
  parts.push(plate);
  for (let i = 0; i < 3; i++) { // prongs from the plate out under the ball, curving up round it
    const a = (i - 1) * 0.75;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.006, 6, 18, Math.PI * 0.55), mat);
    arc.position.copy(c);
    arc.rotation.set(0, a * 0.9, 0);
    arc.rotateX(Math.PI / 2); arc.rotateZ(Math.PI * 0.72 + a * 0.15);
    parts.push(arc);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 0.007, 6, 24), mat); // the ring the ball sits in
  ring.rotation.x = Math.PI / 2;
  ring.position.set(c.x, c.y - r * 0.78, c.z);
  parts.push(ring);
  for (const p of parts) p.castShadow = true;
  return parts;
}

/** The holder as a wall piece (#1568): origin on the wall point (the rearrange offset of 8 mm already in), local +z out of
 * the wall like a picture, so the picture placement of rearrange.js applies. The ball rests at (0, 0, r + 0.004). */
function basketHolderFrame() {
  const r = B.ball.r, wallX = -0.008, c = new THREE.Vector3(wallX + 0.012 + r, 0, 0);
  const frame = new THREE.Group();
  frame.rotation.y = -Math.PI / 2; // the +x built parts face local +z
  for (const p of holderParts(c, wallX)) frame.add(p);
  return frame;
}

/** Build FIBA-proportioned court markings in local hoop coordinates (extending in +z into the court). */
function buildCourtLines(C, H) {
  const points = [];
  const y = 0.02; // 2 cm elevation over ground to avoid z-fighting
  const w = C.lineWidth ?? 0.05;

  function addQuad(x1, z1, x2, z2, x3, z3, x4, z4) {
    points.push(
      x1, y, z1,  x2, y, z2,  x3, y, z3,
      x1, y, z1,  x3, y, z3,  x4, y, z4
    );
  }

  function addSegment(ax, az, bx, bz, width = w) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    const nx = (-dz / len) * (width / 2);
    const nz = (dx / len) * (width / 2);
    addQuad(
      ax - nx, az - nz,
      ax + nx, az + nz,
      bx + nx, bz + nz,
      bx - nx, bz - nz
    );
  }

  function addArc(cx, cz, r, a1, a2, steps = 48, width = w) {
    const rIn = r - width, rOut = r;
    for (let i = 0; i < steps; i++) {
      const t1 = a1 + (a2 - a1) * (i / steps);
      const t2 = a1 + (a2 - a1) * ((i + 1) / steps);
      const s1 = Math.sin(t1), c1 = Math.cos(t1);
      const s2 = Math.sin(t2), c2 = Math.cos(t2);
      addQuad(
        cx + rIn * s1, cz + rIn * c1,
        cx + rOut * s1, cz + rOut * c1,
        cx + rOut * s2, cz + rOut * c2,
        cx + rIn * s2, cz + rIn * c2
      );
    }
  }

  const baseZ = C.baselineLocalZ ?? -0.30;
  const rimZ = H.rimZ ?? 0.38;
  const ftZ = baseZ + (C.freeThrowDist ?? 5.80);
  const halfW = C.halfWidth ?? 6.75;
  const depth = baseZ + (C.depth ?? 9.0);

  // 1. Baseline
  addSegment(-halfW, baseZ, halfW, baseZ);
  // 2. Sidelines
  addSegment(-halfW, baseZ, -halfW, depth);
  addSegment(halfW, baseZ, halfW, depth);
  // 3. Key lanes (FIBA width 4.90 m)
  const kw2 = (C.keyWidth ?? 4.90) / 2;
  addSegment(-kw2, baseZ, -kw2, ftZ);
  addSegment(kw2, baseZ, kw2, ftZ);
  // 4. Free throw line (3.60 m long)
  const ftw2 = (C.freeThrowLen ?? 3.60) / 2;
  addSegment(-ftw2, ftZ, ftw2, ftZ);
  // 5. Free throw circle (radius 1.80 m, outer solid into court, inner dashed toward hoop)
  addArc(0, ftZ, C.freeThrowRadius ?? 1.80, Math.PI / 2, -Math.PI / 2, 32);
  const dashes = 8;
  for (let i = 0; i < dashes; i += 2) {
    const a1 = Math.PI / 2 + (Math.PI * i) / dashes;
    const a2 = Math.PI / 2 + (Math.PI * (i + 1)) / dashes;
    addArc(0, ftZ, C.freeThrowRadius ?? 1.80, a1, a2, 6);
  }
  // 6. Three point line (radius 6.75 m with straight corner parts at distance 6.60 m)
  const cornerX = C.threeCornerX ?? 6.60;
  const threeR = C.threeRadius ?? B.three ?? 6.75;
  const cornerZ = rimZ + Math.sqrt(Math.max(0, threeR ** 2 - cornerX ** 2));
  addSegment(-cornerX, baseZ, -cornerX, cornerZ);
  addSegment(cornerX, baseZ, cornerX, cornerZ);
  const alpha = Math.asin(cornerX / threeR);
  addArc(0, rimZ, threeR, -alpha, alpha, 48);
  // 7. No-charge semi-circle under basket (radius 1.25 m)
  addArc(0, rimZ, C.noChargeRadius ?? 1.25, -Math.PI / 2, Math.PI / 2, 24);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f0,
    roughness: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

/** The portable hoop on the asphalt: a weighted base, a pole leaning forward, a backboard facing west into the car park (#1018, #1037),
 * the orange rim, a white net and regulation court lines. Always visible on the car park. Collision with the ball is analytic (`collide`). */
export class Hoop {
  constructor() {
    const H = B.hoop, g = new THREE.Group();
    this.ground = groundY(H.x, H.z);
    g.position.set(H.x, this.ground, H.z);
    const rotDeg = H.rot ?? (H.yaw ? THREE.MathUtils.radToDeg(H.yaw) : 0);
    g.rotation.y = THREE.MathUtils.degToRad(rotDeg);
    const black = new THREE.MeshStandardMaterial({ color: 0x1e1f22, roughness: 0.6 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.4, metalness: 0.6 });
    const board = new THREE.MeshStandardMaterial({ color: 0xf4f6f7, roughness: 0.3 });
    const red = new THREE.MeshStandardMaterial({ color: 0xd2232a, roughness: 0.5 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xe8611a, roughness: 0.4, metalness: 0.3 });
    const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    const [bw, bh] = H.board, rimY = H.rim, by0 = rimY - H.below;
    // the base: a black tank with two wheels at the back
    const [tw, th, td] = H.base;
    this.baseMesh = add(new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), black), 0, th / 2, H.baseZ);
    for (const s of [-1, 1]) { const w = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), black), s * (tw / 2 + 0.02), 0.06, H.baseZ - td / 2 + 0.08); w.rotation.z = Math.PI / 2; }
    // the pole from the base up to just behind the board, leaning forward a little
    const foot = new THREE.Vector3(0, th, H.baseZ - 0.05), top = new THREE.Vector3(0, by0 + bh * 0.4, -H.arm);
    const len = foot.distanceTo(top), pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, len, 14), steel), 0, 0, 0);
    pole.position.copy(foot).lerp(top, 0.5);
    pole.quaternion.setFromUnitVectors(up, tmp.subVectors(top, foot).normalize());
    this.pole = { a: foot.clone(), b: top.clone(), r: 0.05 };
    for (const dy of [-0.12, 0.12]) add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, H.arm), steel), 0, top.y + dy, -H.arm / 2); // the arms to the board
    // the backboard: white with a black frame and the red shooter's square over the rim
    this.boardMesh = add(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.03), board), 0, by0 + bh / 2, -0.015);
    for (const [w, h, x, y] of [[bw, 0.03, 0, by0 + 0.015], [bw, 0.03, 0, by0 + bh - 0.015], [0.03, bh, -bw / 2 + 0.015, by0 + bh / 2], [0.03, bh, bw / 2 - 0.015, by0 + bh / 2]]) add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.034), black), x, y, -0.015);
    const sq = [0.45, 0.32];
    for (const [w, h, x, y] of [[sq[0], 0.02, 0, rimY + 0.01], [sq[0], 0.02, 0, rimY + sq[1]], [0.02, sq[1], -sq[0] / 2, rimY + sq[1] / 2], [0.02, sq[1], sq[0] / 2, rimY + sq[1] / 2]]) add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.004), red), x, y + 0.01, 0.002);
    // the rim on a small bracket, and the net hanging from it
    const rim = add(new THREE.Mesh(new THREE.TorusGeometry(H.rimR, H.rimTube, 8, 36), orange), 0, rimY, H.rimZ);
    rim.rotation.x = Math.PI / 2;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, H.rimZ - H.rimR), orange), 0, rimY - 0.01, (H.rimZ - H.rimR) / 2);
    this.net = add(new THREE.Mesh(new THREE.CylinderGeometry(H.rimR, H.rimR * 0.62, H.net, 12, 4, true),
      new THREE.MeshBasicMaterial({ color: 0xf2f2f2, wireframe: true })), 0, rimY - H.net / 2, H.rimZ);
    this.net.castShadow = false;

    // court lines on the ground (#1018)
    this.courtMesh = buildCourtLines(B.court ?? {}, H);
    if (this.courtMesh) g.add(this.courtMesh);

    // Free throw interaction trigger
    const baseZ = B.court?.baselineLocalZ ?? -0.30;
    const ftLocalZ = baseZ + (B.court?.freeThrowDist ?? 5.80);
    const ftTrigger = new THREE.Mesh(
      new THREE.BoxGeometry(B.court?.freeThrowLen ?? 3.6, 0.5, 0.8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    ftTrigger.material.visible = false; // #1383: pick-only volume; material visibility preserves its actual raycast target.
    ftTrigger.position.set(0, 0.25, ftLocalZ);
    g.add(ftTrigger);
    this.freeThrowTarget = {
      kind: 'freethrow',
      name: 'straffkastlinjen',
      verb: 'skjuta straffkast från',
      pickable: ftTrigger,
      toggle: () => this.ball?.shootFreeThrow()
    };
    ftTrigger.userData.door = this.freeThrowTarget;

    this.object = g;
    this.height = new THREE.Box3().setFromObject(g).max.y - this.ground;
    this.depth = this.height + 0.05;
    this.k = 1; this.swish = 0; // always visible on the car park (#1018)
    g.position.y = this.ground;
    g.visible = true;

    // local-space pieces for analytic collision
    this.localRimC = new THREE.Vector3(0, rimY, H.rimZ);
    this.localBoardBox = new THREE.Box3(new THREE.Vector3(-bw / 2, by0, -0.03), new THREE.Vector3(bw / 2, by0 + bh, 0));
    this.localBaseBox = new THREE.Box3(new THREE.Vector3(-tw / 2, 0, H.baseZ - td / 2), new THREE.Vector3(tw / 2, th, H.baseZ + td / 2));
    this.rimC = new THREE.Vector3();
    this.updateWorldPieces();
  }

  updateWorldPieces() {
    this.object.updateMatrixWorld(true);
    this.rimC.copy(this.object.localToWorld(this.localRimC.clone()));
    this.boardBox = new THREE.Box3().setFromObject(this.boardMesh);
    this.baseBox = new THREE.Box3().setFromObject(this.baseMesh);
  }

  get up() { return this.k > 0.98; }

  /** Rise (`show`) or sink over B.hoop.rise s; hidden when all the way down. */
  update(dt, show) {
    this.k = Math.max(0, Math.min(1, this.k + (show ? dt : -dt) / B.hoop.rise));
    const e = this.k * this.k * (3 - 2 * this.k);
    this.object.visible = this.k > 0.001;
    this.object.position.y = this.ground - (1 - e) * this.depth;
    if (this.object.visible) this.updateWorldPieces();
    if (this.swish > 0) { // the net jumps after a basket
      this.swish = Math.max(0, this.swish - dt);
      const s = Math.sin(this.swish * 30) * this.swish * 0.25;
      this.net.scale.set(1 - s, 1 + s * 0.6, 1 - s);
    }
  }

  /** Collision segments for the visitor (the base) while it stands there. */
  segments() {
    if (this.k < 0.5) return [];
    this.object.updateMatrixWorld(true);
    const H = B.hoop, [tw, , td] = H.base, bz = H.baseZ;
    const corners = [
      new THREE.Vector3(-tw / 2, 0, bz - td / 2),
      new THREE.Vector3(tw / 2, 0, bz - td / 2),
      new THREE.Vector3(tw / 2, 0, bz + td / 2),
      new THREE.Vector3(-tw / 2, 0, bz + td / 2)
    ].map(p => p.applyMatrix4(this.object.matrixWorld));
    return [
      [corners[0].x, corners[0].z, corners[1].x, corners[1].z],
      [corners[1].x, corners[1].z, corners[2].x, corners[2].z],
      [corners[2].x, corners[2].z, corners[3].x, corners[3].z],
      [corners[3].x, corners[3].z, corners[0].x, corners[0].z]
    ];
  }

  /** Push the ball (centre c, radius r, velocity v) out of the hoop's parts; returns the strongest normal speed hit. */
  collide(c, v, r) {
    if (!this.up) return 0;
    this.object.updateMatrixWorld(true);
    const invMat = this._invMat ??= new THREE.Matrix4();
    invMat.copy(this.object.matrixWorld).invert();
    const lc = c.clone().applyMatrix4(invMat);
    const lv = v.clone().transformDirection(invMat);
    let hit = 0;
    const push = (q, rr, e) => { // q = the nearest point of a part, rr = its thickness
      const d = tmp.subVectors(lc, q), l = d.length();
      if (l >= r + rr || l < 1e-6) return;
      d.multiplyScalar(1 / l);
      lc.copy(q).addScaledVector(d, r + rr);
      const vn = lv.dot(d);
      if (vn < 0) { lv.addScaledVector(d, -(1 + e) * vn); hit = Math.max(hit, -vn); }
    };
    // the rim: the nearest point on its circle in local coordinates
    const R = B.hoop.rimR, rc = this.localRimC;
    tmp2.set(lc.x - rc.x, 0, lc.z - rc.z);
    if (tmp2.lengthSq() < 1e-8) tmp2.set(1, 0, 0);
    tmp2.setLength(R).add(rc);
    push(tmp2.clone(), B.hoop.rimTube, 0.55);
    push(this.localBoardBox.clampPoint(lc, new THREE.Vector3()), 0, 0.7);
    push(this.localBaseBox.clampPoint(lc, new THREE.Vector3()), 0, 0.5);
    const { a, b } = this.pole; // the pole in local space
    seg.subVectors(b, a);
    const t = Math.max(0, Math.min(1, tmp.subVectors(lc, a).dot(seg) / seg.lengthSq()));
    push(a.clone().addScaledVector(seg, t), this.pole.r, 0.6);
    if (hit > 0) {
      c.copy(lc).applyMatrix4(this.object.matrixWorld);
      v.copy(lv).transformDirection(this.object.matrixWorld);
    }
    return hit;
  }
}

export class Basketball extends Holdable {
  constructor(scene, camera, { marks, hoop, world }) {
    const b = B.ball, y0 = LEVELS[b.level].floor + b.y;
    // #1568: the ball's home is local to its holder, a wall piece of Möblera om (the holder's pose is the saved layout)
    const local = { pos: new THREE.Vector3(0, 0, b.r + 0.004), rot: new THREE.Euler(0, -Math.PI / 2, 0) }; // (world-upright at the default wall)
    super(scene, camera, {
      name: 'basketbollen', backName: 'hållaren', backVerb: 'lägga tillbaka basketbollen i', model: ballModel(), parts: [basketHolderFrame()],
      home: { pos: new THREE.Vector3(), rot: new THREE.Euler() }, local,
      heldPose: { pos: new THREE.Vector3(b.held.x, b.held.y, b.held.z), rot: new THREE.Euler(0, 0, 0) },
      pick: { pos: local.pos.clone(), size: [0.3, 0.3, 0.3] },
      cooldown: 0.4, useLabel: 'Skjut', grip: [b.r * 0.25, -b.r - 0.002, 0.015], handPose: 'palm', // carried on the open palm (#238, #914)
    });
    Object.assign(this, { marks, hoop, world, clickIsUse: true, hitsTarget: false, flying: false, v: new THREE.Vector3(), air: 0, dribbling: false, armed: true, returning: false, outOfBoundsTimer: 0 });
    this.homeParent = this.holder;
    this.holder.position.set(b.x + 0.008, y0, b.z); this.holder.rotation.y = Math.PI / 2; // default: west wall, +z out = +x
    this.holder.updateMatrixWorld(true);
    hoop.ball = this;
    this.isFreeThrow = false;
    this.altIcon = '🏀'; this.altLabel = 'Studsa bollen';
    this.lastCam = new THREE.Vector3(); this.camV = new THREE.Vector3();
    this.rest = { q: new THREE.Quaternion(), lift: b.r }; // put down: it lies on its round side
  }

  /** Out of its holder (in the hand, flying, lying somewhere): the hoop stands outside. */
  get out() { return this.held || this.placed; }

  onTake() { sfx.bounce(this.where(), 0.3); this.camera.getWorldPosition(this.lastCam); this.camV.set(0, 0, 0); }

  take() {
    this.flying = false;
    this.returning = false;
    this.outOfBoundsTimer = 0;
    super.take();
  }

  goHome() {
    this.flying = false;
    this.returning = false;
    this.outOfBoundsTimer = 0;
    this.placed = false;
    this.holder.add(this.model); // into the holder, wherever Möblera om has put it (#1568)
    this.model.position.copy(this.local.pos);
    this.model.rotation.copy(this.local.rot);
  }

  /** Target position on the court at the free throw line / court centre (#1036). */
  courtReturnSpot() {
    const H = B.hoop, C = B.court ?? {};
    if (C.returnSpot) {
      const rx = C.returnSpot.x, rz = C.returnSpot.z;
      const ry = groundY(rx, rz) + (B.ball?.r ?? 0.115);
      return new THREE.Vector3(rx, ry, rz);
    }
    const baseZ = C.baselineLocalZ ?? -0.30;
    const ftZ = baseZ + (C.freeThrowDist ?? 5.80);
    const local = new THREE.Vector3(0, 0, ftZ);
    this.hoop.object.updateMatrixWorld(true);
    const worldPos = this.hoop.object.localToWorld(local);
    worldPos.y = groundY(worldPos.x, worldPos.z) + (B.ball?.r ?? 0.115);
    return worldPos;
  }

  /** Check whether a point `c` is within the accessible / walkable world space (#1036). */
  isWalkable(c, isResting = false) {
    const bounds = B.return?.outBounds ?? OUTDOOR;
    if (c.x < bounds.x0 || c.x > bounds.x1 || c.z < bounds.z0 || c.z > bounds.z1) return false;
    if (c.y < -15) return false;

    const W = this.world?.size?.x ?? 5.75, D = this.world?.size?.z ?? 12.75;
    const insideFlat = c.x >= 0 && c.x <= W && c.z >= 0 && c.z <= D;

    if (insideFlat) {
      if ((c.y >= -0.2 && c.y <= 1.8) || (c.y >= 3.0 && c.y <= 4.5)) return true;
      if (c.y >= 0 && c.y <= 3.5) return true;
    }

    if (this.world?.core?.contains?.(c.x, c.z, c.y)) return true;
    if (this.world?.garage?.inside?.(c.x, c.z) && c.y < (GARAGE?.floor ?? -3) + 1.5) return true;
    if (this.world?.unitAt?.(c.x, c.z, c.y)) return true;
    if (this.world?.roofs?.under?.(c.x, c.z, c.y, 0.4)) return true;

    const gy = groundY(c.x, c.z);
    if (c.y < gy - 0.4) return false;

    for (const b of SITE.blocks ?? []) {
      if (c.x >= b.x0 && c.x <= b.x1 && c.z >= b.z0 && c.z <= b.z1 && c.y < 15) return false;
    }
    if (c.z >= 0 && c.z <= D && (c.x < 0 || c.x > W)) {
      if (!this.world?.unitAt?.(c.x, c.z, c.y)) return false;
    }

    if (c.z >= 12.75 && c.z <= 18.0 && (c.x < 0.04 || c.x > 5.71)) return false;
    if (c.y < -1.5 && c.z >= 0 && c.z <= 55 && c.x >= -70 && c.x <= 10) return false;
    if (isResting && c.y > gy + 2.2 && !this.world?.roofs?.under?.(c.x, c.z, c.y, 0.4)) return false;

    return true;
  }

  /** An identified free throw from the free throw line (#1018). Scores 1 point. */
  shootFreeThrow() {
    if (!this.held) this.take();
    this.isFreeThrow = true;
    this.onUse();
  }

  /** Check if a shot origin (world px, pz) is outside the FIBA 3-point line (#1018). Line belongs to 2p. */
  isThreePoint(px, pz) {
    const H = B.hoop, C = B.court ?? {};
    this.hoop.object.updateMatrixWorld(true);
    const invMat = this._invMat ??= new THREE.Matrix4();
    invMat.copy(this.hoop.object.matrixWorld).invert();
    const local = tmp.set(px, 0, pz).applyMatrix4(invMat);
    const cornerX = C.threeCornerX ?? 6.60;
    const threeR = C.threeRadius ?? B.three ?? 6.75;
    const rimZ = H.rimZ ?? 0.38;
    const cornerZ = rimZ + Math.sqrt(Math.max(0, threeR ** 2 - cornerX ** 2));
    if (local.z <= cornerZ) {
      return Math.abs(local.x) > cornerX;
    }
    return Math.hypot(local.x, local.z - rimZ) > threeR;
  }

  /** The hand's spot in the world (where a dribble / a throw starts and where it is caught). */
  hand(out = new THREE.Vector3()) { return this.camera.localToWorld(out.set(B.ball.held.x * 0.5, B.ball.held.y, B.ball.held.z)); }

  /** Let go of it at `from` with velocity `v`. */
  release(v, dribble) {
    const from = this.hand();
    this.held = false;
    this.returning = false;
    this.outOfBoundsTimer = 0;
    setHeld(null); // the hand is empty (putBack does nothing: it is no longer held)
    this.scene.add(this.model);
    this.model.position.copy(from);
    this.v.copy(v);
    Object.assign(this, { flying: true, placed: true, air: 0, dribbling: dribble, armed: true, shotFrom: from.clone() });
  }

  /** Click: shoot it on an arc through the point you look at (the rim, if you look near it), coming down onto it at
   * B.ball.entry rad (B.ball.flat at anything else: a throw at a wall is flatter). */
  onUse() {
    const cam = this.camera, eye = cam.getWorldPosition(new THREE.Vector3()), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    const isFt = this.isFreeThrow;
    const { point: aim, rim } = this.aimPoint(eye, dir), from = this.hand();
    this.lastAim = aim; // (tests)
    this.shotOrigin = { x: eye.x, z: eye.z, isFreeThrow: isFt };
    this.isFreeThrow = false;
    const d = Math.max(0.3, Math.hypot(aim.x - from.x, aim.z - from.z)), h = aim.y - from.y, g = B.ball.gravity;
    // a parabola through the aim point that comes down there at angle φ starts at tan θ = 2h/d + tan φ
    const th = Math.min(1.4, Math.atan(2 * h / d + Math.tan(rim ? B.ball.entry : B.ball.flat)));
    let speed = Math.sqrt((g * d * d) / (2 * Math.cos(th) ** 2 * Math.max(0.01, d * Math.tan(th) - h)));
    if (!isFt) speed = Math.min(B.ball.maxSpeed, speed) * (1 + (Math.random() - 0.5) * 2 * B.ball.jitter);
    const flat = new THREE.Vector3(aim.x - from.x, 0, aim.z - from.z);
    if (flat.lengthSq() < 1e-6) flat.set(dir.x, 0, dir.z);
    flat.normalize();
    const v = flat.multiplyScalar(Math.cos(th) * speed); v.y = Math.sin(th) * speed;
    this.release(v, false);
    sfx.nerf(from);
  }

  /** Right click / the 🏀 button: bounce it on the floor in front of you; it comes back up into the hand. */
  useAlt() {
    if (!this.held || this.cool > 0) return;
    this.cool = 0.3;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    this.release(this.camV.clone().setY(0).addScaledVector(fwd, 0.25).setY(-B.ball.dribble), true);
  }

  aimPoint(eye, dir) {
    const H = this.hoop;
    if (this.isFreeThrow && H.up) {
      return { point: H.rimC.clone(), rim: true };
    }
    if (H.up) { // looking near the rim: aim at the point of the look ray nearest the rim's centre
      const t = tmp.subVectors(H.rimC, eye).dot(dir), p = eye.clone().addScaledVector(dir, Math.max(0, t));
      if (t > 0 && p.distanceTo(H.rimC) < B.hoop.assist) return { point: p, rim: true };
    }
    const h = this.cast(eye, tmp2.copy(eye).addScaledVector(dir, 25));
    return { point: h ? h.point.clone().addScaledVector(dir, -B.ball.r) : eye.clone().addScaledVector(dir, 6), rim: false };
  }

  /** The first solid surface on the segment a → b (glass and doors count; not plants, lights, the cat). */
  cast(a, b) {
    for (const h of this.marks.segment(a, b, this.marks.meshes())) {
      let o = h.object, shown = true;
      for (let p = o; p; p = p.parent) if (!p.visible) { shown = false; break; }
      if (!shown || o.isInstancedMesh) continue;
      const m = Array.isArray(o.material) ? o.material[h.materialIndex ?? 0] : o.material;
      if (!m || m.blending === THREE.AdditiveBlending || m.blending === THREE.CustomBlending || m.wireframe) continue;
      const n = h.normal.clone();
      if (n.dot(tmp.subVectors(b, a)) > 0) n.negate();
      return { point: h.point, normal: n };
    }
    return null;
  }

  tick(dt) { // held: track the hand's speed (a dribble or a throw while walking carries it along)
    const p = this.camera.getWorldPosition(tmp);
    if (dt > 0) this.camV.subVectors(p, this.lastCam).multiplyScalar(1 / dt).clampLength(0, 12);
    this.lastCam.copy(p);
  }

  /** Out of the hand: fly, bounce, roll, come to rest; caught when it passes the hand. */
  idle(dt) {
    this.camera.getWorldPosition(this.lastCam);
    if (dt <= 0) return;
    const b = B.ball, r = b.r, c = this.model.position, v = this.v;

    // Ball return (#1036): ball smoothly rolling back to the basketball court
    if (this.returning) {
      const target = this.courtReturnSpot();
      const dx = target.x - c.x, dz = target.z - c.z;
      const dist = Math.hypot(dx, dz);
      const speed = B.return?.speed ?? 4.5;
      if (dist < 0.08) {
        c.copy(target);
        v.set(0, 0, 0);
        this.flying = false;
        this.placed = true;
        this.returning = false;
        this.outOfBoundsTimer = 0;
        sfx.bounce(c, 0.2);
        return;
      }
      const step = Math.min(dist, speed * dt);
      c.x += (dx / dist) * step;
      c.z += (dz / dist) * step;
      c.y = groundY(c.x, c.z) + r;
      const rollAxis = tmp.set(dz / dist, 0, -dx / dist);
      this.model.rotateOnWorldAxis(rollAxis, step / r);
      // Hand pickup or catch on the way
      const hand = this.hand(tmp2);
      if (c.distanceTo(hand) < b.catch && !this.handBusy()) {
        this.take();
      }
      return;
    }

    if (!this.flying && !this.placed) return;

    // Detect if out of walkable space / allowed area (#1036)
    if (this.out && !this.held) {
      const walkable = this.isWalkable(c, !this.flying || v.length() < 0.1);
      if (!walkable) {
        if (c.y < -15) {
          const spot = this.courtReturnSpot();
          c.set(spot.x, spot.y + 1.2, spot.z);
          v.set(0, -1, 0);
          this.flying = true;
          this.placed = true;
          this.outOfBoundsTimer = 0;
          return;
        }
        const bounds = B.return?.outBounds ?? OUTDOOR;
        const farOut = c.x < bounds.x0 - 0.5 || c.x > bounds.x1 + 0.5 || c.z < bounds.z0 - 0.5 || c.z > bounds.z1 + 0.5;
        const delay = farOut ? 0.2 : (B.return?.delay ?? 0.8);
        this.outOfBoundsTimer += dt;
        if (this.outOfBoundsTimer >= delay) {
          this.returning = true;
          this.flying = true;
          this.placed = true;
          v.set(0, 0, 0);
          return;
        }
      } else {
        this.outOfBoundsTimer = 0;
      }
    }

    if (!this.flying) return;

    this.air += dt;
    const n = Math.max(1, Math.ceil((v.length() * dt) / 0.04));
    const h = dt / n;
    let contact = false;
    for (let i = 0; i < n; i++) {
      v.y -= b.gravity * h;
      const prevY = c.y;
      const move = tmp.copy(v).multiplyScalar(h), len = move.length();
      if (len > 1e-6) {
        const dir = move.clone().normalize();
        const hit = this.cast(c, seg.copy(c).addScaledVector(dir, len + r));
        if (hit) { c.copy(hit.point).addScaledVector(hit.normal, r * 1.001); this.bounce(hit.normal, b.bounce); }
        else c.add(move);
      }
      const g = this.cast(c, seg.copy(c).addScaledVector(up, -(r + 0.004))); // resting on something
      if (g && g.normal.y > 0.5) {
        contact = true;
        if (c.y < g.point.y + r) c.y = g.point.y + r;
        if (v.y < 0) this.bounce(g.normal, b.bounce);
      }
      const hv = this.hoop.collide(c, v, r);
      if (hv > 1) sfx.bounce(c, Math.min(1, hv / 6) * 0.8);
      this.score(prevY, c);
      if (c.y < -20) {
        const spot = this.courtReturnSpot();
        c.copy(spot);
        v.set(0, 0, 0);
        this.flying = false;
        this.placed = true;
        this.returning = false;
        return;
      }
    }
    if (contact) { // rolling: friction slows it, it spins
      const k = Math.exp(-b.roll * dt);
      v.x *= k; v.z *= k;
    }
    const sp = Math.hypot(v.x, v.z);
    if (sp > 1e-3) this.model.rotateOnWorldAxis(tmp.set(v.z, 0, -v.x).normalize(), (sp * dt) / r);
    // into the hand again: a dribble on its way up, or a throw that comes back past you
    const hand = this.hand(tmp2), near = c.distanceTo(hand) < b.catch;
    if (near && this.air > 0.15 && (!this.dribbling || v.y > -0.5) && !this.handBusy()) { if (this.dribbling) this.onDribble?.(); this.take(); return; }
    if (this.dribbling && this.air > 2.5) this.dribbling = false;
    if (contact && v.length() < 0.06) { this.flying = false; v.set(0, 0, 0); } // lies still where it is (placed)
  }

  handBusy() { return this.takeTarget.blocked; }

  bounce(n, e) {
    const v = this.v, vn = v.dot(n);
    if (vn >= 0) return;
    if (-vn < 0.5) { v.addScaledVector(n, -vn); return; } // a soft touch: no bounce, it rolls
    v.addScaledVector(n, -(1 + e) * vn);
    const k = 1 - B.ball.slip; // the touch takes a little of the speed along the surface
    tmp.copy(n).multiplyScalar(v.dot(n));
    v.sub(tmp).multiplyScalar(k).add(tmp);
    sfx.bounce(this.model.position, Math.min(1, -vn / 6));
  }

  /** A ball going down through the rim scores once (#1018: 1p free throw, 2p inside/on line, 3p outside line). */
  score(prevY, c) {
    const H = this.hoop;
    if (!H.up) return;
    const y = H.rimC.y;
    if (c.y > y + 0.4) this.armed = true;
    if (!this.armed || !(prevY >= y && c.y < y) || this.v.y >= 0) return;
    if (Math.hypot(c.x - H.rimC.x, c.z - H.rimC.z) > B.hoop.rimR - 0.02) return;
    this.armed = false;
    const isFt = !!this.shotOrigin?.isFreeThrow;
    const isThree = !isFt && this.isThreePoint(this.shotOrigin?.x ?? c.x, this.shotOrigin?.z ?? c.z);
    const points = isFt ? 1 : (isThree ? 3 : 2);
    const kind = isFt ? 'freeThrow' : (isThree ? 'three' : 'two');
    const text = isFt ? '🏀 Straffkast · 1 poäng' : (isThree ? '🏀 Trepoängare · 3 poäng' : '🏀 Tvåpoängare · 2 poäng');
    this.shotOrigin = null;
    H.swish = 0.8;
    sfx.swish(c);
    badge(text, false);
    this.onBasket?.(points, kind);
  }
}
