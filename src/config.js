// Everything the PDF does not tell us. Values marked "guess" should be verified
// against Peab's drawings/photos (see GitHub issues) and adjusted here.

export const SLAB = 0.25; // floor slab thickness between the levels (guess)

export const LEVELS = [
  // Entréplan: "Takhöjd ca 3,0 m. Lokalt lägre över tvätt."
  { name: 'Entréplan', floor: 0, ceiling: 3.0 },
  // Övre plan: "Takhöjd ca 2,8 m. Lokalt ca 2,4 m vid sovrummens fönster."
  { name: 'Övre plan', floor: 3.0 + SLAB, ceiling: 2.8 },
];

// Lowered ceilings (soffits), in plan metres relative to the level's floor.
// x/z ranges are clipped to the interior by the walls anyway.
export const SOFFITS = [
  // Over the laundry (installations). Height is a guess.
  { level: 0, x0: 0.2, x1: 2.06, z0: 3.05, z1: 4.93, height: 2.4 },
  // Sovrum 3 + Sovrum 1 along the north façade: the access balcony (loftgång) above
  // lowers the ceiling to ~2.4 m. Depth from the façade is a guess.
  { level: 1, x0: 0.2, x1: 5.55, z0: 0.46, z1: 0.46 + 1.4, height: 2.4 },
];

export const DOOR_HEIGHT = 2.1;

// Window sill/head heights above the level's floor (guess).
export const WINDOW = [
  { sill: 0.6, head: 2.4 },
  { sill: 0.8, head: 2.2 },
];

// Fixed cabinet heights by plan label (fallback: kitchen base cabinet).
export const CABINET_HEIGHT = {
  EL: 2.1, G: 2.1, L: 2.1, 'U/M': 2.1, K: 2.1, F: 2.1,
  TT: 0.85, TM: 0.85, DM: 0.9,
};
export const BASE_CABINET = 0.9;
export const SHELF_HEIGHT = 2.0; // unlabelled shelving in the upstairs Klk

export const PLAYER = {
  eye: 1.62,
  radius: 0.22,
  walk: 1.6,   // m/s
  run: 3.2,
  stepUp: 0.45,
  headroom: 1.85,
};

// Two flights with winders between them (from the stair outline on both plans).
// Flight A runs east along the south half, winders turn 180° at the east end,
// flight B runs west along the north half and arrives in the upstairs hall.
export const STAIR = {
  aX0: 3.50,                 // bottom step (Entréplan plan)
  aZ: [6.72, 7.54],
  center: [4.645, 6.654],    // winder pivot (Övre plan plan)
  winderX1: 5.49,
  winderZ: [5.77, 7.54],
  bX1: 3.86,                 // top step (Övre plan stair outline)
  bZ: [5.77, 6.60],
  treads: { a: 4, w: 8, b: 3 },
  // Upstairs slab opening = stair outline on Övre plan.
  hole: { x0: 3.86, x1: 5.49, z0: 5.77, z1: 7.54 },
  railHeight: 0.9,
};

export const COLORS = {
  sky: 0xbfd8ea,
  wall: 0xf3f1ec,
  ceiling: 0xfbfbf9,
  floor: 0xc9a77c,
  tile: 0xd6d9da,
  cabinet: 0xe8ebec,
  counter: 0x5b5f62,
  appliance: 0xf7f7f7,
  porcelain: 0xffffff,
  frame: 0xf5f5f5,
  glass: 0xa9cce3,
  door: 0xefeeea,
  rail: 0x6b7378,
  stair: 0xb89467,
  grass: 0x7fa65c,
  patio: 0xbdb7ab,
  hedge: 0x46703a,
  fence: 0x8a7a66,
  neighbour: 0xd9d2c5,
};
