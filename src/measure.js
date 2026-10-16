import * as THREE from 'three';

// Two surface picks per measurement. The input adapter owns mode switching and maps
// locked mouse aim or a canvas tap to normalized device coordinates.

const fmt = (m) => `${m.toFixed(2).replace('.', ',')} m`;

export class Measure {
  constructor(scene, camera, targets, label) {
    this.camera = camera;
    this.targets = targets; // objects to measure against
    this.label = label;     // HTML element for the read-out
    this.points = [];
    this.ray = new THREE.Raycaster();
    this.ray.far = 100;
    this.enabled = false;
    const mat = new THREE.MeshBasicMaterial({ color: 0xd23a2a, depthTest: false, toneMapped: false });
    // Same 3.5 cm marker radius as the public viewer; an illustrative UI marker.
    this.markers = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), mat);
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
  }

  get active() { return this.enabled; }

  setActive(value) {
    this.enabled = value;
    this.clear();
  }

  /** First rendered mesh surface, including glass but excluding hidden ancestors. */
  hit(ndc = new THREE.Vector2()) {
    this.camera.updateMatrixWorld();
    for (const target of this.targets) target.updateWorldMatrix(true, true);
    this.ray.setFromCamera(ndc, this.camera);
    const h = this.ray.intersectObjects(this.targets, true).find((i) => {
      if (!i.object.isMesh) return false;
      for (let o = i.object; o; o = o.parent) if (!o.visible) return false;
      const material = Array.isArray(i.object.material)
        ? i.object.material[i.face?.materialIndex ?? 0] : i.object.material;
      return material?.visible !== false && material?.opacity !== 0;
    });
    return h ? h.point.clone() : null;
  }

  press(ndc) {
    if (!this.active) return false;
    const p = this.hit(ndc);
    if (!p) return false;
    if (this.points.length === 2) this.clear();
    this.points.push(p);
    const m = this.markers[this.points.length - 1];
    m.position.copy(p);
    m.visible = true;
    this.live.copy(p);
    this.redraw();
    return true;
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
    this.line.visible = this.points.length === 2;
    const d = a.distanceTo(b), h = Math.hypot(b.x - a.x, b.z - a.z), v = Math.abs(b.y - a.y);
    this.label.innerHTML = this.points.length === 1 ? 'Välj den andra punkten på en yta' : `<b>${fmt(d)}</b>${v > 0.02 && h > 0.02
      ? `<small>vågrätt ${fmt(h)} · lodrätt ${fmt(v)}</small>` : ''}`;
    this.label.hidden = false;
  }

  /** Keep the read-out at the chosen pair’s midpoint as the camera moves. */
  update(dt, width, height) {
    if (!this.active || !this.points.length) return;
    const [a, b = this.live] = this.points;
    const mid = a.clone().add(b).multiplyScalar(0.5).project(this.camera);
    const behind = mid.z > 1;
    this.label.style.left = `${((mid.x + 1) / 2) * width}px`;
    this.label.style.top = `${((1 - mid.y) / 2) * height}px`;
    this.label.style.visibility = behind ? 'hidden' : 'visible';
  }
}
