// #2372. The painted party wall receives both the pendant and light from the real living-room window.
// Sample the latter with the web shader's own area source, closed-door rays, blinds and curtain transmission.
import { LEVELS, LIGHTING, WINDOW_LIGHT } from '../../src/config.js';
import { castWindow, homeRegion, windowIrradiance, windowPass } from '../../src/windowlight.js';

export function livingWallLight(world) {
  const room = 'Vardagsrum', level = 0;
  const lamp = LIGHTING.pendants.find(p => p.level === level && p.room === room && p.replaces);
  const bounds = world.roomMaps[level].regionBoundsAt(lamp.x, lamp.z), region = homeRegion(world);
  const segments = world.levels[level].wallSegments;
  const east = segments.filter(([x0, z0, x1, z1]) => Math.abs(x1 - x0) < 1e-6 && x0 > lamp.x
    && Math.min(z0, z1) <= lamp.z && lamp.z <= Math.max(z0, z1))
    .sort((a, b) => a[0] - b[0])[0];
  if (!east) throw Error('Living room: missing east wall');
  const [x, a, , b] = east;
  // The plan splits the same painted face at z=11.639 m. Follow adjoining edges up to the south façade.
  let end = Math.max(a, b);
  const edges = segments.filter(([x0,,x1]) => Math.abs(x0 - x) < 1e-6 && Math.abs(x1 - x) < 1e-6)
    .map(([,z0,,z1]) => [Math.min(z0, z1), Math.max(z0, z1)]).sort((a, b) => a[0] - b[0]);
  for (const [from, to] of edges) if (from <= end + 1e-6) end = Math.max(end, to);
  const z0 = Math.max(Math.min(a, b), bounds.z0), z1 = Math.min(end, region.box.z1);
  const y0 = LEVELS[level].floor, y1 = world.levels[level].ceiling;
  const sources = region.sources.filter(s => s.level === level && !s.well);
  const window = sources.filter(s => s.facade === 'south').sort((a, b) => Math.abs(a.x-lamp.x) - Math.abs(b.x-lamp.x))[0];
  if (!window || !(z1 > z0 && y1 > y0)) throw Error('Living room: missing glass or wall extent');
  const walls = region.segs(level);
  for (const s of sources) {
    castWindow(s, walls);
    s.pass = windowPass(s, world.blinds.list, world.blinds.curtains);
  }
  // At most 25 cm between samples. Store sky and warm floor bounce together for one local diffuse light.
  const columns = Math.ceil((z1 - z0) / 0.25) + 1, rows = Math.ceil((y1 - y0) / 0.25) + 1, field = [];
  const normal = {x: -1, y: 0, z: 0};
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const p = {x, y: y0 + (y1 - y0) * j / (rows - 1), z: z0 + (z1 - z0) * i / (columns - 1)};
    field.push(+sources.reduce((e, s) => e + windowIrradiance(s, p, normal, s.pass), 0).toFixed(6));
  }
  return {wall: [x, z0, y0, z1, y1], emitter: [window.x, window.z, window.y], glass: [2 * window.hw, 2 * window.hh],
    columns, rows, field, gain: WINDOW_LIGHT.gain, tint: WINDOW_LIGHT.warm,
    hemiClear: LIGHTING.sky.clear.hemi, hemiOvercast: LIGHTING.sky.overcast.hemi};
}
