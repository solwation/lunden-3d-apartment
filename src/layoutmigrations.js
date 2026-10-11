import { FURNITURE } from './config.js';

// #493: the old single root could move every Tilly poster off its wall.
// New per-art ids deliberately cannot collide with that old group id.
export const LEGACY_POSTER_GROUP = 'f-kposters-1-0-0-0-0';
export function migratePosterLayout(state) {
  if (!state?.pieces || !Object.hasOwn(state.pieces, LEGACY_POSTER_GROUP)) return state;
  const pieces = { ...state.pieces };
  delete pieces[LEGACY_POSTER_GROUP];
  return { ...state, revision: state.revision + 1, pieces,
    migrations: { ...state.migrations, individualPosters: 1 } };
}

// #692: the former Verona L sofa had one saved pose. Carry that rigid transform to all three
// new movable roots once, then retire the old id. Keeping the new ids from FURNITURE here lets
// both the client cache and the shared-layout endpoint perform exactly the same migration.
export function migrateVeronaLayout(state) {
  const oldId = Object.keys(state?.pieces ?? {}).find((id) => id.startsWith('f-veronasofa-0-4.29-13.09-'));
  if (!oldId || state.migrations?.veronaModules) return state;
  const parts = FURNITURE.filter((item) => item.type === 'veronasofa' && item.part);
  if (parts.length !== 3) return state;
  const ids = parts.map((item) => `f-veronasofa-${item.level}-${item.x}-${item.z}-0-0`);
  const pieces = { ...state.pieces }, old = pieces[oldId];
  delete pieces[oldId];
  if (!ids.some((id) => Object.hasOwn(pieces, id))) {
    const oldPos = [4.29, 0, 13.09], oldYaw = Math.PI;
    const pos = Array.isArray(old?.pos) && old.pos.length === 3 ? old.pos : oldPos;
    const q = Array.isArray(old?.quat) && old.quat.length === 4 ? old.quat : [0, 1, 0, 0];
    const savedYaw = Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] ** 2 + q[0] ** 2));
    const turn = savedYaw - oldYaw;
    const moved = Math.hypot(pos[0] - oldPos[0], pos[1] - oldPos[1], pos[2] - oldPos[2]) > 0.001 || Math.abs(turn) > 0.001;
    if (moved) {
      const c = Math.cos(turn), s = Math.sin(turn);
      parts.forEach((item, i) => {
        const dx = item.x - oldPos[0], dz = item.z - oldPos[2];
        const x = pos[0] + c * dx + s * dz, z = pos[2] - s * dx + c * dz;
        const yaw = (item.rot ?? 0) * Math.PI / 180 + Math.PI + turn;
        pieces[ids[i]] = { pos: [x, pos[1] + (item.y ?? 0), z], quat: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], revision: state.revision + 1 };
      });
    }
  }
  return { ...state, revision: state.revision + 1, pieces,
    migrations: { ...state.migrations, veronaModules: 1 } };
}
