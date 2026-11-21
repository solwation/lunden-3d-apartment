// Convert the web reference cameras, solar ephemeris and room lighting anchors to Unreal cm.
import { readFile, writeFile } from 'node:fs/promises';
import { sunDirection } from '../../src/daycycle.js';
import { webToUnreal, webYawToUnrealYaw } from './coordinates.mjs';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url)));
const views = await read('../../unreal/Lunden/Tests/views.json');
if (!process.argv[2] || !process.argv[3]) throw Error('Usage: node tools/unreal-engine/pilot-scene.mjs measurements.json output.json');
const measurements = JSON.parse(await readFile(process.argv[2]));
if (measurements.formatVersion !== 1) throw Error('Expected v1 import measurements.');
const { width, height } = views.viewport;
const radians = deg => deg * Math.PI / 180;
const degrees = rad => rad * 180 / Math.PI;
const horizontalFov = degrees(2 * Math.atan(Math.tan(radians(views.verticalFovDeg / 2)) * width / height));
const { year, month, day } = views.date;
const doy = (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86400000;

const lighting = {};
for (const [name, preset] of Object.entries(views.lighting)) {
  const sun = sunDirection(preset.hour, doy);
  // DirectionalLight points away from the sun, into the scene.
  lighting[name] = { ...preset, sunPitch: -degrees(Math.asin(sun.y)), sunYaw: degrees(Math.atan2(-sun.z, -sun.x)) };
}
const lamps = measurements.lights.filter(lamp => lamp.kind === 'room').map((lamp, index) => ({
  id: index, room: lamp.room, level: lamp.level, xyz: lamp.position.unreal, color: lamp.color,
  // Web room intensities are relative; this is the pilot's renderer-side photometric calibration.
  candela: 7 * lamp.intensity
}));
if (!lamps.length) throw Error('Import contains no room light anchors.');
const shotSet = process.env.LUNDEN_CAPTURE_SHOTS ? JSON.parse(await readFile(process.env.LUNDEN_CAPTURE_SHOTS)) : null;
let poses = views.views;
if (shotSet) {
  const cameraIds = new Set(shotSet.shots.map(shot => shot.camera));
  poses = [...views.views, ...shotSet.views].filter(view => cameraIds.has(view.id));
  if (new Set(poses.map(view => view.id)).size !== cameraIds.size) throw Error('Shot set references a missing camera.');
} else if (process.env.LUNDEN_CAPTURE_VIEWS) {
  poses = JSON.parse(await readFile(process.env.LUNDEN_CAPTURE_VIEWS));
}
const cameras = poses.map(v => ({ id: v.id, lighting: v.lighting,
  xyz: webToUnreal([v.x, v.feetY + views.standingEyeHeightM, v.z]), yaw: webYawToUnrealYaw(v.yawDeg), pitch: v.pitchDeg }));
await writeFile(process.argv[3], JSON.stringify({ ...views.viewport, spawnZ: measurements.spawn.start.unreal[2] + 50 * measurements.spawn.player.headroom, verticalFov: views.verticalFovDeg, horizontalFov, cameras, lighting, lamps, ...(shotSet && {shots: shotSet.shots, settleFacade: shotSet.settleFacade}) }, null, 2) + '\n');
