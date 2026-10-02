import * as THREE from 'three';
import { TARGET as T } from './config.js';
import { sfx } from './audio.js';
import { badge } from './stats.js';

// The Nerf target on the lawn (#99): a ring board on a wooden stand facing the patio. A dart that hits the
// face scores by its ring (10 in the middle … 1 at the edge) times a bonus for the distance it was shot from
// (TARGET.range); a "+N" badge pops up, a ding (higher for a bullseye), and the small board beside it shows
// the total and the best shot (kept in localStorage). E on the target clears the score. It is only there
// while something that shoots is in the hand (#144): it folds up out of the grass, and down again.

const KEY = 'lunden.target';
const load = () => { try { return { total: 0, best: 0, hits: 0, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { total: 0, best: 0, hits: 0 }; } };

function faceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), n = T.rings.length;
  const colors = ['#ffd21a', '#ffd21a', '#d8252b', '#f4f1ea', '#d8252b', '#f4f1ea'];
  for (let i = n - 1; i >= 0; i--) { // outer ring first
    g.fillStyle = colors[i] ?? '#f4f1ea';
    g.beginPath(); g.arc(128, 128, (128 * (i + 1)) / n, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#222'; g.lineWidth = 1.5; g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Target {
  constructor() {
    this.score = load();
    const wood = new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.8 });
    const g = new THREE.Group();
    g.position.set(T.x, 0, T.z);
    // the board: straw-coloured backing with the ring face on its north side
    const back = new THREE.Mesh(new THREE.CylinderGeometry(T.r + 0.03, T.r + 0.03, 0.06, 32).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xcdb37a, roughness: 1 }));
    back.position.set(0, T.y, 0.03);
    this.face = new THREE.Mesh(new THREE.CircleGeometry(T.r, 48).rotateY(Math.PI), new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.9 }));
    this.face.position.set(0, T.y, -0.001);
    this.face.userData.target = this;
    // the stand: two legs in front, one strut behind
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, T.y + 0.5, 0.05), wood);
      leg.position.set(s * 0.32, (T.y + 0.5) / 2 - 0.05, 0.08); leg.rotation.z = s * 0.06;
      g.add(leg);
    }
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, T.y + 0.2, 0.05), wood);
    strut.position.set(0, (T.y + 0.2) / 2 - 0.08, 0.45); strut.rotation.x = -0.35;
    g.add(strut, back, this.face);
    // the score board on a post beside it (west), facing the patio too
    this.canvas = document.createElement('canvas'); this.canvas.width = 256; this.canvas.height = 128;
    this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25).rotateY(Math.PI), new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.9 }));
    sign.position.set(-0.68, 0.8, 0.05);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.85, 0.04), wood);
    post.position.set(-0.68, 0.42, 0.08);
    g.add(post, sign);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.object = g;
    this.target = { kind: 'target', name: 'måltavlan', verb: 'nollställa poängen på', pickable: g, toggle: () => this.reset() };
    g.traverse((m) => { m.userData.door = this.target; });
    this.draw();
  }

  /** Fold up (`show`) or down over ~0.4 s; hidden when down. */
  update(dt, show) {
    this.k = Math.max(0, Math.min(1, (this.k ?? 0) + (show ? dt : -dt) * 2.5));
    const e = this.k * this.k * (3 - 2 * this.k);
    this.object.visible = this.k > 0.001;
    this.object.scale.set(1, Math.max(0.001, e), 1);
  }

  draw() {
    const g = this.canvas.getContext('2d');
    g.fillStyle = '#2c3a2e'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#f3efe2'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
    g.fillText(`Poäng: ${this.score.total}`, 128, 52);
    g.font = '24px sans-serif';
    g.fillText(`Bästa skott: ${this.score.best}`, 128, 96);
    this.tex.needsUpdate = true;
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.score)); } catch { /* private mode */ } }

  /** Points for a dart at world point `p` shot from `from` (0 = missed the face). */
  points(p, from) {
    const local = this.face.worldToLocal(p.clone());
    const ring = Math.floor((Math.hypot(local.x, local.y) / T.r) * T.rings.length);
    if (ring >= T.rings.length) return 0;
    const d = from.distanceTo(p);
    return T.rings[ring] * T.range.find(([upTo]) => d <= upTo)[1];
  }

  /** A dart hit the face: score it. Returns the points. */
  hit(p, from) {
    const pts = this.points(p, from);
    if (!pts) return 0;
    const s = this.score;
    s.total += pts; s.hits += 1; s.best = Math.max(s.best, pts);
    this.last = pts;
    this.save(); this.draw();
    badge(`🎯 +${pts}`, false);
    sfx.pling(p, this.points(this.face.getWorldPosition(new THREE.Vector3()), from) === pts ? 2 : 1.2); // higher for a bullseye
    return pts;
  }

  reset() {
    this.score = { total: 0, best: 0, hits: 0 };
    this.save(); this.draw();
    sfx.click(this.face.getWorldPosition(new THREE.Vector3()));
  }
}
