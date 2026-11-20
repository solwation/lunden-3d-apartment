// #2224: pure layout of the Vicco Berdi secretary that holds Olof's computer (TILLY_DESK.cabinet in config.js).
// No three.js, no DOM: src/tillydesk.js builds the meshes from these numbers and tools/berditest.mjs checks them
// headless (devices inside their compartments, fronts covering the openings, the open flap as a writing surface).
// Cabinet-local coordinates: x across, -z the wall (back), +z the front, y up from the floor.

/** Every board, compartment, front and footprint of the cabinet described by `C` (TILLY_DESK). */
export function berdiLayout(C) {
  const K = C.cabinet, b = K.board, w = K.w, h = K.h, z0 = K.back, z1 = K.back + K.d, zf = z1 - b; // zf: carcass front edge, the fronts lie on it
  const x0 = -w / 2, x1 = w / 2, xi0 = x0 + b, xi1 = x1 - b, yb = K.legH, yi0 = yb + b, ys = K.split, yi1 = h - b, zi = z0 + K.backPanel;
  const doorX = x0 + K.door; // centre of the divider behind the door's right edge
  const boards = [ // [size, centre, inside?]
    [[b, h - yb, K.d - b], [x0 + b / 2, (yb + h) / 2, (z0 + zf) / 2], false], // sides
    [[b, h - yb, K.d - b], [x1 - b / 2, (yb + h) / 2, (z0 + zf) / 2], false],
    [[w - 2 * b, b, K.d - b], [0, yb + b / 2, (z0 + zf) / 2], false],         // bottom
    [[w - 2 * b, b, K.d - b], [0, h - b / 2, (z0 + zf) / 2], false],          // top
    [[w - 2 * b, b, K.d - b - K.backPanel], [0, ys + b / 2, (zi + zf) / 2], true], // shelf under the flap = the cavity floor
    [[w - 2 * b, h - yb - 2 * b, K.backPanel], [0, (yi0 + yi1) / 2, z0 + K.backPanel / 2], true], // back
    [[b, ys - yi0, K.d - b - K.backPanel], [doorX, (yi0 + ys) / 2, (zi + zf) / 2], true], // divider behind the door's edge
    [[b, ys - yi0, K.d - b - K.backPanel], [K.cubbyDivider, (yi0 + ys) / 2, (zi + zf) / 2], true], // between the cubby columns
    [[xi1 - doorX - b / 2, b, K.d - b - K.backPanel], [(doorX + b / 2 + xi1) / 2, K.cubbyShelf + b / 2, (zi + zf) / 2], true], // cubby shelf
  ];
  const legs = [-1, 1].flatMap(sx => [z0 + K.leg, zf - K.leg].map(z => [sx * (w / 2 - K.leg), z]));
  const cub = (xa, xb, ya, yb2) => ({ x0: xa, x1: xb, y0: ya, y1: yb2, z0: zi, z1: z1 });
  const flapL = h - ys - K.gap, flapW = w - 2 * K.gap;
  return {
    outer: { x0, x1, y0: 0, y1: h, z0, z1 },
    boards, legs, legH: yb,
    upper: { x0: xi0, x1: xi1, y0: ys + b, y1: yi1, z0: zi, z1: zf },               // the cavity behind the flap
    lower: { x0: xi0, x1: doorX - b / 2, y0: yi0, y1: ys, z0: zi, z1: zf },          // the computer compartment behind the door
    cubbies: [cub(doorX + b / 2, K.cubbyDivider - b / 2, yi0, K.cubbyShelf), cub(K.cubbyDivider + b / 2, xi1, yi0, K.cubbyShelf),
      cub(doorX + b / 2, K.cubbyDivider - b / 2, K.cubbyShelf + b, ys), cub(K.cubbyDivider + b / 2, xi1, K.cubbyShelf + b, ys)],
    // fronts: the pivot sits on the hinge line on the outer face; the leaf runs +y (flap) / +x (door) and back -z by `b`
    flap: { hinge: [0, ys, z1], size: [flapW, flapL, b] },
    door: { hinge: [x0 + K.gap, yb + K.gap, z1], size: [K.door - 1.5 * K.gap, ys - yb - 2 * K.gap, b] },
    // fully open, the flap's inner face is a writing surface level with the cavity floor
    desk: { x0: -flapW / 2 + .03, x1: flapW / 2 - .03, z0: z1 + .03, z1: z1 + flapL - .03, y: ys + b },
    footprint: [{ x0: x0 - .01, x1: x1 + .01, z0, z1: z1 + .01 }],
  };
}

