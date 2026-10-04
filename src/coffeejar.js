import * as THREE from 'three';
import { COFFEE_JAR as J, MOCCAMASTER as M } from './config.js';
import { sfx } from './audio.js';
import { Holdable, handBusy } from './holdable.js';

// The coffee jar beside the Moccamaster (#334, docs/kaffeburk-sked-*.jpg): a square glass jar with rounded corners, ground
// coffee settled on a slant a third up, coffee dust on the glass, a bamboo lid, a beech scoop hanging in a glass loop on
// its side. The ritual before a pot (coffee.js): fill the jug at a running tap, pour it into the tank; E on the jar opens
// the lid and takes the scoop full of coffee, E on the Moccamaster tips it into the filter, E on the jar again fills it
// again (or, full, puts it back: the lid shuts). `aim` turns what the visitor looks at into those steps.
// A loose item (F hides it, sends the scoop home, empties the tank and the filter).

/** A rounded square, centred. */
function rounded(w, r) {
  const s = new THREE.Shape(), h = w / 2;
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}
/** A rounded square prism standing on y = 0, `ht` high (UVs in metres). */
function prism(w, r, ht) {
  const g = new THREE.ExtrudeGeometry(rounded(w, r), { depth: ht, bevelEnabled: false, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A canvas texture: `draw(g, size)` on a size² canvas, repeated per `metres`. */
function canvasTex(size, metres, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / metres, 1 / metres);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const hex = (c) => `#${new THREE.Color(c).getHexString()}`;
// clear glass with a film of coffee dust on its middle (side UVs: u along the wall, v = height in metres)
const dustTex = canvasTex(128, J.h, (g, n) => {
  g.fillStyle = 'rgba(235,242,244,0.16)';
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 900; i++) {
    const v = Math.random(), y = n * (1 - (J.fill + 0.05 + v * v * 0.4)); // thicker just above the coffee, thinning upwards
    g.fillStyle = `rgba(90,60,40,${0.1 + Math.random() * 0.35})`;
    g.fillRect(Math.random() * n, y, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
  }
});
dustTex.repeat.y = -1 / J.h; dustTex.offset.y = 1 / J.h; // (the walls' v runs 1 − height: canvas top = the jar's top)
const bambooTex = canvasTex(128, 0.1, (g, n) => {
  g.fillStyle = hex(J.bamboo);
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 70; i++) { // fine grain along one way, a few nodes
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,85,45' : '250,235,205'},${0.08 + Math.random() * 0.12})`;
    g.fillRect(0, Math.random() * n, n, 0.6 + Math.random() * 1.2);
  }
  for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(120,85,45,0.18)'; g.fillRect(Math.random() * n, 0, 2, n); }
});

const glassMat = new THREE.MeshStandardMaterial({ map: dustTex, color: 0xffffff, roughness: 0.05, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const loopMat = new THREE.MeshStandardMaterial({ color: 0xe8f0f2, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false });
const groundMat = new THREE.MeshStandardMaterial({ color: J.ground, roughness: 0.95 });
const bambooMat = new THREE.MeshStandardMaterial({ map: bambooTex, roughness: 0.6 });
const edgeMat = new THREE.MeshStandardMaterial({ color: J.bambooEdge, roughness: 0.7 });
const beechMat = new THREE.MeshStandardMaterial({ color: J.beech, roughness: 0.65 });
const stainMat = new THREE.MeshStandardMaterial({ color: J.stain, roughness: 0.8, side: THREE.BackSide }); // the bowl's inside, coffee-stained

const mesh = (geo, m, x = 0, y = 0, z = 0, shadow = true) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = shadow;
  return o;
};

/** The scoop's model: origin at the bowl's centre, the bowl opening towards +z, the handle hanging down (−y). */
function scoopModel() {
  const g = new THREE.Group(), r = 0.022;
  const bowl = new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 1, 0.6);
  g.add(mesh(bowl, beechMat), mesh(bowl, stainMat, 0, 0, 0, false));
  g.add(mesh(new THREE.CylinderGeometry(0.0045, 0.005, 0.085, 10), beechMat, 0, -r - 0.04, -0.005));
  const heap = mesh(new THREE.SphereGeometry(r * 0.85, 14, 8).scale(1, 1, 0.5), groundMat, 0, 0, -0.002);
  g.add(heap);
  return { model: g, heap };
}

/** The scoop: a Holdable whose home is the loop on the jar's side; `full` = a heap of coffee in the bowl. */
class Scoop extends Holdable {
  constructor(scene, camera, jar, home) {
    const { model, heap } = scoopModel();
    super(scene, camera, {
      name: 'skopan', verb: 'ta', backName: 'kaffeburkens ögla', backVerb: 'hänga tillbaka skopan i', placeVerb: 'lägga ner',
      model, home: { pos: home, rot: new THREE.Euler() },
      heldPose: { pos: new THREE.Vector3(J.held.x, J.held.y, J.held.z), rot: new THREE.Euler(-1.25, 0.3, 0) }, // the bowl up and ahead, the handle towards you
      pick: { pos: home.clone().setY(home.y - 0.02), size: [0.05, 0.12, 0.05] }, cooldown: 0.3,
    });
    Object.assign(this, { isScoop: true, jar, heap, full: false, grip: [0, -0.09, -0.005] }); // grip: the hand round the handle's end
    this.showHeap();
  }
  set full(v) { this._full = v; this.showHeap?.(); }
  get full() { return !!this._full; }
  showHeap() { if (this.heap) this.heap.visible = this._full; }
  get atHome() { return !this.held && !this.placed; }
  goHome() { super.goHome(); this.full = false; } // the coffee back in the jar
  onTake() { sfx.click(this.where()); }
  update(dt) { super.update(dt); this.jar.animate(dt); }
}

export class CoffeeJar {
  /** Beside `mocca` on its free (south) side, against the splashback. */
  constructor(scene, camera, mocca) {
    this.mocca = mocca;
    const g = new THREE.Group(), w = J.w, h = J.h;
    const mp = mocca.object.position;
    g.position.set(M.back - J.gap - w / 2, mp.y, M.z + M.w / 2 + J.gap + w / 2);
    // the glass: walls + a thick bottom
    const glass = mesh(prism(w, J.r, h), glassMat, 0, 0, 0, false);
    glass.renderOrder = 2;
    g.add(glass, mesh(prism(w - 0.004, J.r - 0.002, 0.006), loopMat, 0, 0.001, 0, false));
    // the ground coffee, settled on a slant (higher at the back, where it was poured from)
    const cg = prism(w - 0.006, J.r - 0.003, 1), pos = cg.attributes.position;
    const hc = h * J.fill;
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) > 0.5 ? hc + J.slant * (pos.getX(i) / w + 0.15 * pos.getZ(i) / w) : 0.007);
    cg.computeVertexNormals();
    g.add(mesh(cg, groundMat, 0, 0, 0, false));
    // the glass loop on the side towards the sink (+z), the scoop hanging in it
    const loopY = h * 0.66, loopZ = w / 2 + 0.011;
    g.add(mesh(new THREE.TorusGeometry(0.0085, 0.0025, 8, 18).rotateX(Math.PI / 2), loopMat, 0, loopY, loopZ, false));
    g.add(mesh(new THREE.BoxGeometry(0.006, 0.005, 0.006), loopMat, 0, loopY, w / 2 + 0.002, false));
    // the lid: a bamboo square on a darker neck that sits in the glass; hinged (when it opens) at the back edge
    this.lid = new THREE.Group();
    this.lid.position.set(w / 2 + 0.002, h, 0);
    this.lid.add(mesh(prism(w + 0.004, J.r + 0.002, J.lid), bambooMat, -w / 2 - 0.002, 0.003, 0));
    this.lid.add(mesh(prism(w - 0.007, J.r - 0.003, 0.016), edgeMat, -w / 2 - 0.002, -0.013, 0));
    g.add(this.lid);
    this.lidT = 0;
    this.object = g;
    scene.add(g);
    g.updateMatrixWorld(true);
    const self = this;
    this.target = { name: 'kaffeburken', kind: 'coffeejar', pickable: g,
      get verb() { const s = self.scoop; return s.held ? (s.full ? 'hänga tillbaka skopan i' : 'fylla skopan ur') : 'ta en skopa kaffe ur'; },
      get blocked() { return handBusy(self.scoop); },
      toggle: () => this.press() };
    g.traverse((m) => { m.userData.door = this.target; });
    this.scoop = new Scoop(scene, camera, this, g.localToWorld(new THREE.Vector3(0, loopY + 0.03, loopZ + 0.008)));
    this.scoop.takeTarget.toggle = () => (this.scoop.placed ? this.scoop.take() : this.press()); // from its loop: full of coffee, the lid opens
    mocca.scoop = this.scoop;
  }

  /** E on the jar (or on the scoop): take the scoop full / fill it again / hang it back. */
  press() {
    const s = this.scoop;
    if (handBusy(s)) return;
    if (s.held && s.full) { s.putBack(); sfx.click(this.object.position); return; }
    if (!s.held) s.take(); // (from its loop, or from wherever it was put down)
    if (s.held && !s.full) { s.full = true; sfx.scoop(this.object.position, true); }
  }

  /** The lid follows the scoop: shut while it hangs in its loop, flipped up against the splashback otherwise. */
  animate(dt) {
    const want = this.scoop.atHome ? 0 : 1;
    if (this.lidT === want) return;
    this.lidT += Math.sign(want - this.lidT) * Math.min(Math.abs(want - this.lidT), dt * 3);
    const k = this.lidT * this.lidT * (3 - 2 * this.lidT);
    this.lid.rotation.z = -k * 1.45;
    this.lid.position.y = J.h + 0.012 * Math.sin(Math.PI * k);
  }

  /**
   * What looking at `door` (the nearest thing under the look, or null) with `item` in the hand means for the ritual:
   * the jug with water at the Moccamaster → the tank; the jug at a running tap → fill it; the full scoop at the
   * Moccamaster (or its jug) → the filter. null = nothing special.
   */
  aim(item, door) {
    const m = this.mocca;
    if (!item || !door) return null;
    if (item.isJug && door.kind === 'tap' && door.isOpen && !door.spec?.shower && m.jugWater < 0.98) return m.fillTarget; // (full: the tap can be shut)
    if (item.isJug && m.jugWater > 0.02 && m.water < 0.97 && (door === m || door === item.backTarget)) return m.tankTarget;
    if (item === this.scoop && this.scoop.full && (door === m || door === m.jugHolder?.takeTarget)) return m.filterTarget;
    return null;
  }

  /** F: the scoop home in its loop (the lid shuts), the Moccamaster's tank and filter empty. */
  reset() {
    if (this.scoop.held) this.scoop.putBack(); else if (this.scoop.placed) this.scoop.goHome();
    this.lidT = 0; this.lid.rotation.z = 0; this.lid.position.y = J.h;
    this.mocca.reset();
  }
}

/** The jar and its scoop beside the Moccamaster, or null without one. */
export function buildCoffeeJar(scene, camera, world) {
  const mocca = world.lids.find((l) => l.kind === 'coffee');
  return mocca ? new CoffeeJar(scene, camera, mocca) : null;
}
