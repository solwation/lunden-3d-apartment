// Walking on the roofs (#360): every walkable surface outdoors above the ground — Hus L's loftgång (våning 3, street
// side), the roof terraces (våning 4, courtyard side), Hus L's flat roof with its solar panels, the loft over the lift
// (L1205), the spiral-stair drums' top landings, the Å-husen's hip roofs (you stand on the slope) with their roof boxes
// and vent hoods, the entrance canopies — and the walls that stand on them, each with the height range it blocks.
// The builders (exterior.js, surroundings.js) list them where they build the meshes (`userData.walk`); world.js puts
// them together here. Player: `groundAt` takes the highest surface at or below the feet; up there (`aloft`) the
// collision is `walls(feet + stepUp, feet + headroom)` instead of a level's segments. Walking off an edge is a fall.
//
// A surface: { id, name, x0, x1, z0, z1, y } — a rectangle (plan x/z), or a disk with `r` round (cx, cz); `y` is a
// number (flat) or a function (x, z) → y (a slope). `id` names the roof for the stats (the first visit, SCORE.first.roofs).
// A wall: { s: [ax, az, bx, bz], y0, y1 }: in the way of anyone whose body (feet + step … head) overlaps y0 … y1.

export class Roofs {
  constructor(surfaces = [], walls = []) {
    this.surfaces = surfaces;
    this.list = walls;
  }

  /** Is (x, z) on surface `s`? */
  static on(s, x, z) {
    if (s.r != null) return (x - s.cx) ** 2 + (z - s.cz) ** 2 < s.r * s.r;
    return x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1;
  }

  static height(s, x, z) { return typeof s.y === 'function' ? s.y(x, z) : s.y; }

  /** The highest surface at (x, z) that someone with the feet at `feet` can stand on (≤ feet + `step`), or null. */
  under(x, z, feet = Infinity, step = 0) {
    let best = null, by = -Infinity;
    for (const s of this.surfaces) {
      if (!Roofs.on(s, x, z)) continue;
      const y = Roofs.height(s, x, z);
      if (y <= feet + step && y > by) { by = y; best = s; }
    }
    return best ? { surface: best, y: by } : null;
  }

  /** The highest walkable roof at (x, z), or −∞ (the rain stops there, weather.js). */
  topAt(x, z) {
    let top = -Infinity;
    for (const s of this.surfaces) if (Roofs.on(s, x, z)) top = Math.max(top, Roofs.height(s, x, z));
    return top;
  }

  /** The surface the feet stand on (within `eps`), or null. */
  standingOn(x, z, feet, eps = 0.03) {
    const u = this.under(x, z, feet, eps);
    return u && u.y > feet - eps ? u.surface : null;
  }

  /** Is a surface at (x, z) between y0 and y1 (a roof's edge in the way of a body flying in, the jetpack #359)? */
  blocks(x, z, y0, y1) {
    for (const s of this.surfaces) {
      if (!Roofs.on(s, x, z)) continue;
      const y = Roofs.height(s, x, z);
      if (y > y0 && y < y1) return true;
    }
    return false;
  }

  /** The lowest surface at (x, z) above `y` (a canopy over the head while flying up, #359), or +∞. */
  above(x, z, y) {
    let lo = Infinity;
    for (const s of this.surfaces) if (Roofs.on(s, x, z)) { const h = Roofs.height(s, x, z); if (h > y && h < lo) lo = h; }
    return lo;
  }

  /** The walls in the way of a body from y0 to y1 (collision segments). */
  walls(y0, y1) {
    const out = [];
    for (const w of this.list) if (w.y1 > y0 && w.y0 < y1) out.push(w.s);
    return out;
  }
}

/** Helpers for the builders: a rectangle's outline as walls, a single wall. */
export const wallLine = (out, ax, az, bx, bz, y0, y1) => out.push({ s: [ax, az, bx, bz], y0, y1 });
export const wallRect = (out, x0, x1, z0, z1, y0, y1) => {
  wallLine(out, x0, z0, x1, z0, y0, y1); wallLine(out, x1, z0, x1, z1, y0, y1);
  wallLine(out, x1, z1, x0, z1, y0, y1); wallLine(out, x0, z1, x0, z0, y0, y1);
};
