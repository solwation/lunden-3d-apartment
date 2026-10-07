import * as THREE from 'three';
import { LEVELS, SOFFITS } from './config.js';
import { sfx } from './audio.js';

// Curtains on a ceiling track (#342, CURTAINS in config): Sovrum 1's two teal jungle-print panels. One track under the
// soffit from the west wall to the east; a split (#362): the panels meet at the window's middle and part to either side
// (the west one to its end stop by the west wall, #403; the east one to the track's end). Each panel is one wave-folded mesh
// rebuilt only while it moves: the fold count stays, the spacing shrinks and the folds deepen as it gathers; the print
// (our own canvas, tileable) rides with the cloth. They share the blinds' control strip (#blind-panel, src/blinds.js):
// A / D, ← / → or ◀ ▶ held draw them shut / open, and the blinds' daylight cut and saved state.

/** A seeded random (the same print every visit). */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Pattern generator for themed curtain fabrics. */
function printTexture(theme, ground) {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = ground;
  g.fillRect(0, 0, S, S);

  // draw `fn` at (x, y) and its wrapped copies, so the repeat is seamless
  const wrap = (x, y, rad, fn) => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      if (x + dx < -rad || x + dx > S + rad || y + dy < -rad || y + dy > S + rad) continue;
      g.save(); g.translate(x + dx, y + dy); fn(); g.restore();
    }
  };

  if (!theme || theme === 'jungle') {
    const r = rng(342);
    const ink = '#3a2a22', cream = '#eadfc8', brown = '#7a5a48', sage = '#8d9472', olive = '#5f6a4c', pink = '#c99a92', mauve = '#9a7b8c', rose = '#b5847e';
    const leaf = (len, w, fill) => {
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w, -len / 2, 0, -len); g.quadraticCurveTo(-w, -len / 2, 0, 0);
      g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.strokeStyle = ink; g.stroke();
      g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -len + 4); g.strokeStyle = cream; g.lineWidth = 1.2; g.stroke();
    };
    const blade = (len, w) => { // a striped snake-plant leaf
      g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(-w * 0.8, -len * 0.6, 0, -len); g.quadraticCurveTo(w * 0.8, -len * 0.6, w, 0); g.closePath();
      g.fillStyle = cream; g.fill(); g.save(); g.clip();
      g.fillStyle = olive;
      for (let y = -6; y > -len; y -= 13) { g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y - 7); g.lineTo(w, y - 12); g.lineTo(-w, y - 5); g.fill(); }
      g.restore(); g.lineWidth = 2; g.strokeStyle = ink; g.stroke();
    };
    const flower = (rad, a, b) => {
      const n = 7 + Math.floor(r() * 4);
      for (const [k, col] of [[1, a], [0.62, b], [0.3, cream]]) {
        for (let i = 0; i < n; i++) {
          g.save(); g.rotate((i / n) * Math.PI * 2 + k);
          g.beginPath(); g.ellipse(0, -rad * k * 0.55, rad * k * 0.32, rad * k * 0.5, 0, 0, Math.PI * 2);
          g.fillStyle = col; g.fill(); g.lineWidth = 1.5; g.strokeStyle = ink; g.stroke(); g.restore();
        }
      }
      g.beginPath(); g.arc(0, 0, rad * 0.12, 0, Math.PI * 2); g.fillStyle = brown; g.fill();
    };
    const zebra = (s) => {
      g.scale(s, s);
      g.fillStyle = '#f1ece0'; g.strokeStyle = ink; g.lineWidth = 2.5;
      for (const lx of [-26, -14, 16, 26]) { g.fillRect(lx - 4, 8, 8, 44); g.strokeRect(lx - 4, 8, 8, 44); }
      g.beginPath(); g.ellipse(0, 0, 38, 20, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(26, -8); g.lineTo(44, -42); g.lineTo(56, -38); g.lineTo(40, -2); g.closePath(); g.fill(); g.stroke(); // neck
      g.beginPath(); g.ellipse(54, -42, 14, 8, 0.5, 0, Math.PI * 2); g.fill(); g.stroke(); // head
      g.fillStyle = ink;
      for (let x = -32; x < 34; x += 8) { g.beginPath(); g.moveTo(x, -19); g.quadraticCurveTo(x + 5, 0, x - 1, 18); g.lineTo(x + 3, 18); g.quadraticCurveTo(x + 8, 0, x + 3, -19); g.fill(); }
      for (let k = 0; k < 4; k++) g.fillRect(30 + k * 4, -30 - k * 6, 9, 3);
      g.beginPath(); g.moveTo(-38, -2); g.lineTo(-50, 14); g.stroke(); // tail
    };
    const bird = (s, body, wing) => {
      g.scale(s, s);
      g.strokeStyle = ink; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-30, 10); g.lineTo(-58, 30); g.lineTo(-52, 16); g.closePath(); g.fillStyle = wing; g.fill(); g.stroke(); // tail
      g.beginPath(); g.ellipse(0, 0, 30, 14, -0.3, 0, Math.PI * 2); g.fillStyle = body; g.fill(); g.stroke();
      g.beginPath(); g.ellipse(26, -14, 10, 9, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(34, -16); g.lineTo(44, -10); g.lineTo(34, -8); g.fillStyle = cream; g.fill(); g.stroke(); // beak
      g.beginPath(); g.moveTo(-6, -4); g.quadraticCurveTo(-20, -40, 8, -30); g.quadraticCurveTo(10, -14, -6, -4); g.fillStyle = wing; g.fill(); g.stroke(); // wing
    };
    for (let i = 0; i < 300; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI * 2, len = 36 + r() * 44, col = [sage, brown, olive, '#a59378'][Math.floor(r() * 4)];
      wrap(x, y, 70, () => { g.rotate(a); leaf(len, len * 0.55, col); });
    }
    for (let i = 0; i < 16; i++) {
      const x = r() * S, y = r() * S, a = (r() - 0.5) * 0.6;
      wrap(x, y, 220, () => { g.rotate(a); blade(150 + r() * 60, 15); });
    }
    for (let i = 0; i < 22; i++) {
      const x = r() * S, y = r() * S, rad = 36 + r() * 36, pal = [[pink, rose], [mauve, pink], [cream, pink], [rose, mauve]][i % 4];
      wrap(x, y, rad + 10, () => flower(rad, pal[0], pal[1]));
    }
    const animals = [[180, 250, 'z', 1], [700, 160, 'b', 1], [520, 620, 'z', -1], [140, 820, 'b', -1], [880, 520, 'b', 1], [360, 420, 'b', 1]];
    for (const [x, y, k, flip] of animals) wrap(x, y, 170, () => { g.scale(flip, 1); if (k === 'z') zebra(1.9); else bird(1.6, [brown, '#8a6450', cream][Math.floor(r() * 3)], [rose, olive, brown][Math.floor(r() * 3)]); });
    for (let i = 0; i < 120; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI * 2, len = 26 + r() * 24;
      const td = (u, v) => Math.min(Math.abs(u - v), S - Math.abs(u - v));
      if (animals.some(([ax, ay]) => Math.hypot(td(x, ax), td(y, ay)) < 120)) continue;
      wrap(x, y, 50, () => { g.rotate(a); leaf(len, len * 0.5, [sage, '#b8a888', brown][Math.floor(r() * 3)]); });
    }
    for (let i = 0; i < 60; i++) {
      const x = r() * S, y = r() * S;
      wrap(x, y, 8, () => { g.fillStyle = cream; g.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? 2 : 5, a = (k / 10) * Math.PI * 2; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill(); });
    }
  } else if (theme === 'starwars') {
    // Walter & Kian (Sovrum 2): Star Wars / gaming sci-fi motif on dark navy
    const r = rng(77);
    const cyan = '#00f0ff', lime = '#a3e635', amber = '#fbbf24', slate = '#475569', red = '#ef4444', white = '#f8fafc';
    // Starfield background
    for (let i = 0; i < 200; i++) {
      const x = r() * S, y = r() * S, rad = 1 + r() * 2.5;
      wrap(x, y, rad, () => {
        g.fillStyle = r() > 0.3 ? white : cyan;
        g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.fill();
      });
    }
    // Constellation lines
    g.strokeStyle = 'rgba(71, 85, 105, 0.4)';
    g.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const x1 = r() * S, y1 = r() * S, x2 = x1 + (r() - 0.5) * 140, y2 = y1 + (r() - 0.5) * 140;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    // Starfighter silhouette (X-wing style)
    const starfighter = (sc, col) => {
      g.scale(sc, sc);
      g.fillStyle = col; g.strokeStyle = white; g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -32); g.lineTo(8, -10); g.lineTo(36, 12); g.lineTo(36, 20); g.lineTo(12, 16);
      g.lineTo(8, 28); g.lineTo(-8, 28); g.lineTo(-12, 16); g.lineTo(-36, 20); g.lineTo(-36, 12);
      g.lineTo(-8, -10); g.closePath();
      g.fill(); g.stroke();
      g.fillStyle = cyan;
      g.fillRect(-3, -20, 6, 10); // cockpit
    };
    // TIE silhouette
    const tie = (sc, col) => {
      g.scale(sc, sc);
      g.fillStyle = col; g.strokeStyle = white; g.lineWidth = 1.5;
      g.fillRect(-28, -26, 6, 52); // left wing
      g.fillRect(22, -26, 6, 52);  // right wing
      g.beginPath(); g.moveTo(-22, 0); g.lineTo(22, 0); g.stroke(); // struts
      g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill(); g.stroke(); // pod
      g.fillStyle = red;
      g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill(); // viewport
    };
    // Retro arcade controller
    const controller = (sc) => {
      g.scale(sc, sc);
      g.fillStyle = '#1e293b'; g.strokeStyle = cyan; g.lineWidth = 2;
      g.beginPath(); g.roundRect(-24, -14, 48, 28, 6); g.fill(); g.stroke();
      // D-pad
      g.fillStyle = slate;
      g.fillRect(-17, -4, 10, 8); g.fillRect(-14, -7, 4, 14);
      // Buttons
      g.fillStyle = lime; g.beginPath(); g.arc(10, -4, 3.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = amber; g.beginPath(); g.arc(16, 2, 3.5, 0, Math.PI * 2); g.fill();
    };
    // Space invaders sprite
    const invader = (sc, col) => {
      g.scale(sc, sc);
      g.fillStyle = col;
      const rows = [
        [2, 8], [3, 7], [2, 3, 4, 5, 6, 7, 8], [1, 2, 4, 5, 6, 8, 9],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [0, 2, 3, 4, 5, 6, 7, 8, 10],
        [0, 2, 8, 10], [3, 4, 6, 7]
      ];
      for (let y = 0; y < rows.length; y++) {
        for (const x of rows[y]) g.fillRect((x - 5) * 3, (y - 4) * 3, 3, 3);
      }
    };
    for (let i = 0; i < 8; i++) {
      const x = r() * S, y = r() * S, a = (r() - 0.5) * 0.8;
      wrap(x, y, 50, () => { g.rotate(a); starfighter(1.2, '#334155'); });
    }
    for (let i = 0; i < 8; i++) {
      const x = r() * S, y = r() * S, a = (r() - 0.5) * 0.8;
      wrap(x, y, 40, () => { g.rotate(a); tie(1.1, '#1e293b'); });
    }
    for (let i = 0; i < 10; i++) {
      const x = r() * S, y = r() * S, a = (r() - 0.5) * 0.4;
      wrap(x, y, 35, () => { g.rotate(a); controller(1.2); });
    }
    for (let i = 0; i < 14; i++) {
      const x = r() * S, y = r() * S;
      const col = [cyan, lime, amber][i % 3];
      wrap(x, y, 25, () => invader(1.3, col));
    }
  } else if (theme === 'unicorn') {
    // Livia & Tuva (Sovrum 3): Pastel rainbows, unicorns, stars and clouds
    const r = rng(70);
    const pPink = '#f9a8d4', pViolet = '#c084fc', pCyan = '#7dd3fc', pYellow = '#fde047', pMint = '#86efac', white = '#ffffff', gold = '#fbbf24';
    // Pastel cloud
    const cloud = (sc) => {
      g.scale(sc, sc);
      g.fillStyle = white; g.strokeStyle = pViolet; g.lineWidth = 1.5;
      g.beginPath();
      g.arc(-16, 0, 14, 0, Math.PI * 2);
      g.arc(0, -10, 18, 0, Math.PI * 2);
      g.arc(16, 0, 14, 0, Math.PI * 2);
      g.closePath();
      g.fill(); g.stroke();
    };
    // Mini rainbow
    const rainbow = (sc) => {
      g.scale(sc, sc);
      g.lineWidth = 4;
      const colors = [pPink, pYellow, pMint, pCyan, pViolet];
      for (let i = 0; i < colors.length; i++) {
        g.strokeStyle = colors[i];
        g.beginPath();
        g.arc(0, 0, 24 - i * 4, Math.PI, 0, false);
        g.stroke();
      }
    };
    // Unicorn head profile
    const unicorn = (sc) => {
      g.scale(sc, sc);
      g.fillStyle = white; g.strokeStyle = pViolet; g.lineWidth = 2;
      // Head and neck
      g.beginPath();
      g.moveTo(0, 20); g.lineTo(24, 0); g.quadraticCurveTo(28, -12, 18, -20);
      g.lineTo(8, -18); g.lineTo(4, -28); g.lineTo(-2, -20); // ear
      g.quadraticCurveTo(-14, -12, -18, 20); g.closePath();
      g.fill(); g.stroke();
      // Horn
      g.fillStyle = gold; g.strokeStyle = gold;
      g.beginPath(); g.moveTo(10, -20); g.lineTo(22, -42); g.lineTo(4, -22); g.closePath();
      g.fill(); g.stroke();
      // Mane locks
      const maneCols = [pPink, pViolet, pCyan, pYellow];
      for (let k = 0; k < 4; k++) {
        g.fillStyle = maneCols[k];
        g.beginPath();
        g.arc(-4 - k * 3, -16 + k * 8, 5, 0, Math.PI * 2);
        g.fill();
      }
    };
    // Sparkle star
    const star = (sc, col) => {
      g.scale(sc, sc);
      g.fillStyle = col;
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const rr = k % 2 ? 3 : 8, a = (k / 8) * Math.PI * 2;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath(); g.fill();
    };
    for (let i = 0; i < 10; i++) {
      const x = r() * S, y = r() * S, flip = r() > 0.5 ? 1 : -1;
      wrap(x, y, 45, () => { g.scale(flip, 1); unicorn(1.2); });
    }
    for (let i = 0; i < 12; i++) {
      const x = r() * S, y = r() * S;
      wrap(x, y, 40, () => rainbow(1.1));
    }
    for (let i = 0; i < 14; i++) {
      const x = r() * S, y = r() * S;
      wrap(x, y, 35, () => cloud(1.1));
    }
    for (let i = 0; i < 60; i++) {
      const x = r() * S, y = r() * S;
      const col = [pPink, pYellow, pCyan, gold, pViolet][i % 5];
      wrap(x, y, 15, () => star(1 + r() * 0.8, col));
    }
  } else if (theme === 'kpop') {
    // Tilly (Sovrum 4): K-pop & dark violet/lilac theme
    const r = rng(280);
    const lilac = '#c084fc', neonPurple = '#a855f7', pink = '#f472b6', white = '#f8fafc', cyan = '#38bdf8';
    // Korean finger heart
    const fingerHeart = (sc) => {
      g.scale(sc, sc);
      g.fillStyle = '#fbcfe8'; g.strokeStyle = lilac; g.lineWidth = 1.8;
      // Hand silhouette
      g.beginPath();
      g.roundRect(-10, -5, 20, 28, 5); g.fill(); g.stroke();
      // Crossed thumb and index
      g.beginPath();
      g.moveTo(-6, -5); g.lineTo(-2, -18); g.lineTo(4, -18); g.lineTo(8, -5);
      g.stroke();
      // Mini heart on top
      g.fillStyle = pink;
      g.beginPath();
      g.moveTo(0, -22);
      g.bezierCurveTo(-6, -30, -12, -22, 0, -14);
      g.bezierCurveTo(12, -22, 6, -30, 0, -22);
      g.fill();
    };
    // Lilac lightning bolt
    const bolt = (sc, col) => {
      g.scale(sc, sc);
      g.fillStyle = col; g.strokeStyle = white; g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(2, -24); g.lineTo(-12, -2); g.lineTo(-2, -2); g.lineTo(-6, 24);
      g.lineTo(12, 0); g.lineTo(2, 0); g.closePath();
      g.fill(); g.stroke();
    };
    // Cassette tape / mini player
    const cassette = (sc) => {
      g.scale(sc, sc);
      g.fillStyle = '#2e1065'; g.strokeStyle = lilac; g.lineWidth = 2;
      g.beginPath(); g.roundRect(-22, -14, 44, 28, 4); g.fill(); g.stroke();
      g.fillStyle = '#1e1b4b'; g.fillRect(-14, -8, 28, 16);
      g.fillStyle = lilac;
      g.beginPath(); g.arc(-6, 0, 4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(6, 0, 4, 0, Math.PI * 2); g.fill();
    };
    // Music note
    const note = (sc, col) => {
      g.scale(sc, sc);
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(-6, 8, 5, 4, -0.2, 0, Math.PI * 2); g.fill();
      g.ellipse(8, 5, 5, 4, -0.2, 0, Math.PI * 2); g.fill();
      g.fillRect(-2, -10, 2, 18); g.fillRect(12, -13, 2, 18);
      g.fillRect(-2, -14, 16, 4);
    };
    // Sparkle star
    const sparkle = (sc, col) => {
      g.scale(sc, sc);
      g.fillStyle = col;
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const rr = k % 2 ? 2.5 : 8, a = (k / 8) * Math.PI * 2;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath(); g.fill();
    };
    for (let i = 0; i < 10; i++) {
      const x = r() * S, y = r() * S;
      wrap(x, y, 40, () => fingerHeart(1.1));
    }
    for (let i = 0; i < 12; i++) {
      const x = r() * S, y = r() * S, a = (r() - 0.5) * 0.6;
      wrap(x, y, 35, () => { g.rotate(a); bolt(1.0, [lilac, pink, cyan][i % 3]); });
    }
    for (let i = 0; i < 8; i++) {
      const x = r() * S, y = r() * S, a = (r() - 0.5) * 0.3;
      wrap(x, y, 35, () => { g.rotate(a); cassette(1.1); });
    }
    for (let i = 0; i < 18; i++) {
      const x = r() * S, y = r() * S, a = (r() - 0.5) * 0.5;
      wrap(x, y, 25, () => { g.rotate(a); note(1.1, [lilac, white, pink][i % 3]); });
    }
    for (let i = 0; i < 50; i++) {
      const x = r() * S, y = r() * S;
      wrap(x, y, 12, () => sparkle(1 + r() * 0.8, [white, lilac, cyan][i % 3]));
    }
  } else if (theme === 'linen_kitchen') {
    // Kök / matplats (L0 North): Scandinavian warm oat woven linen with botanical olive/sage sprigs
    const r = rng(289);
    // Subtle cross-weave linen texture
    g.strokeStyle = 'rgba(215, 205, 190, 0.35)';
    g.lineWidth = 1;
    for (let y = 0; y < S; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
    for (let x = 0; x < S; x += 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }

    const olive = '#556b2f', sage = '#78866b', brown = '#8b7355', gold = '#c8b273';
    // Olive/herb sprig
    const herbSprig = (len, col) => {
      g.strokeStyle = brown; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(8, -len / 2, 0, -len); g.stroke();
      for (let y = 8; y < len; y += 12) {
        for (const dir of [-1, 1]) {
          g.save(); g.translate(dir * 2, -y); g.rotate(dir * 0.5);
          g.fillStyle = col; g.strokeStyle = '#3e4a28'; g.lineWidth = 1;
          g.beginPath(); g.ellipse(dir * 8, 0, 7, 3, dir * 0.3, 0, Math.PI * 2);
          g.fill(); g.stroke();
          g.restore();
        }
      }
    };
    // Wheat / barley ear
    const wheat = (len) => {
      g.strokeStyle = brown; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len); g.stroke();
      g.fillStyle = gold;
      for (let y = len * 0.3; y < len; y += 8) {
        for (const dir of [-1, 1]) {
          g.save(); g.translate(dir * 2, -y);
          g.beginPath(); g.ellipse(dir * 4, -3, 5, 2.5, dir * 0.6, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.moveTo(dir * 4, -5); g.lineTo(dir * 8, -12); g.stroke(); // awn
          g.restore();
        }
      }
    };
    for (let i = 0; i < 28; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI * 2;
      wrap(x, y, 40, () => { g.rotate(a); herbSprig(36 + r() * 20, [olive, sage][i % 2]); });
    }
    for (let i = 0; i < 20; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI * 2;
      wrap(x, y, 40, () => { g.rotate(a); wheat(38 + r() * 16); });
    }
  } else if (theme === 'linen_living') {
    // Vardagsrum (L0 South): Scandinavian minimalist Jacquard weave with geometric arches and wavy contour lines
    const r = rng(55);
    // Subtle fabric grain
    g.strokeStyle = 'rgba(200, 190, 175, 0.3)';
    g.lineWidth = 1;
    for (let y = 0; y < S; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
    for (let x = 0; x < S; x += 5) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }

    const ochre = '#c49a45', terra = '#b86b53', taupe = '#8f8073', softWhite = '#f4efe6';
    // Modern abstract arch
    const arch = (w, h, col) => {
      g.strokeStyle = col; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-w / 2, h / 2); g.lineTo(-w / 2, 0);
      g.arc(0, 0, w / 2, Math.PI, 0, false);
      g.lineTo(w / 2, h / 2);
      g.stroke();
    };
    // Wavy contour line
    const waveLine = (len, amp, col) => {
      g.strokeStyle = col; g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= len; x += 6) {
        const y = Math.sin((x / len) * Math.PI * 4) * amp;
        if (x === 0) g.moveTo(x - len / 2, y); else g.lineTo(x - len / 2, y);
      }
      g.stroke();
    };
    // Minimalist discs
    const disc = (rad, fill) => {
      g.fillStyle = fill;
      g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.fill();
    };

    for (let i = 0; i < 22; i++) {
      const x = r() * S, y = r() * S, a = (r() - 0.5) * 0.4;
      const col = [ochre, terra, taupe][i % 3];
      wrap(x, y, 45, () => { g.rotate(a); arch(40 + r() * 20, 50 + r() * 20, col); });
    }
    for (let i = 0; i < 18; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI * 2;
      const col = [softWhite, taupe, ochre][i % 3];
      wrap(x, y, 60, () => { g.rotate(a); waveLine(90 + r() * 30, 8 + r() * 6, col); });
    }
    for (let i = 0; i < 20; i++) {
      const x = r() * S, y = r() * S;
      const col = [terra, ochre, taupe, softWhite][i % 4];
      wrap(x, y, 20, () => disc(10 + r() * 12, col));
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const lerp = (a, b, t) => a + (b - a) * t;
const ROWS = 5, SEG = 4; // rows of vertices down the drop; segments per wave fold

/** One panel: a wave-folded sheet from x a..b at the rail's z, `fabric` m of cloth in `n` folds; xa..xb = its reach. */
class Panel {
  constructor(spec, zc, fabric, mat, y0, y1, xa, xb) {
    Object.assign(this, { zc, fabric, y0, y1, amp: spec.amp });
    this.n = Math.max(6, Math.round(fabric / 0.105));
    const cols = this.n * SEG + 1;
    this.cols = cols;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(cols * ROWS * 3), uv = new Float32Array(cols * ROWS * 2), idx = [];
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      uv[k * 2] = (i / (cols - 1)) * fabric / spec.tile; // the print gathers with the cloth
      uv[k * 2 + 1] = lerp(y0, y1, j / (ROWS - 1)) / spec.tile;
      if (i < cols - 1 && j < ROWS - 1) idx.push(k, k + 1, k + cols, k + 1, k + cols + 1, k + cols);
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(cols * ROWS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // fixed bounds over the whole track: culling, raycasts and the detail culler need no recompute
    g.boundingBox = new THREE.Box3(new THREE.Vector3(xa - 0.05, y0, zc - 0.05), new THREE.Vector3(xb + 0.05, y1, zc + 0.05));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
  }

  /** Lay the cloth between x a and b. */
  build(a, b) {
    this.a = a; this.b = b;
    const { n, cols, zc, y0, y1 } = this;
    const s = (b - a) / n, L = this.fabric / n; // fold spacing, cloth per fold
    const A = Math.min(this.amp, Math.sqrt(Math.max(0, (L / 2) ** 2 - (s / 2) ** 2)) / 2); // deeper as it gathers
    const p = this.mesh.geometry.attributes.position.array;
    for (let j = 0; j < ROWS; j++) {
      const v = j / (ROWS - 1), y = lerp(y0, y1, v);
      const aj = A * (1.12 - 0.12 * v); // a touch fuller at the hem
      for (let i = 0; i < cols; i++) {
        const k = (j * cols + i) * 3, ph = (i / SEG) * Math.PI * 2;
        p[k] = a + (b - a) * (i / (cols - 1));
        p[k + 1] = y;
        p[k + 2] = zc + aj * Math.sin(ph);
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

export class Curtain {
  /** spec: a CURTAINS entry; `statics` gets the track (baked with the fittings). */
  constructor(spec, id, statics) {
    const out = spec.out ?? (spec.facade === 'south' ? 1 : -1);
    Object.assign(this, { spec, id, kind: 'curtain', name: 'gardinerna', verb: 'dra i', level: spec.level, room: null, t: 0, moved: false, dark: false, out });
    this.x0 = spec.glass[0]; this.x1 = spec.glass[1]; this.z = spec.z; // the room lookup (Blinds.init)
    this.speed = spec.speed;
    const fl = LEVELS[spec.level].floor;
    const y0 = fl + spec.drop, y1 = fl + spec.top;
    this.tex = printTexture(spec.theme, spec.colors.ground);
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, emissiveMap: this.tex, emissive: 0x000000, roughness: 0.93, side: THREE.DoubleSide });
    // a split on one track: shut, both meet at `meet` (the folds end on the rail's line, so the two join seamlessly);
    // open, each is gathered against its outer end (the west one's end stop, the track's east end)
    const fw = spec.fullness * (spec.meet - spec.stop), fe = spec.fullness * (spec.east - spec.meet);
    this.ends = {
      west: { open: [spec.stop, spec.stop + spec.stack * fw], shut: [spec.stop, spec.meet] },
      east: { open: [spec.east - spec.stack * fe, spec.east], shut: [spec.meet, spec.east] },
    };
    this.travel = this.ends.east.open[0] - spec.meet; // the east panel's leading edge (the west one keeps the same share)
    this.west = new Panel(spec, spec.z, fw, this.mat, y0, y1, spec.stop, spec.meet);
    this.east = new Panel(spec, spec.z, fe, this.mat, y0, y1, spec.meet, spec.east);
    this.object = new THREE.Group();
    this.object.add(this.west.mesh, this.east.mesh);
    for (const m of [this.west.mesh, this.east.mesh]) m.userData.door = this; // E targets, kept out of the merge
    this.pickable = this.object;
    // the track: a slim white rail on the soffit's underside from the west wall + a mounting strip, the west and east end stops
    const trackMat = new THREE.MeshStandardMaterial({ color: spec.colors.track, roughness: 0.4, metalness: 0.1 });
    const sof = SOFFITS.find((o) => o.level === spec.level && spec.z > o.z0 && spec.z < o.z1 && spec.meet > o.x0 && spec.meet < o.x1);
    const yc = fl + (sof?.height ?? LEVELS[spec.level].ceiling); // the soffit's underside (RH 2.4) or ceiling
    const box = (x0, x1, ya, yb, z0, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, yb - ya, z1 - z0), trackMat); m.position.set((x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2); return m; };
    const tx0 = spec.west, tx1 = spec.east + 0.02;
    statics.add(box(tx0, tx1, yc - 0.018, yc, spec.z - 0.012, spec.z + 0.012));
    statics.add(box(tx0, tx1, yc - 0.004, yc, spec.z - 0.02, spec.z + 0.02));
    statics.add(box(spec.stop - 0.012, spec.stop, yc - 0.03, yc - 0.018, spec.z - 0.01, spec.z + 0.01)); // west end stop
    statics.add(box(spec.east, spec.east + 0.012, yc - 0.03, yc - 0.018, spec.z - 0.01, spec.z + 0.01)); // east end stop
    this.yTop = y1;
    this.built = -1;
    this.sound = 0;
    this.set(0);
  }

  /** The glass left free between the two leading edges. */
  freeGlass(wb, ea) {
    const [g0, g1] = this.spec.glass;
    return Math.max(0, Math.min(ea, g1) - Math.max(wb, g0));
  }

  /** How much of the glass is covered, 0 (open: the parked west stack's sliver does not count) … 1 (shut). */
  get cover() {
    const open = this.freeGlass(this.ends.west.open[1], this.ends.east.open[0]);
    return Math.min(1, Math.max(0, 1 - this.freeGlass(this.west.b, this.east.a) / open));
  }
  get isOpen() { return this.t > 0.01; }

  /** 0 open (parked at both sides) … 1 drawn shut (meeting in the middle). */
  set(t) {
    this.t = Math.min(1, Math.max(0, t));
    if (Math.abs(this.t - this.built) < 1e-5) return;
    this.built = this.t;
    for (const k of ['west', 'east']) {
      const e = this.ends[k];
      this[k].build(lerp(e.open[0], e.shut[0], this.t), lerp(e.open[1], e.shut[1], this.t));
    }
  }

  /** While it moves (Blinds.update): a soft runner rattle now and then. */
  step(dt) {
    this.sound -= dt;
    if (this.sound > 0) return;
    this.sound = 0.42;
    sfx.slide(new THREE.Vector3(this.east.a, this.yTop, this.spec.z), { dur: 0.4, wardrobe: true });
  }

  /** The cotton lets a little daylight through (teal), warm from a lit room at night. */
  glow(day, lit) {
    const g = this.spec.glow, e = this.mat.emissive;
    e.setHex(this.spec.colors.glow).multiplyScalar(day * g.day);
    if (lit) e.add(tmp.setHex(this.spec.colors.warm).multiplyScalar(g.lamp));
  }
}
const tmp = new THREE.Color();
