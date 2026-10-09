// L1201's floor plan (#573), in data/plan.json's format, for world.js `buildLevel`. READ off Peab's bofakta sheet
// docs/peab/bostader/bofakta-l1201.pdf (2024-11-08, FOJAB, 1:100 on A4: 28.3465 PDF units per metre; checked against the
// sheet's own figures: the entrance floor 6.01 × 11.10 m outside, the upper floor 9.20 m deep), from the sheet's vector
// paths (the black wall fills, the door swings' arcs, cabinet and fixture rectangles) — drawing measures, ±1–2 cm, not
// construction dimensions. The base plan with Allrum (the issue: the third bedroom is the alternative plan).
// Coordinates: x = metres east of (the flat's east outer face − 5.75) = Hus L's `ox` of its slot, like HUS_L.street's
// L1201 openings (so the west gable is at x −0.26); z = metres south of the upper flats' street face (world z − 1.57,
// HUS_L.loftgangDepth). Level 0 = its entrance floor on våning 3, level 1 = våning 4.
// Left out on purpose: the sheet's loose furniture (beds, table, sofa, armchairs), the dashed bathtub (a tillval: the
// standard is the shower drawn beside it), the tillval klinker line (KL), VS / IL hatches and the ELC (inside the walls).

const R = (x0, x1, z0, z1) => ({ outer: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] });
const W = 5.749;

const lower = {
  name: 'Entréplan (våning 3)',
  size: { x: W, z: 11.099 },
  walls: [
    R(-0.258, 0.2, 0, 11.099),                                   // the west gable (thicker: the end flat)
    R(0.2, 0.8, 0, 0.365), R(1.81, 3.045, 0, 0.365), R(4.655, W, 0, 0.365), // street wall (front door, kitchen window)
    R(5.55, W, 0.365, 10.634), R(5.367, 5.55, 3.044, 6.11),      // party wall east, thicker behind the kitchen run
    R(0.2, 0.85, 10.634, 11.099), R(2.06, 3.04, 10.634, 11.099), R(4.65, W, 10.634, 11.099), // courtyard wall (two windows)
    R(2.24, 2.36, 0.365, 1.695),                                 // hall | kitchen
    R(0.2, 0.408, 1.575, 3.315), R(0.408, 1.108, 1.575, 1.695),  // the VS niche, the hall's south wall
    R(0.2, 1.158, 3.315, 3.41), R(2.068, 3.445, 3.315, 3.41),    // the bathroom's north wall (its door between)
    R(2.675, 2.845, 3.41, 6.11),                                 // bathroom | the tall kitchen units
    R(0.2, 2.675, 6.005, 6.205), R(2.675, 3.445, 6.11, 6.205), R(4.766, 5.55, 6.11, 6.205), // bathroom / Klk | living room
    R(0.2, 0.8, 5.605, 6.005),                                   // a shaft in the bathroom's SW corner
    R(2.16, 2.28, 6.205, 6.255), R(2.16, 2.28, 7.065, 7.115),    // the Klk under the stair: its door's jambs
    R(1.107, 2.28, 7.115, 7.21),                                 // the Klk's south wall (between the stair's flights)
    R(0.2, 2.28, 8.091, 8.195),                                  // the wall between the lower flight and the open void
  ],
  windows: [
    { x0: 3.045, x1: 4.655, z0: 0, z1: 0.365 },                  // kitchen, to the loftgång
    { x0: 0.85, x1: 2.06, z0: 10.634, z1: 11.099 }, { x0: 3.04, x1: 4.65, z0: 10.634, z1: 11.099 }, // living room
  ],
  doors: [
    { hinge: [0.86, 0.12], tip: [0.86, -0.77], wall: [1.75, 0.12], optional: false },      // front door, opens out
    { hinge: [1.218, 3.315], tip: [1.218, 2.525], wall: [2.008, 3.315], optional: false }, // bathroom
    { hinge: [2.28, 6.315], tip: [2.97, 6.315], wall: [2.28, 7.005], optional: false },    // Klk (ST)
  ],
  sliding: [],
  cabinets: [
    { label: 'TT', x0: 0.2, x1: 0.8, z0: 3.46, z1: 4.06 }, { label: 'TM', x0: 0.2, x1: 0.8, z0: 4.06, z1: 4.66 },
    // the tall column facing east: fridge, freezer, a tall cupboard, oven + microwave
    { label: 'K', x0: 2.845, x1: 3.445, z0: 3.41, z1: 4.06 }, { label: 'F', x0: 2.845, x1: 3.445, z0: 4.06, z1: 4.66 },
    { label: null, x0: 2.845, x1: 3.445, z0: 4.66, z1: 5.5 }, { label: 'U/M', x0: 2.845, x1: 3.445, z0: 5.5, z1: 6.11 },
    // the base run on the east wall facing west: hob, cupboard, sink, dishwasher
    { label: null, x0: 4.767, x1: 5.367, z0: 2.93, z1: 3.85 }, { label: null, x0: 4.767, x1: 5.367, z0: 3.85, z1: 4.76 },
    { label: null, x0: 4.767, x1: 5.367, z0: 4.76, z1: 5.61 }, { label: 'DM', x0: 4.767, x1: 5.367, z0: 5.61, z1: 6.11 },
  ],
  fixtures: [
    { kind: 'hob', x0: 4.82, x1: 5.32, z0: 3.13, z1: 3.73 },
    { kind: 'sink', x0: 4.85, x1: 5.15, z0: 4.95, z1: 5.45 },
    { kind: 'sink', x0: 2.25, x1: 2.675, z0: 3.56, z1: 4.16 },   // the bathroom's basin, on its east wall
    { kind: 'toilet_tank', x0: 2.45, x1: 2.675, z0: 4.53, z1: 4.89 }, { kind: 'toilet_bowl', x0: 1.96, x1: 2.5, z0: 4.53, z1: 4.89 },
    { kind: 'shower', x0: 1.78, x1: 2.675, z0: 5.11, z1: 6.005 },
  ],
  rooms: [
    { name: 'Hall', x: 0.9, z: 0.9 }, { name: 'Kök / matplats', x: 3.9, z: 1.6 }, { name: 'Badrum', x: 1.3, z: 4.4 },
    { name: 'Klk', x: 1.4, z: 6.6 }, { name: 'Vardagsrum', x: 3.9, z: 9.0 },
  ],
  site: {},
};

