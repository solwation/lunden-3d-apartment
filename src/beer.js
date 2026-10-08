import * as THREE from 'three';
import { Holdable } from './holdable.js';
import { sfx } from './audio.js';
import { BEER as B, PATIO as P } from './config.js';

// The big beer on the patio (#117): sit down in the lounge sofa and a 50 cl tankard of lager with a head of
// foam turns up on the lounge table, all year round. E takes it; a click / the "Drick" touch button drinks a
// gulp (it goes up to the mouth and tips, the level drops); empty is empty until it goes back on the table
// (E there, or sitting down again fills it). It can be put down like the other things (holdable.js).

const glassMat = new THREE.MeshStandardMaterial({ color: 0xe8f0f2, roughness: 0.05, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
const beerMat = new THREE.MeshStandardMaterial({ color: 0xd99a1e, roughness: 0.25, transparent: true, opacity: 0.92 });
const foamMat = new THREE.MeshStandardMaterial({ color: 0xfbf6ea, roughness: 0.9 });

function tankard() {
  const g = new THREE.Group(); // bottom centre at the origin, the handle towards +x
  const { r, h } = B;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.94, h, 24, 1, true), glassMat);
  glass.position.y = h / 2;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.012, 24), glassMat);
  base.position.y = 0.006;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(h * 0.27, 0.011, 8, 16, Math.PI), glassMat);
  handle.rotation.z = -Math.PI / 2; handle.position.set(r, h * 0.52, 0);
  const beer = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.9, 1, 22), beerMat); // scaled to the level
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.95, 0.025, 22), foamMat);
  g.add(glass, base, handle, beer, foam);
  return { g, beer, foam };
}

export class Beer extends Holdable {
  constructor(scene, camera, world = null) {
    const { g, beer, foam } = tankard();
    const home = new THREE.Vector3(B.x, B.y, B.z);
    super(scene, camera, {
      name: 'ölen', verb: 'ta', backName: 'loungebordet', backVerb: 'ställa tillbaka ölen på', placeVerb: 'ställa ner',
      model: g, home: { pos: home, rot: new THREE.Euler(0, Math.PI * 0.8, 0) },
      heldPose: { pos: new THREE.Vector3(B.held.x, B.held.y, B.held.z), rot: new THREE.Euler(0, -0.4, 0) },
      pick: { pos: home.clone().setY(B.y + B.h / 2), size: [0.16, B.h + 0.04, 0.16] }, cooldown: 0.6,
    });
    Object.assign(this, { beer, foam, level: 1, sip: 0, gulps: 0, out: false, world });
    this.rest = { q: new THREE.Quaternion(), lift: 0 }; // it stands when put down
    this.setLevel(1);
    this.placeForSpot(null);
    this.goHome();
    this.show(false);
  }

  getTable() {
    return this.world?.furniture?.movable?.find((p) => p.item?.type === 'slattable') ?? null;
  }

  get furnitureHome() {
    return this.getTable()?.object ?? null;
  }

  get target() {
    if (this.held) this.updateHomeFromTable();
    return super.target;
  }

  /** "Drick" while there is beer left; nothing to click when it is empty. */
  get useLabel() { return this.level > 0.01 ? 'Drick' : null; }

  setLevel(l) {
    this.level = l < 1e-6 ? 0 : l; // 1 − 5 × 0.2 is not quite 0 in floats
    const hgt = Math.max(0.001, (B.h - 0.035) * this.level);
    this.beer.scale.y = hgt; this.beer.position.y = 0.012 + hgt / 2;
    this.beer.visible = this.level > 0.01;
    this.foam.visible = this.level > 0.01;
    this.foam.position.y = 0.012 + hgt + 0.012;
  }

  /** It is there (on the table, in the hand, put down) or not yet. */
  show(v) {
    this.out = v;
    this.model.visible = v;
    this.holder.visible = v;
  }

