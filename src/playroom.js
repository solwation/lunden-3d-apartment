import { clubhouseLayout, clubhouseSigns } from './clubhouse.js';
import { Billiards } from './billiards.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLAYROOM as R, COURTYARD, COMPUTER_MEDIA } from './config.js';
import { computerFurniture } from './computerfurniture.js';
import { restTarget } from './rest.js';
import { PlayroomDevices } from './playroomdevices.js';
import { PlayroomMusic } from './playroommusic.js';
import { PlayroomSound } from './playroomsound.js';
import { clubhouseWallBoxes, clubhouseSkirting } from './clubhousefinish.js';
import { buildAO, buildWallAO, rectPts } from './ao.js';
import { architectureEdges } from './architectureedges.js';
import { buildContactShadows } from './contactshadow.js';
import { clubhouseSurface, clubhouseMaterial, FINISH, CLUB_ZONES } from './clubhousematerials.js';
import { clubhouseRoundedBox, cinemaChair } from './clubhousefurnishings.js';
import { CinemaCurtains } from './cinemacurtains.js';
import { clubhouseExitSigns } from './clubhouseexit.js';
import { playroomCinema } from './playroomcinema.js';
import { CinemaPosters } from './cinemaposters.js';
import { roomPosters } from './playroomposters.js';
import { PopcornCart, popcornCartParts, popcornSign, popcornLamp, popcornFootprints } from './popcorn.js';

// #1319 / #1326: the playhouse's secret children's room. A hidden interior, far outside the walkable area (see PLAYROOM in
// config.js): the playhouse door teleports any avatar in, the door in the room's south wall back out.
// Nothing here is drawn (or has a draw call) while the visitor is outside: the whole group is hidden until `setInside(true)`.
// #1374: clubhouse.js adds the hall and three rooms; static signs share the existing ceiling-panel draw.
// #1327/#1365: child-sized furniture, usable TV/computer, and a switchable disco ball with sweeping light spots.
// The billiard table (#1328, billiards.js) stays in the middle. Everything is a few
// merged meshes (shell/furniture, signs with ceiling panels, ball, spots) plus the cinema/computer screens: no extra lights or draws outside.
// Rules/network: #1329, sound: #1330.

const X0 = R.x - R.w / 2, X1 = R.x + R.w / 2, Z0 = R.z - R.d / 2, Z1 = R.z + R.d / 2;
const box = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
// Shared surface IDs add material detail without splitting the existing room batch.
const finishFor = colour => [0x641b27,0x8e2635,0xb8494d,0x6a2631,0xd33a2c].includes(colour) ? FINISH.fabric
  : colour === 0x553b35 ? FINISH.wood : [0xb8874d,0x8b9099].includes(colour) ? FINISH.metal : FINISH.paint;
const paint = (g, colour, finish = finishFor(colour)) => clubhouseSurface(g,colour,finish);
const cbox = (colour,x0,x1,y0,y1,z0,z1) => paint(clubhouseRoundedBox(R.x+x0,R.x+x1,y0,y1,R.z+z0,R.z+z1),colour);
const rect = (x0, x1, z0, z1) => [[R.x + x0, R.z + z0], [R.x + x1, R.z + z0], [R.x + x1, R.z + z1], [R.x + x0, R.z + z1]]; // a footprint (convex, world)
const merged = (list, material) => { const mesh = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), material); mesh.receiveShadow = false; return mesh; };

/** Is (x, z) in the room (a metre of margin, so the whole body and the camera count)? */
export const inPlayroom = (x, z) => x > X0 - 1 && x < X1 + 1 && z > Z0 - 1 && z < Z1 + 1;

