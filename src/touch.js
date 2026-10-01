// Touch controls: a floating joystick on the left part of the screen (walk), drag anywhere
// else to look. Multi-touch via pointer events, so both thumbs work at once.

const RADIUS = 56; // px the knob can travel

export function setupTouch({ onLook }) {
  const stick = document.getElementById('stick');
  const knob = stick.querySelector('.knob');
  const analog = { x: 0, y: 0 };
  let stickId = null, lookId = null;
  let origin = null, last = null;
  let enabled = false;

  const isTouch = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';

  function resetStick() {
    stickId = null;
    analog.x = analog.y = 0;
    stick.hidden = true;
    knob.style.transform = '';
  }

  document.addEventListener('pointerdown', (e) => {
    if (!enabled || !isTouch(e) || e.target.closest?.('button')) return;
    if (stickId === null && e.clientX < window.innerWidth * 0.45) {
      stickId = e.pointerId;
      origin = { x: e.clientX, y: e.clientY };
      stick.style.left = `${e.clientX}px`;
      stick.style.top = `${e.clientY}px`;
      stick.hidden = false;
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
      if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      analog.x = dx / RADIUS;
      analog.y = -dy / RADIUS;
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
    },
  };
}