  /** Position the beer on the lounge table directly in front of the seated visitor (#472, #488). */
  placeForSpot(spot = null) {
    const table = this.getTable();
    if (!table) {
      if (spot?.pos) this.home.pos.set(B.x, B.y, B.z);
      return;
    }
    table.object.updateWorldMatrix(true, false);
    const { w, d, h } = P.slatTable;
    const margin = B.r + 0.015;
    const minX = -w / 2 + margin, maxX = w / 2 - margin;
    const minZ = -d / 2 + margin, maxZ = d / 2 - margin;

    let lx, lz;
    if (spot?.pos) {
      let forward;
      if (spot.dir?.[0] === -1 || spot.pos.x > 5.0) {
        forward = new THREE.Vector3(-1, 0, 0);
      } else {
        forward = new THREE.Vector3(0, 0, 1);
      }
      const ideal = spot.pos.clone().addScaledVector(forward, 0.55);
      const inv = table.object.matrixWorld.clone().invert();
      const localP = ideal.applyMatrix4(inv);
      lx = Math.max(minX, Math.min(maxX, localP.x));
      lz = Math.max(minZ, Math.min(maxZ, localP.z));
    } else if (this.localPos) {
      lx = this.localPos.x;
      lz = this.localPos.z;
    } else {
      lx = 0.18;
      lz = 0.05;
    }

    // Avoid colliding with summer beer glasses if present on the table (#408)
    if (Math.hypot(lx - (-0.18), lz - 0.08) < 0.11) {
      lx = lx < -0.18 ? -0.18 - 0.08 : -0.18 + 0.08;
      lx = Math.max(minX, Math.min(maxX, lx));
    }
    if (Math.hypot(lx - 0.06, lz - (-0.1)) < 0.11) {
      lz = lz < -0.1 ? -0.1 - 0.08 : -0.1 + 0.08;
      lz = Math.max(minZ, Math.min(maxZ, lz));
    }

    this.localPos = new THREE.Vector3(lx, h, lz);
    this.updateHomeFromTable();
  }

  updateHomeFromTable() {
    const table = this.getTable();
    if (!table) return;
    table.object.updateWorldMatrix(true, false);
    if (!this.localPos) {
      const { h } = P.slatTable;
      this.localPos = new THREE.Vector3(0.18, h, 0.05);
    }
    const worldPos = this.localPos.clone().applyMatrix4(table.object.matrixWorld);
    this.home.pos.copy(worldPos);
    this.home.rot.y = new THREE.Euler().setFromRotationMatrix(table.object.matrixWorld, 'YXZ').y + Math.PI * 0.8;
    if (this.holder?.children?.[0]) {
      this.holder.children[0].position.copy(worldPos).y += B.h / 2;
    }
  }

  /** The visitor sat down in the lounge sofa: a full beer on the table, unless one is in the hand or put down. */
  serve(spot = null) {
    if (this.broken) this.broken = false; // shot to pieces (#263): a new one
    if (spot) this.placeForSpot(spot);
    if (this.held || this.placed) { if (!this.out) this.show(true); return; }
    this.goHome();
    this.setLevel(1);
    if (!this.out) sfx.click(this.where());
    this.show(true);
  }

  /** Whole again (#263): back on the table if it was served. */
  mend() { this.broken = false; this.goHome(); this.model.visible = this.out; }

  goHome() {
    this.updateHomeFromTable();
    super.goHome();
    this.model.updateMatrixWorld(true);
    if (this.out) this.setLevel(1); // back on the table: a fresh one
  }

  onUse() {
    if (this.level <= 0.01) return;
    this.sip = 1;
    this.gulps++;
    this.onGulp?.();
    sfx.gulp(this.where());
    this.setLevel(this.level - B.gulp);
  }

  tick(dt) {
    this.sip = Math.max(0, this.sip - dt * 1.6);
    const k = Math.sin(this.sip * Math.PI); // up to the mouth, tipped, and down again
    this.model.position.set(B.held.x - 0.16 * k, B.held.y + 0.17 * k, B.held.z + 0.18 * k);
    this.model.rotation.set(0.9 * k, -0.4 + 0.3 * k, 0);
  }
}
