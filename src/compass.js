import * as THREE from 'three';
import { DAY } from './config.js';

// Plan-up (−z) faces 58° ENE on FOJAB's situation/overview north arrows.
// Positive Three.js yaw turns left: bearing is planNorth − yaw, clockwise from true N.
export const compassBearing = yaw => ((DAY.planNorth - THREE.MathUtils.radToDeg(yaw)) % 360 + 360) % 360;
const names=['norr','nordost','öster','sydost','söder','sydväst','väster','nordväst'];

export class Compass {
  constructor(camera,element) {
    this.camera=camera;this.element=element;this.direction=new THREE.Vector3();this.bearing=DAY.planNorth;
    this.badges=document.getElementById('badges');
    this.blockers=['update','reloaded','countdown'].map(id=>document.getElementById(id)).filter(Boolean);
    // The right-hand grid owns placement; lives follow its measured compass center.
    // Observe both its content and viewport so safe areas and hidden HUD startup work.
    const row = element.parentElement;
    const layout = () => {
      const bounds = row.getBoundingClientRect(), size = parseFloat(getComputedStyle(element).width);
      if (bounds.width && Number.isFinite(size))
        document.documentElement.style.setProperty('--compass-center-x', `${bounds.left + size / 2}px`);
    };
    this.layoutObserver = new ResizeObserver(layout);
    this.layoutObserver.observe(row);
    this.layoutObserver.observe(document.documentElement);
    layout();
    this.update();
  }
  update() {
    this.camera.getWorldDirection(this.direction);
    // Looking straight up/down keeps the last meaningful horizontal bearing.
    if(this.direction.x*this.direction.x+this.direction.z*this.direction.z>1e-10)
      this.bearing=compassBearing(Math.atan2(-this.direction.x,-this.direction.z));
    const angle=-this.bearing;
    if(angle!==this.angle){this.element.style.setProperty('--compass-angle',`${angle}deg`);this.angle=angle}
    const rounded=Math.round(this.bearing)%360;
    if(rounded!==this.rounded) {
      this.element.setAttribute('aria-label',`Kompass, blickriktning ${names[Math.round(this.bearing/45)%8]} (${rounded}°)`);
      this.rounded=rounded;
    }
    // Let every event badge finish (including its fade) before restoring the compass.
    this.element.hidden=!!this.badges?.childElementCount||this.blockers.some(e=>!e.hidden);
  }
}
