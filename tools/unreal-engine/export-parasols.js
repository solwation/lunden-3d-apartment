// #2403: describe the actual source canopy and its existing runtime rule. No native controller is built here.
import { PARASOL_FOLD } from '../../src/patio.js';
import { PATIO } from '../../src/config.js';

export function parasolPose(row, fraction) {
  const e = fraction * fraction * (3 - 2 * fraction);
  const radius = PARASOL_FOLD.radius + (row.radius - PARASOL_FOLD.radius) * e;
  const height = PARASOL_FOLD.height + (PARASOL_FOLD.openHeight - PARASOL_FOLD.height) * e;
  return { position: [...row.position], scale: [radius, height, radius], rotationX: row.tilt * e };
}

export function parasolRows(profiles, names, atoms) {
  return profiles.flatMap(p => {
    const atom = atoms.find(a => a.object === p.object);
    if (!atom) return []; // a partial export without the patio has no canopy contract
    const mesh = names.get(p.canopy);
    if (!mesh || atom.zone !== 'l1007-uteplats' || !p.canopy.geometry?.attributes?.uv1) {
      throw Error('Parasol canopy/cloth UVs missing from patio export: ' + atom.id);
    }
    const row = { id: atom.id, mesh, zone: atom.zone, radius: p.radius, tilt: p.tilt,
      position: p.canopy.position.toArray(), exportedOpen: p.open };
    return [{ ...row, folded: parasolPose(row, 0), opened: parasolPose(row, 1),
      rule: { months: [...PATIO.parasol.months], ...PARASOL_FOLD,
        sunComparison: '>', overcastComparison: '<=', easing: 'f*f*(3-2*f)',
        manual: 'holds until automatic state changes', first: 'snap to target' },
      geometry: 'unit cone; apex at local origin, base y=-1; pose is local to the furniture root',
      uv: 'source cloth metre UV1 stays fixed while folding; GLB keeps its existing UV0 (no material-choice port)',
      source: 'src/patio.js parasol, setParasol, updateParasols; src/config.js PATIO.parasol',
      scope: 'export contract only; Unreal import tag, runtime controller and native acceptance remain #2403' }];
  });
}
