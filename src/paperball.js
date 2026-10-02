import * as THREE from 'three';
import { DRAWING as D, LEVELS } from './config.js';
import { sfx } from './audio.js';

// A drawing thrown away (#177): in front of the camera the sheet crumples into a ball (~0.6 s: the sheet
// shrinks and twists while a lumpy ball with the drawing's texture grows), then the ball is thrown along the
// look direction, falls, bounces a couple of times on the floor (walls stop it: the level's collision
// segments) and lies there; after D.ballSeconds it shrinks away. Balls are not saved.

const CRUMPLE = 0.6, G = 9.8, R = 0.045;

/** A lumpy icosahedron: every vertex pushed in or out by a hash of its direction (same spot → same push). */
function ballGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(R, 2), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seed) * 43758.5453;
    v.multiplyScalar(R * (0.72 + 0.38 * (h - Math.floor(h))));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

const segCross = (ax, az, bx, bz, [cx, cz, dx, dz]) => {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, nx: -(dz - cz), nz: dx - cx } : null;
};

export class PaperBalls {
  /** world: collision segments per level; ground(x, z, y): the floor under a point (Player.groundAt). */
  constructor(scene, camera, world, ground) {
    Object.assign(this, { scene, camera, world, ground, balls: [] });
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  /** Crumple a sheet showing `tex` (a poster texture) in front of the camera and throw it; `paper`: the
   * same picture without the transparent margin, for the ball. */
  throwAway(tex, paper = tex) {
    const mat = new THREE.MeshStandardMaterial({ map: paper, roughness: 0.95, flatShading: true });
    const ball = new THREE.Mesh(ballGeometry(Math.random() * 100), mat);
    ball.castShadow = true;
    ball.raycast = () => {};
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(D.w * 0.6, D.h * 0.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide, transparent: true, alphaTest: 0.04 }));
    sheet.raycast = () => {};
    const hand = new THREE.Group();
    hand.position.set(0.02, -0.12, -0.45);
    hand.add(sheet, ball);
    if (!this.camera.parent) this.scene.add(this.camera);
    this.camera.add(hand);
    ball.scale.setScalar(0.01);
    const b = { ball, sheet, hand, t: 0, phase: 'crumple', vel: new THREE.Vector3(), age: 0, bounces: 0, spin: new THREE.Vector3() };
    this.balls.push(b);
    sfx.crumple?.(this.camera.position);
    return b;
  }

  update(dt) {
    for (const b of [...this.balls]) {
      b.t += dt;
      if (b.phase === 'crumple') {
        const k = Math.min(1, b.t / CRUMPLE), e = k * k * (3 - 2 * k);
        b.sheet.scale.setScalar(Math.max(0.01, 1 - e));
        b.sheet.rotation.set(e * 1.3, e * 2.1, e * 0.9);
        b.ball.scale.setScalar(Math.max(0.01, e));
        b.ball.rotation.set(e * 4, e * 3, 0);
        if (k >= 1) this.launch(b);
        continue;
      }
      b.age += dt;
      if (b.phase === 'fly') this.fly(b, dt);
      const left = D.ballSeconds - b.age;
      if (left < 1) b.ball.scale.setScalar(Math.max(0.001, left));
      if (left <= 0) { this.drop(b); }
    }
  }

  /** Off the hand into the world, along the look direction and a little up. */
  launch(b) {
    b.hand.remove(b.sheet);
    b.sheet.geometry.dispose(); b.sheet.material.map?.dispose(); b.sheet.material.dispose();
    const p = b.ball.getWorldPosition(new THREE.Vector3());
    b.hand.removeFromParent();
    this.group.add(b.ball);
    b.ball.position.copy(p);
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    b.vel.copy(dir).multiplyScalar(D.throwSpeed).add(new THREE.Vector3(0, 1.6, 0));
    b.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
    b.phase = 'fly';
  }

  fly(b, dt) {
    const p = b.ball.position, lv = p.y > LEVELS[0].floor + 1.6 + 0.5 ? 1 : 0;
    b.vel.y -= G * dt;
    const nx = p.x + b.vel.x * dt, nz = p.z + b.vel.z * dt;
    // walls (and fixed furniture): bounce back off the first one crossed, losing most of the speed
    const segs = this.world.levels[lv]?.segments ?? [];
    let hit = null;
    for (const s of segs) { const c = segCross(p.x, p.z, nx, nz, s); if (c && (!hit || c.t < hit.t)) hit = c; }
    if (hit) {
      const l = Math.hypot(hit.nx, hit.nz), ux = hit.nx / l, uz = hit.nz / l, dot = b.vel.x * ux + b.vel.z * uz;
      b.vel.x = (b.vel.x - 2 * dot * ux) * 0.35; b.vel.z = (b.vel.z - 2 * dot * uz) * 0.35;
    } else { p.x = nx; p.z = nz; }
    p.y += b.vel.y * dt;
    b.ball.rotation.x += b.spin.x * dt; b.ball.rotation.y += b.spin.y * dt; b.ball.rotation.z += b.spin.z * dt;
    const floor = this.ground(p.x, p.z, p.y) + R * 0.8;
    if (p.y <= floor && b.vel.y < 0) {
      p.y = floor;
      if (b.bounces < 3 && -b.vel.y > 0.6) {
        b.bounces++;
        sfx.ballBounce?.(p, Math.min(1, -b.vel.y / 4));
        b.vel.y *= -0.38; b.vel.x *= 0.55; b.vel.z *= 0.55; b.spin.multiplyScalar(0.5);
      } else {
        b.vel.set(0, 0, 0);
        b.phase = 'rest'; // lies there until it shrinks away
      }
    }
  }

  drop(b) {
    b.ball.removeFromParent();
    b.ball.geometry.dispose(); b.ball.material.map?.dispose(); b.ball.material.dispose();
    this.balls.splice(this.balls.indexOf(b), 1);
  }
}
