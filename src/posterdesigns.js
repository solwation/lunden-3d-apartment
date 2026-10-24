// #1574: the playhouse's poster motifs, all our own generic drawings (canvas shapes and tiny pixel bitmaps: no real logos, brands, games or artwork).
// Each design draws into a 192 x 256 box; src/playroomposters.js puts them in one atlas. Indices: 0-9 hall mix, 10-18 SPEL (gaming), 19-27 BILJARD/DJ.
const W = 192, H = 256, FONT = 'system-ui,sans-serif';

const bg = (c, a, b, border = '#fff6dc') => {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); g.addColorStop(1, b);
  c.fillStyle = g; c.fillRect(0, 0, W, H); c.strokeStyle = border; c.lineWidth = 5; c.strokeRect(5, 5, W - 10, H - 10);
};
const text = (c, s, y, size, fill, stroke, x = W / 2) => {
  c.font = `900 ${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = size / 6; c.strokeText(s, x, y); }
  c.fillStyle = fill; c.fillText(s, x, y);
};
const disc = (c, x, y, r, fill, stroke) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 2; c.stroke(); } };
const rays = (c, x, y, n, colorA, colorB, r = 300) => {
  for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + .5) / n) * Math.PI * 2; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, a0, a1); c.closePath(); c.fillStyle = i % 2 ? colorA : colorB; c.fill(); }
};
const bitmap = (c, rows, x, y, s, fill) => { c.fillStyle = fill; rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') c.fillRect(x + i * s, y + j * s, s, s); })); };
const INVADER = ['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'];
const CRAB = ['..#.....#..', '#..#...#..#', '#.#######.#', '###.###.###', '###########', '.#########.', '..#.....#..', '.#.......#.'];
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
const ROBOT = ['..#####..', '.#######.', '##.###.##', '#########', '.#######.', '..#...#..', '.###.###.', '.#.....#.'];
const star = (c, x, y, r, fill) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .42 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fillStyle = fill; c.fill(); };
const ball = (c, x, y, r, fill, n) => { disc(c, x, y, r, fill, '#00000055'); if (n != null) { disc(c, x, y, r * .5, '#fff'); text(c, String(n), y + 1, r * .75, '#111', null, x); } disc(c, x - r * .3, y - r * .35, r * .18, '#ffffff99'); };
const note = (c, x, y, s, fill) => { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, s * .6, s * .45, -.4, 0, Math.PI * 2); c.fill(); c.fillRect(x + s * .45, y - s * 1.9, s * .14, s * 1.9); c.fillRect(x + s * .45, y - s * 1.9, s * .8, s * .3); };
const vinyl = (c, x, y, r, label) => { disc(c, x, y, r, '#15151a'); for (let i = 1; i < 5; i++) { c.beginPath(); c.arc(x, y, r * (.45 + i * .1), 0, Math.PI * 2); c.strokeStyle = '#ffffff22'; c.lineWidth = 1; c.stroke(); } disc(c, x, y, r * .32, label); disc(c, x, y, r * .05, '#15151a'); };
const discoBall = (c, x, y, r) => {
  disc(c, x, y, r, '#aab4c4'); c.save(); c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
  for (let i = -6; i < 7; i++) for (let j = -6; j < 7; j++) { c.fillStyle = (i + j) & 1 ? '#f4f8ff' : '#6e7a8e'; c.fillRect(x + i * r / 4, y + j * r / 4, r / 4 - 1, r / 4 - 1); }
  c.restore(); c.fillStyle = '#ffffff55'; c.beginPath(); c.arc(x - r * .3, y - r * .3, r * .3, 0, Math.PI * 2); c.fill();
};
const gamepad = (c, x, y, s, body) => {
  c.fillStyle = body; c.beginPath(); c.roundRect(x - s, y - s * .55, s * 2, s * 1.1, s * .45); c.fill();
  c.fillStyle = '#1a1a22'; c.fillRect(x - s * .68, y - s * .1, s * .44, s * .14); c.fillRect(x - s * .53, y - s * .25, s * .14, s * .44);
  for (const [dx, dy, col] of [[.6, 0, '#ff5a7a'], [.45, .18, '#59f3ff'], [.75, .18, '#ffd23c'], [.6, .36, '#7dff7a']]) disc(c, x + s * dx, y + s * (dy - .18), s * .1, col);
};
const joystick = (c, x, y, s) => { c.fillStyle = '#2a2a34'; c.fillRect(x - s, y + s * .2, s * 2, s * .5); c.fillStyle = '#9aa'; c.fillRect(x - s * .06, y - s * .55, s * .12, s * .8); disc(c, x, y - s * .65, s * .3, '#ff4d6d'); disc(c, x + s * .6, y + s * .3, s * .12, '#59f3ff'); disc(c, x + s * .85, y + s * .3, s * .12, '#ffd23c'); };
const ship = (c, x, y, s, fill) => { c.fillStyle = fill; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * .45, y + s * .4); c.lineTo(x + s * .15, y + s * .25); c.lineTo(x, y + s * .5); c.lineTo(x - s * .15, y + s * .25); c.lineTo(x - s * .45, y + s * .4); c.closePath(); c.fill(); disc(c, x, y - s * .15, s * .13, '#59f3ff'); c.fillStyle = '#ff9a3c'; c.fillRect(x - s * .06, y + s * .5, s * .12, s * .25); };
const grid = (c, y0, col) => { c.strokeStyle = col; c.lineWidth = 1.5; for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(W / 2, y0); c.lineTo(W / 2 + i * 40, H); c.stroke(); } for (let k = 1; k < 7; k++) { const yy = y0 + (H - y0) * (k / 7) ** 1.7; c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke(); } };
const popcorn = (c, x, y, s) => {
  for (const [dx, dy] of [[-.5, -.9], [0, -1.1], [.5, -.9], [-.25, -1.35], [.3, -1.3], [0, -.7]]) disc(c, x + dx * s, y + dy * s, s * .3, '#fff1c2', '#e0b45a');
  c.fillStyle = '#f2f2f2'; c.beginPath(); c.moveTo(x - s * .85, y - s * .6); c.lineTo(x + s * .85, y - s * .6); c.lineTo(x + s * .6, y + s * .9); c.lineTo(x - s * .6, y + s * .9); c.fill();
  c.fillStyle = '#d33a2c'; for (let i = -3; i <= 3; i += 2) { c.beginPath(); c.moveTo(x + i * s * .24 - s * .12, y - s * .6); c.lineTo(x + i * s * .24 + s * .12, y - s * .6); c.lineTo(x + i * s * .17 + s * .09, y + s * .9); c.lineTo(x + i * s * .17 - s * .09, y + s * .9); c.fill(); }
};
const rack = (c, x, y, r) => { const cols = ['#e8c53a', '#2d5fd0', '#d33a2c', '#6a3a9c', '#f08a2c', '#1f8f4a', '#8a2a2a', '#111']; let k = 0; for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) ball(c, x + (i - row / 2) * r * 2.05, y + row * r * 1.8, r, cols[k++ % 8], k); };
const cue = (c, x0, y0, x1, y1, w) => { c.lineCap = 'round'; c.strokeStyle = '#c99a5b'; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.strokeStyle = '#2a1b12'; c.lineWidth = w * 1.2; c.beginPath(); c.moveTo(x0 + (x1 - x0) * .78, y0 + (y1 - y0) * .78); c.lineTo(x1, y1); c.stroke(); };
const bars = (c, y, n, cols) => { for (let i = 0; i < n; i++) { const h = 30 + ((i * 53) % 90); c.fillStyle = cols[i % cols.length]; c.fillRect(14 + i * ((W - 28) / n), y - h, (W - 28) / n - 4, h); } };

export function posterDesigns() {
  return [
    // ---- 0-9: hall mix
    (c) => { bg(c, '#ff7a59', '#7a2a8c'); rays(c, W / 2, 120, 14, '#ffffff22', '#ffffff00'); star(c, W / 2, 110, 58, '#ffd23c'); text(c, "LET'S", 190, 38, '#fff6dc', '#4a1760'); text(c, 'PLAY', 226, 38, '#fff6dc', '#4a1760'); },
    (c) => { bg(c, '#1b1230', '#4a1230'); c.fillStyle = '#d33a2c'; c.fillRect(30, 40, 132, 20); c.fillStyle = '#17171d'; c.fillRect(30, 60, 132, 70); for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#fff' : '#17171d'; c.fillRect(34 + i * 22, 42, 12, 16); } text(c, 'ACTION', 98, 24, '#fff6dc'); popcorn(c, W / 2, 190, 34); text(c, 'FILMKVÄLL', 238, 22, '#ffd23c'); },
    (c) => { bg(c, '#0f6a73', '#08203a'); vinyl(c, W / 2, 105, 70, '#ff6a5a'); text(c, 'VINYL', 205, 40, '#fff6dc', '#05202a'); text(c, 'SIDE A', 236, 18, '#78eee2'); },
    (c) => { bg(c, '#2a1f66', '#0d0a24'); grid(c, 150, '#ff59cc66'); gamepad(c, W / 2, 95, 62, '#6a6aff'); text(c, 'GAME', 175, 40, '#59f3ff', '#0d0a24'); text(c, 'ON!', 214, 40, '#ff59cc', '#0d0a24'); },
    (c) => { bg(c, '#0b5d3a', '#05261a'); ball(c, W / 2, 105, 62, '#111', 8); text(c, '8-BALL', 205, 38, '#fff6dc', '#05261a'); text(c, 'KLUBBEN', 236, 18, '#e8c53a'); },
    (c) => { bg(c, '#1a1040', '#401060'); rays(c, W / 2, 85, 18, '#ff59cc33', '#59f3ff33'); discoBall(c, W / 2, 95, 50); text(c, 'DISCO', 190, 40, '#fff6dc', '#401060'); text(c, 'NIGHT', 228, 30, '#ffd23c'); },
    (c) => { bg(c, '#0d1020', '#101830'); bitmap(c, INVADER, 31, 50, 12, '#7dff7a'); bitmap(c, CRAB, 31, 125, 12, '#ff59cc'); text(c, 'ARCADE', 232, 34, '#ffd23c', '#0d1020'); },
    (c) => { bg(c, '#ffb347', '#ff5a7a'); note(c, 62, 140, 26, '#2a1050'); note(c, 128, 110, 26, '#2a1050'); note(c, 92, 190, 18, '#fff6dc'); text(c, 'MUSIK', 50, 40, '#2a1050'); text(c, 'LIVE', 236, 26, '#fff6dc', '#2a1050'); },
    (c) => { bg(c, '#ffe27a', '#ff9a3c'); popcorn(c, W / 2, 150, 50); text(c, 'POP!', 40, 44, '#d33a2c', '#fff6dc'); text(c, 'FRESH', 238, 24, '#8a1f14'); },
    (c) => { bg(c, '#2d5fd0', '#122a5a'); star(c, W / 2, 95, 62, '#ffd23c'); c.fillStyle = '#ffd23c'; c.fillRect(W / 2 - 8, 150, 16, 40); c.fillRect(W / 2 - 30, 190, 60, 12); text(c, 'TURNERING', 232, 28, '#fff6dc', '#122a5a'); },
    // ---- 10-18: SPEL (gaming)
    (c) => { bg(c, '#0d0a24', '#1a1060', '#ff59cc'); text(c, 'PRESS', 90, 46, '#59f3ff', '#0d0a24'); text(c, 'START', 140, 46, '#ff59cc', '#0d0a24'); c.fillStyle = '#ffd23c'; c.fillRect(46, 185, 100, 5); bitmap(c, INVADER, 50, 205, 8, '#7dff7a'); },
    (c) => { bg(c, '#0a1228', '#0a2a30', '#59f3ff'); bitmap(c, INVADER, 31, 40, 12, '#59f3ff'); bitmap(c, CRAB, 31, 120, 12, '#ff59cc'); text(c, 'INVADERS', 225, 28, '#fff6dc', '#0a1228'); },
    (c) => { bg(c, '#220a30', '#0d0a24', '#ff59cc'); bitmap(c, HEART, 38, 40, 16, '#ff4d6d'); text(c, 'GAME', 185, 38, '#fff6dc', '#220a30'); text(c, 'OVER?', 222, 38, '#ffd23c', '#220a30'); },
    (c) => { bg(c, '#050818', '#12104a', '#a670ff'); for (let i = 0; i < 30; i++) disc(c, (i * 71) % W, (i * 47) % 170, 1.4, '#fff'); ship(c, W / 2, 180, 38, '#59f3ff'); bitmap(c, CRAB, 24, 36, 6, '#ff59cc'); bitmap(c, INVADER, 100, 70, 6, '#7dff7a'); text(c, 'STAR SHOT', 232, 24, '#ffd23c'); },
    (c) => { bg(c, '#1a1a3a', '#0a0a1c', '#59f3ff'); gamepad(c, W / 2, 110, 70, '#ff59cc'); text(c, 'PLAYER 1', 205, 32, '#59f3ff', '#0a0a1c'); text(c, 'READY', 238, 18, '#ffd23c'); },
    (c) => { bg(c, '#301040', '#0d0a24', '#ffd23c'); joystick(c, W / 2, 110, 66); text(c, 'ARCADE', 205, 36, '#ffd23c', '#301040'); text(c, 'KLASSIKER', 238, 17, '#59f3ff'); },
    (c) => { bg(c, '#0f3a2a', '#0a1a20', '#7dff7a'); bitmap(c, ROBOT, 28, 50, 14, '#7dff7a'); text(c, 'PIXEL', 215, 42, '#fff6dc', '#0a1a20'); },
    (c) => { bg(c, '#0d0a24', '#1a1060', '#ffd23c'); text(c, 'HIGH', 50, 36, '#ffd23c', '#0d0a24'); text(c, 'SCORE', 88, 36, '#ffd23c', '#0d0a24'); ['AAA 99900', 'BOB 74200', 'CAT 51800', 'ZED 30400'].forEach((s, i) => text(c, s, 135 + i * 26, 18, ['#ff59cc', '#59f3ff', '#7dff7a', '#fff6dc'][i], null)); },
    (c) => { bg(c, '#12104a', '#301060', '#59f3ff'); c.fillStyle = '#7dff7a'; c.beginPath(); c.moveTo(W / 2, 40); c.lineTo(W / 2 + 52, 110); c.lineTo(W / 2 + 22, 110); c.lineTo(W / 2 + 22, 160); c.lineTo(W / 2 - 22, 160); c.lineTo(W / 2 - 22, 110); c.lineTo(W / 2 - 52, 110); c.closePath(); c.fill(); text(c, 'LEVEL', 195, 38, '#fff6dc', '#12104a'); text(c, 'UP!', 233, 34, '#ffd23c', '#12104a'); },
    // ---- 19-27: BILJARD / DJ
    (c) => { bg(c, '#0b5d3a', '#05261a', '#e8c53a'); ball(c, W / 2, 100, 58, '#111', 8); text(c, '8-BALL', 200, 38, '#fff6dc', '#05261a'); text(c, 'POOLKLUBB', 234, 17, '#e8c53a'); },
    (c) => { bg(c, '#0b5d3a', '#06301f', '#fff6dc'); rack(c, W / 2, 60, 17); text(c, "RACK 'EM", 205, 32, '#fff6dc', '#06301f'); text(c, 'UP', 238, 26, '#e8c53a'); },
    (c) => { bg(c, '#4a2a1a', '#1a0f0a', '#c99a5b'); cue(c, 40, 190, 150, 50, 7); cue(c, 150, 190, 40, 50, 7); ball(c, W / 2, 120, 20, '#fff'); text(c, 'POOL', 225, 44, '#fff6dc', '#1a0f0a'); },
    (c) => { bg(c, '#1a1040', '#401060', '#ff59cc'); vinyl(c, W / 2, 100, 62, '#59f3ff'); text(c, 'DJ', 195, 38, '#fff6dc', '#1a1040'); text(c, 'NIGHT', 232, 34, '#ff59cc', '#1a1040'); },
    (c) => { bg(c, '#401060', '#120a30', '#ffd23c'); rays(c, W / 2, 95, 16, '#ffd23c22', '#ff59cc22'); discoBall(c, W / 2, 95, 56); text(c, 'DISCO', 190, 36, '#ffd23c', '#120a30'); text(c, 'FEVER', 228, 36, '#ff59cc', '#120a30'); },
    (c) => { bg(c, '#300a30', '#0d0a24', '#fff6dc'); c.fillStyle = '#ffffff22'; for (const x of [40, 96, 152]) { c.beginPath(); c.moveTo(x - 6, 0); c.lineTo(x + 6, 0); c.lineTo(x + 36, 170); c.lineTo(x - 36, 170); c.fill(); } c.fillStyle = '#9aa'; c.fillRect(W / 2 - 3, 130, 6, 50); disc(c, W / 2, 122, 14, '#444'); text(c, 'KONSERT', 205, 32, '#fff6dc', '#300a30'); text(c, 'LIVE!', 238, 24, '#ff59cc'); },
    (c) => { bg(c, '#222', '#101018', '#78eee2'); c.fillStyle = '#3a3a44'; c.fillRect(24, 50, 144, 100); vinyl(c, 70, 100, 36, '#ff6a5a'); vinyl(c, 124, 100, 36, '#59f3ff'); c.fillStyle = '#ddd'; c.fillRect(100, 56, 3, 40); text(c, 'SPIN', 195, 40, '#78eee2', '#101018'); text(c, 'IT', 235, 30, '#fff6dc'); },
    (c) => { bg(c, '#2a1a10', '#14100a', '#c99a5b'); text(c, 'BILJARD', 60, 34, '#fff6dc', '#14100a'); text(c, 'CLUB', 98, 34, '#e8c53a', '#14100a'); ball(c, 62, 170, 22, '#e8c53a', 1); ball(c, 110, 170, 22, '#2d5fd0', 2); ball(c, 86, 135, 22, '#d33a2c', 3); text(c, 'EST. 1950', 232, 14, '#c99a5b'); },
    (c) => { bg(c, '#0a1a30', '#301050', '#59f3ff'); bars(c, 200, 9, ['#59f3ff', '#ff59cc', '#ffd23c']); text(c, 'BASS', 36, 42, '#fff6dc', '#0a1a30'); text(c, 'BOOST', 232, 30, '#ff59cc'); },
  ];
}

/** The two wall neon signs: a dark panel and a tube-style outline (rose / cyan) with a glow, drawn into a `size` px atlas cell. */
export function neonSignCell(c, name, [w, h]) {
  const spel = name === 'spel', col = spel ? '#59f3ff' : '#ffb866', col2 = spel ? '#ff59cc' : '#ff6a5a', s = spel ? 'GAME ON' : '8-BALL';
  c.fillStyle = '#0c0e18'; c.fillRect(0, 0, w, h);
  c.shadowColor = col2; c.shadowBlur = 18; c.strokeStyle = col2; c.lineWidth = 7; c.beginPath(); c.roundRect(14, 14, w - 28, h - 28, 36); c.stroke();
  c.shadowColor = col; c.shadowBlur = 22; c.font = `900 ${h * .5}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.strokeStyle = col; c.lineWidth = 9; c.strokeText(s, w / 2, h / 2 + 6); c.shadowBlur = 0; c.strokeStyle = '#effffe'; c.lineWidth = 2.5; c.strokeText(s, w / 2, h / 2 + 6);
}
