import { GYM_PUMP as C } from './config.js';

/** Cosmetic progress, independent of points and daily award caps. Future/corrupt timestamps grant nothing. */
export function pumpAt(record, now = Date.now()) {
  if (!record || !Number.isFinite(record.value) || !Number.isFinite(record.at) || record.at < 0 || record.at > now) return 0;
  return Math.max(0, Math.min(1, record.value) - (now - record.at) / (C.decayHours * 3600000));
}
export function creditPump(record, reps, now = Date.now()) {
  const n = Number.isSafeInteger(reps) && reps > 0 ? reps : 0;
  return { value: Math.min(1, pumpAt(record, now) + n / C.repsToFull), at: now };
}
/** A hundred bounded steps on the wire; legacy / malformed input clears the cosmetic. */
export const pumpWire = value => Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 100) / 100 : 0;
/** Sample at most four times/minute, also while offline; no per-frame buffer or storage writes. */
export function pumpSampler(record, clock = Date.now) {
  let next = -Infinity, value = 0;
  return () => { const now = clock(); if (now >= next || now < next - C.sampleMs) { value = pumpWire(pumpAt(record(), now)); next = now + C.sampleMs; } return value; };
}
/** Smooth radial bulge in shoulder-local Y. Zero at shoulder/elbow; forearm bones are never marked. */
export function armPumpShape(y, length) {
  const t = -y / length;
  if (t <= 0 || t >= 1) return [0, 0];
  return [Math.sin(Math.PI * t) ** 2, -Math.PI / length * Math.sin(2 * Math.PI * t)];
}
