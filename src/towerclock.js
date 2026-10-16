import * as THREE from 'three';
import { TOWER_CLOCK as C } from './config.js';
import { freeCanvasAfterUpload } from './lowmemory.js';

const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const hex = color => `#${color.toString(16).padStart(6, '0')}`;

function dialTexture(faceColor, inkColor) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = C.textureSize;
  const g = canvas.getContext('2d'), r = C.textureSize / 2;
  g.fillStyle = hex(faceColor); g.fillRect(0, 0, canvas.width, canvas.height);
  g.translate(r, r); g.fillStyle = hex(inkColor);
  for (let i = 0; i < 12; i++) {
    g.save(); g.rotate(i * Math.PI / 6);
    g.fillRect(-r * C.tickWidth / 2, -r * C.tickRadius, r * C.tickWidth, r * C.tickLength);
    g.restore();
  }
  g.font = `700 ${Math.round(r * C.numeralSize)}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const h of [12, 3, 6, 9]) {
    const a = h * Math.PI / 6;
    g.fillText(String(h), Math.sin(a) * r * C.numeralRadius, -Math.cos(a) * r * C.numeralRadius);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return freeCanvasAfterUpload(texture);
}

/** Four outward-facing dials; two shared draws, no small-detail distance cutoff or per-frame texture painting. */
export class TowerClock {
  constructor(spec) {
    this.spec = spec; this.hour = null;
    this.object = new THREE.Group(); this.object.name = 'tower-clock';
    this.pose = new THREE.Object3D(); this.faceRotation = new THREE.Quaternion(); this.turn = new THREE.Quaternion();
    const texture = dialTexture(spec.faceColor, spec.handColor);
    this.dials = new THREE.InstancedMesh(new THREE.CircleGeometry(1, C.segments),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), 4);
    this.hands = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, .5, 0),
      new THREE.MeshBasicMaterial({ color: spec.handColor, toneMapped: false }), 8);
    this.dials.name = 'tower-clock-dials'; this.hands.name = 'tower-clock-hands';
    this.hands.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (const [i, [dx, dz]] of DIRECTIONS.entries()) {
      this.pose.position.set(spec.x + dx * (spec.width / 2 + C.dialOffset), spec.y, spec.z + dz * (spec.width / 2 + C.dialOffset));
      this.pose.quaternion.setFromAxisAngle(Y, Math.atan2(dx, dz));
      this.pose.scale.set(spec.radius, spec.radius, 1); this.pose.updateMatrix();
      this.dials.setMatrixAt(i, this.pose.matrix);
    }
    this.dials.instanceMatrix.needsUpdate = true;
    this.object.add(this.dials, this.hands);
    this.update(0);
    this.dials.computeBoundingSphere();
    // Every hand angle must fit: a sphere from the initial 00:00 pose can clip 06:00 at the screen edge.
    this.hands.boundingSphere = new THREE.Sphere(new THREE.Vector3(spec.x, spec.y, spec.z),
      Math.hypot(spec.width / 2 + C.handOffset + C.handSeparation,
        spec.radius * Math.hypot(C.minuteLength, C.hourWidth / 2)));
  }

  /** `hour` is the very same fractional day.hour supplied to L1007's WallClock. */
  update(hour) {
    if (!Number.isFinite(hour) || hour === this.hour) return;
    this.hour = hour;
    const angles = [-((hour % 12) / 12) * Math.PI * 2, -(((hour * 60) % 60) / 60) * Math.PI * 2];
    const { spec: s, pose } = this;
    for (const [i, [dx, dz]] of DIRECTIONS.entries()) {
      this.faceRotation.setFromAxisAngle(Y, Math.atan2(dx, dz));
      for (let hand = 0; hand < 2; hand++) {
        const out = s.width / 2 + C.handOffset + hand * C.handSeparation;
        pose.position.set(s.x + dx * out, s.y, s.z + dz * out);
        pose.quaternion.copy(this.faceRotation).multiply(this.turn.setFromAxisAngle(Z, angles[hand]));
        pose.scale.set(s.radius * (hand ? C.minuteWidth : C.hourWidth), s.radius * (hand ? C.minuteLength : C.hourLength), 1);
        pose.updateMatrix(); this.hands.setMatrixAt(i * 2 + hand, pose.matrix);
      }
    }
    this.hands.instanceMatrix.needsUpdate = true;
  }
}
