// #2369. Preserve the sampled visibility polygons that the actual apartment lamp shaders use at the stairs.
import { EXTRA_ROOMS, LEVELS, PLAYER, STAIR } from '../../src/config.js';

export function stairLampProfiles(world, lights) {
  const { hole } = world.openings.slab; // opening extended to the plan's actual inner wall faces by slabOpening()
  const west = Math.min(STAIR.aX0, hole.x0), east = hole.x1;
  const north = Math.min(...STAIR.winderZ, hole.z0), south = Math.max(...STAIR.aZ, hole.z1);
  const label = EXTRA_ROOMS.find(room => room.level === 0 && room.name === 'Hall');
  const passage = world.roomMaps[0].regionBoundsAt(label.x, label.z);
  const bounds = [
    [west, north, LEVELS[0].floor, east, south, LEVELS[1].floor + LEVELS[1].ceiling],
    [passage.x0, passage.z0, LEVELS[0].floor, passage.x1, passage.z1, LEVELS[0].ceiling],
  ];
  const { wash } = lights, vis = wash.uniforms.uLampVis.value.image, profiles = new Map();
  const distanceToInterval = (value, min, max) => Math.max(min - value, value - max, 0);
  wash.entries.forEach(({ lamp, k }, i) => {
    const { x, z, y } = lamp.pos;
    const inRange = bounds.some(([x0, z0, y0, x1, z1, y1]) => Math.hypot(
      distanceToInterval(x, x0, x1), distanceToInterval(z, z0, z1), distanceToInterval(y, y0, y1)) < lamp.range);
    if (!inRange) return;
    const index = (2 * wash.n + i) * 4;
    profiles.set(lamp, { origin: Array.from(wash.data.slice(index, index + 2)), level: lamp.level,
      split: wash.data[index + 3], viewerSplit: LEVELS[0].floor + PLAYER.levelSwitchHeight + PLAYER.eye, canPool: !lamp.shade, weight: k * lamp.intensity,
      rays: Array.from(vis.data.slice(i * vis.width, (i + 1) * vis.width), r => Math.round(r * 1000) / 1000) });
  });
  return { bounds, profiles };
}
