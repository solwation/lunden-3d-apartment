import { PLAYROOM as R } from './config.js';

/** #1619: where the green emergency-exit signs hang (local metres from the room's centre): above each passage's north face and above the playhouse door. */
export function exitSignSpots() {
  const C = R.clubhouse, z = C.front - C.wall / 2 - R.clubhouse.label.offset;
  return [...[-2, 0, 2].map((i) => ({ x: i * C.side, z })), { x: 0, z: R.d / 2 - R.exitSigns.offset }];
}

/** The ISO-style (#1625: painted into playroomposters' atlas, the signs are quads of its one unlit mesh). running-man pictogram with the word NÖDUTGÅNG on a green field. */
export function drawSign(c, w, h) {
  const E = R.exitSigns;
  c.fillStyle = E.green; c.fillRect(0, 0, w, h);
  c.strokeStyle = E.ink; c.fillStyle = E.ink; c.lineWidth = h * .03; c.strokeRect(h * .05, h * .05, w - h * .1, h - h * .1);
  // door frame with the running figure, left
  const x0 = w * .06, y0 = h * .16, dw = h * .42, dh = h * .68;
  c.lineWidth = h * .045; c.beginPath(); c.moveTo(x0 + dw, y0); c.lineTo(x0 + dw, y0 + dh); c.moveTo(x0 + dw, y0 + dh * .08); c.lineTo(x0, y0 + dh * .08); c.lineTo(x0, y0 + dh); c.stroke();
  c.lineWidth = h * .06; c.lineCap = 'round'; c.lineJoin = 'round';
  const cx = x0 + dw * .52, cy = y0 + dh * .5;
  c.beginPath(); c.arc(cx + dw * .08, cy - dh * .3, dh * .07, 0, 7); c.fill();
  c.beginPath(); c.moveTo(cx + dw * .02, cy - dh * .2); c.lineTo(cx - dw * .05, cy + dh * .08); // torso
  c.moveTo(cx - dw * .05, cy + dh * .08); c.lineTo(cx + dw * .18, cy + dh * .3); c.moveTo(cx - dw * .05, cy + dh * .08); c.lineTo(cx - dw * .22, cy + dh * .3); // legs
  c.moveTo(cx, cy - dh * .14); c.lineTo(cx + dw * .24, cy - dh * .06); c.moveTo(cx, cy - dh * .14); c.lineTo(cx - dw * .2, cy - dh * .02); c.stroke(); // arms
  c.font = `700 ${h * .2}px system-ui,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(E.text, x0 + dw + (w - x0 - dw) / 2, h / 2, w - x0 - dw - h * .12);
}
