// Small plan view (bottom left; top right on touch) with the visitor's position and heading.
// Built from the room maps (rooms.js): walls dark, the current room highlighted.

const PX = 1; // canvas pixels per 5 cm cell

export class Minimap {
  constructor(canvas, roomMaps) {
    this.canvas = canvas;
    this.maps = roomMaps;
    const m = roomMaps[0];
    canvas.width = m.nx * PX;
    canvas.height = m.nz * PX;
    this.g = canvas.getContext('2d');
    this.cache = new Map(); // `${level}:${room}` → ImageData background
  }

  background(level, room) {
    const key = `${level}:${room}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const m = this.maps[level];
    const img = this.g.createImageData(m.nx, m.nz);
    for (let c = 0; c < m.nx * m.nz; c++) {
      const o = m.owner[c];
      const col = m.blocked[c] ? [36, 55, 63, 255]
        : o < 0 ? [0, 0, 0, 0]
          : m.rooms[o].name === room ? [126, 196, 222, 235] : [245, 245, 240, 215];
      img.data.set(col, c * 4);
    }
    this.cache.set(key, img);
    return img;
  }

  /** level 0/1 (or −1 outside: shows the ground floor), plan position, yaw (camera rotation.y). */
  draw(level, room, x, z, yaw) {
    const lv = Math.max(0, level), m = this.maps[lv];
    this.g.putImageData(this.background(lv, room), 0, 0);
    const px = (x / m.size.x) * this.canvas.width, pz = (z / m.size.z) * this.canvas.height;
    const g = this.g;
    g.save();
    g.translate(px, pz);
    g.rotate(-yaw); // yaw 0 looks north (−z = up on the map)
    g.fillStyle = '#d23a2a';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -9); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath();
    g.stroke(); g.fill();
    g.restore();
  }
}
