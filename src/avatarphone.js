// #2217: a smartphone in a remote figure's right hand while it types in the chat (#2174's pose) or is away (#2216), its screen glowing and casting a
// cool light on the face and hand. Cost: no extra draw call, texture or light. The phone (body, screen, camera island + lenses) is part of every
// variant's shared geometry on the hand bone (facePart PART.body … PART.lens) and collapses to a point unless `uPhone.x` (the pose weight) reaches
// SP.show, as the glasses (#1165/#2173) and the watches (#1334) do. The screen's content is procedural (a chat with a keyboard, scrolling) in the
// avatar's own fragment shader, and the face light is one directional term from the phone's screen towards each fragment in the same shader:
// `uPhoneAt` / `uPhoneN` = the screen's centre and normal in world space, set per render from the hand bone (mesh.onBeforeRender, so mirrors match),
// moved into view space with the fragment shader's viewMatrix: no new varying. Pure helpers first (tools/avatarphonetest.mjs). Tunables:
// AVATAR_SMARTPHONE in config.js. A generic phone: no brand, logo or trademark design.
import * as THREE from 'three';
import { AVATAR_SMARTPHONE as SP } from './config.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
/** The phone's face parts (avatar.js FACE_PART): outside 1 … 39 (the self view hides those as head parts) and below the fingers (100+). */
export const PHONE_PART = { body: 96, screen: 97, island: 98 };

// --- placement -------------------------------------------------------------------------------------------------------------------------------
/** The phone in the hand bone's frame for hand side `sx` (+1 left, −1 right): `at` its centre, `x` / `y` / `z` its unit axes (x across the screen,
 * y towards its top, z out of the screen). Base: the back on the palm, the screen facing out of it (the palm's normal is −sx along the hand's x), the
 * top towards the fingertips (−y); then SP.tilt (Euler about the hand's axes, mirrored for the left hand). Plain arrays. */
export function phoneFrame(sx = -1, P = SP) {
  const z = new THREE.Vector3(-sx, 0, 0), y = new THREE.Vector3(0, -1, 0), x = new THREE.Vector3().crossVectors(y, z);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(P.tilt[0], -sx * P.tilt[1], -sx * P.tilt[2], 'XYZ'));
  for (const v of [x, y, z]) v.applyQuaternion(q);
  return { at: [-sx * P.at[0], P.at[1], P.at[2]], x: x.toArray(), y: y.toArray(), z: z.toArray() };
}
/** The matrix from the phone's own frame to the hand bone's frame. */
export function phoneMatrix(sx = -1, P = SP) {
  const f = phoneFrame(sx, P);
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.x), new THREE.Vector3(...f.y), new THREE.Vector3(...f.z)).setPosition(...f.at);
}

