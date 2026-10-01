import * as THREE from 'three';

// Tape measure: Q (or 📏 on touch) puts a point where the crosshair hits a surface; the second
// point shows the distance; a third press clears. Between the two presses a live line follows
// the crosshair.

const fmt = (m) => `${m.toFixed(2).replace('.', ',')} m`;

export class Measure {
  constructor(scene, camera, targets, label) {
    this.camera = camera;
    this.targets = targets; // objects to measure against
    this.label = label;     // HTML element for the read-out
    this.points = [];
    this.ray = new THREE.Raycaster();
    this.ray.far = 30;
    const mat = new THREE.MeshBasicMaterial({ color: 0xd23a2a, depthTest: false, toneMapped: false });
    this.markers = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 8), mat);
      m.visible = false;
      m.renderOrder = 10;
      scene.add(m);
      return m;
    });
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xd23a2a, depthTest: false, toneMapped: false }));
    this.line.visible = false;
    this.line.renderOrder = 10;
    this.line.frustumCulled = false;
    scene.add(this.line);
    this.live = new THREE.Vector3();
    this.timer = 0;
  }

  get active() { return this.points.length > 0; }

  /** Surface point under the crosshair, or null. */
  hit() {
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const h = this.ray.intersectObjects(this.targets, true).find((i) => i.object.visible && !i.object.material?.transparent);
    return h ? h.point.clone() : null;
  }

  /** Q pressed. */
  press() {
    if (this.points.length === 2) { this.clear(); return; }
    const p = this.hit();
    if (!p) return;
    this.points.push(p);
    const m = this.markers[this.points.length - 1];
    m.position.copy(p);
    m.visible = true;
    this.live.copy(p);
    this.redraw();
  }

  clear() {
    this.points = [];
    for (const m of this.markers) m.visible = false;
    this.line.visible = false;
    this.label.hidden = true;
  }

  redraw() {
    const [a, b = this.live] = this.points;
    if (!a) return;
    const pos = this.line.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    this.line.visible = true;
    const d = a.distanceTo(b), h = Math.hypot(b.x - a.x, b.z - a.z), v = Math.abs(b.y - a.y);
    this.label.innerHTML = `<b>${fmt(d)}</b>${this.points.length === 2 && v > 0.02 && h > 0.02
      ? `<small>vågrätt ${fmt(h)} · lodrätt ${fmt(v)}</small>` : this.points.length < 2 ? '<small>Q igen för att mäta hit</small>' : ''}`;
    this.label.hidden = false;
  }

  /** Per frame: follow the crosshair while one point is set; keep the label at the midpoint. */
  update(dt, width, height) {
    if (!this.active) return;
    if (this.points.length === 1) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0.08;
        const p = this.hit();
        if (p) { this.live.copy(p); this.redraw(); }
      }
    }
    const [a, b = this.live] = this.points;
    const mid = a.clone().add(b).multiplyScalar(0.5).project(this.camera);
    const behind = mid.z > 1;
    this.label.style.left = `${((mid.x + 1) / 2) * width}px`;
    this.label.style.top = `${((1 - mid.y) / 2) * height}px`;
    this.label.style.visibility = behind ? 'hidden' : 'visible';
  }
}
