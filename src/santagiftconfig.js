// Gameplay sizes/poses, guessed to fit a small present in the ordinary hand (#1409/#1410).
export const SANTA_GIFTS = {
  pool: ['car', 'crayons', 'crystal'],
  size: [0.16, 0.12, 0.14], ribbon: 0.022,
  held: [0.14, -0.19, -0.36], heldRotation: [0.25, -0.3, 0],
  handReach: 0.7, floorLift: 0.002,
  // Only horizontal package tops support a pile; tolerances are gameplay guesses in metres.
  stack: { topNormal: 0.99, tolerance: 0.005, gap: 0.001 },
};
