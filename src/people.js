import * as THREE from 'three';
import { PEOPLE as P, LEVELS, SEASON } from './config.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { bikeGeometry } from './streetlife.js';
import { sfx } from './audio.js';

// People in the area (#114): low-poly figures (a body, two arms and hands, two legs and shoes, a head, hair — one
// InstancedMesh per part, a colour per person) walking to and fro on the paths, cycling on Sankt Lars väg, passing
// a ball, sitting on benches and in the sandbox, lying on a blanket, standing on the loftgång; a dog trots after
// one walker. Daytime only. Every figure is posed each frame from a few numbers (no skinning).

const rnd = (() => { let s = 23; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const pick = (a) => a[Math.floor(rnd() * a.length)];
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

// Rounded parts (#239): lathe-turned torso, arms and legs with soft normals (shoulders, waist, knees, wrists), hands
// and shoes as parts of their own (skin / shoe colour) that share the arm's and the leg's matrix.
const lathe = (pts, seg = 12) => new THREE.LatheGeometry((pts[0][1] > pts.at(-1)[1] ? [...pts].reverse() : pts).map(([r, y]) => new THREE.Vector2(r, y)), seg); // bottom to top: normals out
const geo = {
  torso: lathe([[0, 0], [0.13, 0.0], [0.155, 0.04], [0.16, 0.12], [0.142, 0.26], [0.155, 0.4], [0.17, 0.5], [0.16, 0.57],
    [0.11, 0.62], [0.05, 0.64], [0.045, 0.7], [0, 0.71]]).scale(1.15, 1, 0.7),                   // hip at 0, the neck on top
  arm: lathe([[0, 0.035], [0.035, 0.03], [0.05, -0.02], [0.047, -0.15], [0.041, -0.29], [0.04, -0.33], [0.033, -0.5],
    [0.028, -0.53], [0, -0.535]], 10),                                                            // from the shoulder
  hand: new THREE.SphereGeometry(0.04, 10, 8).scale(0.75, 1.3, 1.05).translate(0, -0.575, 0.004),
  leg: lathe([[0, 0.04], [0.06, 0.03], [0.079, -0.04], [0.07, -0.3], [0.053, -0.46], [0.052, -0.55], [0.04, -0.8],
    [0.034, -0.85], [0, -0.86]], 10),                                                             // from the hip
  shoe: new RoundedBoxGeometry(0.095, 0.075, 0.25, 2, 0.032).translate(0, -0.85, 0.045),
  head: new THREE.SphereGeometry(0.11, 16, 12).scale(0.92, 1.08, 1),
  hair: new THREE.SphereGeometry(0.118, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.012, -0.008),
};
const PARTS = ['torso', 'armL', 'armR', 'handL', 'handR', 'legL', 'legR', 'shoeL', 'shoeR', 'head', 'hair'];
const geoOf = (p) => geo[p.replace(/[LR]$/, '')];

export class People {
  constructor() {
    this.group = new THREE.Group();
    const figs = [];
    const fig = (role, extra = {}) => { const f = { role, s: extra.kid ? 0.66 : 0.92 + rnd() * 0.14, phase: rnd() * 6, ...extra }; figs.push(f); return f; };
    for (const w of P.walkers) fig('walk', { ...w, t: rnd(), dir: 1, pause: 0, kid: w.kid });
    for (const c of P.cyclists) fig('cycle', { ...c, t: rnd() });
    P.ball.forEach(([x, z], i) => fig('ball', { x, z, kid: true, i }));
    for (const [x, z] of P.sandbox) fig('sandbox', { x, z, kid: true, yaw: rnd() * 6 });
    for (const b of P.benches) fig('sit', { ...b });
    fig('lie', { ...P.blanket });
    const top = LEVELS[1].floor + LEVELS[1].ceiling + 0.35; // the loftgång deck
    for (const [x, z] of P.loftgang) fig('stand', { x, z, y: top, yaw: Math.PI });
    this.figs = figs;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    this.parts = {};
    for (const p of PARTS) {
      const g = geoOf(p);
      const m = new THREE.InstancedMesh(g, mat, figs.length);
      m.castShadow = true; m.frustumCulled = false;
      this.parts[p] = m;
      this.group.add(m);
    }
    figs.forEach((f, i) => {
      const shirt = pick(P.shirts), pants = pick(P.pants), skin = pick(P.skin), hair = pick(P.hair), shoes = pick(P.shoes);
      for (const [p, c] of [['torso', shirt], ['armL', shirt], ['armR', shirt], ['handL', skin], ['handR', skin], ['legL', pants], ['legR', pants],
        ['shoeL', shoes], ['shoeR', shoes], ['head', skin], ['hair', hair]]) this.parts[p].setColorAt(i, new THREE.Color(c));
    });
    // bikes under the cyclists, the ball, the dog, the blanket
    const [frame, tyres] = bikeGeometry();
    const cyc = figs.filter((f) => f.role === 'cycle');
    this.bikes = [new THREE.InstancedMesh(frame, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.3 }), cyc.length),
      new THREE.InstancedMesh(tyres, new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 }), cyc.length)];
    cyc.forEach((f, i) => this.bikes[0].setColorAt(i, new THREE.Color(pick([0x1d3c6e, 0xb02a2a, 0x2a2a2a, 0x3c7a4a]))));
    for (const b of this.bikes) { b.castShadow = true; b.frustumCulled = false; this.group.add(b); }
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
    this.ball.castShadow = true;
    const dogMat = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9 });
    this.dog = new THREE.Group();
    const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 10);
    const dogBody = new THREE.Mesh(cap(0.085, 0.34).rotateX(Math.PI / 2).scale(1, 1.05, 1), dogMat); dogBody.position.y = 0.32;
    const dogHead = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10).scale(0.95, 1, 1.1), dogMat); dogHead.position.set(0, 0.45, 0.28);
    const snout = new THREE.Mesh(cap(0.036, 0.05).rotateX(Math.PI / 2), dogMat); snout.position.set(0, -0.025, 0.08); dogHead.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.4 })); nose.position.set(0, -0.015, 0.14); dogHead.add(nose);
    for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6).scale(0.35, 1.2, 0.8), dogMat); ear.position.set(sx * 0.06, -0.01, -0.01); ear.rotation.z = sx * 0.35; dogHead.add(ear); }
    this.dogLegs = [[-0.055, 0.17], [0.055, 0.17], [-0.055, -0.17], [0.055, -0.17]].map(([x, z]) => { const l = new THREE.Mesh(cap(0.024, 0.22).translate(0, -0.13, 0), dogMat); l.position.set(x, 0.27, z); return l; });
    const tail = new THREE.Mesh(cap(0.016, 0.17), dogMat); tail.position.set(0, 0.4, -0.27); tail.rotation.x = -0.9;
    this.dog.add(dogBody, dogHead, tail, ...this.dogLegs);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.01, 1.9), new THREE.MeshStandardMaterial({ color: 0xc2453a, roughness: 1 }));
    blanket.position.set(P.blanket.x, 0.01, P.blanket.z);
    this.blanket = blanket;
    this.group.add(this.ball, this.dog, blanket);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.q2 = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1);
    this.clock = 0;
    this.update(0, 1, 6, null);
  }

  get object() { return this.group; }

  /** Pose figure i: root at (x, y, z) turned `yaw` (facing +z at 0), legs/arms swung, body tilted `lean` about x. */
  pose(i, f, x, y, z, yaw, { legL = 0, legR = 0, armL = 0, armR = 0, lean = 0, hip = 0.9 } = {}) {
    const s = f.s, root = new THREE.Matrix4().compose(this.v.set(x, y, z), this.q.setFromAxisAngle(Y, yaw).multiply(this.q2.setFromAxisAngle(X, lean)), this.one.set(s, s, s));
    const put = (part, ox, oy, oz, rx) => {
      this.m4.compose(this.v.set(ox, oy, oz), this.q2.setFromAxisAngle(X, rx), this.one.set(1, 1, 1));
      this.parts[part].setMatrixAt(i, this.m4.premultiply(root));
    };
    put('torso', 0, hip, 0, 0);
    for (const [side, sx, a] of [['L', 1, armL], ['R', -1, armR]]) { put('arm' + side, sx * 0.21, hip + 0.56, 0, a); put('hand' + side, sx * 0.21, hip + 0.56, 0, a); }
    for (const [side, sx, l] of [['L', 1, legL], ['R', -1, legR]]) { put('leg' + side, sx * 0.085, hip, 0, l); put('shoe' + side, sx * 0.085, hip, 0, l); }
    put('head', 0, hip + 0.74, 0.01, 0);
    put('hair', 0, hip + 0.74, 0.01, 0);
  }

  /** Along a to-and-fro path: position at t ∈ [0, 1] and the heading (yaw) for direction dir. */
  along(f) {
    const x = f.a[0] + (f.b[0] - f.a[0]) * f.t, z = f.a[1] + (f.b[1] - f.a[1]) * f.t;
    const dx = (f.b[0] - f.a[0]) * f.dir, dz = (f.b[1] - f.a[1]) * f.dir;
    return [x, z, Math.atan2(dx, dz)];
  }

  update(dt, daylight, month, player) {
    const show = daylight > P.day;
    this.group.visible = show;
    if (!show) return;
    this.clock += dt;
    const cyc = this.figs.filter((g) => g.role === 'cycle');
    this.blanket.visible = !SEASON.snowMonths.includes(month);
    this.figs.forEach((f, i) => {
      const len = Math.hypot(f.b?.[0] - f.a?.[0], f.b?.[1] - f.a?.[1]);
      if (f.role === 'walk') {
        f.dir ??= 1;
        if (f.pause > 0) f.pause -= dt;
        else {
          f.t += (f.dir * f.speed * dt) / len; f.phase += dt * f.speed * 5.2 / f.s;
          if (f.t > 1 || f.t < 0) { f.t = Math.min(1, Math.max(0, f.t)); f.dir *= -1; f.pause = 1 + rnd() * 3; } // turn round at the end
        }
        const [x, z, yaw] = this.along(f), w = f.pause > 0 ? 0 : Math.sin(f.phase);
        this.pose(i, f, x, 0, z, yaw, { legL: w * 0.45, legR: -w * 0.45, armL: -w * 0.35, armR: w * 0.35 });
        if (f.dog) { // trotting a little ahead and to the side
          const ax = Math.sin(yaw), az = Math.cos(yaw);
          this.dog.position.set(x + ax * 1.1 + az * 0.5, 0, z + az * 1.1 - ax * 0.5);
          this.dog.rotation.y = yaw;
          this.dogLegs.forEach((l, k) => { l.rotation.x = (k % 3 ? 1 : -1) * Math.sin(f.phase * 1.6) * (f.pause > 0 ? 0 : 0.6); });
        }
      } else if (f.role === 'cycle') {
        f.dir ??= 1;
        f.t += (f.speed * dt) / len; if (f.t > 1) f.t -= 1; // loops: it rides off at one end and comes again at the other
        f.phase += dt * f.speed * 2.2;
        const [x, z, yaw] = this.along(f), c = Math.sin(f.phase), k = cyc.indexOf(f);
        // the bike faces +x in its own frame: turn it so +x points along the way
        this.m4.compose(this.v.set(x, 0, z), this.q.setFromAxisAngle(Y, yaw - Math.PI / 2), this.one.set(1, 1, 1));
        this.bikes[0].setMatrixAt(k, this.m4); this.bikes[1].setMatrixAt(k, this.m4);
        this.pose(i, f, x - Math.sin(yaw) * 0.12, 0.0, z - Math.cos(yaw) * 0.12, yaw, { hip: 0.78, legL: -0.9 + c * 0.45, legR: -0.9 - c * 0.45, armL: -1.1, armR: -1.1, lean: 0.25 });
        if (player && !f.rang && player.pos.distanceTo(this.v.set(x, player.pos.y, z)) < P.bellNear) { f.rang = true; sfx.bell?.(this.v.set(x, 1, z)); }
        if (player && f.rang && player.pos.distanceTo(this.v.set(x, player.pos.y, z)) > P.bellNear * 2) f.rang = false;
      } else if (f.role === 'ball') {
        const [x0, z0] = P.ball[0], [x1, z1] = P.ball[1];
        const yaw = Math.atan2((f.i ? x0 - x1 : x1 - x0), (f.i ? z0 - z1 : z1 - z0));
        const k = (this.clock / 1.4) % 2, kick = (f.i === 0 && k > 1.9) || (f.i === 1 && k > 0.9 && k < 1) ? 0.8 : 0;
        this.pose(i, f, f.x, 0, f.z, yaw, { legR: -kick, armL: 0.2, armR: -0.2 });
        if (f.i === 0) { // the ball rolls and bounces from one to the other and back
          const u = k < 1 ? k : 2 - k;
          this.ball.position.set(x0 + (x1 - x0) * u, 0.11 + Math.abs(Math.sin(u * Math.PI * 2)) * 0.25, z0 + (z1 - z0) * u);
        }
      } else if (f.role === 'sandbox') {
        const dig = Math.sin(this.clock * 2 + f.phase);
        this.pose(i, f, f.x, -0.32, f.z, f.yaw, { hip: 0.62, legL: -1.4, legR: -1.3, armL: -0.9 + dig * 0.4, armR: -0.6 });
      } else if (f.role === 'sit') {
        this.pose(i, f, f.x, -0.42, f.z, THREE.MathUtils.degToRad(f.yaw), { legL: -1.45, legR: -1.35, armL: -0.3, armR: -0.25 });
      } else if (f.role === 'lie') {
        // on her back on the blanket, an arm behind the head (out of sight in winter, with the blanket)
        if (this.blanket.visible) this.pose(i, f, f.x, 0.12, f.z + 0.8, 0, { lean: -Math.PI / 2, armL: -2.8 + Math.sin(this.clock * 0.5) * 0.1, armR: 0.1 });
        else this.pose(i, f, f.x, -5, f.z, 0, {});
      } else if (f.role === 'stand') {
        const sway = Math.sin(this.clock * 0.6 + f.phase) * 0.08;
        this.pose(i, f, f.x, f.y, f.z, f.yaw + sway, { armL: -0.2, armR: 0.15 });
      }
    });
    for (const p of PARTS) this.parts[p].instanceMatrix.needsUpdate = true;
    for (const b of this.bikes) b.instanceMatrix.needsUpdate = true;
  }
}