const upper = {
  name: 'Övre plan (våning 4)',
  size: { x: 5.755, z: 9.199 },
  walls: [
    R(-0.259, 0.206, 0, 9.199),
    R(0.206, 0.806, 0, 0.365), R(2.415, 3.345, 0, 0.365), R(4.555, 5.755, 0, 0.365), // street wall (two bedroom windows)
    R(5.555, 5.755, 0.365, 8.835),
    R(0.206, 0.656, 8.835, 9.199), R(1.665, 3.046, 8.835, 9.199), R(4.055, 5.755, 8.835, 9.199), // set-back wall: window, terrace door
    R(3.046, 3.14, 0.365, 4.59),                                 // Sovrum 1 | Sovrum 2
    R(1.946, 2.185, 4.59, 4.71), R(2.995, 3.191, 4.59, 4.71), R(4.0, 4.335, 4.59, 4.71), // the bedrooms' door wall
    R(0.206, 1.0, 3.665, 3.76), R(1.81, 1.946, 3.665, 3.76), R(1.851, 1.946, 3.76, 4.71), // the Klk's (sliding opening)
    R(2.001, 2.095, 4.71, 5.305), R(1.875, 2.095, 5.305, 6.005), // the Klk's east wall on to the stair
    R(0.206, 0.687, 5.305, 6.005),                               // a shaft (schakt) in the Klk's corner
    R(0.206, 2.095, 6.005, 6.205),                               // north of the stair
    R(4.24, 5.555, 3.645, 3.84), R(4.24, 4.335, 3.84, 4.59), R(4.19, 4.335, 4.71, 5.18), R(4.215, 4.335, 5.99, 6.205), // WC/dusch
    R(4.335, 5.555, 6.11, 6.205),
  ],
  windows: [
    { x0: 0.806, x1: 2.415, z0: 0, z1: 0.365 }, { x0: 3.345, x1: 4.555, z0: 0, z1: 0.365 }, // Sovrum 1, Sovrum 2
    { x0: 0.656, x1: 1.665, z0: 8.835, z1: 9.199 },              // over the open void (BH 1.2)
  ],
  doors: [
    { hinge: [2.936, 4.59], tip: [2.935, 3.9], wall: [2.245, 4.59], optional: false }, // Sovrum 1
    { hinge: [3.251, 4.59], tip: [3.25, 3.9], wall: [3.94, 4.59], optional: false },   // Sovrum 2
    { hinge: [4.215, 5.93], tip: [3.525, 5.93], wall: [4.215, 5.24], optional: false }, // WC/dusch
    { hinge: [3.99, 9.0], tip: [3.99, 9.88], wall: [3.11, 9.0], optional: false },      // the terrace door, opens out
  ],
  sliding: [{ a: [1.0, 3.71], b: [1.81, 3.71], arrow: { head: [1.36, 3.65], tail: [0.48, 3.65] } }], // Klk
  cabinets: [
    { label: 'A', x0: 0.206, x1: 0.58, z0: 4.7, z1: 5.3 },       // the ventilation unit's cupboard (A)
    { label: 'LH', x0: 0.687, x1: 1.85, z0: 5.71, z1: 6.0 },     // linen shelving (L, on a hanging system)
  ],
  fixtures: [
    { kind: 'shower', x0: 4.335, x1: 5.555, z0: 3.84, z1: 4.63 },
    { kind: 'toilet_tank', x0: 5.38, x1: 5.555, z0: 4.76, z1: 5.11 }, { kind: 'toilet_bowl', x0: 4.87, x1: 5.4, z0: 4.76, z1: 5.11 },
    { kind: 'sink', x0: 5.2, x1: 5.555, z0: 5.42, z1: 5.85 },
  ],
  rooms: [
    { name: 'Sovrum 1', x: 1.3, z: 1.8 }, { name: 'Sovrum 2', x: 4.2, z: 1.8 }, { name: 'Klk', x: 1.2, z: 4.3 },
    { name: 'WC/dusch', x: 4.9, z: 5.2 }, { name: 'Allrum', x: 3.2, z: 7.2 },
  ],
  site: {},
};

export const L1201_PLAN = { floors: [lower, upper] };
