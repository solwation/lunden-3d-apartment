// Touch controls: a floating joystick on the left part of the screen (walk), drag anywhere
// else to look. Multi-touch via pointer events, so both thumbs work at once.

import { gameView } from './viewport.js';
import { TOUCH } from './config.js';

const fit = ({ frac, min, max }, side) => Math.round(Math.min(max, Math.max(min, side * frac)));
/** Stick travel, button size and gap (CSS px) for a w×h game view: they follow its short side (#1087). */
export function touchSizes(w, h) {
  const side = Math.min(w, h);
  return { travel: fit(TOUCH.stickTravel, side), button: fit(TOUCH.button, side), gap: fit(TOUCH.gap, side) };
}

export function setupTouch({ onLook }) {
  const stick = document.getElementById('stick');
  const knob = stick.querySelector('.knob');
  const hint = document.getElementById('stick-hint'); // the faint resting stick at the lower left (#1087)
  const root = document.documentElement;
  let radius = 56; // px the knob can travel; resize() scales it with the screen
  const analog = { x: 0, y: 0 };
  let stickId = null, lookId = null;
  let origin = null, last = null;
  let enabled = false;

  const isTouch = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';

  function resize() {
    // the CSS layout size, which the sizes are applied to (iOS can leave innerWidth/innerHeight stale, #567)
    const w = root.clientWidth || gameView.w || window.innerWidth, h = root.clientHeight || gameView.h || window.innerHeight;
    const z = touchSizes(w, h);
    radius = z.travel;
    root.style.setProperty('--stick-travel', `${z.travel}px`);
    root.style.setProperty('--touch-button', `${z.button}px`);
    root.style.setProperty('--touch-gap', `${z.gap}px`);
    root.style.setProperty('--stick-hint-opacity', String(TOUCH.hintOpacity));
  }
  // gameView settles a frame or more after a rotation (#567): measure again a little later
  const settle = () => { resize(); requestAnimationFrame(resize); setTimeout(resize, 400); };
  window.addEventListener('resize', settle);
  window.addEventListener('orientationchange', settle);
  resize();

  const showHint = () => { if (hint) hint.hidden = !enabled || stickId !== null; };

  function resetStick() {
    stickId = null;
    analog.x = analog.y = 0;
    stick.hidden = true;
    knob.style.transform = '';
    stick.style.setProperty('--stick-m', '0');
    showHint();
  }

  document.addEventListener('pointerdown', (e) => {
    if (!enabled || !isTouch(e) || e.target.closest?.('button, #hud-top, #stats, #task-note, #terminal, #rearrange-help')) return; // buttons; the stats panel scrolls (#245)
    if (stickId === null && e.clientX < (gameView.w || window.innerWidth) * 0.45) {
      stickId = e.pointerId;
      resize();
      origin = { x: e.clientX, y: e.clientY };
      stick.style.left = `${e.clientX}px`;
      stick.style.top = `${e.clientY}px`;
      stick.hidden = false;
      showHint();
    } else if (lookId === null) {
      lookId = e.pointerId;
      last = { x: e.clientX, y: e.clientY };
    }
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('pointermove', (e) => {
    if (!enabled) return;
    if (e.pointerId === stickId) {
      let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
      const d = Math.hypot(dx, dy);
      if (d > radius) { dx *= radius / d; dy *= radius / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      analog.x = dx / radius;
      analog.y = -dy / radius;
      // the rim lights up toward the push (CSS conic gradient; 0deg = up, clockwise)
      stick.style.setProperty('--stick-a', `${Math.atan2(dx, -dy) * 180 / Math.PI}deg`);
      stick.style.setProperty('--stick-m', (Math.min(d, radius) / radius * 0.75).toFixed(2));
    } else if (e.pointerId === lookId) {
      onLook(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
    }
  });

  const end = (e) => {
    if (e.pointerId === stickId) resetStick();
    if (e.pointerId === lookId) lookId = null;
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);

  return {
    analog,
    get enabled() { return enabled; },
    set enabled(v) {
      enabled = v;
      if (!v) { resetStick(); lookId = null; }
      showHint();
    },
  };
}
