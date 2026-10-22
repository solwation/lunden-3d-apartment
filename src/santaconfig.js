// The Christmas Eve visit times are requested; model proportions and animation timings are visual guesses (metres/seconds).
export const SANTA = {
  month: 12, date: 24, arrives: 15, sleeps: 16, leaves: 21,
  seatIndex: 1,
  // Visual anatomy guesses; front is supplied from the actual LANDSKRONA depth.
  hat: { radius: 0.16, height: 0.36, bend: 0.16, drop: 0.10 },
  legs: { radius: 0.09, clearance: 0.035, thighY: 0.10, kneeY: 0.065, bootY: 0.075, bootH: 0.075, spread: 0.16 },
  size: { belly: [0.33, 0.36, 0.28], head: 0.15, beard: [0.2, 0.21, 0.13] },
  sip: { every: 14, seconds: 3.2, arm: 1.9, inward: 0.5, glassRest: [-0.28, 0.31, 0.4], glassMouth: [-0.08, 0.78, 0.25], tilt: -0.8 },
  sleep: { x: 0.65, y: 0.23, z: 0.04, breathe: 0.008, text: [0.64, 0.22], textSeconds: 2.8, textRise: 0.4 },
  greetingSeconds: 2.5,
  laugh: { seconds: 0.8, beats: 3, gap: 0.23, duration: 0.18, hz: 145, gain: 0.28 },
};

/** Game calendar, half-open intervals: sitting 15–16, sleeping 16–21, absent otherwise. */
export function santaState(day) {
  if (day.month !== SANTA.month || day.date !== SANTA.date) return 'away';
  if (day.hour >= SANTA.arrives && day.hour < SANTA.sleeps) return 'sitting';
  if (day.hour >= SANTA.sleeps && day.hour < SANTA.leaves) return 'sleeping';
  return 'away';
}