// --- geometry (the phone's own frame: centre at the origin, x across, y up the screen, z out of it) ------------------------------------------
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-x, -h / 2); s.lineTo(x, -h / 2); s.absarc(x, -y, r, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, y); s.absarc(x, y, r, 0, Math.PI / 2, false);
  s.lineTo(-x, h / 2); s.absarc(-x, y, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -y); s.absarc(-x, -y, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
const slab = (w, h, r, depth, seg) => new THREE.ExtrudeGeometry(roundRect(w, h, r), { depth, bevelEnabled: false, curveSegments: seg });
/** The parts: [{ g, part (PHONE_PART key), colour }] in the phone's own frame: the rounded body, the screen just proud of its front (inside the
 * bezel), and on the back a raised rounded camera island at the top left (seen from the back) with three lenses in a column. */
export function phoneParts(P = SP) {
  const [W, H, T] = P.size, [iw, ih, it, ir] = P.island, out = [];
  out.push({ g: slab(W, H, P.corner, T, P.seg).translate(0, 0, -T / 2), part: 'body', colour: P.colours.body });
  out.push({ g: new THREE.ShapeGeometry(roundRect(W - 2 * P.bezel, H - 2 * P.bezel, P.screenCorner), P.seg).translate(0, 0, T / 2 + 0.0002), part: 'screen', colour: P.colours.screen });
  const ix = W / 2 - P.islandAt[0], iy = H / 2 - P.islandAt[1]; // the back's left is the phone's +x
  out.push({ g: slab(iw, ih, ir, it, P.seg).translate(ix, iy, -T / 2 - it), part: 'island', colour: P.colours.island });
  for (let k = -1; k <= 1; k++) out.push({ g: new THREE.CircleGeometry(P.lens, 8).rotateY(Math.PI).translate(ix, iy + k * P.lensGap, -T / 2 - it - 0.0002), part: 'island', colour: P.colours.lens });
  return out;
}
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
/** The triangles the phone adds to every variant's shared geometry (for the budget tests, like glassesExtraTriangles). */
export const phoneExtraTriangles = () => phoneParts().reduce((n, p) => n + tris(p.g), 0);

// --- weight, glow and flicker ----------------------------------------------------------------------------------------------------------------
/** Whether the phone is in the hand at pose weight `w` (0 … 1). */
export const phoneShown = (w, P = SP) => w >= P.show;
/** The screen's light reaching a surface: pose weight `w` (0 = no pose: off), `nDotL` = the surface normal · the direction to the phone, `facing`
 * = the screen normal · the direction to the surface, `dist` m, `rise` m = how far the surface is above the phone (world up), `skin` 1 on bare skin, the lips
 * and the eyes, 0 on clothes and hair. gain × w × max(nDotL, 0) × (spill + (1 − spill) × max(facing, 0)^focus) / (1 + (d / d0)²) × aim, faded to
 * 0 between 0.7 × range and range; aim = mix(low, 1, smoothstep(rise[0], rise[1], rise)) × mix(cloth, 1, skin): the glow belongs to the face, chin
 * and eyes above the screen; the shirt below the collarbone and the holding hand keep only a faint spill. Mirrored in GLSL by phoneLightGLSL. */
export function phoneGlow(w, nDotL, facing, dist, rise = SP.light.rise[1], skin = 1, L = SP.light) {
  if (!(w > 0) || !(dist >= 0) || !(dist < L.range) || !(nDotL > 0)) return 0;
  const f = L.spill + (1 - L.spill) * clamp(facing, 0, 1) ** L.focus;
  const aim = (L.low + (1 - L.low) * smooth(L.rise[0], L.rise[1], Number.isFinite(rise) ? rise : -1)) * (L.cloth + (1 - L.cloth) * clamp(skin, 0, 1));
  return clamp(w, 0, 1) * L.gain * Math.min(1, nDotL) * f / (1 + (dist / L.d0) ** 2) * (1 - smooth(0.7 * L.range, L.range, dist)) * aim;
}
/** The screen's brightness factor at time `t` s (1 − depth … 1): the changing content dims and brightens it a little, never off. */
export function screenFlicker(t, F = SP.flicker) {
  const a = Math.sin(t * F.hz * Math.PI * 2 + 1.7 * Math.sin(t * 0.37)), b = Math.sin(t * 2.3 + 0.5);
  return 1 - F.depth * clamp(0.5 + 0.35 * a + 0.15 * b, 0, 1);
}

// --- shader ----------------------------------------------------------------------------------------------------------------------------------
const f4 = (v) => (+v).toFixed(4), v3 = (a) => `vec3(${a.map(f4).join(', ')})`;
const inPhone = (s) => `(${s} > ${PHONE_PART.body}.0 - 0.5 && ${s} < ${PHONE_PART.island}.0 + 0.5)`;
/** uPhone: x the pose weight, y the screen's clock (s), z its flicker; uPhoneAt / uPhoneN the screen's world centre and normal. */
export const phoneUniforms = () => ({ uPhone: { value: new THREE.Vector4() }, uPhoneAt: { value: new THREE.Vector3() }, uPhoneN: { value: new THREE.Vector3(0, 1, 0) } });
export const PHONE_VDECL = 'uniform vec4 uPhone;';
export const PHONE_FDECL = 'uniform vec4 uPhone; uniform vec3 uPhoneAt, uPhoneN;';
/** Vertex (bind pose, an `else if` in avatar.js faceShape before the face parts): the phone collapses to its centre below SP.show. */
export const phoneVertexGLSL = () => `else if (${inPhone('facePart')}) transformed = faceAnchor + (transformed - faceAnchor) * step(${f4(SP.show)}, uPhone.x); // #2217 (src/avatarphone.js)\n`; // (the newline: the face parts' `else if` follows)
/** Fragment colour (after the suit's colours): the phone keeps its own colours. */
export const phoneColorGLSL = () => `if (${inPhone('vSurface.y')}) diffuseColor.rgb = vColor.rgb; // #2217\n`;
/** Fragment roughness: glossy glass on the screen, satin body. */
export const phoneRoughGLSL = () => `if (${inPhone('vSurface.y')}) roughnessFactor = abs(vSurface.y - ${PHONE_PART.screen}.0) < 0.5 ? 0.1 : 0.35; // #2217\n`;
/** Fragment, after the light factor and the lamps (`outgoingLight`, view-space `normal`, `vViewPosition`, the bind position `vSuitAt`): the screen's
 * emission (a chat over a keyboard: message bubbles scrolling up, keys lighting as they are pressed) and the screen's cool light on everything else.
 * `centre` = the phone's centre in bind space (Vector3), `frame` its axes (phoneFrame). */
export function phoneLightGLSL(centre, frame, eyeParts = [], lipRegion = -1, P = SP) {
  const S = P.screen, L = P.light, hw = P.size[0] / 2 - P.bezel, hh = P.size[1] / 2 - P.bezel;
  return `if (uPhone.x > 0.0) { // #2217: the phone's screen and its light (src/avatarphone.js)
        float phOn = smoothstep(${f4(P.show)}, 1.0, uPhone.x);
        if (${inPhone('vSurface.y')}) {
          if (abs(vSurface.y - ${PHONE_PART.screen}.0) < 0.5) {
            vec3 phQ = vSuitAt - ${v3(centre.toArray())};
            vec2 phS = vec2(dot(phQ, ${v3(frame.x)}) / ${f4(hw)}, dot(phQ, ${v3(frame.y)}) / ${f4(hh)}); // -1 … 1 across / up the screen
            vec3 phC = mix(${v3(S.bg)}, ${v3(S.bgTop)}, 0.5 + 0.5 * phS.y);
            float phK = -1.0 + 2.0 * ${f4(S.kbd)}; // the keyboard's top
            if (phS.y > phK + 0.04) { // the chat: rows scrolling up, bubbles of random length on the left (theirs) or the right (mine)
              float phY = (phS.y - phK) * ${f4(S.rows / 2)} - uPhone.y * ${f4(S.scroll)}, phR = floor(phY), phF = fract(phY);
              float phH = fract(sin(phR * 12.9898) * 43758.5453), phMine = step(0.5, fract(phH * 7.31));
              float phLen = 0.3 + 0.55 * phH, phX = mix(phS.x, -phS.x, phMine);
              float phB = step(0.18, phF) * step(phF, 0.82) * step(-0.9, phX) * step(phX, -0.9 + phLen);
              phC = mix(phC, mix(${v3(S.theirs)}, ${v3(S.mine)}, phMine), phB);
              phC = mix(phC, ${v3(S.bg)} * 0.6, step(0.9, phS.y)); // the status bar
            } else if (phS.y < phK) { // the keyboard: a grid of keys, one lighting now and then
              vec2 phG = vec2((phS.x + 1.0) * ${f4(S.keys[0] / 2)}, (phS.y + 1.0) / (phK + 1.0) * ${f4(S.keys[1])});
              vec2 phI = floor(phG), phD = fract(phG);
              float phKey = step(0.1, phD.x) * step(phD.x, 0.9) * step(0.14, phD.y) * step(phD.y, 0.86);
              float phT = floor(uPhone.y * 6.0), phPx = floor(fract(sin(phT * 78.233) * 43758.5453) * ${f4(S.keys[0])}), phPy = floor(fract(sin(phT * 39.425) * 24634.6345) * ${f4(S.keys[1])});
              float phP = step(abs(phI.x - phPx), 0.5) * step(abs(phI.y - phPy), 0.5);
              phC = mix(phC * 0.7, mix(${v3(S.key)}, ${v3(S.press)}, phP), phKey);
            }
            outgoingLight += phC * ${f4(S.gain)} * uPhone.z * phOn;
          }
        } else {
          vec3 phL = (viewMatrix * vec4(uPhoneAt, 1.0)).xyz + vViewPosition; // the phone − the fragment (the fragment is at −vViewPosition)
          float phD = length(phL); phL /= max(phD, 1e-4);
          float phNL = max(dot(normalize(normal), phL), 0.0), phF = max(dot(normalize((viewMatrix * vec4(uPhoneN, 0.0)).xyz), -phL), 0.0);
          float phG = phNL * (${f4(L.spill)} + ${f4(1 - L.spill)} * pow(phF, ${f4(L.focus)})) / (1.0 + phD * phD / ${f4(L.d0 * L.d0)}) * (1.0 - smoothstep(${f4(0.7 * L.range)}, ${f4(L.range)}, phD));
          float phRise = dot(-phL * phD, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)); // the surface's height above the phone (m)
          float phSkin = max(vBare, ${[...eyeParts.map((e) => `step(abs(vSurface.y - ${e}.0), 0.5)`), `step(abs(vSurface.x - ${lipRegion}.0), 0.5)`].join(' + ')}); // skin, the eyes and the lips
          phG *= mix(${f4(L.low)}, 1.0, smoothstep(${f4(L.rise[0])}, ${f4(L.rise[1])}, phRise)) * mix(${f4(L.cloth)}, 1.0, clamp(phSkin, 0.0, 1.0)); // the face above the screen
          outgoingLight += diffuseColor.rgb * ${v3(L.rgb)} * (${f4(L.gain)} * phOn * uPhone.z * phG);
        }
      }`;
}
export const phoneKey = () => '-phone2217';

/** Per render (so mirrors and the main view agree): the screen's world centre and normal from the hand bone, into `u.uPhoneAt` / `u.uPhoneN`; nothing
 * while the phone is away. `centre` / `normal` in bind space; the skinned mesh's own bone inverse maps them (the procedural and the GLB rig alike). */
export function installPhone(mesh, u, bone, centre, normal) {
  const prev = mesh.onBeforeRender, m = new THREE.Matrix4(), n3 = new THREE.Matrix3();
  let index = -1;
  mesh.onBeforeRender = function (...a) {
    prev?.apply(this, a);
    if (!(u.uPhone.value.x > 0) || !bone || !mesh.skeleton) return;
    if (index < 0 || mesh.skeleton.bones[index] !== bone) index = mesh.skeleton.bones.indexOf(bone);
    if (index < 0) return;
    m.multiplyMatrices(bone.matrixWorld, mesh.skeleton.boneInverses[index]).multiply(mesh.bindMatrix);
    u.uPhoneAt.value.copy(centre).applyMatrix4(m);
    u.uPhoneN.value.copy(normal).applyMatrix3(n3.setFromMatrix4(m)).normalize();
  };
}
