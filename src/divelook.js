// #1944: the view under the river's surface while diving (config.js SWIM.dive.look). No render pass, texture or draw call: the scene's own
// fog is pulled in and tinted (daycycle.js sets its colour, near and far again every frame, so the normal fog and sky are back the frame
// after the eye leaves the water), and one fixed DOM element lays a colour wash with a darker rim (the mask's edge) over the picture.
import { Color } from 'three';
import { SWIM } from './config.js';

const L = SWIM.dive.look;

export class DiveLook {
  /** `water(x, z)`: the water line there (riverbridge.js waterYAt). */
  constructor({ scene, camera, player, water, parent = document.body }) {
    Object.assign(this, { scene, camera, player, water });
    this.under = false; this.tint = new Color(...L.tint);
    const el = this.el = document.createElement('div');
    el.style.cssText = `position:fixed;inset:0;z-index:8;pointer-events:none;background:${L.wash};opacity:0;transition:opacity ${L.fade}s ease-out`;
    parent.appendChild(el);
  }

  /** Each frame, after the day cycle set the fog. True while the eye is under the surface. */
  update() {
    const c = this.camera.position, under = !!this.player.swim && c.y < this.water(c.x, c.z);
    if (under) { const f = this.scene.fog; f.color.multiply(this.tint); f.near = L.near; f.far = L.far; }
    if (under !== this.under) { this.under = under; this.el.style.opacity = under ? '1' : '0'; }
    return under;
  }
}
