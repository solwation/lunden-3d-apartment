// Touch controls: a floating joystick on the left part of the screen (walk; the right part when the own layout is
// mirrored, #1090), drag anywhere else to look. Multi-touch via pointer events, so both thumbs work at once.

import { gameView } from './viewport.js';
import { TOUCH } from './config.js';
import { stickLayout } from './touchlayout.js';

const fit = ({ frac, min, max }, side) => Math.round(Math.min(max, Math.max(min, side * frac)));
/** Stick travel, button size and gap (CSS px) for a w×h game view: they follow its short side (#1087). */
export function touchSizes(w, h) {
  const side = Math.min(w, h);
  return { travel: fit(TOUCH.stickTravel, side), button: fit(TOUCH.button, side), gap: fit(TOUCH.gap, side) };
}

/** Stick output 0..1 for a deflection r (distance / travel): dead zone, response curve, full from TOUCH.stick.full (#1088). */
export function stickResponse(r) {
  const { deadZone, full, curve } = TOUCH.stick;
  if (r <= deadZone) return 0;
  return Math.min(1, (r - deadZone) / (full - deadZone)) ** curve;
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
  const pendingLook = { x: 0, y: 0 }; // finger movement not yet eased into the view (#1088)
  let enabled = false;

  const isTouch = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';

  function resize() {
    // the CSS layout size, which the sizes are applied to (iOS can leave innerWidth/innerHeight stale, #567)
    const w = root.clientWidth || gameView.w || window.innerWidth, h = root.clientHeight || gameView.h || window.innerHeight;
    const z = touchSizes(w, h), own = stickLayout(); // the player's own stick size (#1090)
    radius = Math.round(z.travel * own.scale);
    root.style.setProperty('--stick-travel', `${radius}px`);
    root.style.setProperty('--touch-button', `${z.button}px`);
    root.style.setProperty('--touch-gap', `${z.gap}px`);
    root.style.setProperty('--stick-hint-opacity', String(TOUCH.hintOpacity));
  }
  // gameView settles a frame or more after a rotation (#567): measure again a little later
  const settle = () => { resize(); requestAnimationFrame(resize); setTimeout(resize, 400); };
  window.addEventListener('resize', settle);
  window.addEventListener('orientationchange', settle);
  window.addEventListener('touchlayoutchange', resize); // the own layout changed the stick size (#1090)
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
    if (!enabled || !isTouch(e) || e.target.closest?.('button, input, textarea, select, dialog, #hud-top, #stats, #task-note, #terminal, #rearrange-help')) return; // buttons/inputs/dialogs; the stats panel scrolls (#245, #1214)
    const vw = gameView.w || window.innerWidth; // the stick side: left, or right when mirrored for left-handers (#1090)
    if (stickId === null && (stickLayout().mirror ? e.clientX > vw * 0.55 : e.clientX < vw * 0.45)) {
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
      if (d > radius) {
        if (TOUCH.stick.follow) { // follow mode: the base glides after the thumb, so pulling back acts at once (#1088)
          origin.x += dx * (1 - radius / d); origin.y += dy * (1 - radius / d);
          stick.style.left = `${origin.x}px`;
          stick.style.top = `${origin.y}px`;
        }
        dx *= radius / d; dy *= radius / d;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // dead zone + response curve on the length, the direction kept (#1088)
      const r = Math.min(d, radius) / radius, out = stickResponse(r), k = d > 0 ? out / (Math.min(d, radius) || 1) : 0;
      analog.x = dx * k;
      analog.y = -dy * k;
      // the rim lights up toward the push (CSS conic gradient; 0deg = up, clockwise)
      stick.style.setProperty('--stick-a', `${Math.atan2(dx, -dy) * 180 / Math.PI}deg`);
      stick.style.setProperty('--stick-m', (out * 0.75).toFixed(2));
    } else if (e.pointerId === lookId) {
      pendingLook.x += e.clientX - last.x; pendingLook.y += e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      if (!(TOUCH.look.smooth > 0)) update(0);
    }
  });

  const end = (e) => {
    if (e.pointerId === stickId) resetStick();
    if (e.pointerId === lookId) lookId = null;
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);

  /** Per frame (main.js step): ease the pending look movement (CSS px) into the view over TOUCH.look.smooth s (#1088).
   *  Nothing is lost: the deltas handed to onLook add up to the finger's travel. */
  function update(dt) {
    if (!pendingLook.x && !pendingLook.y) return;
    const tau = TOUCH.look.smooth;
    const f = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
    let x = pendingLook.x * f, y = pendingLook.y * f;
    if (Math.abs(pendingLook.x - x) < 0.01 && Math.abs(pendingLook.y - y) < 0.01) { x = pendingLook.x; y = pendingLook.y; } // the last sliver at once
    pendingLook.x -= x; pendingLook.y -= y;
    if (x === 0 && y === 0) return;
    onLook(x, y);
  }

  return {
    analog,
    update,
    get enabled() { return enabled; },
    set enabled(v) {
      enabled = v;
      if (!v) { resetStick(); lookId = null; pendingLook.x = pendingLook.y = 0; }
      showHint();
    },
  };
}
