import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BALLOON as B } from './config.js';
import { balloonScale, balloonPos, basketCarries } from './balloongeo.js';

// #1646: a hot-air balloon that is sometimes up above the cloud deck (BALLOON in config.js; schedule / basket geometry: balloongeo.js).
// ONE merged vertex-coloured mesh (envelope + basket + ropes), no extra lights, no shadows. Outside its scheduled window the mesh is hidden
// and update() returns at once (nothing else runs per frame). While it is up, `world.balloon` (player.js groundAt / rim) sees
// `active` + `pos`; a visitor standing in the basket is carried along with it.

const col = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const plain = (g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; };

function balloonGeometry() {
  const parts = [], R = B.envR, cy = B.envLow + R * 0.92, segs = B.stripes * 2;
  // envelope: a squashed sphere (a "teardrop" lower half), alternating coloured gores
  const env = plain(new THREE.SphereGeometry(R, segs, 14, 0, Math.PI * 2, 0, Math.PI * 0.86));
  const pos = env.attributes.position, c = new Float32Array(pos.count * 3), cols = [new THREE.Color(0xd9382c), new THREE.Color(0xf2ead8), new THREE.Color(0x2a5fa8)];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), x = pos.getX(i), z = pos.getZ(i);
    const k = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * B.stripes * 1.5 + 1e-4) % 3 ;
    const t = (R - y) / (2 * R); const tint = 0.85 + 0.15 * (1 - t); // slightly darker towards the mouth
    c.set([cols[k].r * tint, cols[k].g * tint, cols[k].b * tint], i * 3);
    pos.setY(i, y * 1.12 + cy); // taller than wide
    if (y < -R * 0.5) { pos.setX(i, x * (0.55 + 0.9 * (y + R) / R)); pos.setZ(i, z * (0.55 + 0.9 * (y + R) / R)); } // narrows to the mouth
  }
  env.setAttribute('color', new THREE.BufferAttribute(c, 3));
  parts.push(env);
  // basket: floor, open wall (double-sided), rim ring
  const r = B.basketR, wall = col(plain(new THREE.CylinderGeometry(r, r * 0.92, B.rim, 16, 1, true)), 0x9a7040); wall.translate(0, B.rim / 2, 0);
  const floor = col(plain(new THREE.CircleGeometry(r * 0.92, 16)), 0x7a5630); floor.rotateX(-Math.PI / 2); floor.translate(0, 0.02, 0);
  const rim = col(plain(new THREE.TorusGeometry(r, 0.05, 5, 16)), 0x5c4020); rim.rotateX(Math.PI / 2); rim.translate(0, B.rim, 0);
  parts.push(wall, floor, rim);
  // four ropes from the rim to the envelope mouth
  const mouth = 0.55 * R * 0.9, topY = B.envLow + 0.5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4, p0 = new THREE.Vector3(Math.cos(a) * r, B.rim, Math.sin(a) * r), p1 = new THREE.Vector3(Math.cos(a) * mouth * 0.7, topY, Math.sin(a) * mouth * 0.7);
    const len = p0.distanceTo(p1), g = col(plain(new THREE.CylinderGeometry(0.025, 0.025, len, 4, 1, true)), 0x4a3a28);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()));
    g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    parts.push(g);
  }
  for (const g of parts) { for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(n)) g.deleteAttribute(n); }
  return mergeGeometries(parts);
}

export class Balloon {
  /** `clock`: () => wall-clock seconds (shared); `forced`: always scheduled (debug `&balloon`). */
  constructor({ scene, camera, clock = () => Date.now() / 1000, forced = false }) {
    Object.assign(this, { camera, clock, forced, active: false, aboard: false, scale: 0, pos: { x: 0, y: B.floor, z: 0 }, last: { x: 0, z: 0, ok: false } });
    this.mesh = new THREE.Mesh(balloonGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.mesh.visible = false; this.mesh.castShadow = false; this.mesh.receiveShadow = false; this.mesh.raycast = () => {};
    this.mesh.userData.noDetail = true; // far away and big: not for the small-detail culler (src/detail.js)
    scene.add(this.mesh);
  }

  /** Per frame, BEFORE player.update: place / hide it; carry a visitor standing in the basket. `hidden` = underground. */
  update(player, hidden = false) {
    const t = this.clock();
    this.scale = this.forced ? 1 : balloonScale(t);
    const keep = this.aboard; // a visitor aboard keeps it up past the end of the window
    const cam = this.camera.position;
    const near = Math.hypot(cam.x - B.center.x, cam.z - B.center.z) < B.radius + B.far;
    if (!hidden && near && (this.scale > 0 || keep)) {
      if (this.scale <= 0) this.scale = 1;
      balloonPos(t, this.pos);
      const p = player.pos;
      if (this.last.ok && this.aboard) { p.x += this.pos.x - this.last.x; p.z += this.pos.z - this.last.z; } // carried along
      this.last.x = this.pos.x; this.last.z = this.pos.z; this.last.ok = true;
      this.aboard = this.scale >= 0.999 && basketCarries(this.pos, p.x, p.y, p.z);
      this.active = this.scale >= 0.999;
      this.mesh.visible = true;
      this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.mesh.scale.setScalar(Math.max(0.01, this.scale));
      this.mesh.updateMatrix(); this.mesh.updateMatrixWorld();
    } else if (this.mesh.visible || this.active) {
      this.mesh.visible = false; this.active = this.aboard = this.last.ok = false;
    }
  }
}