export class Playroom {
  constructor() {
    const t = R.finish.wallDepth, h = R.ceiling, dw = R.door.w / 2, dh = R.door.h;
    this.object = new THREE.Group();
    this.object.name = 'playroom';
    this.object.visible = false; // drawn only while the visitor is inside
    this.floorY = 0;
    this.ceiling = h;
    this.bounds = { x0: X0, x1: X1, z0: Z0, z1: Z1 };
    // collision: the four inner walls (the exit is a door you use, not an opening)
    this.segments = [[X0, Z0, X1, Z0], [X1, Z0, X1, Z1], [X1, Z1, X0, Z1], [X0, Z1, X0, Z0]];
    const layout=clubhouseLayout();
    const wallBoxes = clubhouseWallBoxes(layout);
    const walls = wallBoxes.map(([a,b,c,d,e,f]) => box(R.x+a,R.x+b,c,d,R.z+e,R.z+f));
    this.discoWalls=layout.boxes.map(([a,b,c,d,e,f])=>[R.x+a,R.x+b,c,d,R.z+e,R.z+f]);
    this.segments.push(...layout.segments.map(([a,b,c,d])=>[R.x+a,R.z+b,R.x+c,R.z+d]));
    const skirtBoxes = clubhouseSkirting(wallBoxes);
    const trim = [...skirtBoxes.map(([a,b,c,d,e,f]) => box(R.x+a,R.x+b,c,d,R.z+e,R.z+f)),
      box(R.x - dw - 0.07, R.x - dw, 0, dh + 0.07, Z1 - 0.04, Z1), box(R.x + dw, R.x + dw + 0.07, 0, dh + 0.07, Z1 - 0.04, Z1), box(R.x - dw - 0.07, R.x + dw + 0.07, dh, dh + 0.07, Z1 - 0.04, Z1)]; // door frame
    const door = [box(R.x - dw, R.x + dw, 0, dh, Z1 - 0.03, Z1)];
    const handle = [box(R.x + dw - 0.2, R.x + dw - 0.12, 0.72, 0.78, Z1 - 0.07, Z1 - 0.03)];
    const lamp = [];
    // #1570: the BIO's own ceiling panel (x<0, north half) is built by playroomcinema.js so it can dim during a film; #1574: BILJARD's and SPEL's panels are in the poster mesh (zone levels)
    for(const x of [-2*R.clubhouse.side,0,2*R.clubhouse.side])for(const z of [(Z0+R.z+R.clubhouse.front)/2,(Z1+R.z+R.clubhouse.front)/2])
      if(z>R.z)lamp.push(box(R.x+x-0.6,R.x+x+0.6,h-0.03,h,z-0.6,z+0.6));
    lamp.push(popcornLamp()); layout.signs.push(popcornSign()); // #1567: the popcorn cart's heat lamp and sign share the atlas draw
    this.object.add(clubhouseSigns(layout,lamp));
    // ---- furniture (#1327), local metres from the room's centre: x east, z south (the door), y up
    const F = R.furniture, cinema = F.cinema, S = cinema.seat, scr = cinema.screen, tv = F.tv;
    const col = { seat: 0x641b27, velvet: 0x8e2635, piping: 0xb8494d, brass: 0xb8874d, rug: 0x6a2631, wood: 0x553b35, dark: 0x17171d, white: 0xf2f2f2, red: 0xd33a2c, blue: 0x2f6fd0, steel: 0x8b9099 };
    const DS = F.discoSwitch, tvz = scr.z, tvx = scr.x, cd = 0.12;

    const W=R.clubhouse.welcome,edge=R.clubhouse.label.offset;
    const fur = [
      cbox(col.dark,W.x-W.w/2,W.x+W.w/2,W.y-W.h/2,W.y+W.h/2,W.z-R.clubhouse.wall,W.z-edge),
      ...[-1,1].map(side=>cbox(col.steel,W.x+side*W.w/3-edge,W.x+side*W.w/3+edge,W.y+W.h/2,h,W.z-R.clubhouse.wall/2-edge,W.z-R.clubhouse.wall/2+edge)),
      // A dark-red carpet leaves a clear central aisle between the two seat banks.
      cbox(col.rug, tvx + cd, cinema.seat.rowX[1] + S.depth / 2 + 0.15, 0, R.finish.rugHeight, -3.75, 0.48),
      // The large west-wall screen has a shallow frame, gathered red velvet curtains and a wall-wide dark velvet valance.
      cbox(col.wood, tvx - 0.02, tvx + 0.06, scr.bottom - 0.08, scr.bottom + scr.h + 0.08, tvz - scr.w / 2 - 0.08, tvz + scr.w / 2 + 0.08),
      cbox(col.dark, tvx + 0.06, tvx + 0.075, scr.bottom - 0.02, scr.bottom + scr.h + 0.02, tvz - scr.w / 2 - 0.02, tvz + scr.w / 2 + 0.02),
      cbox(col.velvet, tvx + 0.025, tvx + 0.13, scr.bottom + scr.h + 0.08, h, -R.d/2, R.clubhouse.front-R.clubhouse.wall/2),
      ...cinema.seat.rowX.flatMap(x => cinema.seat.z.flatMap(z => cinemaChair(x,z))),
      // #1365: the light switch by the door (the disco ball, TV and PC are also targets themselves)
      cbox(col.white, DS.x - 0.05, DS.x + 0.05, DS.y - 0.07, DS.y + 0.07, R.d / 2 - 0.012, R.d / 2),
      // the disco ball's mount and cord
      cbox(col.steel, F.ball.x - 0.04, F.ball.x + 0.04, h - 0.03, h, F.ball.z - 0.04, F.ball.z + 0.04), cbox(col.steel, F.ball.x - 0.005, F.ball.x + 0.005, F.ball.y + F.ball.r, h - 0.03, F.ball.z - 0.005, F.ball.z + 0.005),
    ];
    fur.push(...computerFurniture());
    fur.push(...popcornCartParts()); // #1567: the popcorn cart and its bin in the entry
    // Shallow diffusers sit inside a slim rounded frame instead of floating light squares.
    const rim=R.appearance.panelRimWidth;
    for(const x of [-2*R.clubhouse.side,0,2*R.clubhouse.side])for(const z of [(-R.d/2+R.clubhouse.front)/2,(R.d/2+R.clubhouse.front)/2]) {
      for(const side of [-1,1]) {
        const e=x+side*.6;
        fur.push(cbox(col.white,e-rim/2,e+rim/2,h-.065,h-.025,z-.6,z+.6));
        const f=z+side*.6;
        fur.push(cbox(col.white,x-.6,x+.6,h-.065,h-.025,f-rim/2,f+rim/2));
      }
    }
    // #1424: a small DJ bench; every dimension/placement is a fantasy-room guess.
    const DJ = R.dj, djBox = (color, a,b,c,d,e,f) => cbox(color, DJ.x+a,DJ.x+b,c,d,DJ.z+e,DJ.z+f);
    // #1620: the podium (a low step-up platform, floorAt below) and the counter body on its south edge; the legs of the old bench are gone
    const PD = DJ.podium, pbox = (color, y0, y1) => cbox(color, PD.x0, PD.x1, y0, y1, PD.z0, PD.z1);
    fur.push(pbox(col.dark, 0, PD.h - .012), pbox(col.wood, PD.h - .012, PD.h));
    fur.push(djBox(col.dark,-DJ.w/2,DJ.w/2,PD.h,DJ.h-DJ.top,-DJ.d/2,DJ.d/2),djBox(col.wood,-DJ.w/2-.02,DJ.w/2+.02,DJ.h-DJ.top,DJ.h,-DJ.d/2-.02,DJ.d/2+.02));
    fur.push(djBox(col.dark,-.57,.57,DJ.h,DJ.h+.055,-.22,.22),djBox(col.steel,-.12,.12,DJ.h+.055,DJ.h+.065,-.18,.18));
    for (const x of [-.35,.35]) {
      fur.push(paint(new THREE.CylinderGeometry(.16,.16,.018,12).translate(R.x+DJ.x+x,DJ.h+.064,R.z+DJ.z),col.steel));
      fur.push(paint(new THREE.CylinderGeometry(.035,.035,.02,8).translate(R.x+DJ.x+x,DJ.h+.074,R.z+DJ.z),col.dark));
      for(const z of [-.15,.15])fur.push(djBox(col.blue,x-.025,x+.025,DJ.h+.055,DJ.h+.065,z-.018,z+.018));
    }
    for(const x of [-.065,.065])for(const z of [-.1,0])
      fur.push(paint(new THREE.CylinderGeometry(.018,.018,.025,6).translate(R.x+DJ.x+x,DJ.h+.0775,R.z+DJ.z+z),col.dark));
    fur.push(djBox(col.dark,-.075,.075,DJ.h+.065,DJ.h+.069,.09,.11),djBox(col.red,-.012,.012,DJ.h+.069,DJ.h+.085,.075,.125));
    const cinemaParts = playroomCinema(cbox, paint, col.dark, col.steel); // #1570: 7.1 + height speakers, wall sconces (dimmed while a film runs)
    fur.push(...cinemaParts.fur);
    this.posters = new CinemaPosters(); fur.push(...this.posters.frames(cbox, col.brass, col.dark)); // #1575: the BIO's film posters (frames in this batch, faces one atlas)
    const furMat = clubhouseMaterial();
    // Collision edges stop at each chair; the wide center aisle and the route behind the rear row stay open.
    this.footprints = [rect(DJ.x-DJ.w/2-.02,DJ.x+DJ.w/2+.02,DJ.z-DJ.d/2-.02,DJ.z+DJ.d/2+.02), ...cinema.seat.rowX.flatMap((x) => cinema.seat.z.map((z) => rect(x - S.depth / 2, x + S.depth / 2, z - S.width / 2, z + S.width / 2))),
      rect(tvx - 0.02, tvx + 0.075, -R.d/2, R.clubhouse.front-R.clubhouse.wall/2),
      ...COMPUTER_MEDIA.stations.filter(s=>s.clubhouse).flatMap(s=>{const D=COMPUTER_MEDIA.desk,x=s.x-R.x,z=s.z-R.z,cx=x+Math.sin(s.yaw)*D.seatOffset;return[rect(x-D.depth/2,x+D.depth/2,z-D.width/2,z+D.width/2),rect(cx-D.chair[2]/2,cx+D.chair[2]/2,z-D.chair[0]/2,z+D.chair[0]/2)];}),
      ...popcornFootprints().map(([a,b,c,d])=>rect(a,b,c,d)), // #1567: the popcorn cart and its bin
      ...cinemaParts.footprints.map(([a,b,c,d])=>rect(a,b,c,d))]; // #1570: floor-standing fronts, centre speaker and subwoofer
    for (const q of this.footprints) for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; this.segments.push([a[0], a[1], b[0], b[1]]); }
    // the individual cinema and computer chairs carry invisible pick boxes for the ordinary E / touch rest targets
    this.targets = [];
    const seatAt = (name, verb, x, z, w, d, yaw, spots) => {
      const pick = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.set(R.x + x, 0.25, R.z + z); pick.rotation.y = yaw; pick.updateMatrixWorld(true);
      pick.userData.rest = { kind: 'sit', name, verb, spots };
      pick.userData.door = pick.userData.interact = restTarget(pick, { x: R.x + x, z: R.z + z, level: 0 }, 0);
      this.object.add(pick); this.targets.push(pick.userData.interact);
    };
    cinema.seat.rowX.forEach((x, row) => cinema.seat.z.forEach((z, i) => {
      const pick = new THREE.Mesh(new THREE.BoxGeometry(S.width, 0.92, S.depth), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.set(R.x + x, 0.48, R.z + z); pick.rotation.y = -Math.PI / 2; pick.updateMatrixWorld(true);
      pick.userData.rest = { kind: 'sit', name: `biostol ${row * cinema.seat.z.length + i + 1}`, verb: 'sätta dig i', spots: [{ x: 0, y: S.height, z: 0.03,
        look: [scr.z - z, x - scr.x, scr.bottom + scr.h / 2] }] };
      pick.userData.door = pick.userData.interact = restTarget(pick, { x: R.x + x, z: R.z + z, level: 0 }, 0);
      this.object.add(pick); this.targets.push(pick.userData.interact);
    }));
    for(const s of COMPUTER_MEDIA.stations.filter(s=>s.clubhouse)){const D=COMPUTER_MEDIA.desk;seatAt(`datorstolen · ${s.name}`, 'sätta dig på', s.x-R.x+Math.sin(s.yaw)*D.seatOffset,s.z-R.z,D.chair[0],D.chair[2],s.yaw,[{x:0,y:D.seat,z:0,aim:[0,0],dir:[0,-1],look:[0,-D.seatOffset,D.monitorY]}]);}
    this.object.userData.furnitureCount = fur.length;
    // the disco ball: a faceted silver sphere that turns, and light spots sweeping over the walls, floor and ceiling (one mesh, no real light)
    const bg0 = new THREE.IcosahedronGeometry(F.ball.r, 2), bg = bg0.index ? bg0.toNonIndexed() : bg0, bn = bg.attributes.position.count, bc = new Float32Array(bn * 3);
    for (let i = 0; i < bn; i += 3) { const f = Math.sin(i * 12.9898) * 43758.5453, v = 0.55 + 0.45 * (f - Math.floor(f)); for (let j = 0; j < 3; j++) bc.set([v, v, v * 1.04], (i + j) * 3); }
    bg.setAttribute('color', new THREE.BufferAttribute(bc, 3)); bg.deleteAttribute('uv');
    this.ball = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.ball.position.set(R.x + F.ball.x, F.ball.y, R.z + F.ball.z);
    this.object.add(this.ball);
    const N = F.ball.spots;
    this.rays = Array.from({ length: N }, (_, i) => { // fixed directions (a golden-angle spiral over the lower hemisphere + a little up), hue each
      const u = (i + 0.5) / N, y = 0.3 - 1.25 * u, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      return { d: [r * Math.cos(a), y, r * Math.sin(a)], c: new THREE.Color().setHSL((i * 0.137) % 1, 1, 0.5) };
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 12), 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 8).map((_, k) => [0, 0, 1, 0, 1, 1, 0, 1][k % 8]), 2));
    sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 12), 3));
    sg.userData.keepCpu = true;
    for (let k = 0; k < N; k++) for (let v = 0; v < 4; v++) this.rays[k].c.toArray(sg.attributes.color.array, k * 12 + v * 3);
    sg.setIndex(Array.from({ length: N }, (_, k) => [k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3]).flat());
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const cx = cv.getContext('2d'), gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 32, 32);
    this.spots = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.spots.frustumCulled = false; this.spots.renderOrder = 2;
    this.object.add(this.spots);
    this.spin = 0;
    // #1365: the disco light can be switched off and on: from the wall switch by the door or by aiming at the ball itself. `onSwitch(name, on)` is the hook
    // for sound (#1330) and for syncing the state later; nothing is saved (the room persists no state) nor shared (local, like the room's props).
    this.discoOn = true; this.onSwitch = null; this.controlPickables = [];
    this.discoTarget = { kind: 'playroomDisco', name: 'discolampan', get verb() { return self.discoOn ? 'släcka' : 'tända'; } };
    const self = this;
    for (const [w, x, y, z, d] of [[0.16, DS.x, DS.y, F.discoSwitch.z, 0.06], [F.ball.r * 3, F.ball.x, F.ball.y, F.ball.z, F.ball.r * 3]]) {
      const pk = new THREE.Mesh(new THREE.BoxGeometry(w, w, d), new THREE.MeshBasicMaterial({ visible: false }));
      pk.position.set(R.x + x, y, R.z + z); pk.userData.door = this.discoTarget; this.discoTarget.pickable ??= pk;
      this.object.add(pk); this.controlPickables.push(pk);
    }
    this.music = new PlayroomMusic();this.sound = new PlayroomSound();
    const speaker = R.speakers;
    for (const x of speaker.x) {
      fur.push(cbox(col.dark, x-speaker.w/2, x+speaker.w/2, speaker.y-speaker.h/2, speaker.y+speaker.h/2, speaker.z-speaker.d/2, speaker.z+speaker.d/2));
      for (const [dy, radius, segments] of [[-.065, .075, 10], [.105, .035, 8]]) {
        fur.push(paint(new THREE.CylinderGeometry(radius, radius, .012, segments).rotateX(Math.PI/2).translate(R.x+x, speaker.y+dy, R.z+speaker.z+speaker.d/2), col.steel));
      }
      const pk = new THREE.Mesh(new THREE.BoxGeometry(speaker.w, speaker.h, speaker.d+.04), new THREE.MeshBasicMaterial({ visible: false }));
      pk.position.set(R.x+x, speaker.y, R.z+speaker.z); pk.userData.door = this.music.target;
      this.music.target.pickable ??= pk; this.object.add(pk); this.controlPickables.push(pk);
    }
    const djPick = new THREE.Mesh(new THREE.BoxGeometry(1.18,.14,.48), new THREE.MeshBasicMaterial({ visible: false }));
    djPick.position.set(R.x+DJ.x,DJ.h+.07,R.z+DJ.z); djPick.userData.door=this.music.target;
    this.object.add(djPick); this.controlPickables.push(djPick);
    this.devices = new PlayroomDevices((name, on) => this.onSwitch?.(name, on));
    this.object.add(this.devices.object); this.controlPickables.push(...this.devices.pickables);
    this.disco(0);
    const C = R.colors, shell = [...walls.map((g) => paint(g, C.wall)), ...trim.map((g) => paint(g, C.trim, FINISH.wood)), ...door.map((g) => paint(g, C.door)), paint(box(X0, X1, -0.1, 0, Z0, Z1), C.floor, FINISH.floor), paint(box(X0, X1, h, h + 0.1, Z0, Z1), C.ceiling), ...handle.map((g) => paint(g, 0x2a2a2a))];
    // Capture construction only, before furniture joins the existing shell batch.
    const edgeRoot = new THREE.Group(), source = merged(shell, furMat);
    source.userData.edgeSources = shell; edgeRoot.add(source);
    const edges = architectureEdges(edgeRoot, { floor: h + 1 });
    for (const line of edges) this.object.add(line);
    source.geometry.dispose();
    const parts = [merged([...shell, ...fur], furMat)]; // shell and furniture share one vertex-coloured mesh; screens animate separately
    for (const m of parts) { m.matrixAutoUpdate = false; this.object.add(m); }
    this.zones = CLUB_ZONES; // #1574: per-room lamp/ambient levels [BIO, BILJARD, SPEL, hall] (live uniforms)
    this.roomPosters = roomPosters(); this.object.add(this.roomPosters.mesh); // #1574: posters, SPEL neon, BILJARD pendants and lamps: one unlit draw, hidden with the room
    this.curtains = new CinemaCurtains(furMat); this.object.add(this.curtains.mesh); // #1619: the masking curtains follow the film's picture ratio
    this.exitSigns = clubhouseExitSigns(); this.object.add(this.exitSigns); // #1619
    this.sconces = cinemaParts.sconces; this.setSconceDim = cinemaParts.setDim; this.object.add(this.sconces);
    this.object.add(this.posters.object); this.controlPickables.push(...this.posters.pickables);
    this.film = false; this.filmOverride = false; this.filmDim = 0; // #1570: a film is running / the light switch overrode the dimming / smoothed dim 0..1
    this.popcorn = new PopcornCart(this.object, furMat); this.controlPickables.push(...this.popcorn.pickables); // #1567 (tubs: main.js, makeTubs)
    // the way out: an invisible pick box in front of the door (the raycaster ignores `visible: false` materials)
    this.exitTarget = { name: 'lekstugan', kind: 'playroomExit', verb: 'gå ut ur' };
    const pick = new THREE.Mesh(new THREE.BoxGeometry(R.door.w + 0.1, R.door.h + 0.1, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(R.x, (R.door.h + 0.1) / 2, Z1 - 0.2);
    pick.userData.door = this.exitTarget;
    this.exitTarget.pickable = pick;
    this.object.add(pick);
    this.billiards = new Billiards();this.billiards.onSound=(...args)=>this.sound.hit(...args);this.object.add(this.billiards.object);this.segments.push(...this.billiards.segments);
    // Reuse L1007's baked floor/ceiling and wall/corner shading, in a small local
    // coordinate frame. Door headers only occlude the ceiling, never the passage floor.
    const ox = -R.w/2-t, oz = -R.d/2-t, size = { x: R.w+2*t, z: R.d+2*t };
    const solids = wallBoxes.map(([a,b,c,d,e,f]) => ({ x0:a-ox, x1:b-ox, z0:e-oz, z1:f-oz, y0:c, y1:d }));
    const floorRects = solids.filter(s => s.y0 <= 0), ceilRects = solids.filter(s => s.y1 >= h);
    const shading = buildAO(size, 0, h, floorRects, ceilRects);
    shading.name = 'clubhouse-ao'; shading.position.set(R.x+ox,0,R.z+oz);
    shading.add(buildWallAO(size, 0, h, solids.map(s => ({ pts:rectPts(s), y0:s.y0, y1:s.y1 })), floorRects.map(rectPts)));
    this.object.add(shading);
    const seatCount = S.rowX.length*S.z.length;
    const shadows = this.footprints.flatMap((points,i) => i === seatCount+1 ? [] : [{
      object:this.object, base:i > 0 && i <= seatCount ? R.finish.rugHeight : 0,
      rects:[{ x0:points[0][0], x1:points[1][0], z0:points[0][1], z1:points[2][1] }],
    }]);
    const B = R.billiards, bw = Math.abs(Math.cos(B.yaw))*(B.length+2*B.rail)+Math.abs(Math.sin(B.yaw))*(B.width+2*B.rail),
      bd = Math.abs(Math.sin(B.yaw))*(B.length+2*B.rail)+Math.abs(Math.cos(B.yaw))*(B.width+2*B.rail);
    shadows.push({ object:this.object, base:0, rects:[{x0:R.x+B.x-bw/2,x1:R.x+B.x+bw/2,z0:R.z+B.z-bd/2,z1:R.z+B.z+bd/2}] });
    this.object.add(buildContactShadows(shadows));
    this.finishInfo = { skirtingRuns:skirtBoxes.length, edgeBatches:edges.length, contactFootprints:shadows.length };
    this.inside = false;
  }

  update(dt,camera,aimed) { if(this.inside){this.sound.update(dt,this.discoOn,this.music.state!=='off');this.billiards.update(dt,camera,aimed);this.devices.update(dt);this.popcorn.update(dt);this.fadeCinema(dt);this.curtains.update(dt);this.roomPosters.setLevel(this.lit/R.lit);if(this.discoOn)this.disco(dt);} }

  /** #1365: switch the disco light on or off (the ball stops and goes dull, the light spots vanish). Returns the badge text. */
  setDisco(on) {
    this.discoOn = !!on;
    this.ball.material.color.setScalar(this.discoOn ? 1 : 0.28);
    this.spots.visible = this.discoOn;
    this.onSwitch?.('disco', this.discoOn);
    return this.discoOn ? 'Discolampan är tänd' : 'Discolampan är släckt';
  }
  toggleDisco() { if (this.film) this.filmOverride = !this.discoOn; return this.setDisco(!this.discoOn); } // #1570: switching the disco on beats the film dimming; #1610: switching it off keeps (or restores) it

  /** #1570: a film is running on the BIO screen (read from the cinema state by main.js each frame). */
  setFilm(on, aspect = 0) {
    on = !!on;
    this.curtains.setAspect(on ? aspect || R.furniture.cinema.curtain.aspect : 0); // #1619: the picture ratio (width / height) of the film, 16:9 while unknown
    if (on === this.film) return;
    this.film = on; this.filmOverride = false; // each start/stop begins again with the automatic dimming
  }
  /** Ease the sconces/ambient toward dimmed (a film runs, no switch override) or lit; the disco spots rest while dimmed. */
  fadeCinema(dt) {
    const target = this.film && !this.filmOverride ? 1 : 0, step = dt / R.sconces.fadeSeconds;
    this.filmDim = dt <= 0 ? this.filmDim : target > this.filmDim ? Math.min(target, this.filmDim + step) : Math.max(target, this.filmDim - step);
    this.setSconceDim(this.filmDim); this.posters.setDim(this.filmDim);
    this.spots.visible = this.discoOn && this.filmDim < 0.5;
  }

  /** Ambient light inside (day.lit): a touch dimmer with the disco on, so its colours read; a film dims it further. */
  get lit() { return R.lit * (this.discoOn ? R.litDisco : 1 - (1 - R.litDisco) * this.filmDim) * (1 - (1 - R.sconces.ambientDim) * this.filmDim); } // #1610: dimmed, the disco makes no difference (switching it off is never brighter)

  /** The disco ball turns and its light spots sweep round the room (only while inside; each spot is where a fixed ray from the ball meets a wall, the floor or the ceiling). */
  disco(dt) {
    const F = R.furniture.ball, h = R.ceiling;
    this.spin += dt;
    this.ball.rotation.y = this.spin * F.spin * Math.PI * 2;
    if (!this.spots.visible) return; // #1610: no beam work or upload while a film keeps the spots hidden
    const ox = R.x + F.x, oy = F.y, oz = R.z + F.z, a = this.spin * F.spotSpin * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), pos = this.spots.geometry.attributes.position.array;
    this.rays.forEach((ry, k) => {
      const dx = ry.d[0] * ca - ry.d[2] * sa, dy = ry.d[1], dz = ry.d[0] * sa + ry.d[2] * ca;
      let t = Infinity, nx = 0, ny = 0, nz = 0;
      const hit = (tt, ax, ay, az) => { if (tt > 0 && tt < t) { t = tt; nx = ax; ny = ay; nz = az; } };
      if (dx > 1e-6) hit((X1 - ox) / dx, -1, 0, 0); else if (dx < -1e-6) hit((X0 - ox) / dx, 1, 0, 0);
      if (dz > 1e-6) hit((Z1 - oz) / dz, 0, 0, -1); else if (dz < -1e-6) hit((Z0 - oz) / dz, 0, 0, 1);
      if (dy > 1e-6) hit((h - oy) / dy, 0, -1, 0); else if (dy < -1e-6) hit((0 - oy) / dy, 0, 1, 0);
      // Actual partition/header entry faces: an open passage lets a ray continue into the hall.
      for(const [a,b,c,d,e,f]of this.discoWalls){
        if(Math.abs(dx)>1e-6){const tt=((dx>0?a:b)-ox)/dx,y=oy+dy*tt,z=oz+dz*tt;if(y>=c&&y<=d&&z>=e&&z<=f)hit(tt,dx>0?-1:1,0,0);}
        if(Math.abs(dy)>1e-6){const tt=((dy>0?c:d)-oy)/dy,x=ox+dx*tt,z=oz+dz*tt;if(x>=a&&x<=b&&z>=e&&z<=f)hit(tt,0,dy>0?-1:1,0);}
        if(Math.abs(dz)>1e-6){const tt=((dz>0?e:f)-oz)/dz,x=ox+dx*tt,y=oy+dy*tt;if(x>=a&&x<=b&&y>=c&&y<=d)hit(tt,0,0,dz>0?-1:1);}
      }
      const px = ox + dx * t + nx * 0.012, py = oy + dy * t + ny * 0.012, pz = oz + dz * t + nz * 0.012, sz = 0.1 + 0.035 * t;
      // the quad's axes in the surface plane: side walls u = z, v = y; end walls u = x, v = y; floor / ceiling u = x, v = z
      const u = nx !== 0 ? [0, 0, 1] : [1, 0, 0], v = ny !== 0 ? [0, 0, 1] : [0, 1, 0];
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let c = 0; c < 4; c++) {
        const [cu, cv] = corners[c], i = k * 12 + c * 3;
        pos[i] = px + (u[0] * cu + v[0] * cv) * sz * 0.5; pos[i + 1] = py + (u[1] * cu + v[1] * cv) * sz * 0.5; pos[i + 2] = pz + (u[2] * cu + v[2] * cv) * sz * 0.5;
      }
    });
    this.spots.geometry.attributes.position.needsUpdate = true;
  }

  contains(x, z) { return inPlayroom(x, z); }

  /** #1620: the floor height under (x, z) in the room: the DJ podium's top inside it (a step under PLAYER.stepUp), else the plain floor. */
  floorAt(x, z) { const P = R.dj.podium, lx = x - R.x, lz = z - R.z; return lx > P.x0 && lx < P.x1 && lz > P.z0 && lz < P.z1 ? this.floorY + P.h : this.floorY; }

  /** Where you stand when you come in (the door behind you, facing into the room). */
  get arrival() { return { x: R.x, z: Z1 - R.standOff, yaw: 0 }; }

  /** Drawn (and its exit pickable live) only while inside. */
  setInside(on) { this.inside = on; this.sound.setInside(on); this.billiards.active = on; this.object.visible = on; this.devices.setInside(on); this.music.setInside(on); this.posters.setInside(on); }

  /** Where you stand when you come out: just north of the playhouse's door, facing away from it. */
  static get outsideSpot() {
    const P = COURTYARD.playhouse;
    return { x: (P.x0 + P.x1) / 2, z: P.z0 - R.outside, yaw: 0 };
  }
}