/** The flap turned `a` rad open about its hinge: its leaf's outline (local [x, z]) seen from above. */
export function flapOutline(L, a) {
  const { hinge: [, , z], size: [fw, fl] } = L.flap, reach = fl * Math.sin(a);
  return [[-fw / 2, z], [-fw / 2, z + reach], [fw / 2, z + reach], [fw / 2, z]];
}
/** The top surface height and forward reach of the flap's leaf at opening angle `a` rad (0 = shut, π/2 = flat). */
export function flapTop(L, a) {
  const { hinge: [, y, z], size: [, fl, t] } = L.flap;
  return { y: y + fl * Math.cos(a) + t * Math.sin(a), reach: z + fl * Math.sin(a) };
}
/** Where the door's free edge is (local [x, z]) at opening angle `a` rad. */
export function doorEdge(L, a) {
  const { hinge: [x, , z], size: [dw] } = L.door;
  return [x + dw * Math.cos(a), z + dw * Math.sin(a)];
}

/** Axis-aligned bounds of every device in its compartment, from TILLY_DESK: [name, region, {x0..z1}]. */
export function deviceBoxes(C) {
  const box = (size, at) => ({ x0: at[0] - size[0] / 2, x1: at[0] + size[0] / 2, y0: at[1] - size[1] / 2, y1: at[1] + size[1] / 2, z0: at[2] - size[2] / 2, z1: at[2] + size[2] / 2 });
  const L = berdiLayout(C), floor = L.upper.y0, out = [];
  for (const [i, M] of C.monitors.entries()) {
    out.push([`monitor ${i}`, 'upper', box(M.size, M.at)]);
    out.push([`stand ${i}`, 'upper', box(C.stand.foot, [M.at[0], floor + C.stand.foot[1] / 2, C.stand.z])]);
    out.push([`pole ${i}`, 'upper', box([C.stand.r * 2, M.at[1] - floor, C.stand.r * 2], [M.at[0], (M.at[1] + floor) / 2, M.at[2] - M.size[2] / 2 - C.stand.r])]);
  }
  out.push(['webcam', 'upper', box(C.webcam.size, C.webcam.at)]);
  out.push(['ring light', 'upper', box([2 * (C.ring.r + C.ring.tube), 2 * (C.ring.r + C.ring.tube), 2 * C.ring.tube], C.ring.at)]);
  out.push(['mat', 'upper', box(C.mat.size, C.mat.at)], ['keyboard', 'upper', box(C.keyboard.size, C.keyboard.at)]);
  out.push(['mouse', 'upper', box(C.mouse.scale.map(v => 2 * v), C.mouse.at)]);
  out.push(['puck', 'upper', box([2 * C.puck.r, C.puck.h, 2 * C.puck.r], C.puck.at)], ['charger', 'upper', box([2 * C.charger.r, C.charger.h, 2 * C.charger.r], C.charger.at)]);
  out.push(['headphone hook', 'upper', box([2 * C.hook.tube, 2 * (C.hook.r + C.hook.tube), 2 * (C.hook.r + C.hook.tube)], [C.hook.x, C.hook.y, C.hook.z])]);
  out.push(['led strip', 'upper', box(C.led.size, C.led.at)]);
  out.push(['wall wash', 'upper', box([C.led.glow[0], C.led.glow[1], 0], [0, C.led.washY, L.upper.z0 + C.detail.glowGap])]);
  out.push(['computer box', 'lower', box(C.pc.size, C.pc.at)]);
  for (const [i, s] of C.speakers.at.entries()) out.push([`speaker ${i}`, `cubby ${i}`, box(C.speakers.size, s)]);
  out.push(['dac', 'cubby 2', box(C.dac.size, C.dac.at)]);
  out.push(['mascot', 'cubby 2', box(C.figure.scale.map(v => 2 * v), C.figure.at)]);
  return out;
}
/** The region named in deviceBoxes. */
export const regionOf = (L, name) => name === 'upper' ? L.upper : name === 'lower' ? L.lower : L.cubbies[Number(name.split(' ')[1])];
export const within = (a, r, eps = 1e-9) => a.x0 >= r.x0 - eps && a.x1 <= r.x1 + eps && a.y0 >= r.y0 - eps && a.y1 <= r.y1 + eps && a.z0 >= r.z0 - eps && a.z1 <= r.z1 + eps;
