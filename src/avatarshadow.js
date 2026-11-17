import * as THREE from 'three';
import { AVATAR_SHADOW as S, GHOSTS } from './config.js';

// #2010: a soft ground-contact shadow under every other player. The avatars cast no shadow-map shadow (the map is redrawn rarely), so
// they looked to float, most in sun and on light floors. One InstancedMesh of flat radial blobs serves ALL avatars together = one draw
// call: per player a wide body blob under the root and one blob per shoe. Each blob sits on the ground found for ITS OWN x/z (stairs: each
// foot on its own step; grass / terrain / floors / roofs through `ground(x, z, feetY)`), so it never ends up in a wall or on another storey;
// it is depth tested, writes no depth, and fades with the foot's lift (swing phase) and the body's height over the ground (jump, flight).

/** Smooth 1 -> 0 as `v` goes from `a` to `b`. */
export function fadeOut(v, a, b) { const u = Math.min(1, Math.max(0, (v - a) / (b - a))); return 1 - u * u * (3 - 2 * u); }

/** Alpha of the body blob: gone when the player swims or is far over the ground, `fromGround` = root y − ground y (m). */
export function bodyAlpha(fromGround, swimming) { return swimming || !Number.isFinite(fromGround) || fromGround > S.maxDrop ? 0 : S.bodyAlpha * fadeOut(Math.abs(fromGround), S.jump[0], S.jump[1]); }
/** Alpha of a shoe blob: `lift` = the sole's height over the ground below it (m). */
export function footAlpha(lift, bodyA) { return bodyA > 0 && Number.isFinite(lift) ? S.footAlpha * fadeOut(Math.max(0, lift), S.lift[0], S.lift[1]) * (bodyA / S.bodyAlpha) : 0; }

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(0.45, 'rgba(0,0,0,0.6)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}

const _a = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

export class AvatarShadows {
  constructor(parent, { max = GHOSTS.max } = {}) {
    this.ground = null; // (x, z, feetY) -> the walkable height there; set by main.js (without it the player's own root y is the ground)
    const cap = this.cap = max * 3;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('shA', this.alpha);
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    mat.name = 'avatar-shadow';
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float shA;\nvarying float vShA;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvShA = shA;');
      sh.fragmentShader = 'varying float vShA;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.a *= vShA;');
    };
    mat.customProgramCacheKey = () => 'avatar-shadow2010';
    const mesh = this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    Object.assign(mesh, { name: 'avatar-shadow', count: 0, visible: false, frustumCulled: false, renderOrder: 2 });
    mesh.castShadow = mesh.receiveShadow = false; mesh.raycast = () => {};
    mesh.userData.noDetail = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parent.add(mesh);
    this.n = 0;
  }

  put(x, y, z, yaw, rx, rz, a) {
    if (this.n >= this.cap || a <= 0.004) return;
    _q.setFromAxisAngle(UP, yaw); _p.set(x, y + S.rise, z); _s.set(rx * 2, 1, rz * 2);
    this.mesh.setMatrixAt(this.n, _m.compose(_p, _q, _s)); this.alpha.array[this.n++] = a;
  }

  /** Each frame: `ghosts` = the Ghost list (src/ghosts.js), `eye` = the camera position. */
  update(ghosts, eye) {
    this.n = 0;
    const ground = this.ground;
    for (const g of ghosts) {
      if (!g.root.visible || g.dEye > S.range || g.swim) continue;
      const rp = g.root.position, av = g.avatar, ob = av.object;
      const gy = (x, z, y) => { const h = ground ? ground(x, z, y) : rp.y; return Number.isFinite(h) && h > y - S.maxDrop ? h : NaN; };
      const sc = ob.scale.z || 1, yaw = g.root.rotation.y + ob.rotation.y, ry = rp.y;
      const bg = gy(rp.x, rp.z, ry), ba = bodyAlpha(ry - bg, false);
      if (ba <= 0) continue;
      this.put(rp.x, bg, rp.z, yaw, S.bodyRadius[0] * sc, S.bodyRadius[1] * sc, ba);
      const posed = g.dEye <= 30 && av.bones?.footL && av.bones?.footR;
      for (let i = 0; i < 2; i++) {
        if (posed) {
          av.bones[i ? 'footR' : 'footL'].getWorldPosition(_a);
        } else { // (not posed that far away: standing feet under the hips)
          const c = Math.cos(yaw), s = Math.sin(yaw), sx = (i ? -1 : 1) * 0.095 * sc;
          _a.set(rp.x + sx * c, ry, rp.z - sx * s);
        }
        const sole = _a.y - (posed ? 0.05 * sc : 0), fg = gy(_a.x, _a.z, Math.max(ry, sole) + 0.3), g0 = Number.isFinite(fg) ? fg : bg;
        this.put(_a.x, g0, _a.z, yaw, S.footRadius[0] * sc, S.footRadius[1] * sc, footAlpha(sole - g0, ba));
      }
    }
    this.mesh.count = this.n; this.mesh.visible = this.n > 0;
    if (this.n) { this.mesh.instanceMatrix.needsUpdate = true; this.alpha.needsUpdate = true; }
  }
}
