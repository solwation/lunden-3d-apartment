import * as THREE from 'three';
import { PLAYROOM as R } from './config.js';
import { cinemaCurtainGrid } from './clubhousefurnishings.js';
import { clubhouseSurface, FINISH } from './clubhousematerials.js';

/** #1619: half width of the opening the masking curtains leave for a film of this picture ratio (0 / unknown = fully apart, the screen's width). */
export function pictureHalf(aspect) {
  const s = R.furniture.cinema.screen, c = R.furniture.cinema.curtain, open = s.w / 2 - c.overlap;
  return aspect > 0 ? Math.min(open, s.h * aspect / 2 + c.pad) : open;
}

/**
 * The BIO's two velvet curtains as one mesh whose vertices follow the picture width (one extra draw, replacing the two static curtains in the room's batch).
 * Like a cinema's masking: 4:3 draws them in to leave a narrow black frame, 16:9 and wider draw them apart; they ease there smoothly.
 */
export class CinemaCurtains {
  constructor(material) {
    const grids = [-1, 1].map((side) => cinemaCurtainGrid(side)), base = grids[0].pos.length / 3;
    this.source = new THREE.BufferGeometry();
    this.source.setIndex([...grids[0].indices, ...grids[1].indices.map((i) => i + base)]);
    this.source.setAttribute('position', new THREE.BufferAttribute(new Float32Array(grids[0].pos.length * 2), 3));
    this.map = Uint32Array.from(this.source.index.array);
    this.half = this.target = pictureHalf(0);
    this.write();
    this.geometry = clubhouseSurface(this.source, 0x8e2635, FINISH.fabric);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = 'bio-curtains'; this.mesh.receiveShadow = false; this.mesh.matrixAutoUpdate = false; this.mesh.frustumCulled = false;
    this.refresh();
  }
  /** 0 = drawn fully apart (no film); otherwise the film's picture ratio (width / height). */
  setAspect(aspect) { this.target = pictureHalf(aspect); }
  get moving() { return this.half !== this.target; }
  write() {
    const pos = this.source.attributes.position.array, one = pos.length / 2;
    [-1, 1].forEach((side, i) => pos.set(cinemaCurtainGrid(side, this.half).pos, i * one));
    this.source.computeVertexNormals();
  }
  refresh() {
    const sp = this.source.attributes.position.array, sn = this.source.attributes.normal.array, p = this.geometry.attributes.position, n = this.geometry.attributes.normal;
    for (let k = 0; k < this.map.length; k++) for (let c = 0; c < 3; c++) { p.array[k * 3 + c] = sp[this.map[k] * 3 + c]; n.array[k * 3 + c] = sn[this.map[k] * 3 + c]; }
    p.needsUpdate = n.needsUpdate = true;
  }
  update(dt) {
    if (!this.moving) return;
    const d = this.target - this.half;
    this.half = Math.abs(d) < 1e-4 ? this.target : this.half + d * (1 - Math.exp(-4 * Math.max(0, dt) / R.furniture.cinema.curtain.seconds));
    this.write(); this.refresh();
  }
}
