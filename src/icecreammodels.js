import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ICECREAM_CONES as C } from './config.js';

// #1229: Ice cream cones in the freezer (a box of 6 cones with three flavours: vanilla, strawberry, chocolate).
// The box has a hinged lid showing wrapped cones inside when opened.
// Cones have a golden waffle cone, flavour-coloured ice cream scoop, and paper wrapper while closed.

const std = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
function mesh(geo, mat) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; }
const once = {};
const lazy = (k, make) => (once[k] ??= make());
const cardboard = () => lazy('cardboard', () => std(0xb89a72, 0.85));

function canvasMat(w, h, draw, roughness = 0.55) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness });
}

function word(g, text, x, y, px, fill, { font = 'bold', stroke = null, lw = 0 } = {}) {
  g.font = `${font} ${px}px Arial Black, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.lineJoin = 'round'; g.strokeText(text, x, y); }
  g.fillStyle = fill; g.fillText(text, x, y);
}

/** Draws an ice cream cone graphic on the canvas. */
function drawCone(g, cx, cy, w, h, scoopColor) {
  // Waffle cone
  g.fillStyle = '#d49b55';
  g.beginPath();
  g.moveTo(cx - w * 0.45, cy);
  g.lineTo(cx + w * 0.45, cy);
  g.lineTo(cx, cy + h * 0.7);
  g.closePath();
  g.fill();
  // Waffle lines
  g.strokeStyle = '#b87c33';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(cx - w * 0.3, cy + h * 0.15); g.lineTo(cx + w * 0.2, cy + h * 0.55);
  g.moveTo(cx + w * 0.3, cy + h * 0.15); g.lineTo(cx - w * 0.2, cy + h * 0.55);
  g.stroke();
  // Ice cream scoop
  g.fillStyle = scoopColor;
  g.beginPath();
  g.arc(cx, cy - h * 0.05, w * 0.48, 0, Math.PI * 2);
  g.fill();
  // Swirl highlight
  g.fillStyle = 'rgba(255, 255, 255, 0.35)';
  g.beginPath();
  g.arc(cx - w * 0.12, cy - h * 0.18, w * 0.18, 0, Math.PI * 2);
  g.fill();
}

const PRINT = {
  boxTop: (g, w, h) => {
    // Sky blue background
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(1, '#0284c7');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);

    // Decorative border
    g.strokeStyle = '#ffffff'; g.lineWidth = 4;
    g.strokeRect(8, 8, w - 16, h - 16);

    // Title
    word(g, 'GLASSTRUTAR', w * 0.5, h * 0.22, h * 0.18, '#ffffff', { stroke: '#0369a1', lw: 6 });
    word(g, 'Tre goda smaker · 6 st', w * 0.5, h * 0.42, h * 0.08, '#fef08a', { stroke: '#075985', lw: 3 });

    // 3 cones illustration (vanilla, strawberry, chocolate)
    const cw = w * 0.12, ch = h * 0.4;
    drawCone(g, w * 0.25, h * 0.65, cw, ch, '#fff6dd');
    drawCone(g, w * 0.50, h * 0.65, cw, ch, '#f4729b');
    drawCone(g, w * 0.75, h * 0.65, cw, ch, '#542e18');

    // Flavour names
    word(g, 'Vanilj', w * 0.25, h * 0.9, h * 0.065, '#ffffff', { stroke: '#075985', lw: 2 });
    word(g, 'Jordgubb', w * 0.50, h * 0.9, h * 0.065, '#ffffff', { stroke: '#075985', lw: 2 });
    word(g, 'Choklad', w * 0.75, h * 0.9, h * 0.065, '#ffffff', { stroke: '#075985', lw: 2 });
  },
  boxFront: (g, w, h) => {
    g.fillStyle = '#0284c7'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#38bdf8'; g.fillRect(0, 0, w, h * 0.25);
    word(g, 'GLASSTRUTAR · 6 ST', w * 0.5, h * 0.62, h * 0.35, '#ffffff', { stroke: '#0369a1', lw: 4 });
  },
};

const boxTopMat = () => lazy('iceCreamBoxTop', () => canvasMat(512, Math.round(512 * C.box[0] / C.box[2]), PRINT.boxTop));
const boxFrontMat = () => lazy('iceCreamBoxFront', () => canvasMat(512, Math.round(512 * C.box[1] / C.box[2]), PRINT.boxFront));
const boxSideMat = () => lazy('iceCreamBoxSide', () => std(0x0284c7, 0.6));

/** Builds the ice cream box. */
function buildIceCreamBox(def) {
  const [L, H, W] = C.box, n = def.amount ?? C.count, g = new THREE.Group();
  const side = boxSideMat(), print = boxTopMat(), frontPrint = boxFrontMat(), inner = cardboard();

  // Tray body: bottom + 4 walls
  const t = 0.003, walls = [
    [L, t, W, 0, t / 2, 0],
    [t, H, W, -L / 2 + t / 2, H / 2, 0],
    [t, H, W, L / 2 - t / 2, H / 2, 0],
    [L, H, t, 0, H / 2, -W / 2 + t / 2],
    [L, H, t, 0, H / 2, W / 2 - t / 2],
  ];
  g.add(mesh(mergeGeometries(walls.map(([x, y, z, px, py, pz]) => new THREE.BoxGeometry(x, y, z).translate(px, py, pz))), side));

  // Front face print (faces -x in freezer drawer slot)
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateY(-Math.PI / 2), frontPrint);
  front.position.set(-L / 2 - 0.0004, H / 2, 0);
  g.add(front);

  // Hinged lid along far (+x) edge
  const hinge = new THREE.Group(); hinge.position.set(L / 2, H, 0); g.add(hinge);
  const lid = mesh(new THREE.BoxGeometry(L, t, W), inner); lid.position.set(-L / 2, t / 2, 0); hinge.add(lid);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2), print);
  top.position.set(-L / 2, t + 0.0004, 0); hinge.add(top);

  // 6 miniature cone stand-ins inside the box (arranged 3 along x by 2 along z)
  const pieces = [];
  const flavors = ['vanilla', 'vanilla', 'strawberry', 'strawberry', 'chocolate', 'chocolate'];
  for (let i = 0; i < C.count; i++) {
    const f = flavors[i], fcfg = C.flavors[f];
    const coneGroup = new THREE.Group();
    // Tiny wrapped cone
    const wrapMat = std(fcfg.wrap, 0.4);
    const coneGeo = new THREE.ConeGeometry(0.016, 0.07, 10).rotateX(Math.PI);
    coneGroup.add(mesh(coneGeo, wrapMat));
    // Mini scoop
    const scoopGeo = new THREE.SphereGeometry(0.017, 10, 8);
    const scoopMesh = mesh(scoopGeo, std(fcfg.color, 0.8));
    scoopMesh.position.y = 0.038;
    coneGroup.add(scoopMesh);

    const xi = i % 3, zi = Math.floor(i / 3);
    coneGroup.position.set(-L * 0.3 + xi * L * 0.3, t + 0.036, (zi - 0.5) * W * 0.45);
    coneGroup.rotation.z = 0.15 * (zi ? -1 : 1);
    g.add(coneGroup); pieces.push(coneGroup);
  }

  return {
    object: g,
    grip: [0, H / 2, 0],
    show(item) {
      const open = item.pkg !== 'closed';
      hinge.rotation.z = open ? -1.9 : 0;
      pieces.forEach((p, i) => { p.visible = open && i < (item.amount ?? C.count); });
    },
  };
}

/** Builds an individual ice cream cone for the given flavour. */
function buildCone(flavorKey) {
  const fcfg = C.flavors[flavorKey];
  return (def, still = false) => {
    const g = new THREE.Group();
    const body = new THREE.Group();

    // Waffle cone: height 0.09 m, top radius 0.024 m, pointed down
    const waffleGeo = new THREE.ConeGeometry(0.024, 0.09, 16).rotateX(Math.PI);
    const waffleMat = std(C.cone.waffle, 0.85);
    const waffleMesh = mesh(waffleGeo, waffleMat);
    waffleMesh.position.y = 0.045;
    body.add(waffleMesh);

    // Ice cream scoop: hemisphere/sphere sitting on top of the waffle cone
    const scoopGeo = new THREE.SphereGeometry(0.026, 16, 14);
    const scoopMat = std(fcfg.color, 0.75);
    const scoopMesh = mesh(scoopGeo, scoopMat);
    scoopMesh.position.y = 0.092;
    scoopMesh.scale.set(1, 1.05, 1);
    body.add(scoopMesh);

    // Cute swirl tip on top
    const swirlGeo = new THREE.ConeGeometry(0.011, 0.018, 12);
    const swirlMesh = mesh(swirlGeo, scoopMat);
    swirlMesh.position.y = 0.12;
    body.add(swirlMesh);

    // Paper wrapper: covers the cone when wrapped (pkg === 'closed')
    const wrapGeo = new THREE.ConeGeometry(0.025, 0.082, 16).rotateX(Math.PI);
    const wrapMat = std(fcfg.wrap, 0.5);
    const wrapMesh = mesh(wrapGeo, wrapMat);
    wrapMesh.position.y = 0.049;

    // Paper band with decorative collar around scoop edge
    const collarGeo = new THREE.CylinderGeometry(0.026, 0.024, 0.015, 16);
    const collarMat = std(0xffffff, 0.4);
    const collarMesh = mesh(collarGeo, collarMat);
    collarMesh.position.y = 0.09;
    wrapMesh.add(collarMesh);

    g.add(body, wrapMesh);

    const look = (item) => {
      wrapMesh.visible = item.pkg === 'closed';
      const amt = item.amount ?? 1;
      if (amt >= 0.5) {
        // First bites eat off the swirl and top scoop
        scoopMesh.visible = true;
        swirlMesh.visible = amt > 0.8;
        const k = (amt - 0.5) / 0.5;
        scoopMesh.scale.set(0.6 + 0.4 * k, 0.4 + 0.65 * k, 0.6 + 0.4 * k);
        scoopMesh.position.y = 0.082 + 0.01 * k;
        waffleMesh.scale.set(1, 1, 1);
        waffleMesh.position.y = 0.045;
      } else {
        // Later bites eat down into the waffle cone
        scoopMesh.visible = false;
        swirlMesh.visible = false;
        const k = Math.max(0.2, amt / 0.5);
        waffleMesh.scale.set(k, k, k);
        waffleMesh.position.y = 0.045 * k;
      }
    };

    if (still) look({ pkg: 'closed', amount: 1 });
    return { object: g, grip: [0, 0.03, 0], show: look };
  };
}

export const ICECREAM_BUILDERS = {
  iceCreamBox: buildIceCreamBox,
  iceCreamConeVanilla: buildCone('vanilla'),
  iceCreamConeStrawberry: buildCone('strawberry'),
  iceCreamConeChocolate: buildCone('chocolate'),
};
