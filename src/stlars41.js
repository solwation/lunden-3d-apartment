import * as THREE from 'three';

const BRICK = 0xb48770;
const PLINTH = 0xb4b1aa;
const FRAME = 0xf2f1ec;
const ROOF = 0x52585a;
const CHIMNEY_CAP = 0x3b3f43;
const DOOR = 0x4a3c31;

const plain = g => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); return g; };

function makeQuad(p0, p1, p2, p3, c0, c1, c2, c3) {
  const g = new THREE.BufferGeometry();
  // Two triangles: p0-p1-p2 and p0-p2-p3
  const pos = [
    ...p0, ...p1, ...p2,
    ...p0, ...p2, ...p3
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const col = [
    ...c0, ...c1, ...c2,
    ...c0, ...c2, ...c3
  ];
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Build Building 41 (Sankt Lars väg 41) based on Peter Sondhauss 2014 Wikimedia Commons photo. */
export function buildStLars41(b, p, base, bottom, parts) {
  // Polygon origin and local (u, v) basis
  // p[0] is southwest corner [-58.26, 284.51]
  const origin = p[0];
  const dx_len = p[1][0] - origin[0];
  const dz_len = p[1][1] - origin[1];
  const len_total = Math.hypot(dx_len, dz_len); // ~28.22m
  const ux = dx_len / len_total;
  const uz = dz_len / len_total;
  const vx = -uz;
  const vz = ux;

  const toWorld = (u, v, y) => [
    origin[0] + u * ux + v * vx,
    y,
    origin[1] + u * uz + v * vz
  ];

  const colBrick = new THREE.Color(BRICK).toArray();
  const colPlinth = new THREE.Color(PLINTH).toArray();

  const plinthH = base + 0.4;
  const eave2 = base + 6.0; // 2 storeys
  const eave3 = base + 9.0; // 3 storeys

  // Wall quad helper: wall segment from (u0, v0) to (u1, v1) between yLo and yHi
  function addWallSegment(u0, v0, u1, v1, yLo, yHi) {
    if (yLo < plinthH && yHi > plinthH) {
      // Split into plinth part and brick part
      addWallSegment(u0, v0, u1, v1, yLo, plinthH);
      addWallSegment(u0, v0, u1, v1, plinthH, yHi);
      return;
    }
    const c = yLo < plinthH ? colPlinth : colBrick;
    const p0 = toWorld(u0, v0, yLo);
    const p1 = toWorld(u1, v1, yLo);
    const p2 = toWorld(u1, v1, yHi);
    const p3 = toWorld(u0, v0, yHi);
    parts.facade.push(makeQuad(p0, p1, p2, p3, c, c, c, c));
  }

  // 1. Exterior wall segments:
  // South facade (continuous along v = 0)
  addWallSegment(0, 0, 7.46, 0, bottom, eave3);
  addWallSegment(7.46, 0, 20.43, 0, bottom, eave2);
  addWallSegment(20.43, 0, 28.22, 0, bottom, eave3);

  // East facade (along u = 28.22)
  addWallSegment(28.22, 0, 28.22, 24.31, bottom, eave3);

  // North facade of east pavilion (v = 24.31)
  addWallSegment(28.22, 24.31, 20.43, 24.31, bottom, eave3);

  // Risalit east return wall (along u = 20.43)
  addWallSegment(20.43, 24.31, 20.43, 30.44, bottom, eave2);

  // Risalit north front facade (along v = 30.44)
  addWallSegment(20.43, 30.44, 7.46, 30.44, bottom, eave2);

  // Risalit west return wall (along u = 7.46)
  addWallSegment(7.46, 30.44, 7.46, 24.32, bottom, eave2);

  // North facade of west pavilion (v = 24.32)
  addWallSegment(7.46, 24.32, 0, 24.32, bottom, eave3);

  // West facade (along u = 0)
  addWallSegment(0, 24.32, 0, 0, bottom, eave3);

  // Upper inner walls above 2nd floor for the 3-storey corner pavilions:
  // West pavilion east face from eave2 to eave3
  addWallSegment(7.46, 24.32, 7.46, 0, eave2, eave3);
  // East pavilion west face from eave2 to eave3
  addWallSegment(20.43, 0, 20.43, 24.31, eave2, eave3);

  // 2. Cornices (projecting frieze bands at eaves):
  const colCornice = new THREE.Color(0xa87560).toArray();
  function addCornice(u0, v0, u1, v1, y, proj = 0.35, height = 0.35) {
    const du = u1 - u0, dv = v1 - v0, len = Math.hypot(du, dv);
    if (len < 0.01) return;
    const nu = -dv / len * proj, nv = du / len * proj;
    // Lower outward face
    const p0 = toWorld(u0 + nu, v0 + nv, y - height);
    const p1 = toWorld(u1 + nu, v1 + nv, y - height);
    const p2 = toWorld(u1 + nu, v1 + nv, y);
    const p3 = toWorld(u0 + nu, v0 + nv, y);
    parts.facade.push(makeQuad(p0, p1, p2, p3, colCornice, colCornice, colCornice, colCornice));
    // Underside
    const u0w = toWorld(u0, v0, y - height), u1w = toWorld(u1, v1, y - height);
    parts.facade.push(makeQuad(u0w, u1w, p1, p0, colCornice, colCornice, colCornice, colCornice));
  }

  // West pavilion cornice at eave3
  addCornice(0, 0, 7.46, 0, eave3);
  addCornice(7.46, 0, 7.46, 24.32, eave3);
  addCornice(7.46, 24.32, 0, 24.32, eave3);
  addCornice(0, 24.32, 0, 0, eave3);

  // East pavilion cornice at eave3
  addCornice(20.43, 0, 28.22, 0, eave3);
  addCornice(28.22, 0, 28.22, 24.31, eave3);
  addCornice(28.22, 24.31, 20.43, 24.31, eave3);
  addCornice(20.43, 24.31, 20.43, 0, eave3);

  // Central section & risalit cornice at eave2
  addCornice(7.46, 0, 20.43, 0, eave2);
  addCornice(20.43, 24.31, 20.43, 30.44, eave2);
  addCornice(20.43, 30.44, 7.46, 30.44, eave2);
  addCornice(7.46, 30.44, 7.46, 24.32, eave2);

  // 3. Flat roofs (in parts.roof):
  function addRoofQuad(u0, v0, u1, v1, y) {
    const p0 = toWorld(u0, v0, y);
    const p1 = toWorld(u1, v0, y);
    const p2 = toWorld(u1, v1, y);
    const p3 = toWorld(u0, v1, y);
    // Roof quad facing up
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p0, ...p2, ...p3], 3));
    g.computeVertexNormals();
    parts.roof.push(plain(g));
  }
  // West pavilion roof
  addRoofQuad(0, 0, 7.46, 24.32, eave3 + 0.05);
  // East pavilion roof
  addRoofQuad(20.43, 0, 28.22, 24.31, eave3 + 0.05);
  // Middle section roof (central link + risalit)
  addRoofQuad(7.46, 0, 20.43, 30.44, eave2 + 0.05);

  // 4. Chimneys on corner pavilions:
  function addChimney(u, v, yBase, w = 0.8, h = 1.3) {
    const u0 = u - w / 2, u1 = u + w / 2, v0 = v - w / 2, v1 = v + w / 2;
    // 4 sides
    addWallSegment(u0, v0, u1, v0, yBase, yBase + h);
    addWallSegment(u1, v0, u1, v1, yBase, yBase + h);
    addWallSegment(u1, v1, u0, v1, yBase, yBase + h);
    addWallSegment(u0, v1, u0, v0, yBase, yBase + h);
    // Dark cap
    const p0 = toWorld(u0 - 0.05, v0 - 0.05, yBase + h);
    const p1 = toWorld(u1 + 0.05, v0 - 0.05, yBase + h);
    const p2 = toWorld(u1 + 0.05, v1 + 0.05, yBase + h);
    const p3 = toWorld(u0 - 0.05, v1 + 0.05, yBase + h);
    const cCap = new THREE.Color(CHIMNEY_CAP).toArray();
    parts.facade.push(makeQuad(p0, p1, p2, p3, cCap, cCap, cCap, cCap));
  }
  addChimney(3.7, 5.5, eave3);
  addChimney(3.7, 18.5, eave3);
  addChimney(24.3, 5.5, eave3);
  addChimney(24.3, 18.5, eave3);

  // 5. Windows and Doors:
  const colFrame = new THREE.Color(FRAME).toArray();
  const colDoor = new THREE.Color(DOOR).toArray();

  function addWindow(u, v, floor, normalU, normalV, isDoor = false) {
    const yCenter = isDoor ? base + 1.2 : base + floor * 3.0 + 1.75;
    const winW = isDoor ? 1.4 : 1.05;
    const winH = isDoor ? 2.4 : 1.7;
    const frameW = winW + 0.2;
    const frameH = winH + 0.2;

    const nLen = Math.hypot(normalU, normalV);
    const nu = normalU / nLen, nv = normalV / nLen;
    // Tangent along wall
    const tu = -nv, tv = nu;

    const pw = toWorld(u, v, yCenter);
    const rotY = Math.atan2(nu * ux + nv * vx, nu * uz + nv * vz);

    // Frame quad
    const f0 = toWorld(u - tu * frameW / 2 + nu * 0.02, v - tv * frameW / 2 + nv * 0.02, yCenter - frameH / 2);
    const f1 = toWorld(u + tu * frameW / 2 + nu * 0.02, v + tv * frameW / 2 + nv * 0.02, yCenter - frameH / 2);
    const f2 = toWorld(u + tu * frameW / 2 + nu * 0.02, v + tv * frameW / 2 + nv * 0.02, yCenter + frameH / 2);
    const f3 = toWorld(u - tu * frameW / 2 + nu * 0.02, v - tv * frameW / 2 + nv * 0.02, yCenter + frameH / 2);
    parts.facade.push(makeQuad(f0, f1, f2, f3, colFrame, colFrame, colFrame, colFrame));

    if (isDoor) {
      // Door panel
      const d0 = toWorld(u - tu * winW / 2 + nu * 0.03, v - tv * winW / 2 + nv * 0.03, yCenter - winH / 2);
      const d1 = toWorld(u + tu * winW / 2 + nu * 0.03, v + tv * winW / 2 + nv * 0.03, yCenter - winH / 2);
      const d2 = toWorld(u + tu * winW / 2 + nu * 0.03, v + tv * winW / 2 + nv * 0.03, yCenter + winH / 2);
      const d3 = toWorld(u - tu * winW / 2 + nu * 0.03, v - tv * winW / 2 + nv * 0.03, yCenter + winH / 2);
      parts.facade.push(makeQuad(d0, d1, d2, d3, colDoor, colDoor, colDoor, colDoor));
    } else {
      // Glass pane
      const g = new THREE.PlaneGeometry(winW, winH);
      g.rotateY(rotY);
      g.translate(pw[0] + (nu * ux + nv * vx) * 0.03, yCenter, pw[2] + (nu * uz + nv * vz) * 0.03);
      parts.glass.push(plain(g));
    }
  }

  // Windows on West pavilion:
  // North face (normal is +v)
  addWindow(2.2, 24.32, 0, 0, 1, true); // Arched main portal
  addWindow(5.3, 24.32, 0, 0, 1);
  addWindow(2.2, 24.32, 1, 0, 1);
  addWindow(5.3, 24.32, 1, 0, 1);
  addWindow(2.2, 24.32, 2, 0, 1);
  addWindow(5.3, 24.32, 2, 0, 1);

  // West face (normal is -u)
  for (const v of [3.5, 8.0, 12.5, 17.0, 21.0]) {
    for (let fl = 0; fl < 3; fl++) addWindow(0, v, fl, -1, 0);
  }

  // South face of west pavilion (normal is -v)
  addWindow(2.2, 0, 0, 0, -1);
  addWindow(5.3, 0, 0, 0, -1);
  addWindow(2.2, 0, 1, 0, -1);
  addWindow(5.3, 0, 1, 0, -1);
  addWindow(2.2, 0, 2, 0, -1);
  addWindow(5.3, 0, 2, 0, -1);

  // Windows on East pavilion:
  // North face (normal is +v)
  addWindow(22.4, 24.31, 0, 0, 1, true); // Side entrance door
  addWindow(26.2, 24.31, 0, 0, 1);
  addWindow(22.4, 24.31, 1, 0, 1);
  addWindow(26.2, 24.31, 1, 0, 1);
  addWindow(22.4, 24.31, 2, 0, 1);
  addWindow(26.2, 24.31, 2, 0, 1);

  // East face (normal is +u)
  for (const v of [3.5, 8.0, 12.5, 17.0, 21.0]) {
    for (let fl = 0; fl < 3; fl++) addWindow(28.22, v, fl, 1, 0);
  }

  // South face of east pavilion (normal is -v)
  addWindow(22.4, 0, 0, 0, -1);
  addWindow(26.2, 0, 0, 0, -1);
  addWindow(22.4, 0, 1, 0, -1);
  addWindow(26.2, 0, 1, 0, -1);
  addWindow(22.4, 0, 2, 0, -1);
  addWindow(26.2, 0, 2, 0, -1);

  // Windows on Middle section & Risalit:
  // Risalit north front (normal is +v)
  for (const u of [10.2, 13.95, 17.7]) {
    addWindow(u, 30.44, 0, 0, 1);
    addWindow(u, 30.44, 1, 0, 1);
  }
  // Risalit east return (normal is +u)
  addWindow(20.43, 27.4, 0, 1, 0);
  addWindow(20.43, 27.4, 1, 1, 0);
  // Risalit west return (normal is -u)
  addWindow(7.46, 27.4, 0, -1, 0);
  addWindow(7.46, 27.4, 1, -1, 0);

  // South face of middle section (normal is -v)
  for (const u of [10.2, 13.95, 17.7]) {
    addWindow(u, 0, 0, 0, -1);
    addWindow(u, 0, 1, 0, -1);
  }

  return { eave: eave3 };
}
