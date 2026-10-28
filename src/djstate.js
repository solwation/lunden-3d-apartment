// #1664: bounded, shared manual two-deck state. Positions are milliseconds; no timer or per-frame network messages.
export const freshDJ = (volume = 5) => ({ ix: [0, 1], on: [false, false], pos: [0, 0], at: [0, 0], gain: [1, 1], cross: 0, volume, shuffle: false });
export function cleanDJ(m, tracks, steps) {
  if (!m || !['play','track','cross','gain','volume','shuffle','stop'].includes(m.c)) return null;
  const a = { c: m.c };
  if (['play','track','gain'].includes(m.c)) { if (m.s !== 0 && m.s !== 1) return null; a.s = m.s; }
  if (['track','cross','gain','volume'].includes(m.c)) {
    const max = m.c === 'track' ? tracks - 1 : m.c === 'volume' ? steps : 1;
    if (!Number.isFinite(m.v) || m.v < 0 || m.v > max || (['track','volume'].includes(m.c) && !Number.isInteger(m.v))) return null;
    a.v = m.v;
  }
  return a;
}
export function validDJ(d, tracks, steps) {
  return d && ['ix','on','pos','at','gain'].every(k => Array.isArray(d[k]) && d[k].length === 2)
    && d.ix.every(x=>Number.isInteger(x)&&x>=0&&x<tracks) && d.on.every(x=>typeof x==='boolean')
    && d.pos.every(x=>Number.isFinite(x)&&x>=0) && d.at.every(Number.isFinite)
    && d.gain.every(x=>Number.isFinite(x)&&x>=0&&x<=1) && Number.isFinite(d.cross)&&d.cross>=0&&d.cross<=1
    && Number.isInteger(d.volume)&&d.volume>=0&&d.volume<=steps && typeof d.shuffle==='boolean';
}
export function applyDJ(d, a, now) {
  const s = a.s;
  if (a.c === 'play') { if (d.on[s]) d.pos[s] = Math.max(0, now - d.at[s]); else d.at[s] = now - d.pos[s]; d.on[s] = !d.on[s]; }
  else if (a.c === 'track') { d.ix[s] = a.v; d.pos[s] = 0; d.at[s] = now; }
  else if (a.c === 'cross') d.cross = a.v;
  else if (a.c === 'gain') d.gain[s] = a.v;
  else if (a.c === 'volume') d.volume = a.v;
  else if (a.c === 'shuffle') d.shuffle = !d.shuffle;
  else if (a.c === 'stop') { d.on = [false,false]; d.pos = [0,0]; }
  return d;
}
export function snapshotDJ(d, now) { return { ...d, pos: d.pos.map((p,s)=>d.on[s]?Math.max(0,now-d.at[s]):p) }; }
export function djLevel(d, s) { return d.gain[s] * (s ? Math.sin(d.cross * Math.PI / 2) : Math.cos(d.cross * Math.PI / 2)); }
