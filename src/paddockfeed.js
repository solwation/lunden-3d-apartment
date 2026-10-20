import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PADDOCK as P } from './config.js';

// #1396: two local hay portions under the existing roof. This is an ambient
// feeding cycle, not a hunger/inventory system. Everything follows the shed frame.
export class PaddockFeed {
  constructor(scene, ground, shelter, bodies) {
    this.time = 0;
    this.slots = shelter ? bodies.map((body) => ({ body, x: body.x + Math.sin(shelter.yaw) * P.feed.reach, z: body.z + Math.cos(shelter.yaw) * P.feed.reach, yaw: shelter.yaw })) : [];
    this.amount = new Float32Array(this.slots.length).fill(1);
    this.eaten = new Float32Array(this.slots.length);
    this.next = this.slots.map((_, i) => i * P.feed.stagger);
    this.refill = this.slots.map(() => Infinity);
    const parts = [], F = P.feed;
    const box = (w, h, d, x, y, z, color, food = false, yaw = 0) => {
      const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.rotateY(yaw); g.translate(x, y, z); g.deleteAttribute('uv');
      const n = g.attributes.position.count, rgb = new THREE.Color(color), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) rgb.toArray(col, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aFood', new THREE.BufferAttribute(new Float32Array(n).fill(food ? 1 : 0), 1)); parts.push(g);
    };
    box(F.w, F.base, F.d, 0, F.base / 2, 0, F.wood);
    for (const side of [-1, 1]) {
      box(F.rail, F.h, F.d, side * (F.w - F.rail) / 2, F.base + F.h / 2, 0, F.wood);
      box(F.w, F.h, F.rail, 0, F.base + F.h / 2, side * (F.d - F.rail) / 2, F.wood);
    }
    for (let i = 0; i < F.strands; i++) {
      const u = Math.sin(i * 2.39996), v = Math.cos(i * 4.71), y = F.base + F.h + F.mound * (0.4 + 0.6 * (1 - Math.abs(u)));
      box(F.w * 0.72, F.strand, F.strand, u * F.w * 0.11, y, v * F.d * 0.3, F.hay[i % F.hay.length], true, i * 2.39996);
    }
    const geometry = mergeGeometries(parts);
    for (const g of parts) g.dispose();
    this.level = new THREE.InstancedBufferAttribute(this.amount, 1);
    this.level.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aAmount', this.level);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFood; attribute float aAmount;');
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\nif (aFood > 0.5) transformed.y = ${F.base.toFixed(4)} + (transformed.y - ${F.base.toFixed(4)}) * aAmount;`);
    };
    material.customProgramCacheKey = () => 'paddock-feed-1396';
    this.mesh = new THREE.InstancedMesh(geometry, material, this.slots.length);
    this.mesh.name = 'paddock-feed'; this.mesh.raycast = () => {}; this.mesh.userData.noDetail = true;
    const matrix = new THREE.Matrix4();
    this.slots.forEach((s, i) => { s.y = ground(s.x, s.z); matrix.makeRotationY(s.yaw); matrix.setPosition(s.x, s.y, s.z); this.mesh.setMatrixAt(i, matrix); });
    this.mesh.computeBoundingSphere(); this.mesh.visible = false; scene.add(this.mesh);
  }

  /** Feeding never takes an animal away from its winter/rain refuge. */
  decide(p, i, host) {
    const s = this.slots[i];
    if (!s || this.time < this.next[i] || this.amount[i] <= P.feed.empty) return false;
    const distance = Math.hypot(p.x - s.body.x, p.z - s.body.z);
    if ((host.winter || (host.rainy && p.seek)) && (distance > P.feed.arrive || (!host.winter && p.spot?.kind !== 'shed'))) return false;
    p.feedGoal = i; p.eat = false;
    if (distance <= P.feed.arrive) { this.begin(p); return true; }
    const target = host.hop(p, s.body.x, s.body.z);
    if (!target) { p.feedGoal = null; return false; }
    p.goal = [s.body.x, s.body.z]; p.target = target; p.state = 'walk'; return true;
  }

  begin(p) { p.state = 'feed'; p.left = P.feed.seconds; p.goal = p.target = null; }

  step(p, i, dt, host) {
    if (p.feedGoal !== i || p.state === 'pet') return;
    const s = this.slots[i], near = Math.hypot(p.x - s.body.x, p.z - s.body.z) <= P.feed.arrive;
    if ((host.winter || (host.rainy && p.seek)) && !near) { p.feedGoal = null; return; }
    if (near && p.state !== 'feed') this.begin(p);
    if (p.state !== 'feed') return;
    let angle = s.yaw - p.yaw; angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    p.yaw += Math.max(-P.pony.turn * dt, Math.min(P.pony.turn * dt, angle));
    if (p.neck > P.feed.neck && Math.abs(angle) < P.feed.facing) {
      const bite = Math.min(this.amount[i], P.feed.rate * dt);
      this.amount[i] -= bite; this.eaten[i] += bite; this.level.needsUpdate = true;
    }
    if (p.left <= 0 || this.amount[i] <= P.feed.empty) {
      if (this.amount[i] <= P.feed.empty) this.refill[i] = this.time + P.feed.refillSeconds;
      this.next[i] = this.time + P.feed.interval;
      p.feedGoal = null; p.state = 'idle'; p.left = 0.5;
    }
  }

  update(dt, show) {
    this.mesh.visible = show && this.slots.length > 0;
    if (!show) return;
    this.time += dt;
    for (let i = 0; i < this.refill.length; i++) if (this.time >= this.refill[i]) { this.amount[i] = 1; this.refill[i] = Infinity; this.level.needsUpdate = true; }
  }
}
