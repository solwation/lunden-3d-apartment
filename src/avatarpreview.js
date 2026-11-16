import * as THREE from 'three';
import { Avatar } from './avatar.js';

/** On-demand mirror preview of the same model, shaders and proportions as the game.
 * Its private, capped drawing buffer is copied into a 2D canvas; no animation loop or world renderer state. */
export class AvatarPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(1.5, globalThis.devicePixelRatio || 1));
    this.renderer.setSize(220, 310);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x263747);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  }

  draw(look, { closeup = false, yaw = 0 } = {}) {
    this.avatar?.object.removeFromParent();
    this.avatar?.dispose();
    const avatar = this.avatar = new Avatar(look);
    avatar.object.rotation.y = yaw;
    avatar.update(0, {});
    this.scene.add(avatar.object);
    avatar.object.updateMatrixWorld(true);
    const target = new THREE.Vector3(0, 1.05, 0);
    if (closeup) {
      avatar.bones.head.getWorldPosition(target);
      target.y += 0.1 * avatar.object.scale.y;
    }
    // Fixed full-body framing makes height changes visible. Head framing follows the actual skeleton.
    const height = closeup ? 0.68 : 2.35, width = height * 220 / 310;
    Object.assign(this.camera, { left: -width / 2, right: width / 2, top: height / 2, bottom: -height / 2 });
    this.camera.position.copy(target).add(new THREE.Vector3(0, 0, 4));
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const source = this.renderer.domElement;
    this.canvas.width = source.width;
    this.canvas.height = source.height;
    this.canvas.getContext('2d').drawImage(source, 0, 0);
  }

  dispose() {
    this.avatar?.object.removeFromParent();
    this.avatar?.dispose();
    this.avatar = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
