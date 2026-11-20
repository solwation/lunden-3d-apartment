# Graphics, materials and lighting

Read [CLAUDE.md](../../CLAUDE.md) first for shared workflow rules. Paths in code spans and module maps are relative to the repository root.

Related: [performance](performance.md), [plan-material](plan-material.md).

## Character realism goal (#1915)

The user requests higher realism with acceptable performance (2026-11-12), across
characters, animals and related figures, including non-GLB consumers. Restoring
a pre-migration shape is not the requested general visual upgrade. Use comparable
whole-model and actual-view before/after evidence, preserve identity/pose/gameplay,
and compare real scoped render/update/memory costs at fixed inputs and quality.
A format change or a higher polygon count does not establish quality or speed.
[Full coverage, measured baseline, limits and concrete follow-ups](../verification/1915/README.md).

### Player facial surfaces (#1995)

The live `Avatar` recipe uses one continuous cheek/orbit/nose skin instead of a
separate nasal bridge and alar spheres. Front-focused head rings retain the
combined head/nose triangle budget. A shared byte-sized `noseBlend` keeps nose
customization local and flattens the cartilage under the existing suit mask;
head/eye/jaw controls, mouth, rig, poses and protocol remain. Eyelid rims follow
the same head surface and cheek normals. The one Standard material distinguishes
skin, eyes, hair, matte cloth and existing metal accessories, with restrained
bind-space colour detail that fades with pixel footprint. `AVATAR_SURFACE` owns
the artistic assumptions. No image texture, light, pass or frame-time build is
added. The loaded rig still receives this live geometry/material, so the neutral
GLB's standalone inspection surface is unchanged. [Matched views, fixed budget
and software-renderer limitations](../verification/1995/README.md).

**Head silhouette and neck (#2043).** `src/avatarcontour.js` (tunables `AVATAR_CONTOUR`, all *guess*)
joins the authored head rings (`AVATAR_SURFACE.head`, the `AVATAR_FACE.jaw` widths) with a monotone
cubic (`profileAt`, exact on the authored rows and never overshooting them) instead of straight lines,
in the mesh, in `headSculpt`'s jaw widening and in `headFront` (lids and lips seat on the same profile).
`contourRows` adds nine rings only where the outline curves (jaw angle, chin, cheek, back of the
skull, crown) and rounds the chin's flat underside off as a quarter ellipse 6 mm deep (two rings, the
cap centre lowered by `roundChinCap`). The 8-sided capped neck cylinder is replaced by `neckGeometry`:
an open 16-sided column that tapers from the collar, sits set back under the jaw so the underside of
the chin shows, and carries a soft larynx bump (fuller on the male figure); it keeps the old y span
inside the head, so the neck slider stretches it as before. The Spider mask's projection keeps its old
lower edge (`projectionMinY`). Columns, the face-front sculpt, nose, eyes and brows are untouched;
the gameplay head boxes do not read this mesh. +592 triangles per figure (head shell 864 to 1,392,
neck 32 to 96; about +9 % of the head's triangles), one draw.
[Views](../verification/2043/README.md) (`tools/avatarcontour2043browser.cjs`).

**The nose (#2048).** `src/avatarnose.js` (tunables `AVATAR_NOSE`, all *guess*) replaces #1995's single
ridge with a painted tip spot by parametric forms in head-local metres (before `faceWarp`), still on the
one continuous head skin: a `body` profile (narrowest between the eyes, widest at the tip, narrowing
under it into the columella), a fine `ridge` along the dorsum, two `tip` domes, tapered capsule alar
`ala` wings joined by a smooth maximum (`blend`; its fillet shrinks with the lower form, so it never
lifts the face) with a groove along their upper outer edge (`crease`), and `nostril` dips in the steep
underside between the columella and each wing. #2044's nasolabial fold starts just outside the wing.
The head's columns are about 15 mm apart at the nose, so `refineNose` removes the head-ring quads of the
`grid` block (3 columns either side of the middle, rings 0.05–0.142) and puts a 21 × 18 grid on the same
cubic ring profile in their place, zipped to the block's edge (no T-junction; `avatarnosetest` checks that
every shell edge is shared by two triangles). `noseBlend` stays the height / `maxProjection`, so the Spider
mask subtracts exactly the nose and the rifle's nose classification (`noseBlend > 0.25`) holds; the frontal
surface in the rifle nose patches moves by at most about 1.6 mm. The sliders (`noseVertexGLSL`) scale the
projection exactly (`noseBlend`), the width under a smooth mask that leaves the bridge between the eyes
alone and the length about `mask.pivot`, so no slider end folds the skin (`avatarnosetest`). Fragment:
the nostrils' hollow is darker and the nostrils and crease take ambient light out (`noseCavity`); the
painted tip warmth (`AVATAR_SKIN.nose`) dropped from 0.5 to 0.18 over a wider area, so the tip's shadow is
the form's. A `vNose` varying (noseBlend) gives #2032's nose shine, flush and backlit thin skin the nose's
own surface (`avatarSkinGLSL` `nose`), which had no surface to act on since the separate nose went.
+656 triangles per figure (+7.7 % of the head's 8,524 before this step), one draw, no attribute, texture,
light or pass (program key since #2049 `-nose2049`). [Views](../verification/2048/README.md) (`tools/avatarnose2048browser.cjs`).

**Nose shape variants (#2049).** A look field `noseForm` (0 straight = #2048's nose and every old code,
1 convex, 2 upturned, 3 broad with a flat bridge; `AVATAR_NOSE_FORMS`, all *guess*), chosen with buttons in
the customizer's "Näsa & öron" section (also picked by Slumpa). All lowercase tags are taken, so it shares
the nose size's `n` tag: `noseSize + 10 * noseForm`, written only when a variant is chosen (an older client
reads a combined value as the middle size); remote players get it through the existing look code. Each
variant is a smooth offset of the bind position in the vertex shader (`noseFormAt`, JS twin
`noseFormOffset`, uniform `uNoseForm` = the variant's weights): convex a hump on the dorsum and a drooping
tip, upturned a lifted tip and a scooped dorsum, broad a bridge lowered by a share of its height and the
nose widened (sliding along the face's sideways curve, faded out before the inner eye corners). Offsets
that move with the tip scale with `noseBlend`, so they vanish where the nose meets the face; the size slider
scales the offset, the width slider adds its own widening on top; the Spider suit cancels it. The shared
geometry is untouched (no triangles, attribute, draw, texture, light or pass); the normals follow the
offset's Jacobian by finite differences in `beginnormal_vertex` (`noseNormalGLSL`), skipped for straight.
`tools/avatarnosetest.mjs` (old codes exactly unchanged, no fold at any slider end, no dent, the variants
differ), `tools/avatarcustomizertest.mjs` (the shared tag, the Worker, Slumpa);
[views](../verification/2049/README.md) (`tools/avatarnose2049browser.cjs`, including a pixel comparison
of old codes against the baseline).

**Nose sliders without a cheek edge (#2060).** The width slider's widening is `noseSlideAt` (JS twin
`noseSlideOffset`, profile `AVATAR_NOSE_WIDTH`, *guess*): a point moves by `(width − 1) · x / (1 + (x / peak)²)`
faded out over about 4 cm of cheek (narrow at the bridge), sliding back along the face's sideways curve like
the broad variant. #2048's `x · smoothstep` fade squeezed the cheek beside the wings to about a quarter of
its width at the largest + widest sliders, and the normals stayed put, so the facets and their shading
disagreed in a thin ring (an outline through the skin bump). `noseNormalGLSL` now turns the normal by the
sliders' and the variant's offsets together (finite differences; the height's slope taken from the normal
fades in over the nose's first `slopeFade` m). The middle sliders of the straight nose skip it, so old codes
render pixel-identically. `avatarnosetest` (cheek facets against their shader normals at every end and
variant, no skin squeezed below 0.6); [views](../verification/2060/README.md) (`tools/avatarnose2060browser.cjs`).

**Formed ears (#2047).** `src/avatarear.js` (tunables `AVATAR_EAR`, all *guess*) replaces the folded
disc of #2002 with an ear built on a polar grid round the concha: a superellipse outline (fuller top,
narrower lobe, the top leaning back), a rolled helix along the top and back edge with the scapha groove
inside it, the antihelix ridge round a deep concha bowl, a tragus over the bowl's front, a soft lobe
without folds, and a cranial surface from the rim down to a root inside the head. The whole ear is
turned out about a vertical hinge at its front edge (`flare`, more at the top than at the lobe), so the
helix stands about 1.8 cm off the head and the ear reads as a C from the front. A per-vertex `shade`
darkens the concha, scapha and the sulcus behind. It keeps the old attachment point, so the ear slider
(`uEar`), the skin flush and the backlit translucency (#2032 `earRim`) still apply; the earrings take
their lobe point from `earLobe`, and the hair keeps clear of `earEnvelope` (three ellipsoids fitted to the
ear) instead of the old single ellipsoid. Headphone cups, hats and glasses temples were not changed.
1,000 triangles for both ears instead of 384 (+616: +8.5 % of the head's 7,268 before this step, +7.8 % of
7,908 with the #2045 eyes), one draw, no attribute, texture, light or pass. [Views](../verification/2047/README.md) (`tools/avatareartest.cjs`).

**Lip volume (#2065).** `src/avatarlips.js` seats rounded upper/lower vermilion and a two-row skin bridge on
`headFront`, using the same `lipOutline` as the face shader. `AVATAR_LIP_VOLUME` values are visual guesses:
a fuller lower belly and two small philtrum columns replace the nearly flat lip strips. The seam, outline,
regions, jaw and kiss roles remain; border follow weights fade from lip to muzzle over both rows. Reallocating
the existing four rows per lip/border pair (3+1 to 2+2) keeps triangles, retained attributes, shader instructions,
rig and draw calls unchanged. `sealLipEdge` takes the lip row count and still shares normals at the joined edge.
[Matched daylight/backlight and expression views](../verification/2065/README.md).

**Sculpted face (#2044).** `src/avatarsculpt.js` (tunables `AVATAR_SCULPT`, all *guess*) gives the face
real forms instead of painted depth, as pure functions of the head-bone bind position (before
`faceWarp`), so they hold on any head tessellation. `shape` forms (the upper-lid sulcus under the brow
ridge and the ridge) move the head skin in `headSculpt` (`sculptShape`), so the lids and brows seated on
`headFront` follow. The rest is finer than the head's vertex grid (about 16 mm between columns on the
cheek): the cheekbones and the hollow under them (`form`), the one-sided nasolabial fold, the philtrum's
columns and groove, the mouth corners and the bulge outside them, and the lip border's roll (`fine`)
bend the shading normal per pixel (an analytic height, forward differences, three's bump formula) and
the fine hollows take a little ambient light out (`cavity`). The smile (#2031 `uExpr.x`) deepens the
fold and corners; expressions, the talking mouth and the kiss move the skin and the forms ride along on
its bind position; both groups fade out by pixel footprint. `sealLipEdge` gives the lip's outer row the
skin band's normal and the colour blends across the lip outline (part skin on the lip edge, part lip
colour on the skin), so the lips no longer read as stickers. The painted socket darkening
(`AVATAR_SKIN.eye`) dropped from 0.35 to 0.2 now that the socket is sculpted. No triangles, attributes,
textures, lights or passes; one fragment branch on face pixels only (program key `-sculpt2044`).
[Views](../verification/2044/README.md) (`tools/avatarsculpt2044browser.cjs`).

**Eye surfaces (#2064).** `src/avatareyes.js` / `AVATAR_OCULAR` add a warm sclera corner
falloff, a medial pink caruncle and pixel-filtered radial iris fibres with a darker limbus.
`src/avatarlids.js` keeps the same topology but reduces iris/pupil relief; the wet glint
uses a virtual cornea normal above that flatter coloured surface, without an additional
transparent mesh or pass. Pupil adaptation, blink and gaze still use their existing
uniforms and chosen `EYES` palette. Geometry, one draw and 15 bones are unchanged; one
`vec3` varying and eye-only fragment arithmetic are added. These values are artistic
assumptions. Socket depth belongs to #2063. [Matched views, checks and software timing
limits](../verification/2064/README.md).

### Player body and clothing fit (#2001)

`upperBody` / `AVATAR_SURFACE.body` join the ribcage, oval armholes and rounded
upper arms before palette separation. Shared positions, skin/pump weights and
normals preserve the connection through the existing 15-bone rig. The first
horizontal arm ring sits below the armhole so the cross-section's turn does not
fold back; short sleeves end below that connection. A lower neckline, integrated
hem and fitted hoodie pocket replace overlapping primitives. One byte-sized,
triangle-constant `suitRole` gives skin and suit stable torso/head/limb/hand identity
independent of blended bone indices. The six measured looks remain one body draw,
with fewer triangles and attribute bytes including that byte. No head/hair,
collider, gait, texture, pass or per-frame build is added. Inner-axilla compression
still limits LBS normals; the guard and exposed high-arm imagery do not claim every
posed triangle is error-free. [Final art, actual preview, source equivalence,
counts and software timing limits](../verification/2001/README.md).

#### Shoulder volume when the arm moves (#2013, #2022)

A pose-driven corrective in `src/avatararmfix.js` (#2022) replaced #2013's static follow weights. Each skeleton update
measures each upper arm's elevation in the torso frame and sets `uArmFix` (vec2, one per side; 0 for hanging, forward and
rifle-hold arms, 1 from about horizontal). A lifted arm then moves a falling share of the torso weight around its armhole to
the shoulder bone (less below the pivot), and re-blends the sewn shoulder rows' shoulder share s as s^rows, so the fabric rides
up with the arm instead of stretching the armpit. Lowered arms keep the plain rig weights, so the rifle hold no longer pays for
the lift. The vertex shader adds the change to the bone blend (positions and normals) after `skinbase_vertex`; the CPU path
overrides the mesh's `applyBoneTransform` with the same formula, so `getVertexPosition` and the volume tool measure what is
drawn. Same 15-bone rig, geometry, attributes and draw call; values `AVATAR_SURFACE.body.armFix` (guesses from a random search).
Measured against the pre-#2013 weights (male; female similar): arms-up 99th-percentile edge stretch 1.858 → 1.667, wave
1.732 → 1.605, rifle hold unchanged at 1.389 (#2013 had 1.432), and no pose's worst-1% triangle area below its before value.
Forward reach and crossed arms are back at the pre-#2013 values (#2013's small gains there came with the rifle cost), and the
inner armpit of crossed arms is still unimproved. Check with `node --test tools/avatarshouldertest.mjs` (bounds against the stored
before-table, via `tools/avatarshouldervolume.mjs`) and the pose sheets `tools/avatarshoulderbrowser.cjs` /
`tools/verify-avatar-shoulders.html` ([#2013 images](../verification/2013/), [#2022 images](../verification/2022/)).

#### Sweater hem and long-hair ends (#2019)

The sweater's two lowest rings flare out by `AVATAR_SURFACE.body.hemFlare` (14 mm, a *guess*, fading out by
`hemFlareTo`), so the hem stands 9 mm or more clear of the trousers' seat and thighs instead of lying in the same
surface (z-fighting, worst on the female body and with the hoodie). Long hair (`longHair`) now measures the sweater's
own `SURFACE.body` rings (both bodies, hoodie ease and flare) instead of the older `TORSO_PROFILE` ellipse, so its ends
hang outside the back of the sweater (13 mm or more). Same geometry, no new part or draw call. Check with
`node --test tools/avatarhemtest.mjs` (rest-pose gaps, both bodies, tee/long sleeves/hoodie/wide trousers) and
`tools/browsertest.sh node tools/avatarhemtest.cjs SITE docs/verification/2019` on `tools/avatarhem.html`
([images](../verification/2019/)).

### Player head and hair (#2002)

`AVATAR_FACE` / `addFace` seat shaped upper/lower lip bands and a skin border on
that same continuous head, round the front chin, and add folded ears (formed since #2047) and tapered
brows. The lip border joins lip and muzzle pucker weights without a retained new
attribute. The muzzle weight fades smoothly above the lips (`KISS.muzzleTop`) and over the nose's own
height (`KISS.noseFade`), so the kiss leaves the nose and the cheeks beside it in place without torn
triangles (#2058, `tools/avatarnosetest.mjs`, [images](../verification/2058/)). Directional scalp groups, smoother curls and a grouped, uneven long
curtain keep the existing five styles, colours and controls. Posterior nasal
isolation, head-role shading, headwear, glasses and the existing 15-bone rig remain.
The five measured variants add 4.09–5.45% triangles/attribute bytes, within the
locked +10% budget, with one body draw and no new texture/light/pass. Hair and
beards remain stylized and the older rear long-hair join remains visible.
[Matched art, actual preview, final-source equivalence and cost limits](../verification/2002/README.md).

### Finer hair and beards (#2012)

`hairParts` samples the front of the scalp at `AVATAR_HAIR.fine` degrees, packs rows towards
the hairline (`rowPower`, with lifts and shades evaluated at the elevation share), feathers
the edge to the skin (`edgeLift`) and breaks it into small alternating tufts (`tuft`).
Strand groups are sharper ridges with darker valleys (`clump`, `clumpShade`); short hair has
one crown point instead of a spiky pole. Long hair keeps its curtain columns, and the curtain's
top row now takes the scalp's lowest-row position, shade and averaged normal, so the old rear
join is gone (regression in `tools/avatarheadtest.mjs`). Curly hair has 24 locks whose
ends lie flat at the nape so cuffs still cover them. `beardShell`/`moustacheShell` share
`beardGrid`: 32 beard columns with a tufted cheek edge and per-column strand shade, and the
moustache alone is a tapered, drooping band instead of two blocks. The fragment shader draws
fine strands round the head bone's axis for head hair and beards (`AVATAR_SURFACE.hair.strands`),
a whole number per turn and faded by footprint. Variants add 0.4–4.3% triangles over the
**Headwear check (#2021).** Cap, beanie, hat and headphones were checked against all five hairstyles in front, profile, back and back-quarter views
(`tools/avatarhat2021browser.cjs`, evidence in `docs/verification/2021/`): the `uHat` tuck keeps every style, including the curls and the bun
(`AVATAR_HAIR.bunAt`, unchanged and still the single source for the sway), inside the headwear. The one visible fault was the brimmed hat: its brim started at the
skull lift while the crown stands `0.012` m higher, leaving a slit that showed hair; the brim now starts at the crown's lower edge (no new geometry or draw call).

#2002 result (curly 2.1%), within +10%, one draw, no texture/pass/attribute.
[Before/after views, counts and limits](../verification/2012/README.md).

#### Beard mouth opening (#2020)

The dark rectangular lip patch behind the beard's opening (it sat below the #2002 lips) is
gone: the beard has no second part, and the sculpted lips on the head's own skin show
through the opening. The beard grid has 12 rows (`AVATAR_BEARD.rows`) so the opening
`AVATAR_BEARD.mouth` (-24 .. -12.5 degrees, two quads high, aligned with the lip seam at about
-17) lands on row edges; the beard-only notch just shows the lips and chin skin. `mouthWeight`
role `moustache` is unchanged (the beard below the opening follows the jaw with `uMouth`);
the `upper` backdrop role is no longer used by the beard. Beard + moustache gained 84
triangles (12,560 to 12,644), one draw. [Views](../verification/2020/README.md)
(`tools/avatarbeard2020browser.cjs`).

**Oval opening (#2041).** The grid's rectangular opening showed a hard-edged rectangle of skin
round the lips and, in a steep three-quarter view, a slit past the lifted shell. `AVATAR_BEARD.mouth`
is replaced by `AVATAR_BEARD.opening`: the grid's quads inside `frame` (±4 columns, rows 7 to the
top edge) give way to `rings` bands (`beardMouthRing`) running from the frame's own edge vertices
in to a smile-bent oval just outside the lips and their skin band. Round the oval the shell sinks
onto the head mesh's real skin (`headSkinAlong` raycasts `headGeometry` once per variant; the mesh
lies up to about 1 cm inside the projection ellipsoids there), fully at the edge
(`edgeLift` 0.8 mm) and easing back to the shell's own lift over `feather` degrees, for grid and
bands alike, so the edge feathers onto the skin. `mouthWeight` role `moustache` now drops the
beard from just above the lip seam (`opening.e`) downwards. Only facial 3 changes (facial 0–2
geometry is bit-identical); beard + moustache gains 92 triangles (12,912 to 13,004), one draw.
[Views](../verification/2041/README.md) (`tools/avatarbeard2041browser.cjs`).

#### Flyaway hairs and backlit hair rim (#2040)

`src/avatarflyaway.js` (tunables `AVATAR_FLYAWAY`, all *guess*) adds a few dozen loose strands per hairstyle and beard to the shared
variant geometry (appended last in `parts`, so earlier parts keep their vertex order) and two shader pieces to the one material. Roots are
area-weighted samples of the outward-facing hair/beard triangles (least spacing `spacing`), sunk `rootIn` into the hair; each strand leaves
along the hair's flow with droop (`sag`) or curl and is a ribbon whose two sides share one centre-line point in the bind pose, so CPU raycasts
and the headshot surfaces never see it. `normal` carries the strand tangent and `faceAnchor` its data (side, t + strand index, kind 1 head /
2 below the hat line / 3 beard; plain hair keeps 0, 0, 0), so no attribute is added. After `project_vertex` the ribbon opens towards the
camera to its stylised width but at least `minPx` pixel; alpha = real/drawn width with `alphaToCoverage` (custom blending keeps the canvas
alpha at 1, so the page never shows through), so a sub-pixel strand is faint instead of jagged, with no sorting. Strands get zero width
without MSAA (`&test`), under the Spider-Man suit, beyond `fade` m and, for head strands above the hat line, under any hat (#2021); their tips
follow the #2014 hair spring outwards. A soft rim per directional light (`rim`) lights hair and beards whose edge faces away from the sun,
stronger on the flyaways, tinted by √albedo. Budget: ≤ 600 triangles per avatar (short 264, long 448, bun 240, curly 400, beard +120,
moustache +28, beanie 0), no texture, attribute or draw call; the far figure (#1966) has none. [Before/after views, alpha and cost](../verification/2040/README.md).

#### Brows of hairs (#2046)

`src/avatarbrow.js` (tunables `AVATAR_BROW`, all *guess*; position `AVATAR_FACE.brow.at`) replaced the solid brow tubes. Each brow is a
thin grid (`cols` × `rows`, 168 triangles for both, was 96) seated `lift` m above `headFront`, so it follows the forehead's sculpt; its
per-vertex `faceAnchor` is the arched centre line, so the thickness/height slider (`uBrow`, the height now slides along the forehead's slope)
and the #2031 expressions move it as before. The fragment recomputes the brow's own coordinates from the bind position (no attribute): hairs
lie on flow lines that rise steeply by the nose and lie down outwards; each lane cell holds at most one hashed hair, present with the body's
density at its root (wide and dense at the head, thin and sparse at the tail), drawn as an antialiased line in pixel footprint and faded to
its expected coverage once lanes share a pixel (no shimmer at distance), over a thinner undergrowth (`base`). The coverage is the alpha
under the #2040 alpha-to-coverage; without MSAA (`&test`) the colour mixes towards the skin (`uBrowSkin` × the eye-socket tone) instead,
which leaves a faint lighter band at the brow's lower edge on light skin in extreme close-up. Brow colour and slider codes are unchanged.
Checks: `node --test tools/avatarbrowtest.mjs` and `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarbrowtest.cjs SITE OUT`
([views and cost](../verification/2046/README.md)).

#### Soft hairline (#2050)

`src/avatarhairline.js` (tunables `AVATAR_HAIRLINE`, the visible line `AVATAR_HAIR.hairline`, all *guess*) replaced the scalp shell's hard,
jagged lower edge (the #2012 tufts are gone). The visible line has temple recessions and tapering sideburns; `hairParts` starts the shell
`drop` degrees below the lowest line within ±4° (`hairlineShell`, so the straight edge between columns stays under it) and keeps the
columns laid out from `AVATAR_HAIR.cols` (no new triangles). A curtain's top (long, curly) stays on the line. The fragment recomputes the
azimuth/elevation round `AVATAR_HAIR.centre` and the signed distance across the line (nearest of three polyline segments, so the steep
sideburn edges thin as wide as the forehead, plus a slow `wobble`) from the bind position, no attribute: within `band` m above it the
coverage thins towards the skin — an under-layer over the band's top and single hashed hairs on meridian lanes, present with a chance rising
from the line — and below it only short, fine baby hairs at the forehead and temples (fainter at the nape). Hairs are antialiased lines in
pixel footprint; once ≥ 2–3 lanes share a pixel the pattern fades to its expected coverage (earlier, a uniform mean read as a pale stripe).
The coverage is the alpha under the #2040/#2046 alpha-to-coverage, so the skin under the shell shows through; without MSAA a dithered cut-out
(a colour mix towards the skin, as the brows do, left the shell's own lighting as a pale ghost of the old edge). Curtains (`hairlineCurtain`: long from 63°, curly from 71°) and flyaways keep
their edges, and flyaways are not rooted below or in the sparse band (`hairlineAvoid`). Checks: `node --test tools/avatarhairlinetest.mjs`
and `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarhairlinetest.cjs SITE OUT` ([views and cost](../verification/2050/README.md)).

#### Long hair in locks (#2053)

`src/avatarlonghair.js` (tunables `AVATAR_LONGHAIR`, all *guess*) replaces long hair's single outer/inner curtain sheet (`longHair` in
`hairParts`) with `perCol` locks per scalp column: ribbons from the scalp's lowest row (shared positions and normals, so no join) that hang
clear of the head, ears and neck (the old analytic clearance and gap) and of the real sweater, overlap their neighbours below the top and
taper to a point at their own length, which varies by ±`jag` about the old hem (less at the face edge). Every other lock lies a few mm
further out and a little shorter (layers with air between them); edge normals are bent across the lock and edges are darker. The sweater
clearance is a table (azimuth × height) sampled from `upperBody`'s torso and shoulder caps of both figures (plain and hoodie ease, not the
hanging arms), un-warped by faceWarp's x factor because hair is built before faceWarp; a lock ends where the sweater below juts out more
steeply than `stop[0]` or has pushed it out by `stop[1]` (it rests on the shoulder instead of fanning out over it). A shorter, darker
under-layer and its inner surface keep the curtain closed where the locks part; the locks' lowest `backRows` rows have back faces. Two
two-sided strands per side fall forward over the shoulders onto the chest. Skinning: the front strands blend from the head to the torso
along their length and the rest of the curtain shares up to `torso[2]` with the torso bone below `torso[0]`, so a nod or turn bends hair
that rests on the back and chest instead of swinging it into the body (an extreme head tilt still pushes the nape's hair a little into the
collar). The under-layer and front strands carry `userData.noFly` (no #2040 flyaways rooted there); sway (#2014), the hair-length slider
and #2052's hanging strand tangent act on every curtain vertex as before. The soft hairline (#2050) no longer thins hair far below the
scalp shell's edge (its locks and strands hung below the line at the face edge and were erased). Cost: +800 triangles on the long-haired
head (+8.5 % of 9444), no attribute, texture, light, pass or draw call. Checks: `node --test tools/avatarlonghairtest.mjs` (budget, uneven
hem, tapered tips, front strands on the torso bone, flyaways, no hair inside the body standing / walking / running / sitting via
`tools/avatarlonghairpose.mjs`, which also reports nods and turns) and `PLAYWRIGHT_MODULE=… tools/browsertest.sh node
tools/avatarlonghairtest.cjs SITE OUT` ([views, motion and cost](../verification/2053/README.md)).

#### Gloss along the hair strands (#2052)

`src/avatarhairgloss.js` (tunables `AVATAR_HAIR_GLOSS`, all *guess*) replaces the general GGX highlight on hair, bun, beard, brows and
flyaways with a Kajiya-Kay style anisotropic gloss: two lobes round the strand tangent, shifted along the normal (`primary` towards
roots, `secondary` towards tips). #2068 removes the wide white band on dark hair: below `darkRange` in linear albedo, both lobes
narrow by `darkSharp`, the primary takes the hair's own hue at √ brightness, and `secondaryWarm` warms the secondary. Blond/grey
albedo above the range retains the previous white primary and wider secondary. The change adds scalar/vector arithmetic inside
`hgSpec`, with no new lobe, trigonometric operation, varying or geometry; program key `-gloss2068`. The tangent needs no attribute or network field: the vertex shader inverts the hair shells'
own parametrisation from the bind position (`hairParts`: azimuth a + sweep · sin(πs) about `AVATAR_HAIR.centre`, elevation from the
shell's edge to the crown) and follows `AVATAR_HAIR.flow`'s strand groups (sweep plus the clump ridges' twist per style, the uniform
`uHairFlow` set from the look); the edge table is resampled every 5° into a const array. Below the shell (the long and curly curtains)
the strands hang, the beard follows its own hairs (#2051 `bdTangent` in `src/avatarbeard.js`: down and converging towards the chin, outwards on a moustache; without MSAA its gloss fades with `beardCov`), the bun coils round its tilted axis, the brows rise
along `AVATAR_BROW.slope`, and a flyaway uses its own tangent (#2040's `normal`). The tangent is skinned to view space as one varying
(`vHairT`) and re-orthogonalised to the shading normal per fragment. The lobes are evaluated per scene light inside three's `RE_Direct`
(wrapped for hair only, so shadows and indoor lights apply), plus the #2039 street lamps' warm light from above. The band's shift is
jittered per strand group and fine strand (bind azimuth), and the clump ridges' own normals break it further; the jitter fades by its
pixel footprint and the lobes broaden and soften (`fade`, `far`) so nothing flickers at distance. A lower roughness (#2018 wet hair)
sharpens it (`wet`). The #2040 backlit rim is unchanged. No triangle, texture, light, pass or draw call. Checks:
`node --test tools/avatarhairglosstest.mjs` and `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarhairglosstest.cjs SITE OUT`
([views, orbit and cost](../verification/2052/README.md)). Dark-colour regression: `tools/avatarhair2068browser.cjs SITE OUT` captures matched short black/brown,
long black, curly black, brown bun, blond and grey hair in daylight/backlight, with an orbit and paired timing.
[Result and limits](../verification/2068/README.md).

#### Beards that grow from the skin (#2051)

`src/avatarbeard.js` (tunables `AVATAR_BEARD`, all *guess*) replaced the #2012/#2041 beard shell (`beardGrid`, `beardMouthRing`,
`headSkinAlong` in `src/avatar.js`). The shell was projected onto the skull/jaw ellipsoids and floated 4–17 mm off the real face (its
cheek edge 4–10 mm, the moustache alone 8–15 mm), so every edge was a hard, lifted rim. Now each option is a grid over azimuth/elevation
from `centre` seated on the head's real skin (a ray probe of the head and neck meshes, `skinProbe`, built once per option and figure and
cloned), lifted by `lift` plus `thick` × density^0.7, so the edges lie within a millimetre of the skin. The density (`beardDensity`,
`moustacheDensity`, mirrored in GLSL) fades over `edge` degrees: a soft, slightly wavy cheek line with no saw-tooth (`jag`/`strand` are
gone), a crisp line under the nose and lip, a long fade down the neck and behind the jaw, a short one round the #2041 oval (kept: same
`opening` frame, rings and `mouthWeight` role); the upper cheeks are patchier. Facial 3 dips its top under the nose; the moustache alone
is a band whose ends droop and taper to points past the mouth corners, just above the vermilion. The fragment recomputes (a, e) from the
bind position (the face warp undone, no attribute or varying) and draws hairs in lanes: down and converging towards the chin on the beard,
outwards and down from the philtrum on a moustache (facial 3 blends both above the mouth), one hashed hair per lane cell with a random
lean, present with the density at its root, over an undercoat that is full only where the beard is dense; past ~1 px per lane only the
expected coverage is drawn (no loop, no shimmer). Coverage is alpha → the #2040 alpha-to-coverage, and on the silhouette the undercoat
gives way so the outline is hairs; without MSAA the colour mixes towards the skin (`uBeardSkin` × cheek/lip/under-jaw tone). The #2012
strand stripes no longer apply to beards; the #2040 rim light and beard/moustache flyaways stay (they root only in the dense part,
`beardCore`). Expressions, talking and kiss move the beard with the skin as before. Checks: `node --test tools/avatarbeardtest.mjs` and
`PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarbeardtest.cjs SITE OUT` ([views and cost](../verification/2051/README.md)).
Stubble and the cropped beard (#2166, `AVATAR_BEARD_CUT`, all *guess*): look field `beardCut` (1 stubble on a clean-shaven face, 2 a short beard; `beardCutOf` ignores a cut that does not fit `facial`). The customizer's facial-hair choices 4 (`Stubb`) and 5 (`Kort skägg`) go through `setBeardChoice` / `beardChoiceOf`. Look code: the `x` tag (necklace in the units) carries the cut in the tens (`x10`, `x20`); the nine digits keep `facial` (stubble as 0, short as 3), so older clients show none / the full beard, and a missing or unknown value is today's look. Stubble is shader only (`stubbleGLSL`, `stubbleZone` = beard + moustache area minus the lips' oval; darker skin, fine dots in the beard's colour, expected coverage at distance; no geometry, no new program). Short: a thinner shell variant (`beardShell(lip, skin, short)`, no flyaways), hairs `len` ×, the undercoat `base` ×. Checks: `node --test tools/avatarstubbletest.mjs`, `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarstubble2166browser.cjs SITE OUT` ([views](../verification/2166/browser.json)).
Makeup and lashes (#2170, `AVATAR_MAKEUP` + `AVATAR_LIDS.lash`, all *guess*, `src/avatarmakeup.js`): the lips have their own finish (`SURFACE.finish.lips` 0.26, skin 0.55: wet). The lashes are separate curved hairs in two rows (`lashes(side, upper)` / `lashHairs` in `src/avatarlids.js`: 30 upper at about 7.5 mm, 18 lower at about 4.2 mm, rooted `root` 0.2 mm inside the margin on a darker lash line, longer toward the temple, a curl `angle` [root, tip], 6 triangles per hair, 576 per avatar instead of 112); the blink shader tells the lower row by its y sign and folds it up. Makeup is the look's `lipstick` (0-4), `eyeMakeup` (0 none, 1 mascara, 2 eyeliner, 3 both) and `blush` (0-2), one code 0-59 in the legs tag `p`'s tens (the legs in the units, so older clients read the default legs and a plain face; a missing tag is no makeup). No mesh, texture or draw call: lipstick is the lips' own vertex colour (`lipColour`), eyeliner the lid-margin vertices' colour in each eye's frame (`linerWeight`, so it follows the blinking lid), mascara and blush two uniforms (`uMake` lash length / darkness, `uBlush`; the blush is two Gaussian cheek apples, `blushWeight`) read in the lash vertex shader and the face's skin shading. Program key suffix `-makeup2170`. Customizer: three sections (`addMakeupSection`) and the 2D preview. Checks: `node --test tools/avatarmakeuptest.mjs tools/avatarlidstest.mjs`, `PLAYWRIGHT_MODULE=... tools/browsertest.sh node tools/avatarmakeup2170browser.cjs SITE docs/verification/2170` ([views](../verification/2170/browser.json)).

The full beard's sideburn (#2061, `src/avatarsideburn.js`, tunables `AVATAR_SIDEBURN`, all *guess*) runs up into the soft hairline
instead of stopping short of it: the visible line (`hairlineAt`, round the hair centre) is mapped into the beard's angles at a typical
skin radius into a small table (`SIDEBURN_TABLE`, baked into the shader), and behind `from` the beard's top follows it `over` degrees
inside the hair (less where the line is steep, so no spike of beard shows through the sparse hair along the sideburn's front). There the
beard thins to `flat` of its thickness, so it lies under the scalp shell and the two soft edges overlap (the beard dense where the hair is
sparse) instead of leaving a skin strip. The back edge in front of the ear is feathered over `back` degrees (it was the grid's hard edge
above the jaw). A curtain (long, curly) covers the sideburn as before; the moustache alone has no sideburn. Checks:
`node --test tools/avatarsideburntest.mjs` and `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarsideburntest.cjs SITE OUT`
([views and cost](../verification/2061/README.md)).

#### Curly hair as curl volumes (#2054)

`src/avatarcurls.js` (tunables `AVATAR_HAIR.curly`, all *guess* by eye) replaces the #1377 tubes that wound over a smooth shell with
packed curl clumps: each a small lat-long ellipsoid (8 × 4 segments, 48 triangles) with its own size, elongation, direction and tone,
its head side flatter and its normals leaning towards its outward axis (`soften`), so the clumps shade as lumps of one mass without a
grazing rim round each. On the scalp a deterministic dart throw packs them small and tight along the hairline and at the nape and larger
over the crown, half sunk into a thinner, darker shell (`thick[4]`, `shellShade`); on the curly curtain they hang as ringlets clear of
head, ears, neck and torso, the lowest past the hem (an uneven hem). Their reach off the skull is capped (`out`, and `hat` near the
knitted hat's edge, `curlReach`) so every hat and the headphones' band still cover them. Every curl vertex carries its clump's centre
as `faceAnchor` (y > 0.5 m tells it from plain hair's zero, z < 0.5 from a flyaway), and the hair-length slider moves a curl by its
centre instead of squashing or stretching it. Fragment (`uCurly`, curly only): a domain-warped field in the bind position replaces the
#2012 meridian strands with small coils and winding strands (colour: crests lighter, gaps darker; normal: one-pixel differences of
the field through `clothBump`), faded by the pixel footprint; the #2052 gloss's strand direction turns with the coils and is weaker
(`fine.turn`, `fine.gloss`), so the highlight breaks into short glints. Cost: curly head triangles 14,796 → 15,996 (+8.1 %), other
styles unchanged; one uniform, no attribute, texture, light, pass or draw call. Checks: `node --test tools/avatarcurlstest.mjs` and
`PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarcurlstest.cjs SITE OUT` ([views, sway and cost](../verification/2054/README.md)).

#### Layered short hair and a wound bun (#2055)

`src/avatarshorthair.js` (tunables `AVATAR_SHORT_HAIR`, all *guess*) breaks up the smooth helmet of short hair (style 0) and the bun
(style 2). `hairLocks` lays overlapping locks over the scalp shell in tiers (`tiers`: crown, middle, lowest down to the soft hairline): each
lock follows the shell's own parametrisation (`hairParts`' azimuth + sweep · sin(πs), elevation from the shell's edge, the clump twist from
`glossFlow`), so the #2052 gloss tangent runs along it; its root is sunk into the shell, its tip lifted and closed back down, so the tips
overlap the tier below and break the outline. The lowest tier stays shorter over the ears. Short hair's per-column #2012 tousle is
replaced by the locks (`tousle: 0`); flyaways keep growing from the shell only (`userData.noFly`). The nape and the hair over the ears get
an uneven edge from irregular tufts that pull the #2050 soft line down (`jag`, a GLSL term `hairlineColor` adds to its line distance;
`shortJag` is its JS twin); the short shell starts that much lower there (`shortHairDrop`), and `hairlineColor`'s #2053 cut-off for hanging locks reaches that much
further for short hair (`below`, `shortHairBelow`), so the soft line still thins the lowered shell. The side parting (`AVATAR_SURFACE.hair.part`)
is grooved deeper and tinted towards the skin colour along its middle in the fragment (`uShortHair`, set from the look); locks keep
`partClear` off it. `bunParts` replaces the bun's smooth ball and torus with two three-ply ropes coiled round its tilted axis (the axis
the gloss's bun tangent and #2014's sway radius use) over a darker core, with the band as before; the bun's thin shell gets flat
combed-back locks. Cost: short hair +660, bun +816 triangles (≤ +10 % of the head's), one uniform, one draw call. Hats still tuck the
hair (the lifted tips included). Checks: `node --test tools/avatarshorthairtest.mjs` and
`PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarshorthairtest.cjs SITE OUT` ([views, sway and cost](../verification/2055/README.md)).

### Butterfly wing hinges (#1925)

`butterflymodel.js` supplies shared authored contours and a bounded vertex hinge.
Ambient body vertices retain their width while the wings rotate, with matching
normal rotation and no geometry rebuild. Magic keeps the two transparent passes
of its one 12-slot instanced mesh, one extra 12-float wing attribute and the existing
64px atlas size. Its body strip stays fixed; each wing strip folds in three dimensions
at the existing small effect scale on every axis. The same contours paint ordinary
butterfly marks and collection previews. [Reviewed actual views and costs](../verification/1925/README.md).

### Sewn Pingping cushion (#1927)

`src/pingpingsurface.js` / `PINGPING.surface` share the authored cushion recipe
between GLB and the missing/late-load fallback. The product photo retains its
original panel outlines, expression, flippers, feet and contact dimensions. A
single shared 256px normal map suggests short pile; the existing 512px face atlas
adds restrained panel stitching and colour grain. Shallow static joins/gathers
suggest stuffing, while the original hug scale still performs the compression.
No fur mesh, cloth simulation, new light, extra pass or per-frame geometry is added.
The same immutable maps serve live and collection models; thumbnail disposal owns
geometry/materials only. The embedded GLB maps are adopted into that shared cache,
and a late asset reuses already-live fallback maps. [Reviewed images, native
parity and increased asset transfer](../verification/1927/README.md).

### Santa surfaces (#1923)

`SANTA.surface` contains the authored coat/head/hand/beard profiles and tessellation
for `src/santasurface.js`, shared by the GLB and missing/late-load paths. The coat
has shoulders and a curved belt, the head has a jaw and nose bridge, and separate
short fingers/thumbs replace the fists. A continuous trouser sweep joins the knee.
Subtle static vertex tint and shallow grooves suggest cloth and beard without
adding texture, shader animation or lights. Existing arm/glass animation and the
movable sofa frame remain unchanged. [Matched result views and bounded costs](../verification/1923/README.md).

### Complete Santa collection pose (#1930)

`bestiarymodels.js` uses the explicit `santaPortrait()` factory for a complete
seated figure with the existing LANDSKRONA frame and sitting-leg recipe. It owns
loaded arm/glass copies and disposes unused pose/text resources, so offscreen
thumbnail cleanup leaves the live sofa guest intact. Only Santa's thumbnail
version becomes 2; native sitting/sleeping and discovery/photo data remain.
[Loaded/fallback cards, old-cache renewal, ownership and local costs](../verification/1930/README.md).

### First-person hand surfaces (#1917)

`Hand` keeps the existing relaxed/grip/spread/web controls, camera-space contacts,
left-hand mirroring and three ordinary hand/arm/cuff draws. Indexed continuous
finger skins replace separate phalanx capsules; shaped palm/wrist and thumb-base
profiles, fitted dorsal nails and shallow palm creases are authored once for all
four morph poses. `HAND_SURFACE` contains the visual assumptions. The thumb ring
uses the same fitted thumb root. The bare arm has a white colour attribute for
the shared skin material; suit gloves retain their uniform finish. No texture,
light, animation mixer or per-frame geometry work is added.
The bare forearm has its own cached taper; the shallow crease projection is also
cached across morphs. [Reviewed views, scoped costs and test limitations](../verification/1917/README.md)
separate warm rendering from the modest extra one-time construction cost.


Kitchen appliance details (#1043): `hob.js` keeps zone markings and touch controls
in one canvas texture; its thin bevel adds16 triangles. `hood.js` caches steel,
glass and woven-filter materials, with merged shell/filter/diffuser geometry.
Interior supplies the original hood-lamp material to both LED spots, preserving
the existing lamp wash/pool and independent fan switch. The measured kitchen
component adds3 calls/220 triangles, no shader programs or lights.
[Normal-light before/after pictures and limitations](../validation/issue-1043/README.md).
`src/vertexcompile.js` records exact fragment-only compile callbacks so the
phone's tight-frustum proof can distinguish native vertex positions from unknown
deformation. Lamp-wash and foliage normal callbacks retain their original GLSL
and cache keys; a material flag/name alone never qualifies a callback (#1453).

An individual flat A/B/C CoreHouse lobby pane uses `forceSinglePass` with the
same double-sided transparent material. This avoids the redundant back/front
draw for one plane. The condition is exactly one generated pane; multi-pane
batches, including Hus L's noncoplanar glass, keep two passes (#1453).

Clubhouse finishes (#1480): `playroom.js` now reuses `architectureEdges` for the
construction shell, `buildAO`/`buildWallAO` for floor/ceiling/concave-corner
contact shading, and `buildContactShadows` for furniture. It adds five visible
batches only inside the room, with no lights or postprocessing. Exposed trim
comes from the wall union in `clubhousefinish.js`; pass-through headers do not
cast a floor barrier. See [furniture](furniture.md#clubhouse-finishes-1480) and
the scoped before/after evidence in [verification](verification.md#clubhouse-wall-finishes-1480).

Clubhouse materials (#1481): `clubhousematerials.js` adds a surface-ID attribute
to the existing merged batches; its shared Standard-material shader distinguishes
wood, woven cloth, matte paint, metal and staggered floor planks. Colours use
Three's sRGB-to-linear conversion before becoming vertex colours. Procedural
patterns are evaluated in clubhouse-local world metres; cloth weave fades with
pixel footprint. The warm ceiling wash is a static room-local approximation,
not a dynamic shadow light. Geometry remains native during shader compilation,
with an audited callback registered in `vertexcompile.js`. Rounded/crowned
furnishings are built once in `clubhousefurnishings.js`. No extra visible draws,
image downloads or postprocessing are introduced. See the scoped evidence in
[verification](verification.md#softer-clubhouse-rendering-1481).

## Parquet grain and matt varnish (#2069)

`src/parquet.js` caches one colour map and a half-resolution roughness map for each authored
`FINISH.parquet` / `STANDARD.parquet` object. World uses the pair on its existing floors and
parquet stair treads. Existing metre UVs, six-board repeats, stagger, one-/three-stave layout,
base palettes and roughness scalars stay. Fine deterministic curved fibres and occasional forks
replace the straight stripes; the roughness field follows the same fibre paths with a broader,
very low-contrast stroke. Cut boards repeat their seed/tint at the long texture boundary so
there is no arbitrary colour reset at the repeat. `PARQUET_SURFACE` owns the visual assumptions;
these are not measured wood or varnish data.

No geometry, collision, draw, light or pass changes. The built-in Standard roughness-map branch
adds its normal texture sample/UV varying; it is not a free shader effect. Colour-map dimensions
stay 324×1200 / 360×1320; added maps are 162×600 / 180×660. Across both finishes: +864000 RGBA8
base-level bytes, or +1151172 bytes for the complete nominal mip chains (driver/CPU overhead
excluded). Maps are generated once, not per frame. Three scoped Node checks and one matched
production-level browser fixture cover both finishes. [Images, exact checks and limits](../verification/2069/README.md).

## School grass material (#1813)

Confirmed school lawn polygons use `grassUV` and `grassMaterial()` in the single `east-lawn` batch, sharing the existing grass detail texture, world-metre scale, seasonal tint and snow map removal/restoration. The old fixed bright vertex tint remains unused for those lawn geometries; playground/sport pads and sand retain their own colors in access. Drape positions, normals, polygon lifts, source outlines and rendered triangle counts are unchanged. The original paving depth bias is retained to keep the lawns above the underlying yard surface. [Scoped test and seasonal views](verification.md#school-lawns-1813).

## Module and test map

```text
src/neighborglass.js   opaque MeshPhysicalMaterial for unmodeled neighboring interiors (#516), shared by exterior.js's
                       ordinary/occupied/entrance glass batches. One six-face 128 px procedural CubeTexture is reused;
                       clearcoat and view-dependent envMap reflections, no live mirror pass or additional lights.
                       Night lowers environment intensity and preserves existing warm occupied-window emission.
                       #569 also shares this environment across ABC's listed openings/loggia/entrance glazing and
                       the nearby mapped school's panes. surroundings.js batches ABC frames into the existing white
                       trim mesh, adds one seal batch and replaces flat window decals with three opaque panes per
                       actual opening. Existing lintel/sill soldier courses and night light quads stay; sitebackdrop.js
                       keeps the school's arches/spröjs in their historical trim batch. neighboropeningstest covers
                       actual ABC pane visibility/bounds and night routines; eastbackdroptest retains source geometry.
                       NEIGHBOR_OPENINGS centralizes visual assumptions; reflection is a generic outdoor impression,
                       not a surveyed or live reflection of surrounding buildings. L1007's clear materials are independent.
src/interiormap.js     #2180: fake rooms behind near façade glass (fragment patch + baked room attributes; see environment.md).
src/glasspanes.js      #2087: calm per-pane variation for opaque façade glass, baked once into vertex colours before the
                       merge (GLASS_PANES, *guess*): lightness/tone picked from a hash of each pane's centre, a vertical
                       gradient (top lighter) and, on the plain far glass, a soft sky tint at the top. neighborGlass() now
                       has vertexColors, so every consumer (exterior.js neighborGlass/EntryGlass/LitGlass, surroundings
                       siteNeighborGlass, sitebackdrop schoolGlass/karpGlass) calls paneTints first; sitebackdrop `glass`
                       (west/east/north) and southbackdrop `glass` keep their old base colour (W.glass / 0x35444d) in the
                       vertex colour, tinted frames/units in the east brick batch keep theirs. Batches >4 m vary per
                       triangle. No draw, texture, uniform or per-frame work; CoreHouse's see-through lobby glass and
                       L1007's clear glass are untouched. tools/glasspanestest.mjs; [views](../verification/2087/README.md).
src/railmetal.js       #2089: matt, lightly brushed / powder-coated outdoor railings: a fragment-only patch (railMetal) of the
                       existing materials — world-position brush lines across a rail and a soft cloudiness in roughness
                       (±tint), both faded to their mean below pixel size via screen derivatives, roughness rising towards
                       RAIL_METAL.far with distance (no sparkle on thin bars), and an edge light taken from the fragment's
                       ambient/sky irradiance (fades at dusk/night). Acts only on low-saturation colours, so the bus stop's
                       mixed vertex-coloured batch keeps its wood and bin. Consumers: exterior.js loftRails (loftgång,
                       drum spiral stair) and terraceRails, surroundings.js boxRails/boxSlats (garage-box railings, coping,
                       park stairs' handrails) and loggiaRails (ABC), busstop.js furniture. One program key; no texture,
                       draw, uniform, light or per-frame work; geometry, merging and batches unchanged. Indoor stair rails
                       (corehouse/stairs.js) and sheet-metal copings are not railings here. tools/railmetaltest.mjs;
                       [views](../verification/2089/README.md).
src/benchwood.js       #2098: weathered outdoor bench slats. `benchSlat` tags a slat in its own frame (along + a per-slat offset,
                       across, thick, half width/thickness: 16-bit vertex attributes, 12 B a vertex; `padBenchSlats` zero-fills
                       the rest of a batch) and `benchWood` patches the existing material's fragment shader (BENCH_WOOD, *guess*):
                       fine grain lines along the slat with a slow wobble and per-slat phase, a slow streak, a slight cool-grey
                       weathering and lighter worn long edges (all line detail faded below pixel size), roughness ≥ 0.86 and
                       metalness 0 on tagged vertices only. It chains an existing onBeforeCompile and runs after its colour step
                       (the bus stop's railMetal still masks by the original wood colour). Consumers: courtyard.js park and pergola
                       benches (wood batch), busstop.js bench (furniture batch). No texture, draw, uniform or per-frame work;
                       positions unchanged. School-yard play benches and the school-wall bench are not tagged (shared backdrop
                       batches). tools/benchwoodtest.mjs; [views](../verification/2098/README.md).
src/roofsurface.js     #2088: one shared 128 px neutral-grey roof map (ROOF_SURFACE, *guess*): a raised seam per strip (dark
                       shadow line, light lip), slightly different strips, weathering mottle and faint rain streaks, and
                       `roofUV` baking UVs so the seams run down each triangle's own fall line (flat faces: along x, *guess*).
                       metal = standing seam 0.6 m c/c (sitebackdrop roof/schoolRoof, southbackdrop roof, surroundings
                       school/HepCat/old roofs), felt = 1 m roofing-felt strips (Å-husen A/B/C, Hus L, Karpvägen caps).
                       Material colour = old colour / the map's linear mean (school batch: / the old seam map's mean), so the
                       average and far mip-mapped colour stay; snow still drops the map (seasons.js) and the vertex-colour
                       toggles are untouched. Replaces the school's 64 px seam map; geometry, walk surfaces and draws unchanged.
                       tools/roofsurfacetest.mjs; [views](../verification/2088/README.md).
src/rendersurface.js   #2095: rendered façades (puts): Hus L's white render (exterior.js `renders`: the street storeys behind the
                       loftgång, the set-back courtyard storey, the våning-4 gables) and the Å-husen A/B/C's white loggia /
                       recess walls and slabs (surroundings.js loggias, the `white` mesh). One 128 px packed linear map over 0.5 m
                       (RENDER_SURFACE, *guess*): fine sand grain + sparse pits as bump (R) and slight roughness variation (G),
                       plus a faint sRGB albedo grain map; colour / albedo mean and roughness / mean G, so the average tone stays.
                       `renderUV` bakes world-projected UVs per face before merging; window frames in the same mesh use
                       `plainUV` (the neutral texel). Dirt: `dirtPatch` strips (vertex colour, 2–4 mm in front, same mesh, no
                       new draw) under every render reveal's sill flashing (Hus L) / loggia window (A/B/C) and a splash band
                       over the loftgång / terrace / loggia floors. Hus A/B/C stair cores (corehouse.js) have no render
                       façade. tools/rendersurfacetest.mjs; [views](../verification/2095/README.md).
src/visitlights.js     lamps of the visitable empty flats (#620): a ceiling lamp per room (a flat fitting in Kök / matplats, Badrum,
                       WC/dusch, Tvätt; a lamp outlet with a bare bulb on a cord elsewhere — VISIT_LIGHTS, *guess*, the brochure
                       says nothing), a switch by each room's door (lights.js `switchSpots` + `Switch`, `VISIT_LIGHTS.manual` /
                       `manualShared` for door-less rooms), all off at every visit, nothing saved, no score. The light is ONLY a
                       second lamp wash (lampwash.js `buildLampWashes(…, { suffix: 'V', boxes })`: shader names, uniforms and
                       the cache key carry the suffix, so one material can carry L1007's set and this one; each lamp brings
                       its own walls `segs` in world coordinates and its own level split `lamp.split`, and the flats' boxes are
                       tested first): no pool light, no new shadow light. The fittings of a flat are ONE merged mesh whose lit
                       state is a per-vertex `lampOn` added to the emissive colour; the switches live in the flat's group and
                       `unit.detail`. `lights.supply` scales it all (#604). tools/visitlightstest.html: switches on wall faces, E,
                       wash and fitting on/off, a real brightness change, power cut and mend, no light objects, a reload starts dark.
src/architectureedges.js sharp architectural edges (#474), captured before loose furniture/decor is added;
                       excludes transparent overlays, cabinet contents and explicit loose roots. One static batch per floor,
                       one per moving door/fitting/lift anchor; 30° creases, no triangle diagonals, 1 mm depth bias with depth testing.
                       #505 filters coplanar construction seams against the solid union and open wall planes;
                       a temporary triangle tree accelerates baked solids. core.js retains edgeSources while baking
                       so open wall panels and individual blocks stay distinguishable. #603: every edge is also split where
                       another crease of its anchor meets or crosses it (a 0.25 m crease grid), since a merged Batch's bounds
                       hide its blocks (the worktop round the sink, vanity tops, thresholds). Moving anchors remain separate.
                       world.js and core.js build them once; furniture and loose things have no outlines. tools/architecturetest.html
                       verifies batching, exclusions, moving doors/lift, no box diagonals, the merged worktop's seams (#603) and real WebGL occlusion.
                       #1579 tints each edge by its surface colour × 0.62. #1957 (replacing #1592's light-level uniform): the
                       lines multiply what is already drawn (CustomBlending dst × src, after the opaque pass, no fog/tone mapping),
                       so a joint never comes out lighter than its surface (the tint over the lit cabinet green drew light outlines
                       in L1007's kitchen) and follows day, night, blinds and lamps by itself. The tint only gives the joint its hue
                       (normalised): close up the surface is darkened towards `EDGE_LOOK.shade` × hue by `strength` (≈ 9 % on white);
                       beyond `fadeNear` m from the eye it fades to `fadeMin` of that at `fadeFar` m, since one-pixel lines do not
                       thin with distance. Values in `src/config.js` `EDGE_LOOK` (guesses); [images](../verification/1957/).
                       #1615: a single vertex-coloured material (the A/B/C/L stair cores incl. door leaves, the playhouse shell) counts as
                       one group over the whole geometry, so its edges take the painted vertex colours, not the white base (light grey).
textures/              image textures the page loads (published by stamp.sh): stair-pictures.jpg = the 2 × 2 atlas
                       of the stair pictures (#220), cropped/straightened from docs/tavla-trappa-*.jpg; angsgras-sovrum1.jpg = the picture over the
                       Sovrum 1 bed (#284), straightened, reflections painted out; miele.jpg = the cat photo in the window-board
                       frame (#322), cropped and straightened from docs/miele-foto-ram.jpg; linjeteckning-sovrum1.jpg = the line drawing over the RÅGRUND
                       chair (#404), docs/tavla-sovrum1-linjeteckning.png on pale paper inside a white mount;
                       eat-sleep-game-repeat-sovrum2.jpg = Sovrum 2's neon print (#430), cropped inside the frame and straightened
                       from docs/tavla-sovrum2-eat-sleep-game-repeat.webp; tavla-akvarell-schaslong.jpg = the watercolour over the
                       chaise (#1095, `painting`), from docs/tavla-akvarell-ansikte-foto.jpg cropped, straightened, glass reflections flattened
src/ao.js              baked ambient occlusion: distance field → multiply overlay on floor/ceiling (AO); buildWallAO: one
                       shader overlay per level on the walls — floor/ceiling bands + inner-corner columns (AO.wall, #1074);
                       each quad is wound to face the room whatever the piece polygon's orientation (#1084: rectangle
                       lintels/window infills and L1201's plan were back-face culled); the ceiling overlay's blockers
                       include door lintels and windows so its band runs over openings too; partial-height pieces
                       (lintels, infills) block only over their own height and skip where they run over a wall's end
                       (#1129: door jambs' bands inside the lintel and a doubled strip showed as stripes over doors);
                       inner-corner columns extend continuously across floorHole/ceilHole and slabBottom without floor/ceiling bands,
                       preventing shadow cutoffs and unshaded rectangular gaps in the stairwell (#1273)
                       (tools/wallaotest.cjs, tools/stairwallaotest.mjs)
src/lights.js          room switches (E), ceiling lamps/pendants (`LIGHTING.pendants` styles copper3 #307, silvia #1105,
                       paper #134, string #174)/spots/LED (by hand only), small lamps (FloorLamp:
                       E, and they switch themselves with the dusk, #234); a pool of 4 point lights goes to the lit
                       lamps that matter (own room, in sight, nearest), fading when it moves
src/pendants.js        movable pendants (#1106): every LIGHTING.pendants lamp is built into its own group and becomes a
                       Möblera om piece; parts within `pendantMove.band` of the ceiling stay there, cords stretch (vertex
                       rewrite on a move only), the pool-light anchors and lamp washes (`wash.relocate`) follow; no new
                       draw calls at home (the string lamp's cord shows only when lowered). Visited flats' bare-bulb
                       outlets (visitlights.js) are not pendants and stay fixed. tools/pendanttest.html
src/weather.js         weather (WEATHER, #248): a seeded draw per date (`showersOn`, `rainAt`): showers in spring/autumn (a little
                       in summer, none Dec–Feb), thunderstorms 20 Jul – 31 Aug; follows the clock/calendar. Rain = one
                       LineSegments of streaks around the eye ending on the ground or a roof (`roofAt`: the house boxes of
                       greet.js `occluders` + our unit; a walkable roof's real top where there is one, #360), DayCycle `overcast` (grey sky, fog, weaker sun) and `flash`
                       (lightning), sfx.rain (muffled indoors) / sfx.thunder after distance / 343; sitting in our car (#664) `cabinMix(car.openness)` (CAR.cabin, *guess*) knocks the rain down and dulls it with all doors shut (-18 dB, 800 Hz low-pass) and lets it through with a door open, fading with the door's angle, thunder likewise (the car's roof box already keeps streaks out of the cabin; `tools/carsoundtest.html` measures the levels with an AnalyserNode and counts streaks in the cabin); the small lamps come on
                       earlier, the parasol folds; the HUD shows the weather symbol (#660); `&weather=rain|storm|snow|hail|clear`, `&temp=°C`, `&year=` (with `&month=&day=`).
                       Temperature and real weather (#674): `weather.temp` (°C, outdoors even inside the flat; the badge shows it beside the symbol). `simTemp`: the
                       month's mean (`WEATHER.climate`, *guess* from memory of Skåne's normals, mid-month points eased into the neighbours) + a seeded per-date offset
                       blended across midnight + the day's swing (low 03:00, high 15:00) + sun on a clear afternoon − showers; snow capped at 0.5 °C (forced `&weather=snow` ≤ −2 °C). Recomputed 4×/s.
                       `state()` takes real data first when `weather.real` (src/realweather.js) has the hour, else the seeded draw; a switch between the two eases rain, cloud and temperature
                       over `climate.fade` s (`ease`; `&weather=` forced weather is never eased). Real: Open-Meteo hourly `temperature_2m`, `precipitation`, `rain`, `snowfall`,
                       `weather_code` for the anchor (lat 55.685, lon 13.181, 3 decimals) a month at a time, mapped by `hourState` (snow if snowfall > 0.05 cm or WMO 71–77/85/86; hail 96/99;
                       storm ≥ 95; rain by precipitation 0.35…1 at `rainMm`; cloud by WMO code 1/2/3/45/48) and blended between hours; the id of a shower is its first hour (counts once).
                       Months over for more than 7 days: archive-api.open-meteo.com (ERA5; cached for good); newer months: api.open-meteo.com up to 6 days ahead (cached 3 h); further ahead:
                       simulated. Fetched asynchronously 1.5 s after the first update, never before; failures (offline, HTTP error, wrong body) are silent and retried after 5 min.
                       Source and terms: Open-Meteo.com, weather data CC BY 4.0, free for non-commercial use without a key (attribution: credited in this file and shown on the start screen under *Om musiken* as `#weather-credit`, always visible, link rel=noopener to open-meteo.com, #700; README too). The cloud
                       session that wrote it had no access to the live service: **the real request/response were not verified against open-meteo.com** (built from its documentation, tested with
                       `tools/fixtures/openmeteo-2024-01.json`, a hand-made fixture) — try it once on a real machine (`?year=2024&month=1&day=10` should give real January weather). Automated
                       browsers (`navigator.webdriver`) and `&shot` never call the service unless `&weatherapi=/path/file.json` (same-origin fixture, replaces both URLs) is given; `&realweather=0` turns it off.
                       Wind (#2117, `src/windsim.js`, `WIND`): `weather.wind` = { x, z } m/s downwind in scene axes (x east, z south, north −z; `windVector(fromDeg, speed)` converts
                       the meteorological direction the wind comes FROM). Real hours: Open-Meteo `wind_speed_10m` (`&wind_speed_unit=ms`) and `wind_direction_10m`, blended between hours
                       as a vector; elsewhere (the far future, gaps, offline, forced weather) `simWind`: a seeded draw per date and hour for Lund — a weather regime every 36 h (≈ 55 %
                       south-west–west round 245°, the rest mostly easterly, more in spring) with smaller turns every 6 h, the monthly mean (≈ 5 m/s in winter, 3.5 in summer, *guess*),
                       an afternoon swing and + 2 m/s in rain, + 6 in a thunderstorm, all smoothly blended (≤ 0.6 m/s per 6 min). `ease` fades the wind with rain/cloud/temperature when the
                       source switches. It slants the rain streaks (`WEATHER.slant`: 0.03 m sideways per m of fall per m/s, ≤ 0.45; 4 m/s ≈ the old fixed 0.12) and drifts the snow
                       (`WEATHER.snowDrift`), is handed to DayCycle (`day.wind`: the cloud shadows) and drives SiteWind's power (`windPower`: (m/s ÷ 13)^0.9, softly capped below 0.8 above 0.6; card flutter capped at power 0.6) and direction, which #2110's
                       avatar wind follows. `&wind=power[,seconds]` still pins the power; the direction always follows the weather. Not verified against the live service either
                       (fixtures only). `tools/windsimtest.mjs`, `tools/wind2117browser.cjs`, [before/after](../verification/2117/README.md).
                       #249: each shower has a `kind`: snow (mostly Dec–Feb; slow swaying Points, a lighter sky, silent),
                       hail (spring, and at the start of some storms; white pellets that bounce once and lie a moment, a
                       louder rattle); ❄️ / 🧊 in the HUD. Walking WEATHER.experience.metres outdoors while it falls calls
                       `onExperience` once per shower → stats walkRain / walkSnow / walkHail / walkStorm (big points the
                       first time, a little each later shower; a badge every time)
src/wetground.js       wet ground in and after rain (#2099, WET_GROUND, all *guess*): `GroundWetness` (main.js, after weather.update) integrates a film
                       `wet` and puddles `pool` (0…1) on the game clock from what falls (rain / melting hail; snow and the snow months stay dry), drying
                       gradually (faster in sun and warmth); at start or after a clock jump it integrates the last 12 h from `Weather.fallAt` (forced,
                       real data or the seeded draw), so a dry afternoon after a morning shower starts damp. `wetGround(material, kind)` chains a
                       fragment-only patch (unique cache key `|wet2099-<kind>`, lampwash wraps it as before) onto the outdoor ground: the site
                       asphalt and park asphalt paths, street kerbs / asphalt patches / zebra paint / cobbles, site pavements, courtyard paving and
                       brick, the exposed patio, every gravel surface and the west/east/north backdrops' access surfaces. Soaked: albedo × `dark` (damp
                       darkens at wet × 1.6), roughness down to `rough` (by wet²); puddles where a world
                       value noise peaks on flat ground (placement *guess*, not measured low points): darker, roughness 0.05, bump flattened. Film and
                       puddles add DayCycle's own horizon/zenith colour by Schlick Fresnel (no mirror pass). Wet = 0 skips every branch (dry pixels
                       unchanged); the `puddles` quality knob turns puddles off at level 0 and on phones. `tools/wetgroundtest.mjs`,
                       [before/after](../verification/2099/README.md).
                       #2119 (RAIN_RIPPLES, all *guess*): while it rains `uGroundWet.z` = the live rain (rain only, eased over `fade` s, 0 after the
                       shower, in the snow months and with puddles off; `uWetTime` = real seconds, wrapped) and `rippleGLSL` (after the puddles'
                       flattening, only where puddles compile, never in the `-lite` shaders) bends the normal: two offset grids of drop rings
                       (one hashed drop per cell per period, a share by rain strength) in the puddles, a faint flash of small splashes (lower
                       roughness) on the film, fading out with view distance (rings 9–22 m, splashes 3–9 m). No new draws, textures or passes;
                       desktop keys unchanged per kind. `tools/rainripplestest.mjs`, [before/after](../verification/2119/README.md).
src/leaflitter.js      fallen autumn leaves on the ground (#2105, LEAF_LITTER, all *guess*): `litterAmount(month)` is the share of full litter (Sep < Oct
                       < Nov; none in summer, spring and SEASON.snowMonths). `LeafLitter` (main.js, a seasons hook) writes it and the month's [fresh,
                       old] leaf tones to shared uniforms and, on the first autumn month, bakes one R8 density map over WALK (1 m texels): a sparse
                       patchy base, more under each `aoTrees` crown (densest at the trunk) and a band along the local roads' kerbs (path roads' edges and the rectangular forecourt's outline). `leafLitter(material,
                       kind)` chains a fragment-only patch (cache key `|litter2105-<kind>`) onto the lawns (grass.js; masked off the river bed's mud) and, from
                       `wetGround`, every exposed ground surface, wrapped outside the wet patch so its step runs first (wet leaves darken too): two
                       jittered world grids of small pinched-ellipse leaves on flat ground, fading by pixel footprint into their mean tint (plus a
                       broken brown mulch where it is densest), so the far ground keeps the colour without shimmer. Amount 0 skips every branch. The
                       `leafLitter` quality knob keeps only the tint at level 0 and on phones. The street's instanced pavement leaves (street.js) thin
                       with `litterAmount` too. `tools/leaflittertest.mjs`, [before/after](../verification/2105/README.md).
src/groundglow.js      light without lights (#434, #433): additive fall-off decals — `poolGeometry` (an ellipse draped over `groundY`),
                       `washGeometry` (an upright one on a wall; #1092: `holes` = the wall's openings, cut out so the glow lights the brick round a window/door, never its glass — the front-door and patio/terrace washes pass them; the Å-husen's loggia washes need none: their glazing stands in front of the wash and hides it), `glowMaterial` (one per set, opacity = the level), `fadeGlow`
                       #1525: courtyard night ground light — every courtyard bollard gets a warm pool (`COURTYARD.bollards.pool`,
                       one `courtyard-bollard-pools` mesh in courtyard.js, hysteresis fade, out in a power cut) and Hus A–C's lit
                       ground-floor windows spill a faint pool in front (`COURTYARD.windowSpill`, one `windowSpillPools` mesh in
                       surroundings.js `buildWindowLights`, per-vertex level = the window's routine level × night). Front-side only
                       (one pass each), hidden by day, no light objects; radii/strengths *guess*. Night perfcount +2 calls max.
src/lamphalo.js        street lamp halos and pool cores (#2104, `SITE.street.lamps.halo` / `pool.core`, *guesses* by eye): one additive
                       `streetLampHalos` mesh of billboard quads (corners expanded in the vertex shader, one draw, `frustumCulled` off),
                       the groundglow fall-off cubed (bright core, soft tail), never under `minPx` px (it dims instead: no sparkle far
                       off), drawn `toward` m in front of the housing, dimmer seen from above, fading with the pools' glow and into the
                       fog/aerial haze (`fadeGlowWithFog`, own cache key). `poolCore` brightens the street pools' middle under each head
                       (rim unchanged), a little more on a wet street (#2099's shared `uGroundWet`). No lights, no lamp-wash patch (basic
                       materials), not in siteinstancebatch. `tools/lamphalotest.mjs`, [before/after](../verification/2104/README.md).
src/daycycle.js        real-time day (#1145; DAY.minutes = 24 × 60, was 60): it follows the visitor's clock (frames lost to the dt cap or a hidden tab catch up from Date.now(); `toNow()` = the wall clock's "Nu"), real solar path for the month (55.7° N), sun → moon light (the moon's real phase and orbit, #2194: `src/moon.js` low-precision ephemeris → `moonDir`, `day.moon`; `uMoonPh` shades the disc as a lit sphere with its lit limb towards the sun, faint earthshine on the unlit side, halo and `DAY.moonlight` × (`moonFloor` + … × lit^`moonExp`) follow the phase; `tools/moontest.mjs`, `tools/moon2194browser.cjs`), shader sky
                       (glow, stars, clouds), fog colour; paused / spooled by the wall clock. Daylight (#1073): `LIGHTING.sky`
                       blends `overcast` (even sky/ambient/fill, sun 2.2, exposure 1) → `clear` (darker shade side, sun 3.0,
                       exposure 1.5 so rooms stay ~as bright) by daylight × (1 − overcast); night, rain and the garage keep the old light
                       Cloud deck (#1250/#1251, `SKYLAYER`, all heights *guess*): the jetpack ceiling is 320 m. `DayCycle.update` reads the camera height: weather (`overcast` ≥ `cloudy`, full at `full`) or flight approach forms
                       one noise quad (`deck`, procedural, no texture, one single-pass draw, only drawn from `approach` m under `base`)
                       is the layer's underside (grey) / top (white, sunlit); between `base` and `top` the view whitens (fog near/far `near`/`far`, sky shader `uWhite`);
                       above `top` + `fade` m `above` = 1: `oc` = 0 so the lighting is the clear-day blend (sun 3.0, exposure 1.5) whatever the weather below (night keeps the moon),
                       and weather.js drops the rain / flakes / sound by (1 − above). One shadow-casting light as before. #1266: sky and cloud deck shaders include `colorspace_fragment` so their fragment colors match the
                       output color space of the fogged ground, eliminating the horizon edge band. `node` check: climb with `&weather=rain&jetpack`, log `day.above`, `scene.fog`, sun.
src/aerialhaze.js      aerial perspective (#2100, `HAZE`, artistic *guesses*): patches three's four fog chunks once at import (no pass, texture or extra program;
                       one `vFogDir` varying, a pow and a few mixes per fogged fragment). Mid-distance haze turns bluer (`blue` x horizon), full fog stays the
                       sky's horizon colour; towards the sun it takes the sky's own horizon glow (+ a small clear-day `scatter` halo the sky shader adds too), so
                       far silhouettes melt into the sky at sunset. The near → far curve blends smoothstep towards a normalised exponential (`k`, weight `w`:
                       clear 0.35, overcast/rain 0.85); nothing changes before fog near (45 m, so the 46–54 m tree LOD zone barely moves). Night, under water
                       (`divelook.js` `clearHaze`), inside the cloud deck and during lightning = stock fog. Uniforms are plain `{x,y,z,w}` objects added to
                       `UniformsLib.fog`/`ShaderLib`, which three's uniform cloning shares by reference; materials without them render stock fog.
                       `tools/aerialhazetest.mjs`, [before/after](../verification/2100/README.md).
                       #2124: the haze also carries the sky's tight low-sun halo (`fogHazeHalo`, (s^6)^8 from the same pow), so the contract
                       "full fog towards the sun = the sky there" includes the halo.
src/valleymist.js      valley mist (#2187, `VALLEY_MIST`, artistic *guesses*): `mistDensity` (pure) = a fog weather code (WMO 45/48 from realweather `hourState().fog`, or `&weather=fog`; lasts all day, wind only thins it) or a calm (< 1.5–4.5 m/s), cool (< 10–17 °C), dry, not-overcast
                       morning that burns off as the sun rises (sun y 0.04–0.32), on a seeded share of days per month (`chance`; autumn most). `Weather.updateMist` eases it into `day.mist` (20 s; `weather.mistOff` = off for tests); DayCycle then pulls
                       the fog in with `mistFog` (far falls exponentially 650 m → 80 m at density 1, near 45 → 6 m; ~190 m at 0.6) and tints it towards a pale mist grey in daylight; #2100's haze curve and colours ride on top unchanged.
                       `ValleyVeils`: 4–14 large soft horizontal alpha cards (one merged mesh, one draw call, no depth write, no extra program-specific shader) lying 1–3 m over Höje å along `driftRiver()`'s path, swaying slowly,
                       drawn only within `veil.range` of the river and while the density is above 0.03; quality knob `valleyVeils` (spacing per level: none / 150 / 95 / 60 m; phones 220 m). The water material is not touched. `node --test src/valleymist.test.mjs`;
                       browser before/after `tools/valleymist2187browser.cjs`, [images](../verification/2187/).
src/daycycle.js        dawn / dusk colour depth (#2124, `SKY_DUSK`, artistic *guesses*; `duskSkyState(sunY, oc, off)` is pure): while the sun is
                       low the sky blends towards a pink (sun side) → violet (away) layer above the horizon (zero on the horizon row itself, so
                       fog and haze match unchanged), the zenith deepens, a tight bright halo (pow 48) circles the sun and the sky clouds get
                       cooler violet-grey bodies with warm edges lit from below. Zero by day (incl. a December noon, sun y 0.19) and at night,
                       damped by overcast, off inside the cloud deck / lightning. One sky program, no pass or texture. `tools/skydusktest.mjs`,
                       [before/after](../verification/2124/README.md).
src/cloudshadow.js     cloud shadows (#2102, `CLOUD_SHADOW`, artistic *guesses*): patches three's `lights_pars_begin` / `lights_fragment_begin` once at import
                       (no pass, texture or extra program): the shadow-casting directional light (index < `NUM_DIR_LIGHT_SHADOWS`, i.e. the sun/moon) is
                       multiplied by two octaves of periodic analytic value noise (110 m cells, tile 5.3 km so the wrapped drift never jumps), looked up
                       where the sun ray through the fragment meets a deck `height` m up, so walls, roofs and the ground below share one cloud. It drifts
                       with the weather's wind (#2117: `day.wind` from weather.js, `stepCloudDrift` integrates `cloudVelocity` = 1.6 × the 10 m speed, 1–25 m/s, so a
                       turn never jumps the pattern; without a wind the old `speed` m/s along `wind`, −x). `DayCycle.update` sets strength from overcast (fades in
                       0.05–0.25, out again 0.8–1 where WEATHER.sunCut already dims everything) × the sun's height; 0 = one uniform branch, no noise:
                       clear sky, full overcast, night, inside the deck, the garage, indoors (`day.indoor` from main.js, eased `indoorFade` s, so the
                       view out of a window has none either) and the `cloudShadows` quality knob (off at level 0 and on phones). Lit built-in
                       materials (standard/physical/lambert/phong/toon and their onBeforeCompile variants) share the uniforms by reference.
                       `tools/cloudshadowtest.mjs`, [before/after](../verification/2102/README.md).
                       #2154 sky clouds: the sky shader's cloud layer is no longer the static `cloudTexture` but the SAME periodic noise (`CLOUD_NOISE_GLSL` / `csField`, shared with
                       the shadows) read where the view ray meets the shadows' deck plane (`cloudShadowA.xy` offset + `.z` height, the shared uniform object), so clouds drift with the
                       wind exactly like their shadows and a cloud overhead casts its shadow below it. Coverage follows `oc` (the weather's overcast, real WMO codes 1/2/3 = 0.05 / 0.2 / 0.55):
                       `skyCloudState(oc)` gives the threshold (`CLOUD_SHADOW.sky`, *guess*: nothing at a clear sky, equal to the shadows' threshold from `ramp`, overcast fills through the
                       shader's floor). The shared field has a low octave (clusters, gaps; cell 200 m); the sky adds two finer octaves that erode the edges and fade out towards the horizon, a wide soft edge, thickness shading (grey cores, bright thin rims) and one sun-ward sample for self-shadow. Dusk colours / lit edges (#2124) and the deck (#1251) are
                       untouched. One program (an uniform branch), no pass; `quality.register('skyClouds')` falls back to the old texture at level 0 and on phones. `tools/skycloudstest.mjs`,
                       `tools/skyclouds2154browser.cjs`, [evidence](../verification/2154/).
src/windowlight.js     the windows' daylight indoors (#2152, `WINDOW_LIGHT`, *guesses* tuned by eye/mean luminance): patches three's `lights_pars_begin` /
                       `lights_fragment_end` once at import like cloudshadow.js (no pass, texture or extra program; never installed on phones). Inside the
                       active flat's box (L1007, or a visitable flat from visitunit.js, each with its own box between its windows' glass planes and its own
                       storey bands: `homeRegion` / `visitRegion`; the flat the camera is in or nearest within `near` m) the hemi + ambient irradiance keeps
                       `base` of itself by day (`baseFactor`, 1 at night), the shadowless fill loses `fillCut`, and up to `max` nearest windows each add a soft
                       sky source: E = L·A·cosW·cosR / (π·(r/spread)² + A) from the nearest point on the glass, softened cosines (`wrap`, `glassWrap`),
                       L = `gain` × `day.skyLight` (the hemi sky intensity × daylight × overcast). Only inside its visibility polygon
                       (`rays` rays fanned over the room side from just inside the inner façade face, cast with lampwash.js `cast` against walls, doors as
                       they stand — re-cast at most every `recast` s while a door moves, so an open bedroom door lets light into the hall — and the outline).
                       Each window's strength is what its own blinds / curtains let through (`windowPass`: BLINDS.dim per tone × cover, the curtains'
                       daylightCut; same level, façade and x overlap). A share `bounce` of it is the room's own bounce: same fall-off, warm (`warm`),
                       hardly any facing (`bounceWrap`), so the window wall, reveals and a soffit's face turned from the glass keep their light; the
                       kept base is tinted warm (`tint`) and the sky term pulled `skyWarm` towards warm. An upper storey's stairwell opening is a
                       bounce-only "well" source (`wellSources`, two ±x fans, `well` × the storey below's mean window strength): light rising up the
                       stairs into the upper hall. The sun's patches are untouched. #2151's room probes re-capture when it switches (probe signature). Exposure × (1 + `exposure`) eased in indoors by day
                       while it lights a flat (`day.windowExposure`). Quality knob `windowLight`: off below `minLevel` (level 0 = the old even light).
                       world.js openings carry `glass` / `inner` z for it. `tools/windowlighttest.mjs`, `tools/windowlight2152browser.cjs`,
                       [before/after](../verification/2152/README.md).
src/balloon.js         hot-air balloon above the cloud deck (#1646, `BALLOON`, all numbers *guess*): one merged vertex-coloured Lambert mesh (envelope, basket, rim, ropes; ~900
                       triangles, no shadows, no light). `src/balloongeo.js` holds the pure parts: a wall-clock (`Date.now`) schedule so every client agrees (visible `window` s of
                       every `period` s, scaled in/out at the ends), the circling drift above the deck, the basket floor (`basketFloor`, a standable surface in Player.groundAt)
                       and the rim wall (`basketCollide`). `update` runs before player.update and carries a player standing in the basket; outside its window, underground or far
                       away the mesh is hidden and update returns at once. It stays up while the player is aboard. `&balloon` forces it on; `window.__app.balloon`.
                       #1770: the 14 gores are the rainbow (`BALLOON.rainbow`, red → violet twice round; each triangle takes its gore from its centroid, `stripeAt`), still in
                       the one merged mesh; up most of the time (`window` 1800 s of every `period` 2400 s, #1779 after #1770 made it rare, *guess*; 2160 s since #1784). The basket's beers (`src/balloonbeer.js`, see food.md) are children of
                       the mesh's `beerGroup` (ride, scale and hide with it; one draw call per bottle only while the balloon is drawn); `stock` = the appearance
                       (`floor(t / period)`) they were last restocked for.
                       #1784 (user: still never seen): measured with the real wall-clock schedule (no `&balloon`) it rendered correctly (visible, in the frustum,
                       not hidden by the deck, sky or fog) but at `radius` 260 it stayed ~290 m from the courtyard (~0.08 % of the picture from a jetpack hover above the
                       deck, a ~10 px hazy dot from the ground) and was up only 75 %. Now `radius` 100 (circles over the houses, ≤ ~150 m from the start spot) and
                       `window` 2160 of 2400 s (90 %), both *guess*; `tools/balloontest.cjs` checks it drawn and ≥ 0.2 % of the picture from a hover at 260 m.
src/birds.js           gulls (#1252, refined #1924; BIRDS/GULL_SURFACE, artistic guesses): exclusive near/far instanced batches, at most two draws, no lights/textures/sound/shadows/raycast.
                       src/gullmodel.js shares the240-triangle near body/head/bill/eye/wing recipe with the collection; far is12tri/bird. Ten birds (five low-memory), immutable seeded circles and
                       GPU glide/flap/bank. A bounded allocation-free CPU pass packs each source seed into exactly one LOD at45m, and skips work while fully hidden. Retained raw buffers31,040B
                       for ten/30,640B for five include both recipes, source/packed seeds and IDs; these are not total heap/GPU memory. Model span1.6m near, smoothly2x visibility scaling at75m,
                       no extra high-flock enlargement. Existing day/rain-snow/whiteout/underground/far/cloud-deck gates remain, as do warmDraw/noDetail flags. BestiaryObserver reads original
                       seeds once across both LODs. The gull-only modelVersion2 refreshes derived thumbnails. Whole/motion/normal views, real draws, timing and limits: docs/verification/1924/README.md.
                       #2129: small birds and landing gulls (src/birdflock.js, BIRD_LIFE): an instance with aMode.x = 1 takes an explicit CPU pose (aPose/aMode/aTurn:
                       position, yaw, flap, folded wings, size, bank, pitch). Low gulls land now and then on roof tops (≥ 8 m) or river-bank spots (GullRoost: a pure
                       function of time plus a flush). The sparrow flocks (`smallMesh`, sparrowGeometry ≈120 tri, kept out of `meshes`) share THIS material: +1 draw,
                       no new program. Details: animals-audio.md "Small birds and landing gulls"; evidence docs/verification/2129/README.md.
src/blinds.js          pleated blinds, bottom-up (BLINDS, #273): one per window in the reveal on the room side of the frame
                       (the living room's split window: two), `blind: 'dark' | 'light'` per WINDOWS entry; the fabric (a
                       zig-zag rebuilt only while it moves, castShadow) + the top rail are two meshes per blind, the bottom
                       rail / cords are baked; E opens #blind-panel (BlindPanel, reading mode like the clock's strip): W / S,
                       ↑ / ↓ or ▲ ▼ held; the visitor's room loses daylight (`DayCycle.dim`) by its blinds' cover; a white
                       one glows by day and warm from a lit room (`lights.roomLit`); localStorage 'lunden.blinds'; F keeps them
src/curtains.js        Sovrum 1's curtains (#342, CURTAINS): two floor-length teal jungle-print panels (our own canvas print) on a white
                       ceiling track under the soffit from the west wall; a split (#362): they meet at the window's middle and part
                       to either side, the same share of their way (the west one to an end stop by the west wall, #403: the RÅGRUND
                       chair moved south out of the corner; both stacks clear of the glass); wave folds rebuilt only while they move (count fixed, spacing shrinks); part of Blinds
                       (`blinds.curtains`): E opens #blind-panel sideways (A / D, ← / →, ◀ ▶ held: together / apart), the daylight cut (`dim`, less than blackout), a teal glow by
                       day, saved in 'lunden.blinds'; fittings: F keeps them; stats `curtains`; `&curtains=0…1`
                       #463: Vardagsrum has three botanical linen panels on a wall-to-wall rail over the patio door too. Optional
                       CURTAINS.panels defines each closed span and parking side; cover sums the window overlap.
                       #464: kitchen valance is one short panel (hem 2.45 m), initially spread along the existing rail, dim 0.03.
                       #468: every rail spans the room's side-wall faces (CURTAINS.rail, plan.json); kitchen cloth spans the full width too. #566 gives the living room its own dense dark-green IKEA leaf print on white (IMG_0571); kitchen fabric stays unchanged.
                       Its '-valance' state id avoids inheriting the removed long curtains' position; subsequent positions save normally.
src/lights.js #604     the mains (`setSupply`, 0 … 1, from power.js): every glow, pool light (not a `fire` lamp: the grill) and wash
                       × supply; `room.on` / small lamps' on are kept through a cut; `roomLit` false; `FloorLamp.glow` = k × supply (the tree)
src/lampwash.js        every lamp's light wherever the visitor is (#276, #294, #295, LIGHTING.wash): each pool anchor (small lamps
                       and ceiling lamps) lights the flat inside the lit materials' own shaders (`patch(scene)`: onBeforeCompile on
                       every MeshStandard/Lambert/Phong material, re-scanned every 120 frames; no extra mesh or draw call) exactly
                       like its pool light (same fall-off and range, Lambert on the surface's colour, no specular), only where it
                       sees: its visibility polygon (rays to walls, closed doors but not wardrobe fronts (#297), the façades' outer faces) is a row of a float
                       texture; lamp data in a small float texture. It shows k × (1 − pool) and the pool light k × pool (cross-fade,
                       Lights.update → `set(i, k, pool)`), so a lit room looks the same near, far, upstairs or from outside
                       The injection is idempotent per suffix (#2090): a material that inherits an already washed callback
                       (viewlod.js's parked-car clones under their dither fade) gets each wash once, not a redefined second copy
                       that failed to compile and hid the near cars (`tools/lampwash2090test.mjs`, `tools/lampwash2090browser.cjs`)
src/lampshade.js       shaded lamps throw light up and down (#2191): a lamp carries `shade` (a `LIGHTING.shades` profile: `inner`/`outer` cosines,
                       `up`, `leak`, `boost`, *guesses* by eye) and `axis` (a Vector3, default straight down; NYMÅNE's follows its shade's tilt and
                       the item's rotation, rearrange.js turns it with a move). `shadeGain(cos, shade)` (mirrored in lampwash.js's GLSL, lamp data
                       texture rows 3-4) = a lobe along the axis, a weaker one the other way, a leak between: a table cone with a soft edge, a pool
                       on the ceiling, a darker band beside. Copper pendants, the Silvia, the paper lamp, the cone pendant and the NYMÅNE reading
                       lamps; the string lamp and everything else stay bare. A shaded lamp is lit by the wash alone (never a pool-light candidate:
                       a point light would be even all round and seam when it took over; it gives up the pool light's specular glint). `src/shadepools.js` adds the visible part (the
                       shader alone is faint against the room's ambient): additive floor / ceiling decals per `shade.pool` ([radius, peak]), ONE merged
                       mesh, vertex colour = the lamp's on-ness, re-seated when a pendant moves. No new light or pass; +1 draw call; one more
                       `texelFetch` pair per lamp in the lit shaders. `tools/lampshade2191test.mjs`,
                       `tools/lampshade2191browser.cjs`, [before/after](../verification/2191/README.md).
src/mirror.js          the one mirror material (gradient + glints; hall and bathroom mirrors); the lit mirrors (Badrum LED, Hollywood, Klk) use `litMirrorMaterial` + `litEmissive` + `litReflect` (LIGHTING.mirror, #339)
src/reflections.js     mirror images: a Reflector per mirror, only the nearest one in view (< 4 m) renders; `dim` scales a lit mirror's image (#339)
                       Our own avatar in the mirrors (#691): `setMirrorExtra({ before, after })` runs around each reflector pass (not on a held frame), ghosts.js
                       puts our solid avatar (src/avatar.js, id `me:<name>`) where we stand, looking where we look, with the weapon in hand, walking
                       by the ground speed of the last frames, poses it only then, and hides it again; the main camera never sees it. Same pass, same
                       target: +1 draw call and ≈ 3.7 k triangles in the mirror pass, nothing otherwise. Not while seated / lying (`mirrored`
                       callback), never in raycasts (hidden outside the pass, under the ghosts' group). Windows and glass use the env map, not a live image, so they show nothing.
                       Own typing (#743) uses that same before/after hook and reflector pass: one non-raycast Sprite, hidden afterwards from the main camera.
                       A lazy shared 512×96 RGBA atlas (192 KiB, no mipmaps) holds twelve pre-drawn “Skriver”/dot phases; frames change UV offsets,
                       without repainting or marking the texture dirty. The sprite reuses ghost tag dimensions and its existing above-head anchor (there is no own name tag). Owners lease one
                       material/texture; reset, self-name replacement and disposal release the lease, with the last owner disposing both resources.
src/roomprobe.js       glossy surfaces indoors reflect the room (#2151, ROOM_PROBE): materials tagged `userData.roomProbe = '<class>'`
                       (interior.js, standardinterior.js, toilet.js, hood.js, fridge.js, ovens.js, world.js) get one env map: a 64 px
                       cube-camera view of the visitor's room zone, PMREM-filtered, kept per zone (LRU); `roomEnv()` (the painted room,
                       #307, re-exported by lights.js) below ROOM_PROBE.minLevel. See [Room reflections](#room-reflections-in-glossy-surfaces-2151)
tools/roomprobetest.mjs node test: mode per quality level / phones, capture plan (load, new zone, light change, settle, LRU, once), bands, zones
tools/roomprobe2151browser.cjs before | after pictures in the real game (kitchen, bathroom; day, evening with lamps) and the probe's numbers
src/seasons.js         month → tree colours/leaf cover and snow on ground, roofs, hedges, paving (SEASON)
src/footprints.js      footprints in the snow (#1773, FOOTPRINTS): one InstancedMesh of atlas quads (shoe | paw, a canvas), fade by
                       age and distance in the shader (onBeforeCompile), hidden while no live print is within drawDist; walkers fed by main.js
src/footprinttrail.js  #1773 without three.js: Stepper (prints every step m, alternating feet), PrintStore (bounded ring, fade, compact),
                       catOut (snow-day outings), netTrails (the room's history). node test src/footprinttrail.test.mjs
tools/footprintstest.cjs three clients against the local Worker in snow (#1773): A's prints on the lawn, none on the road or indoors, B sees
                       them, a late C gets them from the room, paw prints behind a cat out, half faded at 15 min, gone at 30 min, pictures
src/huego.js           the Philips Hue Go on Sovrum 1's window board (#409, #428, HUE_GO): the classic frosted bowl, a lamp of its own; its
                       action menu (#367, an ActionSet; FloorLamp `options`) = Tänd/Släck + Byt färg (scenes), the colour kept by keep.js
src/screens.js         TV programmes drawn on a canvas (PROGRAMS: space, underwater, superheroes, unicorn …), channel
                       snow, the Ambilight colour per programme; `Screen` is shared by the TVs in furniture.js
tools/mirrortest.html  headless test: in front of every mirror its Reflector is the active one, on the glass (#139); our own avatar is drawn once inside the active mirror's pass, hidden again after it and not at all when no mirror reflects (#691)
tools/weathertest.html headless test (#674 too: simTemp, RealWeather against a mock service, the fixture in the page, 404 → the draw, cache on a second load, future → simulated, `&temp=`): showers per season, thunderstorms only in late summer, a shower ramps in; with &weather=storm:
                       drops (none inside Hus L), grey sky, a flash and back, ⛈ in the HUD; snow only in winter, hail in
                       spring / storms, snowflakes not in Hus L, walking 20 m out in it counts once, not indoors; clear = no rain
```

## Recent implementation notes

### Snow cover from the real weather (#2176)

`SEASON.snowMonths` is now only the fallback. `src/snowcover.js` holds the pure model (`snowStep`: depth cm + hourly snowfall,
`SNOW_COVER.melt` cm per degree-hour above 0 °C, minus `SNOW_COVER.rain` cm per mm of rain per degree on snow; `coverOf` = depth / `full`)
and the `SnowCover` driver (main.js, after `weather.update`, before `groundWet.update`): it integrates the real hourly series
(`RealWeather.rawAt`: temp, snowfall, rain; `spin` hours of history re-read at a start, a jump or when a month arrives) and writes
the shared `snowState` (`cover` 0…1, `lies` = binary with the `lies` / `gone` hysteresis, `source` real | calendar | forced) and
`snowUniform`. Without real data for the hour, or with forced weather, `cover` is the calendar's 0 / 1 (the old behaviour);
`&snow=0…1` pins it. Binary readers (squirrels, ponies, footprints, drains, roofs, hedges, cats, leaf litter, backdrops) call
`snowLies(month)`; `applySeason` re-runs the seasonal hooks when the month or that reading changes. `wetground.js` fades the film
out as the cover grows, `snowcap.js` (#2123) takes `min(1, 4 × cover)` (sills catch snow first).
`src/snowground.js` (`registerSnow(mat, hex, cls)` with a ground class asphalt | paving | gravel | grass) chains one fragment step
onto the ground materials: the spot is white when the cover exceeds its hold (`snowHold`: class base, ± world-xz noise, lower under
crowns and against north facades = R channel of one 512 px shelter texture built once by `buildSnowShelter` from the trees, the
`weather.boxes` and `roadFrameAt`, lower and dirty grey `ridge.color` along the road edges = G channel: the plough ridges, placement
*guess*). The ground keeps its texture and bump (the step flattens the normal where snow lies). Phones (`lowMemory`): noise only, no
texture lookup. No draw, light or pass; one extra sampler on the patched materials. Test: `node tools/snowcovertest.mjs`; fixture
`tools/fixtures/openmeteo-snow-2176.json` (hand-made Jan 2026: snowfall 2 Jan, thaw from 9 Jan), used with `&weatherapi=`.

### Footprints in the snow (#1773)

In the snow months (`SEASON.snowMonths`, i.e. while the ground is white; snowfall in another month leaves none) players leave shoe
prints, alternately left and right `FOOTPRINTS.shoe.step` m apart, and the outdoor cats small paw prints, where snow lies: main.js
`snowY` says no inside our flat, off the ground (a roof, a deck, a bridge, in the air), on a ploughed road (`onRoad`), in a stairwell or
visited flat, in the river and under a roof, canopy or balcony (`roofs.above` within 9 m). Each print is dated by when the walker was
there and fades linearly to nothing in `FOOTPRINTS.life` s (30 min, real time). Our own prints come from `player.pos`, the other players'
from their interpolated ghost positions (no new message; riding, the jetpack's thrust and sitting make none), the cats' from their loop
positions while they are out (`outdoorcats.js snowOut`: short snow-day outings, a pure function of the clock, see
[animals-audio.md](animals-audio.md#outdoor-cats-1767)). A late joiner gets the players' last 30 minutes from the room
(`cloudflare/trails.js`, the welcome's `trails` field, [storage.md](storage.md)) and rebuilds the cats' from their loops.
Drawing: all prints (at most `max`, 2000; the oldest give way) are one `InstancedMesh` of quads with a two-cell canvas atlas, a
`MeshLambertMaterial` (no new light, no shadow), transparent without depth writes, polygon offset; per-instance `fpBorn` / `fpCode`
attributes and an `onBeforeCompile` fade by age and by distance (`fadeFrom` × to 1 × `drawDist`, phone `drawDistPhone`). The mesh is
hidden while no live print lies within the draw distance, so a view without prints near (the start view, also in December) gets
no extra draw call; otherwise exactly one. Gone prints are compacted out every 20 s; only new slots are uploaded (`addUpdateRange`).
`&nofootprints` disables the module. Tests: `node --test src/footprinttrail.test.mjs cloudflare/trails.test.mjs`, browser
`tools/footprintstest.cjs`. Images: [docs/verification/1773](../verification/1773/).

Takgardinernas ljus (#499): `CURTAIN_LIGHT` samlar antagen svag transparens, diffus transmission, råhet och genomlysning. Alla sex `Curtain`-uppsättningar använder matt, lätt transparent tyg med `depthWrite` och `forceSinglePass`; de vanliga täta skuggorna stoppar direkt sol. `daylightCut` styr rummets befintliga diffusa fyllnad via `Blinds.update`, fullängd från gemensam transmission, kappans lilla bidrag från `spec.dim`. Plissématerial och vertikal styrning är oförändrade; inga nya ljus/renderpass. `curtaintest` verifierar även alla sex lagrade lägen efter riktig omladdning och tygens dags-/kvällsgenomlysning. Vyer och begränsningar: `docs/validation/issue-499/README.md`.


Basin mixer levers (#526): interior.js supplies side-mounted pins for kitchen/laundry goosenecks and top paddles for the two vanity mixers. Their positions and proportions are assumptions in TAP_LEVER, with the existing mixer finish. Tap in water.js adds one merged dynamic mesh per basin, tagged moving for the detail culler, and a widened elliptical pick at the control rather than the outlet. outlineRoot targets that physical lever. Lever progress follows isOpen with a reversible 0.24 s eased lift; flow and sound synchronize even after an external state change. Water outlets/handwash/dish/fill APIs keep their existing positions. Taps remain transient across reloads (keep.js); new/reset visits start shut with handles down. Showers retain their thermostat controls. watertest checks all four levers, touch/desktop use, nozzle rejection, quick reversal, live state, sound stopping and an actual reload; cuptest and life2test sections 382/383 cover jug filling and dishes. Four extra draws at most; no new material/light/render pass.

Focus material lamp scans (#548): InteractionOutline tags its temporary shader material with INTERACTION_MATERIAL_SOURCE. LampWashes.patch follows that original source, so its periodic 120-frame discovery scan cannot insert duplicate lamp declarations into the focused shader. The wrapper reads the current original compile hook and cache key, including a first lamp patch while the object is already focused. No extra geometry, passes or lighting; original materials, live uniforms and appearance forwarding remain intact. interactionoutlinetest covers repeated scans on Standard/Physical materials, the real closed entry door, and discovery during focus.

Focus materials (#558) survive focus exit and are reused by source/index; the source material disposal releases all cached variants. Instanced figure selection is a shader uniform, so walking the eye across people does not generate a distinct GPU program for each figure. Dynamic getters still forward live source appearance and lamp shader hooks (#548). Tests: focusperftest and interactionoutlinetest.

Plant wind (#518): `src/plantwind.js` adds a shared vertex deformation to explicitly selected foliage materials and the matching sun-depth material; existing lamp wash and interaction brightness hooks remain composed. Height/phase/stiffness attributes survive static material merges. Two shared uniforms update per frame, with no vertex uploads, extra light or draw pass. `PLANT_WIND` caps displacement at 6 cm per horizontal axis; pots/soil and collision/interaction positions remain static. Rendering spheres include sway margin without changing model dimensions. See plants.md and tools/plantwindtest.html for WebGL pixel verification.

Living-room curtain print (#566, #570): `ikea_leaves` in `curtains.js` redraws broad organic lobes from `docs/gardiner-vardagsrum-ikea-img-0571.jpg` as a seamless canvas repeat. Under #570 the ink colour matches the living-room rug's olive green (`#5a6150`) for harmony with the room, keeping the dense pattern and crisp white ground. Fine thread lines cover both colours. Existing cloth UVs gather with the folds, with no new material, mesh, light or render pass; #499 opacity/diffuse transmission/shadows remain. `curtaintest` checks actual texture coverage/colours, fixed UVs through movement, kitchen independence and the existing six-room interaction/save/light checks. #584 halves the repeat (`tile` .90 → .45 m, read off the photo with a *guessed* 145 cm panel width) so the lobes are ~12–16 cm like a dense textile print; the canvas's mipmaps and anisotropy 4 keep it free of moiré at distance, and `curtaintest` checks the repeat stays ≤ .5 m.

Hall mirror night light (#572): `HALL_WALL.tall.nightLight` gives the entrance NISSEDAL a warm-white LED strip round the frame's outer back edge (one merged emissive mesh), a soft additive halo on the wall behind it (`glowMaterial` with its own rounded-rectangle fall-off texture, one mesh) and an invisible pick box over the glass. keycabinet.js returns it as a small-lamp spec (`hallWall.lamps` → `world.lamps`), so lights.js switches it with the dusk (LIGHTING.auto, follows the clock), E on the mirror toggles it, and it shares the existing pool lights / lamp wash (one anchor `out` m in front of the glass) — no extra light, pass or reflector. It lives in the mirror's group, so Möblera om carries strip, halo and anchor (rearrange.js moves the anchor, main.js re-bakes the wash). Strip width, halo reach, colour and light are *guesses* by eye. loosemirrorstest checks the anchor follows the mirror; lighttest toggles it with the other lamps.

Christmas tree lights (#571): no light of its own per bulb. The tree is a small-lamp spec (`julgranen`, `auto: false`: lit whenever the tree stands, E toggles it) with one pool anchor `XMAS_TREE.ahead` m in front of it, so it shares the pool lights and the shader lamp wash like the floor lamps. The 160 bulbs are one InstancedMesh of unlit cores plus one additive `Points` halo layer (the shared groundglow fall-off texture), recoloured on the CPU every frame by christmas.js (a per-bulb sine shimmer + a slow wave up the tree, × the lamp's fade `k`); the star's emissive is the lamp's `shade`, its halo an additive sprite. Hidden furniture's lamps give no light: lights.js `shown` also checks `userData.seasonHidden` on the lamp's object and its parents (`roomLit` too). Colours, counts and strengths are *guesses* by eye ([day/night screenshots](../validation/issue-571/README.md)).

Shadow receiving on hand-built fronts (#602): the sun is the only shadow-casting light, and the house's walls and ceilings are what keep it off indoor surfaces. A mesh with `receiveShadow = false` ignores that, so the low evening sun (SUN_LOW, orange) lit it straight through the house: the cup cabinet's door (`cups.js`, built beside the merged row whose `Batch.meshes()` receive) looked lighter and more yellow than its neighbours at dusk, the same `M.front` material notwithstanding. Every opaque part of a door built outside the merged rows sets `castShadow = receiveShadow = true` (cups.js, the laundry wall cabinet in cabinets.js, the hall's key cabinet). `cupshadetest` compares the closed cup door's pixels with its neighbour's at noon and two evenings (≤ 3 per channel; it measured 14 before) and checks those hand-built doors receive shadows. The same goes for the flat things that move with a door or drawer (#607): the changelog note on the freezer (changelog.js), the task card inside the cup door (tasks.js), the name signs on Övre plan (signs.js), the hob's body (hob.js; its glass top already received), the letter box's plates and flap (world.js `letterFlap`) and the Spider-Man suit in its drawer (spidersuit.js) set `receiveShadow`; they lit up warm in the low sun before. Only receiving: no extra caster in the shadow pass, so the shadow budget is unchanged, and the planes cast nothing, so no self-shadow acne. cupshadetest checks them all. #609 did the rest of that sweep: the coffee maker's cord and every wall plug (`sockets.js` `plugAt`), the toaster's label, lever, cord and plug (toaster.js), the pan's handle (pan.js), the secretary's drawers with their knobs, key and contents (furniture.js `trinket` and the secretary's `moving` drawers), the smart display and smart speakers (nest.js) and the SYMFONISK speakers' opaque parts (furniture.js `symfonisk` `add`; the transparent lamp shade still only casts). cupshadetest checks each named openable and the toaster.

### Reusable curtain textile choices (#997)

Each real Curtain exposes one category `gardin` textile surface shared only by its own existing panels. Bounded per-set material variants preserve DoubleSide, opacity/depthWrite/forceSinglePass, shadows, roughness and the original emissive-light response. `map` and `emissiveMap` stay paired; both light-wash hooks are installed through the existing prepare callback. Original is the exact original material/map pointer. Generic 128px maps are cached by choice and original tile scale; their 0.4m physical repeat is a visual guess in MATERIAL_LIBRARY.curtainTile. Existing panel UVs/geometry/folds, coverage/transmission, rails and saved movement do not change.

`tools/curtainmaterialtest.cjs` runs actual Curtain/Blinds/Rearrange, source-bound main registration/UI, and two local Worker HTTP browser visitors with zero WebGL in native mode. Native: 21/21 (including actual precise-vertex ray → source-bound main use/access); unchanged rug library regression: 29/29; Worker schema: 12/12. One bounded 640×400/FOV72/DPR1 component renderer produced eight inspected images across all six sets (16/16 checks), including the living-room three panels open/closed. These are component views, not an apartment/physical-phone/FPS claim. Original failed runs and complete producers are retained: native1 called unsupported Color.length; final-native1 incorrectly required globally empty poses after legitimate rug moves; final-native2/3 aimed into open cloth gaps because Panel deliberately retains fixed full-track bounds. The corrected fixture aims precise actual vertices and preserves existing GET poses; no runtime bounds or geometry were changed for these tests.

Publication verification for #997: client Refs96da5b3 follows the actual deployed Worker-first a5c74aa. Earlier progress notes reported 14 render checks by mistake; the unmodified original render1 result contains 16 passing checks (six common, eight image budgets, page errors and source freeze). Final native is 21/21; no image rerun was needed for this reporting correction.

Actual Pages run 38554226716 / job 115819253847 created the client96da5b3 deployment at 2026-10-14T11:06:43.759Z and reported success at 11:06:54.269Z. Root independently matched all 240 published source/data/index hashes. Worker-first remains a5c74aa (run38552880671/job115814826761); the client changes no Worker runtime/catalogue and needs no second Worker deployment.

### Independent indoor cushions and throws (#1014)

The sofa's four cushions/folded plum throw and the armchair's two cushions/draped
grey throw register eight stable semantic surfaces before static merging.
`CUSHIONS` supplies their IDs/names; existing forms, folds, transforms, rest spots
and footprints are untouched. Their six-column original atlas (print/knit/geo/
cord/weave/stripe), vertex tints, UV0 and fleece maps remain exact. No global atlas
or `throwMats` is mutated. Patio cushions/copies remain separate future work.

`upholsterySurface(group,name,{id,category,replaceDetails})` reuses #1010's bounded
private handles and shared two generic pattern maps. Defaults remain
`textile`/`klädsel`/false for existing seating and future bed builders. Only these
decorative surfaces opt into replacing atlas details: alternatives disable
vertexColours and original bumpMap, use metric UV1 for patterns and restore exact
original flags/map/bump/color on Original. Materials keep their identity through
merge, both lamp washes and interaction-outline transitions.

`tools/cushionmaterialtest.cjs GAME LOCAL_WORKER OUT` uses actual sofa/armchair
builders, before-1014 source-bound originals, merge, Rearrange and main terminal
controls. Native has zero WebGL and two genuine local HTTP browser visitors. All
eight parts cycle all six choices; exactly one merged material changes per
non-original part choice and every original attribute/map/flag restores. Raw
per-part UV0/color/map metadata and bounded model counts are archived. Original
geometry/finishes/rest/footprint match the #1010 baseline. Native merged mesh
counts are sofa4→7 and armchair4→5 (+4 total); component draw measurements and
images are separate from full-World or phone performance. `--render` requires
the shared GPU slot. Original component comparisons temporarily pause fixture
polling after the actual GET and choose local Original; native HTTP acceptance
restores the actual accepted R.state and normal polling before exercising UI,
while the renderer keeps explicit component selections stable.

Initial native1 passed33/35 but its two inherited base-cloth assertions wrongly
counted every newly independent UV1 cushion as base cloth. Corrected per-surface
native3/native4 passed36/36; every one of eight parts tests all six choices and
records exact original UV0/color/map flags. Native2 stopped before tests on a
fixture syntax error; both original producers and raw CLI1 logs are retained.
The four-image render1 has actualCLI1 (10/12): its two common Original comparisons
read a local Worker left with legitimate saved choices from native4, while their
before-record was captured before GET. Image/shader/budget checks passed and all
four images were inspected; source hashes match the render freeze. The component
fixture now explicitly selects local Original before its Original comparisons,
without altering accepted HTTP state. No runtime workaround or unapproved GPU
retry was used. Component measured draw calls are sofa4→7 and armchair4→5,
with triangles unchanged11256/6696. This is not a whole-apartment/phone FPS result.

The first post-rebase native run retained34/36 andCLI1: the fixture's local
component Original reset also reached later HTTP-only visitor/reload setups.
It is now explicitly limited to the initial two component-proof instances;
new/reloaded visitors retain the actual GET result untouched. A focused selector
check covers different surface names with the same Original choice, and the HUD
cache key includes both material piece ID and surface ID.

Final #1014 native2 after the bounded component/HTTP separation and HUD fix passed
37/37 (actualCLI0); shared Worker layout tests passed16/16CLI0. Publication
`4b1b0264d63c679132e8260fddeed67069dd6b70` (ch796) records1411 source hashes.
Nine executable whole paths match the final native exactly; incoming food wiring
changed main.js outside all six byte-exact exercised production fragments.
CUSHIONS/LANDSKRONA/LEVELS/MATERIAL_LIBRARY remain equal. All prior changelog raw
rows/publication times are preserved. The rejected4c01b87 push was never published.
Actual Pages38558606214/job115833827515 created this exact client deployment and
reported success2026-10-14T11:44:40.2112767Z. Worker-first remains the actual
573551e deployment described in storage.md. Render evidence remains four
inspected pictures and two passing image/shader/budget checks, with processCLI1
(10/12), not a green render-suite claim or full-World/phone verification.

### Verona fixed-pad material isolation (#1012)

Only the three movable Verona parts create private fixed-pad material handles.
All original values/UV0/positions/normals and material identity restore exactly;
noncloth steel and decorative neighbors remain independent. Pattern maps use
existing metre-scale UV1 and the shared bounded two-map cache from upholstery.js.
The normal seasonal decorative atlas mesh stays in `userData.keep`; nothing is
added to its weather/box binding or material. No extra draw is expected from the
source isolation; component draw counts are measured separately before claiming
cost, and no whole-apartment/phone performance is implied.

`LUNDEN_SECRET_TEST_INPUTS=… PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/veronamaterialtest.cjs GAME LOCAL_WORKER OUT`
uses actual three-part builders/merge, a real `decorative:true` neighbor, Patio
and dynbox, source-bound main UI and two local Worker HTTP browser visitors.
Native1/native2 passed33/33 actualCLI0, including all six choices, exact Original,
noncloth/neighbor preservation, actual summer/rain/winter loose/box visibility,
ordinary peer/new visitor/reload, stale edits, offline accepted-cache retention,
old move/material concurrency and keyboard/touch. Component comparisons select
local Original only for their initial two fixture instances, restoring actual
accepted state and normal polling before native HTTP acceptance. The separately
granted `--render` path shows three original/pattern pairs in one bounded
900×560 renderer; no World, physical phone or FPS claim follows from this test.

Granted render1 passed13/13 actualCLI0; the external supervisor measured
7.967473475961s, no deadline and no live descendants. All three original/pattern
pairs were inspected. The renderer is900×560; full-page PNGs are900×600 because
the fixture retains a40px blank bottom strip. Each component stays3draws:
sofa23772triangles and each divan6636, before=after; UV1 programs link. All11
recorded driver/Chrome owners and their temporary profile are gone. These are
component images, not apartment/mobile/FPS verification.

#1012 publication88b7b46ea03e875d386f8267cad3fe61cfcbb388 (ch800): final native33/33
actualCLI0 and schema18/18CLI0 after incoming1015 catalogue/culling. All ten
executable/native paths match final test bytes. Publication1414 paths are hashed;
the complete final freeze differs only in changelog, with every older raw row/time
preserved. All ten render sources were recovered exactly. Only catalogue/main
whole files differ from render; full patio.js and whole upholstery.js remain
byte-identical, and final native exercised the combined incoming version.
Actual Pages38561048171/job115841906736 deployed this exact client and reported
success2026-10-14T12:04:30.6937873Z. Worker-first deployment is recorded in
storage.md. Render remains13/13CLI0 with three inspected component pairs and
no World/physical-phone/FPS claim. Full producers, source freezes, owner/socket
samples, supervisor receipt and cleanup remain in worker-1012-artifacts.
### Outdoor cushion and stored fleece surfaces (#1015)

Each actual Verona module exposes one named decorative `cushions` surface,
independent of its fixed `textile` pads. The eight existing cushion specifications
carry explicit `materialGroup` ownership (sofa4/divan1 2/divan2 2). All eight
box copies are still generated in their original order with their original seed,
stack position, atlas/UV0 and vertex colours; only then are they partitioned into
three private-material batches. `surfaceFor` is an optional explicit builder
handle; ordinary cushion callers retain their existing behavior.

#1146 (the user) superseded the divan part: only the sofa row with its backs
carries decorative cushions, so the divans no longer build cushions or a
`cushions` surface, and the box keeps the four sofa cushions in one `sofa` copy.
`PATIO_TEXTILE_SURFACES` still accepts the legacy divan `cushions` id so older
saved layouts validate; the client simply ignores those entries. The #1015
fixture `tools/patiotextiletest.cjs` still asserts the old divan surfaces and
eight-cushion stack.

`linkPatioTextiles(movable)` runs once after Furniture construction and connects
only those named module surfaces to their matching box-copy handles. There is
no scene traversal/global material registry or frame update. The canonical module
choice drives preview, cancellation, original restore and accepted remote state
in both representations. The dynbox has its own `throw-folded` fleece surface.
Original restores the original atlas/bump/vertex-colour flags; generic patterns
use the existing private UV1 material implementation. No season/stow policy,
geometry, seating, lid contents or neighboring decorative furniture is changed.
### Short/long pile on every rug (#1086)

Every rug has a second material surface `pile` (Lugg): Original = Kort lugg (the unchanged flat mesh) or `pile-long`
(Lång lugg). `longPileMesh(item, '#ffffff', flatMesh)` builds the generic variant lazily once per rug: grid spacing
`LONG_PILE.cell` capped at the #1009 cell budget, round rugs mapped onto a disc, bath-mat corners rounded, the flat
mesh's own geometry as backing (still one draw), UVs matching the flat mesh, and finer/more contrasted shade-only
vertex colours (`LONG_PILE.shag`). Its material is a clone of the chosen textile material (map kept, bump removed,
vertex colours on), cached per textile choice, so every colour/pattern also works with long pile. Long pile raises
`rugTop` by `fiberHeight` like #1009, so furniture/cat support follows. The legacy `rug-longpile-bluegrey` textile
choice keeps its own #1009 mesh and wins over the pile surface. All values are visual guesses.
Measured in the full World (headless Chrome, real GPU, quality 3): draw calls unchanged (342 short and long,
living room); long-pile triangles/bytes per rug: living room 31,498/0.89 MB, zigzag 31,856/0.94 MB, round 1.6 m
16,640/0.48 MB, round 0.72 m 5,728/0.17 MB, bath mats 2,852/0.12 MB each — built and drawn only while long.

### Living-room long-pile geometry (#1009)

Only the explicit `living-room` materialFamily accepts `rug-longpile-bluegrey`. The lazy cached opaque mesh uses a dense connected plush surface, smooth deterministic multiscale height/normal variation, a rounded frayed perimeter and the existing backing. It is stylised plush/loft, not individually resolved realistic yarn fibres; the lower rim remains somewhat faceted. All LONG_PILE shape values are named visual guesses. The actual surface spans38.75–59mm including the original12mm backing and2mm floor gap. The flat59mm effective support plane is deliberately a gameplay approximation to the maximum; not every visible point is59mm high.

A fixed156×96 top grid supplies15,229 surface samples. Actual native geometry has32,268triangles/810,540bytes, finite positions/normals, upward-facing top triangles and a hard33,000triangle/1,000,000byte guard. One visible opaque mesh is reused; no alpha layers, new maps or per-frame geometry allocations. Both real light-wash prepare hooks are installed before first render. Original restores its exact material/geometry/top and hides the cached plush without changing the accepted rug pose.

`tools/longpiletest.cjs` uses actual Furniture/Rearrange/Life, source-bound main controls/cat tick and genuine local browser/Worker HTTP peers. Native8 passed18/18 with per-phase timing and no WebGL; the existing support regression passed25/25, retaining #1013's known loose-object reload-XZ difference while checking supportY. Render4-dense passed7/7 in34.481s with one640×400/FOV72/DPR1 renderer and three inspected original/overview/edge images, one actual draw per rug image. It rendered the explicitly frozen older UI/source snapshot; later shared helper/UI changes require meaningful native and critical-block parity, not a new visual claim about the entire apartment. These component/native results do not certify World, physical phones or FPS.

All original producers/logs/images are retained. Native1 omitted world in the fixture; native2 revealed the actual idle-cat support update gap; native3 was only a manual helper control. Native4 and later bind the corrected main tick. Native7-dense timed out at the external60s deadline during reload setup, after10passes; TargetClosed was secondary, no OOM cause is claimed. The bounded native8 rerun retains two real peers, checks same-context reload before replacing that viewing context with a new visitor, and preserves ordinary native polling. Render1 and render2-soft passed technical checks but failed visual acceptance (grass-like/sparse pins); render3-dense timed out before any image in unnecessary second-peer setup. Render4 changes only render mode to one setup; its timer stops after actual GET and Life/cat objects are explicitly hidden for the rug-only views.

Final rebase targets the immutable published base `88b7b46ea03e875d386f8267cad3fe61cfcbb388`, including #1014’s full surface selector and #1011/#1012 upholstery. The seven rendered geometry/material/support/cat blocks remain byte-identical; main’s only product delta against that base is the approved idle-cat guard. Final-schema18/18 passed. The first final-schema invocation failed before tests because its external fixture environment variable was omitted; the corrected invocation retains its own log. Final-native9 and final-support2 both reached the fixed60s parent deadline (60.896s/60.565s), with no live owned descendants. Native9 has exactly8 recorded PASS checks before termination; support2 failed during newPage before acceptance. They were mistakenly launched concurrently; resource contention is a hypothesis, not an established cause. Both raw failures and removed-profile evidence are retained.

Sequential final-native10 completed46.895s with16/18 checks, CLI1. The two failures were the initial45mm support delta and idle Original restoration: its raw idleProbe began/stayed59mm because native9 had accepted pile in the reused local Worker before timeout. Other16 checks, including new UI, ordinary visitor/reload/concurrent fields and geometry, passed. This fixture-state error is retained; a later run explicitly requires actual GET to show empty local pieces/materials after restarting only the owned local Worker.

Final-native11 passed18/18, actualCLI0 in16.682225s with no live owners, against the full new surface-selector/upholstery runtime. It asserts actual local GET revision0 with empty pieces/materials before starting; original→pile→cancel is14→59→14mm and20 accepted polls remain stable. Final-support3 passed25/25, actualCLI0 in6.393539s, with #1013 legacyXZ explicitly retained. Final-schema2 passed18/18. The subsequent immutable base `b8374a15bbc50322fc5c0599d61a0f9eeb96f216` adds only #1012 verification text; no runtime rerender or further acceptance retry is needed.

Final-native12-post1015 passed18/18, actualCLI0 in15.807750s, on explicit immutable published base `3364240e801ca601c143e25198ca9ca3b1b46f36`, after a fresh owned local Worker GET revision0/empty state. This exercises the incoming final buildFurniture patio-copy linking too. Config/furniture whole-file hashes changed solely for that unrelated incoming family; all seven geometry/material/support/cat critical blocks and the full Rearrange/main driver paths remain byte-identical. Earlier support25 and schema18 remain applicable; no repeated GL or support suite was run.

Published client `eff6a462b13fd45adc56251593115e8e174c53b5` (changelog802) preserves the final-native12 executable/driver hashes and seven rendered critical blocks. Actual Pages38562314387/job115846178170 created this exact SHA at2026-10-14T12:14:39.1206901Z and reported success12:16:07.4188045Z. The client’s actual Worker38562314260/job115846177444 ran npx wrangler deploy12:14:46.5637247Z, Uploaded12:14:50.7279099Z and Deployed12:14:51.0103460Z, versione3b1453e-bda1-4b30-8630-dc49bd1bd8b8. The241 src/data/index publication hashes, complete source producers, original failure receipts and exact owner/socket/profile cleanup are archived with worker-1009 artifacts. Both owned local services and all test browser owners are stopped. No extra screenshots or runtime changes followed the accepted component render.

### HEMNES textile surfaces (#1021)

Only the custom daybed builder binds eight existing textile groups: the upper quilted mattress, lower pull-out mattress, existing quarter-turned quilted spread and five black/holographic/graphic/faux-fur/pink cushions. Each uses its own upholsterySurface/private handle; no traversal recolor or global dayMats mutation. Exact Original retains every original map/UV0, roughness/metalness and shape, including unit-UV printed cushions and the noisy round fur cushion. Generic patterns reuse the existing metric UV1 and cached two-map family. No new geometry, mattress layer or bedding model is invented.

Only the existing spread remains care-index0. Binding occurs before real merge; unchanged other parts receive their existing zero bedCare attribute through normal preparation. Baseline geometry/normal/UV0/index/care/matrix/finishes/rest/footprint comparison runs once in the first proof context. The native merged Mesh count changes30→31 by separating the two mattress handles; this includes hidden contents and is not an actual visible draw-call measurement. Renderer budget and component-image acceptance are recorded separately after their granted run.

The granted render1 recorded13 raw PASS rows (12 meaningful render checks plus1 inherited native-only bypass), actualCLI0 in5.336239s, with no live owners or temporary profile. All three640×400/FOV72/DPR1 component images were inspected: full Original, mixed independent cloth choices retaining holographic/graphic/pink originals, and a closer cloth detail. Each actual renderer frame uses28draws/34,960triangles; choices add no draws or geometry. The render path has exactly one setup and stops material polling after its real GET. Its inherited “ordinary peer” raw label is a render-mode short-circuit, not another HTTP visitor proof; the51-check native run supplies the genuine ordinary-peer evidence. The driver label was clarified afterward without a rerender or product change. These components do not verify the entire apartment, physical phone or FPS.

### Parasol canopy and cloth lamp shades (#1026)

Three existing builders expose private canopy/shade handles. Parasol UV1 uses its actual fully-open radius in planar metres; folding keeps the same cloth reference. DANI inner cylinder uses actual circumference/height UV1, with planar UV1 on its existing cap. Original UV0, cylinder/cap shapes, rattan, wood, pick helper, wash planes and private FloorLamp.shade pointer remain intact. No new rendered mesh or draw pass is introduced.

TUBELAMP’s wire and weave are part of linenTextures, not a separate spiral mesh. Its optional background choice draws colour/metric pattern BEFORE exactly the existing weave/wire/bulb detail passes; the unchanged default still creates the original map/emissiveMap. Alternatives allocate only colour Texture objects and reuse the original emissiveMap; the same private shade material is retained by FloorLamp/focus/washes. Actual600 previews reuse6colour Texture objects (Original+5alternatives256×512),1original emissive Texture and1material handle:7total Texture objects at this surface, not merely5cache entries. All original material/map/emission/UV0/shape data restores without changing live lamp on/off.

The separately granted render1 completed30/30checks, actualCLI0 in4.162446s with no live descendants or temporary profile. All six640×400/FOV72/DPR1 component PNGs were inspected. Original/pattern actual renderer costs match: canopy6draws/1,096triangles, TUBE5/1,260, DANI5/10,666. Canopy checks are clear, TUBE stripes retain spiral/weave/warm glow, and DANI has only discreet visible checks behind its unchanged rattan and warm glow. No new mesh, shadow pass, World or physical-phone/FPS claim follows from these component images. Native52 and schema23 remain separately recorded.

## Steam, misted mirror and wet tiles after a shower (#2189)

`src/showermoisture.js`: one moisture state per bathroom (L1007's two running showers; their taps carry `room`, the bathroom rectangle, set in `buildBathroom`; the standard houses A/B/C/L have no running showers: not applicable). `stepMoisture` builds `mist` (about 18 s time constant with the water on, slower with the door open) and `wet` (faster) and clears them without water, faster with an open bathroom door (`SHOWER_MOIST.door`) and the ventilation (`vent`: the plan has no fan, one *guess* constant); the tiles dry slower than the mirror clears. `ShowerMoisture.update` (main.js, after the taps) steps every bathroom and points three shared uniforms (`uMoistRoom`, `uMoistAt`, `uMoist`) at the dampest one, so no per-bathroom materials. Consumers: `mistMirror` (the plain glints material, `mirror.js`) and `mistReflector` (reflections.js `addReflector` option `mist`, set by `mirrorReflector`) fog the glass in their own fragment shader, clearing column by column in running streaks (`fogAmount` / `moistFog`, same maths); `wetTiles` darkens and glosses `M.wallTile` / `M.wetTile` in the shower zone (fragment-only patch, `rememberFragmentCompile`); steam = puffs from `sharedPuffs()` (the avatar breath pool, one draw call already; `emit`'s new `lifeScale`), rate scaled by `weather.particleScale` (QUALITY.particles), only within `steamRange` m. No light, no render pass, no new draw call or program (the existing tile / mirror programs get a few more lines). Tunables `SHOWER_MOIST` (*guess*). Checks: `node tools/showermoisturetest.mjs`; browser before / shower / after in the bathroom ([result](../verification/2189/)).

## Shower spray (#1062)

`water.js` gives showers 36 separated narrow nozzle jets in one merged mesh, with
transparent moving breaks in a shared 8×128 texture. A mild quadratic fall keeps
the angled hand shower's jets on the basin plane. `SHOWER_SPRAY` centralises visual
assumptions (*guess*); these are not measured nozzle counts or hydraulic physics.
The two L1007 showerSet templates retain their positions, thermostat picks, splash,
wetness footprint, audio and transient open state. Basin streams are unchanged.
The existing splash ring remains an inexpensive stylised floor effect.

Both real overhead and hand-shower components were rendered in Chromium before
and after, including a later spray frame, and inspected. Geometry per stream is
40 → 1,080 triangles; component render totals grow by 1,000 triangles because the
old transparent DoubleSide cone rendered twice. Measured component calls are
8 → 7, with one stream mesh retained; no added light or render pass.
`tools/showerspraytest.cjs GAME OUT [--baseline]` checks actual Tap state, sound
lifecycle (spy), wetness, floor endpoints, static geometry and texture animation.
Artifacts and source hashes: `/tmp/lunden-showers1062/{before,after}`.
These are bounded components with illustrative walls/floor/lights, not World,
audible-audio, FPS or physical-phone evidence.

Equivalent-house inspection: L1007 has both affected running shower variants.
Other modelled L flats (`VISIT_UNITS`, including L1201) use standardinterior's
static hand-shower fixture, which deliberately does not register water outlets.
A/B/C core/flat-door models do not build these interactive shower interiors.
Those static/nonexistent running-water variants are unaffected; no house
dimensions, fixtures or controls were changed.


## Tower clock (#1067)

The Klockhuset clock uses `TowerClock` instances instead of frozen baked hands. Shared256px dial, four cardinal numerals,
12 strong ticks, wider hour/minute hands and unlit materials preserve contrast at distance/night without increasing
physical dial size or adding lights. All new ratios/offsets are declared in TOWER_CLOCK as visual assumptions.
The hands' fixed conservative bounds cover every rotation; neither instanced mesh participates in the small-detail culler.
The clock adds two draws and144 dynamic triangles, while replacing80 static desktop /64 static phone triangles.
Isolated flat-ground campus captures:10 draws,71425 desktop /29766 phone triangles. See environment and towerclocktest.

## Distant ground shadows (#1079)

The sun's shadow map covers only ±14 m round its target, so `src/groundao.js` bakes soft ground darkening for everything
further out: a disc under every tree crown (surroundings.js `aoTrees`, plus southbackdrop.js's woodland) and a thin band
along the wall feet of Kv. Lunden's blocks, the old S:t Lars/school/HepCat buildings, the mapped backdrop buildings
(outlines and courtyard holes) and Hus L's rectangle (world.js passes `husL`). Everything is one indexed mesh with a
multiply-blended `ShaderMaterial` (one draw call, ~25k triangles, `renderOrder = -1`: after the opaque ground, before glass,
water and the additive light pools), draped over `max(groundY, renderedTerrainY)`; triangles across a height jump
(`maxStep`, e.g. the garage box edge) are dropped. Each vertex carries the point whose real shadow it stands for (`aRef`:
the crown centre, a point 1.5 m up the wall); the vertex shader projects it with `sun.shadow.matrix` (bound by reference in
main.js, so it follows the visited-flat box shift and the sun's angle) and fades the darkening in only outside the map's
texture-space edge (`fade`), so nothing is darkened twice. Without a shadow map (test mode) the matrix stays identity and the
baked shadows show everywhere. Fog fades them; in winter trees keep `bare` of their share. The multiply happens in linear
space, so the strengths look weaker on screen than their numbers. All values are *guesses* in `GROUND_AO` (config.js).

Shadow box outdoors (#1144): the box stayed on our flat (or a visited one) also out in the courtyard, so its rim ran as a
straight line across the lawn between the patios and Hus A (midday: the box's southern edge at z ≈ 23; tree shadows on
one side, none on the other). Outdoors further than `SHADOW_BOX.home` m from our footprint — not in a stairwell or under
the courtyard — main.js now centres the box `lead` m ahead of the visitor along the view, snapped to a `snap` m grid
(the shadow map is redrawn only on a grid step; by a visited flat too, the follow box still holds its rooms). Inside or
right by our flat and inside a visited flat the old centring holds. groundao.js also patches three's `getShadow()` so
every real sun shadow fades out between `SHADOW_BOX.rim` of the map's texture-space edge (where the baked ground shadows
fade in), so a rim still in view is soft. Same single shadow light, map size and shadow pass; values are *guesses*.

## Furniture contact shadows (#1075)

`src/contactshadow.js` gives every floor-standing loose piece a soft multiply-blended rounded rectangle over its
collision footprint (the baked AO in `src/ao.js` only knows walls and fitted cabinets). `buildFurniture` collects the
pieces whose lowest point is within `CONTACT_SHADOW.maxBase` of the floor and that have a footprint (not rugs or the
parasol); a piece's rectangles that tile a larger rectangle (a sofa's back, arms and seat) are merged, and the edge fade
is symmetric round the footprint edge so touching rectangles (the sofa and its chaise) meet without a light seam.
All shadows are one `InstancedMesh` (one draw call, `frustumCulled = false`, no raycast, no shadow casting), the last
child of the furniture group: F hides it, and its `updateMatrixWorld` copies each piece's world matrix every frame, so a
piece moved in Möblera om, hidden for the season or culled by detail takes its shadow along (a hidden piece's instance
is scaled to zero; during a move the piece is hidden behind the ghost, so its shadow appears again on confirm).
Strength, soft width, corner radius and lift are *guesses* tuned by eye in `CONTACT_SHADOW` (config.js).

## Cat card rarity visuals (#1256)

The binder cards (`#binder-view .card`, src/catbinder.js) get progressively fancier by tier with CSS only: no texture, light or draw call in the 3D scene (tools/perfcount.html unchanged). Levels, ★ counts and tilt come from `CAT_CARD.fx`; details and the reduced-motion fallback are in [animals-audio.md](animals-audio.md). Animations are opacity / transform only (twinkle, shine sweep) plus one rotating rainbow frame on the top tier.

## Smooth sky/ground horizon transition (#1266)

At altitudes above 120 m (up to jetpack ceiling 320 m), the distant ground ends at the far clipping plane (1000 m) in full fog. While `scene.fog.color` is transferred to uniforms in sRGB color space by Three.js standard materials (`getUnlitUniformColorSpace(renderer)`), custom `ShaderMaterial` instances (`this.sky` and `this.deck` in `src/daycycle.js`) originally wrote raw linear values to `gl_FragColor`. Adding `#include <colorspace_fragment>` applies `linearToOutputTexel`, matching the output sRGB color of the fogged ground (`0xcfe0ec` -> `(207, 224, 236)`) and seamlessly blending sky, fog, and distant ground across all altitudes and times of day. Zero extra draw calls or textures (`tools/perfcount.html` PASS).

Depth precision at distance (#1276): the camera far is 1000 m and a 24-bit buffer resolves ~d²/(near·2²⁴·0.5) m, i.e. ~10.7 cm at 300 m with the old 0.05 m near plane, so window glass 1–7 cm in front of a façade (backdrops, neighbours, campus decals) z-fought and far houses shimmered. Window-glass materials (`neighborGlass()`, sitebackdrop/southbackdrop `glass`) carry `DECAL_OFFSET` (polygonOffset counted in depth steps, so it holds at any distance), and `updateCameraNear()` in main.js uses `VIEW_NEAR`: 0.05 m indoors/stairwell/flats/garage/vehicles/roofs, 0.12 m on open ground (PLAYER.radius is 0.22 m), growing 2 cm per metre above 3 m altitude to 1.5 m when flying. `&near=m` pins it. SwiftShader depth is float-like and cannot draw the flicker, so `tools/depthprecisiontest.cjs` checks the offsets, near planes and the analytic step. Frames in the western façade batch (`facade`) still sit 1.5 cm in front of their wall without an offset.

Hus L long-facade backing (#1852): the actual brick/render skins stand only 6 mm in front
of `buildExterior`'s simplified opaque masses. At the valid roof near plane 0.05 m,
450 emitted long-facade layer samples include 89 equal codes in an analytical 24-bit
projection at the report-context camera. `exteriorBackingMaterial(wall)` clones only
that backing material and applies the positive counterpart of `DECAL_OFFSET`, moving
its depth away from the viewer. Skins, frames, panes, geometry and real wall material
stay unchanged. The clone retains existing fragment lighting compile/cache hooks;
plain `Material.clone()` would drop lamp-wash callbacks when called on a composed
material. A/B/C use separate `aHouseParts`/CoreHouse builders; no common 6 mm backing
cause was found there. [Exact mesh/depth evidence, own images and limits](../verification/1852/long-side/README.md).


## Hus L brick surface (#2071)

`src/bricksurface.js` adds shallow mortar and fine clay grain to the existing Hus L brick material in
`exterior.js`. The original 512² colour canvas, half bond, palette and world-space UVs are unchanged.
One cached 512² linear RGBA texture packs height in red and roughness in green, sampled as the Standard
material's `bumpMap` and `roughnessMap`. The same eight courses / four bricks / 8 px joints and canvas
orientation align the relief with the retained colour rectangles. Native mipmaps, linear filtering and
anisotropy filter the fine grain at distance. `BRICK_SURFACE` numbers are visual guesses: the virtual
face-to-mortar depth is about 2.52 mm and face-grain amplitude about 0.11 mm; geometry is not displaced.

The main brick batch keeps its geometry, openings, shadows and draw count. Added storage is one 1 MiB
CPU pixel array and about 1.333 MiB of RGBA8 GPU storage including the mip chain, independent of facade
area. Standard bump adds three height samples plus the roughness sample and their UV varyings; no new
light, draw or render pass is added. This is a material-detail tradeoff, not a measured frame-rate gain.
A/B/C's `surroundings.js` / `aHouseParts` use separate grid/plain atlases and mapped opening variants;
their painted windows, loggias and material mapping are not replaced by Hus L's tile. Hus L's existing
plain-colour pilasters and white render remain separate materials.

`tools/bricksurfacetest.mjs` checks deterministic aligned scalar channels, caching and distance filtering.
`tools/bricksurface2071browser.cjs` compares the production exterior builder before/after with identical
plan/window inputs, checks every emitted position/UV/index and opening record, and captures matched
facade/entrance/grazing/distant views in one scoped browser test. [Evidence and limits](../verification/2071/README.md).

## Lens flare towards the sun (#1283)

`src/flare.js` (`FLARE` in config.js; `?noflare` disables it): one ShaderMaterial mesh, one draw call, no texture and no light, parented to the camera and hidden unless the flare is active. Seven additive procedural quads (glow, corona, discs, halos) sit along the line from the sun's screen position through the screen centre. Visibility = sun above the horizon x sun inside the view x not occluded x weather: `day.overcast` damped by `day.above` (above the deck the sky is clear, #1251), rain and the cloud whiteout (`uWhite`) extinguish it. Occlusion is a cheap CPU ray test from the camera along `sunDir` against building AABBs (greet.js `occluders()` plus the `SITE` neighbour footprints), tree crowns (`aoTrees` from surroundings.js) and, indoors, the ceiling and the window openings of L1007; underground / garage / stairwell is always occluded. Intensity follows the target with an exponential smoothing (`FLARE.smoothTime`), so it never pops. Test: `tools/flaretest.html` (run through Playwright like the other tools pages); perfcount covers the budget (the flare only costs a draw call while visible).


## Opaque cloud sea above the flight layer (#1368)

The old #1251 deck could disappear in fair weather, retained transparent noise holes/rim in cloudy weather and left the spherical sky's clouds overhead. Jetpack height was sufficient; it was a visibility failure. `DayCycle` now raises coverage smoothly as the camera approaches the existing150m base in every weather. The unchanged150–190m layer whites out, then the unchanged190–220m transition reveals clear sky and an opaque procedural cloud sea. Overhead sky cloud opacity follows `1-above`. Ground-level weather and views remain unchanged. All heights remain visual guesses.

The deck is now a two-triangle plane. From above its half-span grows to at least the camera far distance; alpha closes all noise/edge gaps by `above=1`. Noise still shades cloud tops and the distant **colour**, rather than alpha, blends to the sky horizon. A single double-sided pass avoids the former transparent two-pass draw. No texture, light, shadow caster, weather input, jetpack physics or movement limit is added.

`tools/skylayertest.cjs` uses actual production DayCycle/WebGL and frozen pre-change `e6f5ce4e:src/daycycle.js`. A magenta↔green ground oracle is visible through the old clear-weather sky (mean channel change133.08); all12 new above-layer cases have exact zero ground-pixel difference: heights220/250/320, clear/partial/overcast, shallow views, far1500 and translated camera. Three controlled ground views remain pixel-identical; fair-weather inside-layer whiteout and disappearance of overhead sky clouds pass. Component18/18PASS, CLI0. Same four fixture lights; clear-flight component2→3 draws and962→964triangles, no ground draw increase. Both fixture screenshots were opened.

A real full-World flight invokes production Jetpack.putOn, holds Space in Player's input state and steps the normal app at1/60s, without raising/clamping heat. Before and after reach feet300.0604m in25.9167 **simulated** seconds, heat0.57593 and no cut, identical positions. At camera165.0563m, whiteout changes0→0.99983; at300.6947m the old cover0/hidden deck becomes cover1/visible deck and above1. Four real-world down/horizon before/after images were opened, with no browser JS exceptions. This is controlled Chromium verification, not E/touch end-to-end or physical-phone FPS.

Public applicability: inspected `kvarteret-lunden` at0afb8bd; it has a fixed daylight scene and no DayCycle, SKYLAYER or jetpack/high-flight feature. This flight-specific sky change does not apply there and no gameplay is transferred.

## Shared physical cinema screen (#1476)

`cinemasurface.js` positions the official cross-origin YouTube iframe with the
pinned CSS3DRenderer behind an alpha-enabled WebGL canvas. A zero-alpha
NoBlending material writes depth at the real screen, preserving foreground
occlusion. The scene background still writes opaque pixels elsewhere. Inactive
surfaces restore their original material and hide the CSS layer. No video
texture extraction, per-frame downloads or new lights are used. See
[furniture lifecycle](furniture.md#cinema-network-video-1376).

The same surface supports all three home TVs (#1483), using unique CSS layers
and their retained screen mesh matrices. Media updates run after movement/rest/
touch camera changes at the end of `step`, so CSS and WebGL use the same final
camera pose instead of allowing a one-frame projection lag.

## Clubhouse precipitation guard (#1485)

The fantasy clubhouse is a completely enclosed off-map interior, without an
outdoor view or normal house occluder. `Weather.update` takes an optional
`enclosed` flag; main passes `player.inPlayroom`. It disables both precipitation
draws for that interior while retaining the actual climate and muffled audio.
Leaving restores ordinary roof-aware precipitation, including the existing car
guard. This also avoids transient particle/roof-edge and hail-bounce cases.
Ordinary indoor windows still show outdoor weather. No geometry, audio gains
or particle budgets change. A/B/C/L house guards are unchanged. This off-map
game room has no public downstream equivalent and must not be ported there.

## Wide screen aspect ratio (#1415)

CSS3D iframe height derives from each physical screen's width/height, and both
projection axes use that derived viewport. The expanded6.34×1.90m cinema plane
uses1280×384px; YouTube adds its normal fitting/bars instead of stretching a
16:9 iframe across the wider physical plane. The idle poster is proportional
as well. Curtain topology, material batch and light count are unchanged.

Clubhouse neon signs (#1384): `clubhouseSigns` paints clipped coloured tube
outlines, glow and a pale core into the existing512×256 atlas. Sign positions,
UVs, geometry, unlit material, ceiling-light swatch and room visibility are
unchanged. `PLAYROOM.clubhouse.neon` holds the assumed colours/pixel widths;
there are no new lights, passes or draws. The private fantasy room has no
public downstream counterpart. See [verification](verification.md#lekstuga-neon-1384).

First-focus stalls (#1508): `InteractionOutline.warmCompiler` feeds the existing
screen/mirror and sliced phone warm-up with compile-only focus variants. Runtime
brightness shaders and source-material appearance/lifetime remain unchanged; no
extra geometry or render pass is added. See [performance](performance.md#first-focus-program-warm-up-1508).
Saved drawings that arrive from IndexedDB after a compile stage started are queued
via `WarmUp.add` and compiled a few per frame (#1514).


Procedural startup backing sizes (#1549): AO, frozen-meal prints and the kitchen's painted picture use
`resourceprofile.js` `profileCanvasSize`/`profileCanvas` before painting. Full retains authored pixels;
light retains the GPU cap and authored drawing coordinates. AO preserves its blocker grid and hole edges.
See [performance](performance.md#paint-procedural-sources-at-startup-profile-size-1549).

## Playhouse posters, neon and zoned light (#1574)

`src/playroomposters.js` builds the hall's, SPEL's and BILJARD's own generated posters (canvas shapes and pixel bitmaps in `src/posterdesigns.js`, no real logos or artwork) on one atlas,
together with SPEL's neon ceiling runs and the two wall neon signs ("GAME ON", "8-BALL"), BILJARD's two green pendants and the warm wall lamps. All of it is one unlit
vertex-coloured mesh (no light source); `src/posterlayout.js` is the pure layout (wall planes, keep-out checks) and every placement, size, colour and level lives in
`PLAYROOM.posters` / `PLAYROOM.zones` (*guess*). BIO is not touched (its posters are #1575's); the hall's west short wall stays free for the popcorn cart.
The runs, lamps and shades sample a white swatch that fills the atlas's last poster cell, which no design uses (#1608: in the
atlas corner it showed as a white square on the 8-BALL sign); `roomPosters` throws if the designs ever fill that cell.
[Before/after](https://github.com/solwation/lunden-3d-apartment/issues/1608).
Per-room light: `clubhousematerials.js` exports `CLUB_ZONES` (Vector4 [BIO, BILJARD, SPEL, hall]); each clubhouse fragment scales its ceiling-lamp and ambient terms by the room it is in, so SPEL is
dim and BILJARD pub-like while BIO and the hall are unchanged. The values are live uniforms (set a component, no recompile), meant to be reused for further per-room moods. The light switch (#1365) and
the disco ball work as before; the neon and lamps stay on when the disco light is off.

Real posters (#1670): `src/playroomphotos.js` fetches the Worker's `GET /playroom/posters` (Wikimedia Commons, see `cloudflare/README.md`) when the visitor
enters the playhouse. It loads the day's 28 thumbnails (CORS `*`, 330 px wide) and asks `roomPosters().setPhotos(cells)` to repaint. That paints the whole
atlas on a fresh canvas with each real poster in the cell of the design it replaces (hall 0-9, SPEL 10-18, BILJARD 19-27, `PLAYROOM.posters.online.cells`),
swaps the material's map and disposes the old texture. The mesh, material, atlas size (1536×1280), draw calls and texture count are unchanged, and
`freeCanvasAfterUpload` still frees the canvas on phones because every repaint is a new canvas. Each picture is letterboxed in its own proportions on a dark
mount (`mat`); a CC BY/BY-SA picture gets its author and licence in a `credit` band below it. A picture that fails to load keeps its canvas design. Fallbacks: the
last good list in localStorage `lunden.playroomPosters`, else the designs. [Before/after](../verification/1670/).

## BIO film darkening, masking curtains and exit signs (#1619)

A running film darkens the BIO further and slower than #1570: `PLAYROOM.sconces` `dimmed .06`, `ambientDim .18`, `fadeSeconds 6` (both ways; the light switch override from #1570/#1610 is unchanged).
The two velvet curtains are no longer in the room's static batch: `src/cinemacurtains.js` (`CinemaCurtains`, one small dynamic mesh, one draw, shared `furMat`; #1625 tried the room batch but that would keep ~6.1 MB (152 712 vertices x 40 B) of CPU arrays on low-memory phones) rewrites their vertices from
`cinemaCurtainGrid(side, half)` (`src/clubhousefurnishings.js`) while the opening eases (`PLAYROOM.furniture.cinema.curtain`: `aspect 16/9` default, `pad .03` m of black frame, `seconds 2.5`).
The picture is `screen.h * aspect` wide (the iframe letterboxes the video inside the 3.3:1 screen), clamped to the screen. The ratio comes from `CinemaSurface.measure(id)` (`src/cinemasurface.js`): YouTube's
iframe API exposes no video size and the iframe is cross-origin, so the CORS-readable `i.ytimg.com/.../mqdefault.jpg` (16:9) is read and `pictureAspect` cuts away symmetric pure-black bars
(4:3 pillarbox, 2.39:1 letterbox); anything unreadable or offline stays 16:9. `main.js` passes `cinema.surface.aspect` to `playroom.setFilm`; 0 / no film = curtains fully apart.
`src/clubhouseexit.js`: four green NÖDUTGÅNG signs (`PLAYROOM.exitSigns`; #1625: painted into three free cells of the `playroom-posters` atlas and four quads of that unlit mesh, so no draw of their own, no light; the brightness is a constant vertex colour) above the BIO/BILJARD/SPEL passages (north face, seen from inside each room) and the playhouse door.
Test: `tools/bio1619test.cjs`; phone profile `tools/cinema1688lowmemtest.cjs` (#1688: the curtain geometry keeps its CPU arrays, see performance.md). Limitation: thumbnails of films whose first frame has black edges, or whose uploader added burnt-in bars, can mislead; real devices were not tested.

## DJ surface and active controls (#1667)

`PLAYROOM.dj.panel` is the actual black mixer/deck surface. Controls and atlas ink are
kept inside its footprint; labels on active buttons move with their 6 mm depression.
Inactive/active button faces use two small merged Standard-material batches; the active
one is emissive, so no new light or bloom pass is needed. Static bezels/rails keep the
existing furniture batch. Vinyl uses one shared Standard material and a 128² procedural
groove/paired-highlight texture, a painted ceiling-reflection approximation rather than
a live reflection. All gloss/press/emission values are centralized visual guesses.
The scoped native-input/room render in `tools/playroomdjcontroltest.cjs` checks label
occlusion, edge clearance and observer state; see [result images](../verification/1667/).

## Cosmetic upper arms (#1837)

`Avatar` shares immutable per-variant bind-pose geometry, including one `armPump` attribute. Shoulder skin and sleeve vertices receive a smooth radial X/Z bulge; the material's own `uPump` controls it before skinning with matching normal correction. Other bone regions stay unchanged. No bone scaling, shared-buffer edits, new draws or per-frame rebuild. New self/remote looks reapply their current pump. [Checks, before/after and remote comparison](../verification/1837/README.md).

## Restored northern bus-stop boards (#1843)

`street.js` procedurally paints the two ordinary yellow/blue bus-stop boards into one shared canvas (no operator logo, photo or new font). `SITE.street.busStopName` is split into two fitted lines: “Lund S:t Lars” / “Karpvägen”. Both front/back faces keep existing pole x/z sites. Only these boards use the40 mm face offset, clearing their30 mm-radius post so the name/icon remains visible; all other street signs retain12 mm. No added lights/draws; the removed signal/warning geometry reduces the same-input street component by4 meshes/236 triangles. [Final near view and diagnostic for the corrected post intersection](../verification/1843/README.md).

## Cat continuous surfaces (#1918)

`catmodel.js` recipe 2 supplies shared immutable tapered torso/skull, shallow
muzzle, curved ears and recessed eye buffers. `CAT_SURFACE` holds authored
proportion estimates. `cat.js` paints chest/blaze on shared surface geometry,
with coat-specific colour views and private materials; late GLB installation
preserves those colours and existing part/contact references. OutdoorCats
multiplies vertex colour into its existing merged LOD bake. No pose/brain or
tail-allocation rewrite is included. Cat thumbnail modelVersion 3 invalidates
older generated images. The neutral GLB and attribution describe the same
recipe. [Whole-cat, actual consumer and bounded cost evidence](../verification/1918/README.md).

## Contact shadow under other players (#2010)

`src/avatarshadow.js` (`AvatarShadows`, tunables `AVATAR_SHADOW`): avatars cast no shadow-map shadow, so every other player gets a soft
blob under the body and one under each shoe. All blobs of all players are ONE `InstancedMesh` (+1 draw call, +2 triangles per blob, a
per-instance alpha attribute, depth tested, no depth write, polygon offset), created in `Ghosts` and updated at the end of `Ghosts.update`.
Each blob rests on the ground found for its own x/z through `ghosts.shadows.ground` (`main.js` passes `player.groundAt`), so a foot on a
stair step, grass, a floor or a roof gets its own height and nothing lands on another storey; the shoe blob fades with the sole's lift
(swing phase), the body blob with the root's height over the ground (jump, flight, fall) and is off when swimming. Players beyond 30 m
(not posed) use standing feet; beyond `AVATAR_SHADOW.range` none. Our own mirror image, the appearance preview and the far figure are not
touched. Component page and check: `tools/avatarshadow.html`, `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarshadowtest.cjs GAME OUT`
(grass / light floor by a wall / stairs / jump; one extra draw call, [images](../verification/2010/)).

## Avatar light level (#2017)

Avatars take no shadow-map shadow, so the scene lights (those the player stands in) lit every avatar as if it stood in open sun: too bright
in a dark room, the stairwell or at night, too dark next to strong sun. `src/avatarlight.js` (`AvatarLight`, tunables `AVATAR_LIGHT`, all
*guess*) gives each avatar one factor on its own material (`uLight`, multiplies `outgoingLight` before the rim; `Avatar.setLight`; program
key `...-sway-light-v18`): the zone's light level over what the scene lights deliver now (`sceneLevel`: hemi + ambient + fill + 0.6 x sun,
1 = clear sunlit day), bounded to [0.4, 2] (the boost is for lit interiors at night) and eased over 0.4 s. The zone comes from `ghosts.light.zone(x, y, z)` (wired in `main.js`
next to the Ghosts): playroom, stairwell (`world.core.contains`), garage, a room of the flat / a visited flat (window share by daylight and
overcast, plus a lamp share from `lights.roomLit`), else outdoors, in shade when a roof / canopy / deck is overhead (`world.roofs.above`).
The zone is re-probed every 0.25 s per avatar (a few array lookups), the factor is a uniform write per frame: no light, no shadow, no draw
call. Hooked in `Ghosts.update` (others) and `beforeMirror` / `showSelf` (our own avatar). Check: `node --test tools/avatarlighttest.mjs`;
browser comparison and costs: `tools/browsertest.sh node tools/avatarlightbrowser.cjs GAME OUT` ([images](../verification/2017/)).

Street lamps at night (#2039): outdoors, the zone also carries `lamp` (0 … 1, `lampLight` in `src/avatarlight.js`): how much of the
nearby lit lamps reaches the figure, from the lamp sets `world.outdoorLamps` (`street.js` `lamps`: every street / path / road lamp head
with its pool's mean reach; `courtyard.js` `lamps`: the bollards, at `AVATAR_LIGHT.lamp.bollard` strength), each lamp
(1 − (d / reach)²)², saturating, times the set's pool fade (`glow`: 0 by day). The factor `uLight` ignores it (the dim bluish night
stays the base), and a second uniform `uLamp` (`Avatar.setLamp`, eased like the factor) adds the lamps' warm pool colour on the surface's
own colour after `outgoingLight *= uLight`, full on surfaces facing up, less on vertical / downward ones (`AVATAR_LIGHT.lamp`, all
*guess*). The zone level gains `lamp.level × lamp`, so the pupils (#2033) narrow under a lamp too; rooms, stairwell, garage and day are
unchanged. Window light (lit façades, the courtyard's window spill) is not included. Still no light object, shadow caster or draw call;
the probe scans the ~200 lamp heads with a box reject every 0.25 s per avatar. Check: `node --test tools/avatarlighttest.mjs`; in the
game under / between lamps at night, a room at night and the same lamp by day: `tools/browsertest.sh node tools/avatarlampbrowser.cjs
GAME OUT` ([images](../verification/2039/)).

## Living avatar skin (#2032)

`src/avatarskin.js` (`avatarSkinGLSL`, tunables `AVATAR_SKIN_DETAIL`, all *guess*) adds three GLSL pieces to the avatars' one material
(program key suffix `-skin2067`), hooked in `makeMaterial` after `skinShading()`, after `normal_fragment_maps` and after
`lights_fragment_end`. No texture, mesh, triangle, draw call or network field. Colour: a warmer flush (an albedo multiplier, so it works
for every skin tone) on the ears (by `facePart`) and nose (#2048: by its height `vNose`), wider on the cheeks and on the knuckles / finger joints of the back of the
hand (hand-bone bind frame). Normal: fine dense pores and shallow grain (two three-wave quasi-periodic sums), in bind-pose
metres with an analytic gradient (no derivative inside the skin branch), bumped like three's `perturbNormalArb`; each layer fades out
between 6 and 4 pixels per period, so it shows only within roughly an arm's length and leaves nothing to shimmer at distance or in the
#1966 dither fade; pits are a little rougher and the nose a little shinier. Light: per directional light a wrapped diffuse past the
terminator and a backlight transmission term (`back`: distortion, power, strength) scaled by a thickness per part (the ear's rim full,
its middle `inner`; nose; fingers), tinted red times √albedo so darker skin glows a little less but stays red. It is added before
`uLight` (#2017), so the local light level scales it. The far figure (`ghostfar.js`) has none of it.
Budget: 0 triangles / draw calls / textures; per skin fragment within close range 6 sin + 6 cos and about 60 other ALU operations, beyond
the fade range one footprint test (the branch is skipped); wrap + transmission about 20 operations per directional light on bare skin.
Measured under SwiftShader (software sin/cos, so a pessimistic proxy): a 640 × 640 face close-up +15 – 65 % frame time across runs on a
shared machine, nine figures at 3 – 6 m within noise; no Surface measurement. Check: `tools/browsertest.sh node tools/avatarskintest.cjs
SITE docs/verification/2032` (component page `tools/avatarskin.html`: light / medium / dark skin before and after in day light and backlight,
frame-to-frame shimmer ratio at 2 / 4 / 8 m ≤ 1.1, cost) ([images](../verification/2032/)).

**Fine detail correction (#2067).** The field periods/relief are 0.65 mm / 1 µm for pores
and 1.5 mm / 1.5 µm for grain (artistic assumptions). The old sparse 2.4 mm pores and
6.5 mm dimples were visibly pitted. A cheek/nose weight concentrates the detail, both
layers exclude lips and eyelids, and eight-decimal GLSL literals retain the micrometre
relief. Geometry/rig/attributes are unchanged; the weighting adds two exponentials and
mask arithmetic per head-skin fragment. Flush, sweat/rain and transmission retain their
existing hooks. [Matched three-tone views, motion and scoped cost](../verification/2067/README.md).

## Cloth folds and weave (#2034)

`src/avatarcloth.js` (tunables `AVATAR_CLOTH`, all *guess*) adds pose-driven folds and a per-garment weave to the avatars' one material
as a normal perturbation after `normal_fragment_maps` (program key suffix `-cloth2034`). `installCloth` (on the avatar and its mirror clone)
measures the elbows' and knees' bend, its direction and the thighs' forward swing from the bones' local rotations each skeleton update
(`clothSignal` → `applyClothSignal`, about 1 µs per avatar) and writes a few vec4 uniforms; no network field, attribute, texture, mesh or
draw call. The shader raises pull folds in the elbow / knee crease that deepen with the joint angle, shallow pull lines over the outside
of the joint, bunched rings at the waistband / lap with the hips' flex, at the jeans' ankle and a long sleeve's wrist, and a fine weave
per garment (`clothKinds`: jersey T-shirt / vest, knitted sweater, fleece hoodie, denim jeans, finer twill for the wide trousers).
Everything is a height field over the bind-pose position (so it rides with skinning) turned into a normal with screen-space derivatives;
both layers fade out by the pixel footprint before they could shimmer. Check: `node --test tools/avatarclothtest.mjs` and
`tools/browsertest.sh node tools/avatarclothtest.cjs SITE OUT` (component page `tools/avatarcloth.html`: three outfits standing,
crouching, sitting and with bent elbows, fold on/off pixel difference per pose, far-view shimmer ratio, draw calls, CPU cost)
([images](../verification/2034/)). The conductor finished the delivery from the worker's last saved state; the planned extra tuning
(wider crease mask, irregular phase) was not done.

## Wet, living avatar eyes (#2033)

`src/avatareyes.js` (tunables `AVATAR_EYES`, all *guess*) adds the wet look to the avatars' eyes on their one material (uniform `uEyeLit`,
program key suffix `-eyes2033`): no texture, mesh, triangle, light, draw call or network field. Hooks in `src/avatar.js`: in the eye branch of
`faceShape()` the pupil (the dark `fixed` disc of the `iris` part) scales about the iris' centre (`eyePupil`); after the gaze and before
the blink (#2045) each eye vertex gets its place in the opening (x corner to corner, y lower to upper lid, the eye size undone; `eyeAt`)
and after the blink its offset from a wet ball (`eyeBall`); right before the skinning (after the face shape and #2031's expressions) the ball's centre and the head's up go to view
space through the skinning (`eyeView`). Fragment: after
the roughness the eyeball darkens softly under the upper lid and in its corners, is glossy along the lower lid (the tear line) and the lid
margin just outside is wet (`eyeWet`); the flat eye geometry's own highlight is kept broad and the pupil matt, so the one sharp highlight is
the glint (`eyeGlint`, before `uLight`): per fragment the ball's exact normal (a cornea-sized ball, `ball` × the eye's radius), a sharp
highlight from every directional light where it reflects towards the camera (so it follows the sun), a broader one from the sky, and a thin
line from the tear meniscus; it fades under the upper lid and with the blink. The pupil and the sun's share follow #2017: `AvatarLight.apply`
also calls `Avatar.setEyeLight(zone, env)`; `eyeLight` gives the zone's light level (`zoneLevel`) and whether direct sun reaches the eyes
(open ground, not shaded, by day, less under cloud; elsewhere the directional glint drops to `room`, a window or lamp); `Avatar.updateEyes`
eases the pupil (narrowing over 0.25 s, widening over 1.8 s) from 0.7 × the drawn pupil in sun to 1.45 × in the dark. Without a light
reading (the appearance preview) the eyes keep the plain size and full glint. Hidden eyes (the suit, sunglasses, the diving mask) skip it.
Budget: on eye fragments only, a few `pow` per directional light; per vertex one branch. The far figure (`ghostfar.js`) has none of it.
Check: `node --test tools/avatareyestest.mjs` and `tools/browsertest.sh node tools/avatareyestest.cjs SITE docs/verification/2033 [BEFORE]`
(component page `tools/avatareyes.html`) ([images](../verification/2033/)).

## Avatar eyelids, lashes and round irises (#2045)

`src/avatarlids.js` (tunables `AVATAR_LIDS`, all *guess*) builds the eye's own parts in `addFace` (eye frame: metres from the eyeball's
centre, before the head's widthwise warp) and blinks them; still one draw call, no attribute, light, pass or network field. The iris is a
24-sided dome whose rim tucks into the eyeball, shaded per vertex (`shade` attribute: a lighter collarette, a dark limbal ring); the pupil a
24-sided disc just over it (the #2033 light scale and the #2011 gaze clamp act on both as before). The lids are one skin ring round the
opening: the margin's back sits inside the opening behind the eyeball (no slit where they meet), its front edge stands `thick` m proud of
the eyeball (thickness in profile), rounds over and falls onto the head's surface tangentially (`headFront`, so #2044's socket sculpt
carries the outer edge along); the upper lid has a shallow, darker fold (`crease`) and its front row is darker (the lash line). The upper
lashes are a closed wedge along the margin in the brows' colour × `lash.shade` (region 9 inside the eye part: no glint, hair roughness;
#2046's brow hairs (`browColor` / `browRoughness`, `part: FACE_PART.brow`) shade only the brow part).
`lidBlink` (vertex, the eye branch after the gaze; replaces #2011's squeeze about the centre) moves both margins onto a closing line a
third down the lower opening, the upper lid's skin up to `fold` m above its margin stretching with them, squeezes the eyeball, iris and
pupil onto the line and pushes them `push` m back, and folds the lashes down; the lashes collapse onto the margin when shorter than
`lash.px` on screen (`uFly`, #2040: buffer height and MSAA), so a far figure's lash line is the darker margin only and never flickers.
Budget: 1,248 eye triangles per avatar against #2033's 608 (+640, 6.7 % of style 0's head-bone triangles after #2043); the #2002/#2012
whole-avatar budgets in `tools/avatarheadtest.mjs` leave that growth out, `tools/avatarlidstest.mjs` holds it. Vertex: a few ALU per
eye vertex; fragment unchanged but the lashes' region test. Known limit: the lid's outer edge meets the head mesh along a visible line in steep views. #2063 seats the eye behind the temple in profile (see below).
Check: `node --test tools/avatarlidstest.mjs tools/avatareyestest.mjs tools/avatarheadtest.mjs` and
`tools/browsertest.sh node tools/avatarlids2045browser.cjs SITE docs/verification/2045 [BEFORE]` ([images](../verification/2045/)).


## Inset avatar eyes (#2063)

`AVATAR_FACE.eye.at.z` seats the globe 12 mm farther back and `eye.scale.z` flattens it from 0.55 to 0.4;
`AVATAR_SURFACE.face.socket` deepens the same continuous head surface by 9 mm. These are artistic guesses in metres,
not measured human dimensions. The #2045 lids, iris and pupil use the shared globe coordinates and head surface, so they follow.
`applyFaceShape` keeps the eye's z scale at 1 while retaining the existing width/height controls: larger openings no longer
push the eye forward. The integrated close-up review required an extra 4 mm inset and matching socket depth to hide the far-eye sliver at oblique angles. `AVATAR_FACE.accessoryFront` keeps glasses and sunglasses at their previous nasal-bridge depth;
the diving mask has its independent `SWIM.dive.mask.front`. Codes, wire fields, skeleton, material and detail LOD are unchanged.

Budget: unchanged eye/whole style-0 figure counts (1,248 / 15,620 triangles), one draw, no new shader operations, varyings,
attributes, lights, passes or textures. `tools/avatarsockettest.mjs` checks seating, accessory clearance and the slider ends;
existing lid/sculpt/gaze checks cover the shared behavior. `tools/avatarsocket2063browser.cjs` captures front, 45°, 60°, profile,
three skin tones, smallest/largest openings, glasses, blink/gaze and backlight in one run.
[Images, source baseline, paired software timing and limits](../verification/2063/README.md).

## Continuous face profile (#2066)

`AVATAR_SCULPT.shape` adds geometry-only root depression, upper-lip support, mentolabial groove and
chin pad to `sculptShape`. The shared `headFront` query seats the #2065 lips on that profile, and the
#2051 beard ray-probes the actual reshaped head. The lower authored head/jaw rings have a broader,
more forward rounded chin; `jawRise` raises only the low lateral/rear shell toward the ear. Its central
mask leaves lip and eye heights alone. Values are artistic guesses in head-local metres, not measured
human anatomy. Eye-depth, nose sliders, head-form/appearance codes and ordinary head boxes stay shared.

The same mesh topology remains: no extra triangles, shader work, attribute, varying, texture, light or
pass. Budget/evidence: 30 scoped Node checks, all eight head-form slider corners, three skin tones,
beard/moustache/cap/hat/headphones, daylight and backlight; 15 bones and one draw in the timing fixture.
[Matched images, source-bound budget/timing and limits](../verification/2066/README.md)
(`tools/avatarprofiletest.mjs`, `tools/avatarprofile2066browser.cjs`).

## Ceramic tile joints (#2070)

`src/tilesurface.js` supplies the existing colour tiles (`tileTexture`, still re-exported by
`interior.js`) and `tileMaterial`. The four L1007 surfaces and three standard-interior surfaces
use one extra packed linear RGBA map each: red is structural height, green is absolute roughness.
Bump and roughness share that texture, resolution, metric repeat and anisotropy. The samples are
flipped to match CanvasTexture's Y orientation, including the kitchen's half-bond rows. The colour
joint is wrapped at both texture edges, retaining the authored tile/joint dimensions and palette.
The existing colour mottling/seed never enters height, so colour specks do not become pits.

`TILE_SURFACE` holds artistic guesses: 0.8 mm shallow bump, 1.2 mm eased ceramic edge (at least
0.75 texel to filter the old low-resolution maps), grout roughness 0.96; the ceramic retains each
material's previous nominal roughness. This is normal relief, not vertex displacement: silhouettes,
geometry, UVs, collision floors, tile placement/openings, material batches and shadow policy stay.
No light, pass, texture upload per frame or custom shader hook is added. Native StandardMaterial
bump sampling and roughness sampling do add fragment work; no frame-rate improvement is claimed.

Checks: `node --test tools/tilesurfacetest.mjs` and the one matched production-builder browser
`tools/browsertest.sh node tools/tilesurface2070browser.cjs SITE docs/verification/2070`.
The fixture uses the real plan and `buildInterior`/`buildStandardInterior` in controlled light;
it is not a complete World/device test. [Images, source hashes, exact budget and limits](../verification/2070/README.md).


## Local asphalt aggregate (#2072)

`src/asphaltsurface.js` gives the existing local road mesh in `surroundings.js` one cached
material and two shared 512² RGBA textures: sRGB aggregate colour and linear packed height
(R)/absolute roughness (G). Geometry UVs use local world X/Z metres, so adjoining strips,
fillets and sloping sections share a fixed 1.6 m repeat and phase. Positions, normals,
indices, road shape, height and markings stay exact; the existing UV allocation is replaced
at the same byte count. Bridge/distant road and pavement materials are outside this change.

`ASPHALT_SURFACE` contains artistic guesses: roughly 7 mm aggregate cells, 0.45 mm shallow
bump, roughness 0.69–0.88 and quiet ±3.5% broad colour modulation from two metre-based sine
terms. These represent ordinary aggregate and binder, not surveyed wear, repairs or damage.
Trilinear mipmaps and anisotropy 4 soften grain at distance. The fragment-only tone hook is
registered with the native vertex policy; it changes no bounds or shadow geometry.

The existing `flat()` / `registerSnow` path continues to own winter colour and colour map.
Only this new material opts into auxiliary-map restoration: snow removes bump/roughness maps
and restores the former road roughness 0.7; summer restores the same cached texture objects.
The broad-tone fragment code is guarded by `USE_MAP`, so it also disappears under snow.
No shared winter contract changes. No new light, pass, geometry or per-frame upload is added.

Checks: three Node tests in `tools/asphaltsurfacetest.mjs`, existing `tools/roadendstest.mjs`,
and one matched production-road browser pass (near/walking/far/winter). Two extra textures
cost 2,097,152 base-level bytes, 2,796,200 bytes with every mip level. Native bump/roughness
sampling and two fragment sine terms add work; no timing/FPS improvement is claimed.
[Inspected paired images, exact counts, source provenance and limits](../verification/2072/README.md).

## Street wear (#2103)

`src/streetwear.js` chains a fragment patch onto the local asphalt (after #2072's aggregate, before #2099's wet patch, key
`|wear2103-asphalt`) and the zebra paint (`|wear2103-paint`). Lanes come from one extra per-vertex attribute `roadFrame`
(signed metres across the centre line, half width), computed once at build: each `SITE.roads` path strip uses only its own
road's samples (a junction's neighbouring road never bends its lanes); car park and fillets get (0, 0) = no tracks; the zebra
bars use the nearest local road. The vertex patch only passes varyings (`vRoadFrame`, world `vWearXZ`), registered as a
fragment compile: positions, bounds and shadows unchanged. Asphalt (inside `USE_MAP`, so the snow look skips it): two
slightly darker, polished wheel tracks per lane and a faint lane-centre strip, varying slowly along the road; per 8 m world
cell a wavy crack with probability 0.42, 40 % of them sealed with a wider glossy black band; an intermittent wavy crack
0.32 m inside the road edge. Line coverage is anti-aliased with `fwidth` and fades below a pixel. Paint: bars flake to the
asphalt colour from a three-octave value noise, mostly where a wheel track runs. The repair patches (`SITE.street.patches`
plus `STREET_WEAR.patches`) now use the shared aggregate maps at a darker tone. All values are `STREET_WEAR` *guesses*.
No new draw, texture, light or pass; cost: 8 bytes per asphalt/zebra vertex and a few hashes/noise per road fragment.
Test: `node --test tools/streetweartest.mjs`; browser: `tools/streetwear2103browser.cjs`
([before/after](../verification/2103/README.md)).

## Moss on shaded north faces (#2122)

`src/shademoss.js` chains a fragment patch (key `|shademoss2122-<joints>`) onto the wall batches: Hus L's brick
(exterior.js; its render is all ≥ 6 m over the street, so unpatched), the Å-husen A/B/C brick façades (grid and plain), their plinths and white render, the brick retaining walls and
the park stairs (surroundings.js). Where: the face's world normal from screen derivatives (north = −z; `north` smoothstep of
−normal.z, so east/west/south faces and tops/soffits get none), the height above the ground in front of the face (one baked
float per vertex, `mossHeight`, ground from `groundY` 0.3 m out along the normal, stored + `offset` so a mesh without it reads
as underground) and a two-octave world noise: a patchy, ragged band up to ~`band` m, and a thinner green in mortar joints up
to `joints.height` m (low bump height on bump-mapped brick/render, a light map texel = mortar on the Å-husen/retaining-wall
canvases), darker than the band (`joints.dark`) so light mortar never turns lime. The colour moves towards the muted olive moss hue at the surface's own luminance × `dark`, so a façade's mean tone stays
within 2 % (shademosstest); roughness rises slightly. All values `SHADE_MOSS` *guesses*. Phones (lowMemory) skip it
entirely: no attribute, no program change. No new draw, texture, light or pass; cost: 4 bytes per patched vertex and a few
hashes per low north-facing fragment (others exit after a height test). Not covered: low roofs and bench foundations (no
shade information; only the listed wall batches), horizontal paving edges. Test: `node --test tools/shademosstest.mjs`;
browser: `tools/shademoss2122browser.cjs` ([before/after](../verification/2122/README.md)).

## Snow caps on narrow upward faces (#2123)

`src/snowcap.js` chains a fragment step (key `|snowcap2123`, after `normal_fragment_begin`, i.e. after every colour and
roughness step of the chain: railMetal, benchWood, render, moss) onto the outdoor batches with narrow tops: Hus L's brick,
render, pilasters, the fascia/roof capping ring (#2093)/copings/sill flashings batch and the loftgång and terrace rails
(exterior.js); the Å-husen A/B/C brick façades, white render (loggia slabs, parapets), loggia rails, house letters and
light sheet metal (edges, copings), the box walls and their rails/slats (surroundings.js); the courtyard benches, metal and
pergola (courtyard.js) and the bus-stop bench (busstop.js). The view-space normal turned to world: `up` smoothstep of its y,
so walls and soffits get none and slopes fade out by ~57°; a world-xz noise thins the cap in places; colour towards the roof
snow white, roughness up, metalness to 0. Moss sits earlier in the shader, so a mossy top is white under snow. One shared
uniform `uSnowCap` (1 in `SEASON.snowMonths`, set by a seasons hook; the shader branches on it), so a month change
recompiles nothing and outside the snow months the colours are unchanged. Roofs and ground keep `registerSnow`; glass is
not capped. Phones (lowMemory) only cap materials that already have their own compile step (rails, benches): no new program
for a plain material. No geometry, draw, texture, light, pass or per-frame work. All values `SNOW_CAP` *guesses*.
Test: `node --test tools/snowcaptest.mjs`; browser: `tools/snowcap2123browser.cjs` ([before/after](../verification/2123/README.md)).

## Wet facades, roofs, cars and benches (#2175)

`src/wetsurface.js` chains one fragment step per material class (`WET_SURFACE.kinds`: brick, render, roof, car, wood, metal; key
`|wetsurf2175-<kind>`) onto the outdoor materials after their own patches (snowCap, railMetal, benchWood, moss, render). It only reads
the ground's wetness (`wetUniforms.uGroundWet.x`, 0 in the snow months), so walls dry as fast as the street. Damp darkens the albedo
(wet × 1.6), the gloss comes as it soaks (roughness down by wet²) and a faint sky reflection (`uWetHorizon/uWetZenith`, Schlick) shows
on the film; brick and render also get thin vertical run streaks on near-vertical faces (only once soaked), car paint beads of dropwise
gloss. Wired in: Hus L brick, render, pilasters, roof felt, flashings and rails (exterior.js); the Å-husen A/B/C and the neighbours'
brick, white render, rails, sheet metal and modern roofs, retaining walls (surroundings.js); courtyard and bus-stop benches
(courtyard.js, busstop.js); the parked and far cars (carfinish.js). Dry skips the branch. Phones (lowMemory) like snowCap: only materials
that already have a compile step (so no new program for a plain material): the plain car paint and roofs stay dry-looking there. No
geometry, draw, texture, light, pass or per-frame work. All `WET_SURFACE` values *guesses*. Test: `node --test tools/wetsurfacetest.mjs`;
browser: `tools/wetsurface2175browser.cjs` ([before/after](../verification/2175/README.md)).

## Painted screen-wall surface (#2075)

`screenwall.js` retains #1786's `SCREEN_WALL` palette, board spacing, frame bands and seeded board tints. Its fine colour strokes now follow gently curved, occasionally forked fibres within each existing board. `screenwallsurface.js` supplies one shared 256×512 linear RGBA texture: red holds only shallow, smooth-edged joint height; green holds matte roughness (about .85 on boards/frame and .96 in joints). `SCREEN_WALL_SURFACE` parameters are visual assumptions, not surveyed construction detail. Relief is shading only (maximum joint difference about .595 mm), never displacement.

`World.M.fence` uses the same map for standard-material bump and roughness. The existing UVs sample an exactly flat cream-rail band for posts and horizontal faces, so these do not acquire board grooves. All geometry, collision and occluder data remain unchanged; the original shared colour canvas retains its dimensions. The additional texture costs 524,288 base bytes or 699,052 bytes with the complete RGBA mip chain (512×256 down to 1×1). No geometry, draw, pass, light or per-frame texture update is added; standard bump/roughness sampling adds fragment work.

`tools/screenwallsurfacetest.mjs` checks deterministic joint registration, seam continuity, flat frame UVs and bounded fibre paths. `tools/screenwallsurface2075browser.cjs` checks real `buildExterior` ground and roof consumers using the actual `World.M.fence`, exposed only by a test route. The [saved comparisons](../verification/2075/README.md) document identical geometry/collision data and per-view render counts. This controlled component check makes no full-world or device/FPS claim. Hus A/B/C have no consumers of this screen-wall builder; this material-only change does not alter house layouts. Public transfer is tracked separately in kvarteret-lunden #297.


## Patio paving joints (#2074)

`src/pavingsurface.js` wraps each existing `pavingTexture()` colour map with a shared
384×384 linear RGBA8 height(R)/absolute roughness(G) map. `World.M.patio` uses it for
our patio and `buildExterior`'s neighbouring patios/roof terraces; the portik receives
its own sheltered material using the same scalar texture. The old `src/patio.js`
colour generator, palette, seed, speckle, rounded pixel layout and metre UVs remain
byte-identical. Geometry, bounds, collision/walking surfaces and batches are unchanged.
A/B/C use separate ground/access builders and are not remapped to this slab material.

`PAVING_SURFACE` owns artistic assumptions: 1.5 mm bump depth, 2 mm nominal bevel with
a 1.25-texel minimum at the existing 160 px/m resolution, concrete roughness 0.93 and
grout 0.99. The minimum bevel footprint is 7.8125 mm; these are shading guesses, not a
surveyed concrete profile or vertex displacement. Height depends only on the existing
six-by-six 40 cm half-bond slab layout; colour speckle never becomes relief. The existing
8 mm nominal joint still rounds to one pixel at this resolution, exactly as before.

Existing `registerSnow` at World owns the exposed colour/map. Only the new exposed
material registers an auxiliary-map seasonal hook: snow removes bump/roughness and
restores the former 0.95 roughness, summer restores the identical cached map objects.
The sheltered portik never opts in, so all its maps remain in winter. `seasons.js`
is untouched. No new draw, geometry, lamp, render pass or per-frame upload is added;
native Standard bump/roughness sampling and UV varyings increase fragment work.

Additional packed texture: 589824 base bytes / 786424 nominal full-mip bytes (about 0.75 MiB),
plus its 589824-byte CPU array, excluding driver overhead. One shared texture serves
both materials. Checks: three targeted cases in `tools/pavingsurfacetest.mjs`, scoped
syntax/diff/source preservation, and a matched actual World material/plate plus production
exterior browser with summer/snow/restoration. [Inspected aspect-correct images, hashes,
camera correction, exact counters and limits](../verification/2074/README.md).


### Own resting body (#2080)

`Ghosts.showRestBody` reuses the already allocated self avatar for settled ordinary
`Rest` spots. The production `restState` / `applyRestPose` determine the world anchor,
seat heading, chosen height, ordinary bent legs, `legsUp` chaise and lying pose.
Camera yaw only changes gaze. `main.js` poses the body before the normal draw even
without a nearby mirror, then hides it in `finally` so it cannot remain in picking,
menus, standing or the next view. Gym spots keep their existing special path.

`avatarselfview.js` uses existing skin/face labels in the established PBR program.
Own view hides head, hair, neck accessories and avatar arms; the existing camera
`Hand` and held-object views continue to own arms/hands. This avoids duplicate hands
and open shoulder sections inside the eye. A body-only 30 cm inner near plane
(*guess*, display clipping rather than an anatomical measurement) removes surfaces
through the eye. World geometry, camera near plane, proportions and poses are unchanged.
The material stays solid, opaque and depth-tested: existing cushions/duvets can cover
it. Reflector hooks save/restore view masks and visibility and draw the complete avatar,
including arms, head and held proxies. BIO reactions retain the complete body too.

One extra existing skinned-body draw while resting, no second avatar, new geometry,
attribute, image map, light, pass, storage or wire field. First use can upload the
existing bone texture if warm-up/mirrors have not done so. The skeleton updates while
the body is drawn. [Scoped native views, costs and limits](../verification/2080/README.md).


#### Standing, walking and crouching (#2145)

`Ghosts.showRestBody(rest, stand)` also shows the same self avatar outside Rest: `main.js` passes the
game-only flags (swim, riding, flying, climbing, swinging, falling) and `standBodyReady`
(`src/avatarselfview.js`) additionally requires wire pose 0, no gym pose, bike, jetpack or air mode
and no active `Rest` (seats and car/bench keep the #2080 path); BIO reactions keep the full third-person body.
`showStandBody` reuses `showSelf` (gait, steps and crouch ramp come from the ordinary mirror animation of
`mine`), roots the body `SELF_STAND.back` m (+ `crouchBack` when down) behind the eye along the heading (`standRoot`, *guess*) and
applies the same head/arm mask with its own, smaller inner near plane `SELF_STAND.near` (`uSelfView.x` = 2 + near; the sitting body keeps 0.30), so chest/belly, legs and both shoes show when looking down, so the camera `Hand` stays the only arms. No new draw beyond the one body
draw (+1 call measured at `&quality=0`), no wire field. `&noselfbody` turns it off.
Limits: running/crouch alignment was checked by eye only; the white silhouette fringe on legs/shoes is not a rim (`uOutline` is 0) and also appears in the #2080 images; before the first step at the stair-top spawn the body was missing in one test position (`standStart.png`), unresolved. Tests: `tools/avatarselfviewtest.mjs`, game views `tools/selfstand2145browser.cjs`
([images](../verification/2145/)).


## Solar-cell and glass surface on Hus L (#2083)

`solarsurface.js` adds two small cached atlases to the existing one panel material:256²sRGB
colour multipliers and128²linear roughness. `SOLAR_SURFACE` records artistic guesses for a10×6
cell grid per nominal1.68m repeat,6mm gaps, thin3mm buses and quiet glass roughness around0.33.
Whole repeats fit each authored long strip, so these are approximate visual dimensions, not a
verified panel model. The original dark blue/metalness remain; no new environment reflection.

`solarPanelUV` changes only existing box UVs before hinge/tilt. Original+Yfaces map to the cell
region; every side/bottom face samples a reserved flat swatch with original colour multiplier1
and Float32 roughness0.3. The top-frame mask uses that same flat finish. Position/normal/index,
12triangles per box,12boxes/one merge batch, shadows, placement10°tilt/5cmthickness/4cmlift and
roof-walk/collision metadata remain exact. There is no bump/displacement/transparent layer,
extra geometry/draw/light/pass or per-frame upload. Existing UV allocation stays3456bytes.
Two maps cost327680CPU/basebytes /436904nominal GPUbytes including mipmaps, plus driver/program
storage and ordinary map-sampling fragment work.

A/B/C roofSpec consumers have no equivalent solar panel batch. Nordic Wellness's low blue boxes
share its glass batch; the eight villa solar quads share roof vertex colours. Their distinct
geometry/materials remain untouched. Neutral public applicability is tracked separately in#304.
[Own native checks, actual buildExterior views, exact source hashes and limits](../verification/2083/README.md).

### Stationary river-lighting ripples (#2082)

The native Standard material receives a bounded analytic normal perturbation from two curved world-XZ phases in riversurface.js, with artistic settings in RIVER_SURFACE. These are stationary lighting detail, not moving/displaced waves or measured hydrology. Their principal periods are approximately 0.67/0.44 m; gains 0.035/0.02 bound the summed slope by 0.055. Normal variation fades smoothly over 12–45 m camera distance and 0.035–0.12 m fragment footprint. Original colours, roughness/metalness, opacity/depth, DoubleSide and geometry/UV remain.

#2186: Höje å now mirrors the sky and its near ripples drift downstream. `riverSurface(material, levels, {flow})` adds a Fresnel-weighted reflection of DayCycle's own horizon/zenith colours (the shared `wetUniforms`, no env map or reflection pass, none from below the surface) to the indirect specular; the production river bridge strip additionally gets `riverFlow` (downstream tangent, chainage, signed across-distance) and `riverShore` vertex attributes from `addRiverFlow(geometry, riverAt)`, shades the mirror darker and green towards the banks, and runs the ripples in the river's own frame at `riverFlowSpeed()` (about 0.4 m/s, the shared `uWetTime` clock wraps on whole wave-lengths). The far-water planes get the sky reflection only (stationary, no new attributes). All values are artistic *guesses* in `RIVER_SURFACE.sky/bank/flow`; no new draw call, texture or pass. Tests: `tools/riversurface2186test.mjs` (helpers, GLSL), browser `tools/riversurface2186browser.cjs`; images in `docs/verification/2186/`.

Consumers: bridges-water plus the two continued water courses already merged into edge-land. The latter selects existing water-coloured vertices at the two exact adjacent water levels, preserving all other vertex colours/geometry. Both batches use identical world phases. The older local/continuation roughness difference remains; this change does not recalibrate it. The colourless edge snow variant returns the exact native shader/cache key, preserving its older winter policy.

No texture, extra vertex attribute, uniform, time source, frame callback, displacement, reflection pass, new light or draw is added. Active ripple fragments add two sin/two cos calls, two fwidth calls, two smoothsteps, camera distance, small vector arithmetic and one normalization; a vec4 varying and world-position transform add vertex/interpolation work, and masked edge vertices also classify colour/height. Inactive/far fragments branch out of ripple math. Driver branch execution is not a measured FPS guarantee. A winter native program that previously shared with local water becomes a separate cached program: measured 6→7 total programs, other views 6→6. Shader binary/driver allocation is not exposed; new map/geometry bytes are exactly zero, total GPU cost is not zero. [Source-bound evidence, cost and limits](../verification/2082/README.md).


### Trainer uppers and lacing (#2084)

`src/avatartrainers.js` adds a small tongue, three crossed lace pairs and two narrow
panel outlines to the existing `avatar.js:bodyParts` uppers. `AVATAR_TRAINERS` contains
visual guesses, not a named product model. Detail polygons are clipped against the
actual coarse upper triangles, with interpolated authored normals. Their tiny Y lifts
are capped at the old maximum; X/Z, the old hemispheres/soles and their contact bounds
stay unchanged. A separate detail block enters the existing merge after the original
body parts, rigidly bound to the same foot bones at the same SHIN offset. All original
attributes, including every sole/upper colour, restore byte-identically after removing
only that contiguous inserted block. No rig, gait/pose, first-person rest mask or shader
changes. The existing palette base shade now applies to shoe region 5 too; the old
upper's shade is exactly 1, while new tongue/panel shades multiply the selected shoe
colour. Laces use the existing sole's ivory, with its existing fixed-surface finish.

The cached variant gains 392 triangles/1176 unindexed vertices and 125832 attribute bytes
(111720 shared non-colour bytes +14112 own colour bytes per avatar). The exact facet
registration exceeds the initial <200-triangle goal; this accepted bound is about 2.4%
of the adult's existing 16312 triangles. There is still one SkinnedMesh, one material
and one draw per avatar, with no new map/attribute kind/light/pass/frame callback or
network/storage field. More vertices enter the existing skinning and bone-texture path;
no FPS claim. Normal chaise images show clear lacing; tongue/panel tones remain subtle.
`tools/avatartrainerstest.mjs` covers finite bounds, exact old attribute/palette/sole
preservation, rig/pose equivalence and source boundaries, alongside existing body/selfview
checks. `tools/avatartrainers2084browser.cjs` uses actual furniture/Rest/Ghosts/Avatar,
production frame hooks and reflector. [Own captures, source hashes, budgets and limits](../verification/2084/README.md).
This character change has no public downstream application.

### Shoe models and socks (#2169)

Look fields `shoeModel` (0 trainer = as before, 1 boot, 2 leather low shoe, 3 sandal) and `socks` (0 none, 1 white, 2 dark, 3 grey), tunables in
`AVATAR_SHOES` (config.js, all *guess*). Wire: both ride the headphones' tag `f` as `phones + 10 * (shoeModel + 4 * socks)`; an older client reads
only f0-f2, skips the value and shows trainers without socks (and without headphones, the one cost of sharing the tag). Missing value = today's look
(no tag written). Every model keeps the trainer's sole (same footprint, height and the foot IK #2015 contact points); the variant key gets the
suffix `_<shoeModel + 4 * socks>` only when non-zero, so existing variants and vertex order are unchanged. Boot: the trainer's upper under a shaft
and collar lathe skinned like the leg (`limbWeights`), so it follows the shin. Leather shoe (`src/avatarshoes.js`): a lower, pointed upper with a
dark throat and toe-cap seam in a new surface region (`REGION.leather` 10, roughness `finish.leather` 0.34 against the trainer's 0.72), dark sole.
Sandal: a bare skin foot, forefoot and instep straps and an ankle strap, tan sole. Socks: a leg tube (the `garment` ease over the skin) from the ankle
up `sockHeight`, built only with shorts or a skirt/dress and not under a boot. Triangle delta per avatar (both feet): boot +280, leather -242,
sandal +164, socks +288 (shorts), on a 16 076 triangle base; no new draw call, texture or uniform. Customizer: "Skomodell" and "Strumpor" beside the
shoe colours. Tests: `tools/avatarshoes2169test.mjs` (tag round trip / fallback, sole on the floor and on a kerb for every model), browser capture
`tools/avatarshoes2169browser.cjs` with `tools/avatarshoes2169.html`.

### Hands: nails, joint creases, knuckles and tendons (#2106)

`src/avatarhand.js` (tunables `AVATAR_HAND_DETAIL`, all *guess*; program key suffix `-hand2106`) places per finger, from #2016's own
joints (`fingerJoints`), a nail on the back of the distal segment (a light tint mixed into the skin, paler free edge, a pinkish cuticle
band, a slightly raised plate rim and lower roughness for a discreet gloss), fine crease lines across the middle joint and an implied
end joint on the back (flattening as the joint bends) with one deeper crease on the palm side (deepening), and a knuckle dome that rises
with the bend. The hand itself gets a lighter, a little rougher palm with two soft creases and four tendons on the back that converge
to the wrist and show more as the four fingers close (the mean knuckle angle from the #2016 `uFing` uniform, which the fragment now
also reads). The vertex finger branch tapers and flattens the fingertip a little before the bend. All in bind-pose coordinates, so the
marks move exactly with the skin under them; the lines and relief fade out between 0.4 and 0.9 mm per pixel (the nails' colour stays).
No mesh, texture, draw call or network field; the far figure has none of it. Cost: on bare hand fragments roughly 60–90 ALU operations
and a few `exp`, elsewhere one role test; per-avatar CPU 0. `tools/avatarhandtest.mjs` checks placement, mirroring, determinism and that
the nails follow every grip shape; `tools/avatarhand2106browser.cjs` takes before/after close-ups ([images](../verification/2106/)).

### Garment seams, ribs, hems and pockets (#2107)

`src/avatarseam.js` (tunables `AVATAR_SEAM`, all *guess*; program key suffix `-seam2107`) adds one height + shade term to #2034's cloth
block (`seamDetail`, spliced by `src/avatarcloth.js`), over the bind-pose position on the top (region 1) and trousers (region 2): side,
shoulder, set-in armhole and underarm seams on the top; outseam, inseam, centre-back seam and (jeans) a back yoke on the trousers; a
ribbed collar (T-shirt, sweater), ribbed hem band and long-sleeve cuffs (sweater, hoodie), the vest's bound neck and armholes, turned-up
stitched hems (T-shirt, short sleeves, trouser legs, shorts), a waistband with belt loops just under a T-shirt's hem, curved front pocket
openings and back patch pockets. Each seam is a groove, a welt on the allowance's side and optional topstitch dashes (paler on denim);
every line is a Gaussian prefiltered by the pixel footprint (it widens and flattens keeping its area) and dashes / rib columns average
out, so nothing shimmers far away. The look sets two uniforms (`uSeam`, `uSeamKind`: top kind, jeans, shorts, long sleeves, edge
heights) with #2034's; garment colours and choices are unchanged. No mesh, texture, attribute, draw call or network field; per-avatar CPU
only at look set-up. `seamAt` mirrors the shader's placement for `tools/avatarseamtest.mjs`; `tools/avatarseam2107browser.cjs` takes
before/after views ([images](../verification/2107/)). Limits: the landmarks are the standard skeleton's (like #2034), the armhole oval
approximates #2001's 12-vertex hole, and the waistband is covered by the hoodie's long hem.

`src/avatarfabric.js` (#2165; tunables `AVATAR_FABRIC`, all *guess*; program key suffix `-fabric2165`) gives each weave kind of #2034 its own
roughness and a cheap sheen lobe instead of the shared cloth roughness 0.92 (jersey 0.86, knit 0.97, fleece 1.0, denim 0.82, fine twill 0.7): the
roughness shifts inside the cloth block (wet cloth still wins), and `fabricLight` (spliced after `lights_fragment_end`) adds a `(1 - N.V)^power` fuzz
term built from the light the lights already summed (direct + ambient diffuse over the albedo, tinted towards white), strongest on knit and fleece,
barely on denim. The jeans (kind 3) are also faded and worn (`fabricWear`: knee and thigh fronts, whiskers at the lap, honeycombs behind the
knees, pale out- and inseams, worn hem; thin lines prefiltered by the pixel footprint). One shader program, no texture, attribute, uniform, draw
or network field. `wearAt` mirrors the shader for `node --test tools/avatarfabrictest.mjs`; `tools/avatarfabric2165browser.cjs` (component page
`tools/avatarfabric2165.html`, before = the base revision's `src/avatar.js`, `avatarcloth.js`, `config.js`) takes the sun-lit group, close-ups
and the mirror preview. [Images](../verification/2165/).

`src/avatarpattern.js` (#2168; tunables `AVATAR_PATTERN` in `config.js`, all *guess*; program key suffix `-pattern2168`) gives the top a procedural pattern in the same cloth
block, a function of the bind-pose position only (so it follows skinning, seams and folds, never a texture, mesh or draw): 1 striped (horizontal bands by bind height), 2 checked (bands plus
whole columns round the part's axis, darker at crossings), 3 marl (two slanted sine lattices of light and dark flecks over a greyed base), 4 two-tone (sleeves in the second colour). The second
colour is derived from the top's own colour (`altOf`: darker on a light top, creamy on a dark one). Look field `pattern`; wire: tag `m` above the cut / outer value (`m` = cut + 3 × (outer + 3 × mode) +
18 × pattern); an older client skips it and shows the plain T-shirt in the seed colour. No pattern under a worn jacket / coat; customizer: the `pattern` button group beside the top model. One vec4
uniform (`uClothPat`). `patternAt` mirrors the GLSL for `node --test tools/avatarpatterntest.mjs`; `tools/avatarpattern2168browser.cjs` (page `tools/avatarpattern2168.html`) takes before/after. [Images](../verification/2168/).

### Optional skin variation: freckles, birthmarks, uneven tone (#2111)

`src/avatarskinvar.js` (tunables `AVATAR_SKIN_VARIATION`, all *guess*; program key suffix `-skinvar2111`) adds an optional, discreet
variation chosen in the mirror's settings (Ansikte → Hud: Fräknar Inga/Lite/Måttligt/Mycket, Födelsemärken, Hudton Jämn/Lätt ojämn,
Ny placering). `skinVarSpots(look)` places 7 / 14 / 22 freckles over the nose bridge and upper cheeks, 1–3 birthmarks and three soft flush
zones in the head bone's bind frame, deterministic from the look's `skinSeed` (0–6) and skin colour (a higher amount keeps the lower
amount's freckles); lids, lips and brows (measured bind bounds plus a margin) are kept clear. The spots fill a per-avatar uniform array
(`uSkinSpot[28]`, `uSkinVar` = count + under-eye strength); the fragment piece multiplies the bare head skin's albedo round each spot,
projected from the front, plus a darker zone under each eye. Each pigment spot widens to the pixel footprint while keeping its area, so it
fades instead of shimmering at distance. Look fields `freckles`, `marks`, `blotch`, `skinSeed` (missing = off) ride in the eye colour's `c`
tag (`eye + 8 × (features + 16 × seed)`, config.js `skinVarCode`; older clients skip a `c` ≥ 8 and lose only the eye colour); the largest
possible wire extension is exactly the Worker's 60 characters. No mesh, texture, attribute, draw call or network field; off = one uniform
test. `tools/avatarskinvartest.mjs` checks placement, determinism, the kept-clear areas and the code round trip;
`tools/avatarskinvar2111browser.cjs` takes before/after mirror-preview views ([images](../verification/2111/)).

## Room reflections in glossy surfaces (#2151)

Chrome, stainless steel, porcelain, glossy glass and tiles indoors had nothing to reflect (no environment map; only the copper
pendants, the toaster and the fruit bowl used the painted `roomEnv()`, #307), so taps, fridge, hood and WC looked flat grey.
`src/roomprobe.js` (ROOM_PROBE in config) gives every material tagged `userData.roomProbe = '<class>'` one env map:

- **Zones.** The visitor's room in L1007 or in a visited flat (`probeZone`: key `L:<level>:<room>` / `<unit id>:<level>:<room>`)
  from the room maps; outdoors, in a doorway, the stairwell, the garage or the playroom the last map stays. The probe stands at
  the room's centre (the largest region; the visitor's spot when the centre is not in the room) `height` m above the floor.
- **Capture.** A `CubeCamera` (64 px faces, `near`/`far` 0.05/18 m, the main camera's layers) draws one face per frame (never in
  a frame that redraws the shadow map), then three's `PMREMGenerator.fromCubemap` filters it into the zone's target. The mirrors'
  Reflectors are hidden during a face (they would draw their own pass). `ProbePlan` (pure) decides: the first capture at once
  (after the warm-up), a zone without a fresh map or a light change after `settle` s, at most `keep` zones (LRU). The light's
  signature = the daylight band (`daylightBand`, with hysteresis) + every room switch, small lamp, visited flat's lamp and the mains.
  No pass in any other frame.
- **Programs.** 64 px everywhere, because the painted room's PMREM is 64 px too: the shiny materials have the same program
  whichever map they show, so a quality step or a capture never compiles. Desktop draws the faces into a linear half-float
  target (the mirror variants the warm-up compiled); phones (lowMemory) into an `isXRRenderTarget` sRGB RGBA8 target (#1561's
  screen-output trick: the screen programs) and the PMREM's cube material decodes it (`sRGBTransferEOTF`, a setter on three
  r170's private `_cubemapMaterial`). The faces are tone-mapped on phones before they are reflected (slightly flatter).
- **Levels.** `probeMode`: below `minLevel` (Lägsta) the painted room, dimmed at night (`paintedScale`); phones capture once
  (the first zone after the warm-up; the cube target and PMREM are freed) and never again; `&noprobe` = no env map at all (the old
  look, for A/B). A quality knob `roomProbe` (`&perf` shows mode, zone and captures).
- **Strength.** `ROOM_PROBE.k` per class (*guess*, by eye): chrome 1, steel 0.8 … porcelain 0.25, tiles 0.12, floor tiles 0.06
  (#271). three scales the env map's diffuse irradiance by the same factor, so a higher value on tiles/porcelain lightens them
  overall rather than adding gloss; that is why they stay low.

Tagged: interior.js (chrome, steel, dishwasher, handles/brass, hob glass, glassDark, porcelain, white appliances, splash and
wall tiles, wet-room floor), standardinterior.js (the visited flats' same classes), toilet.js, hood.js, fridge.js, ovens.js,
world.js (the fallback porcelain, which is also L1007's window-sill material). The copper keeps its own painted map.
Measured (`tools/roomprobe2151perf.cjs`, headless SwiftShader, kitchen, noon, `&warm`; `perf.json`): programs after the warm-up
`&quality=0` 623 → 633 (+10: the tagged materials' env-map variants, screen + mirror), phone profile `&lowmem` 310 → 315 (+5,
screen only) and 0 new programs from its one capture; `&quality=3` 633 after the warm-up, 634 after the first capture (+1:
PMREM's cube material). Draw calls of the view unchanged (270 / 279 at quality 0 / lowmem). A capture face drew 285 calls in
18.9 ms against the view's 28.5 ms (SwiftShader: relative only), six frames per capture. GPU memory: one 64 px half-float cube
(≈ 0.2 MB) + ≈ 0.7 MB per kept zone (≤ 6) + PMREM's ping-pong target; phones free all but the one map. Not measured on the
Surface Pro or a phone.
Not done: window glass (#2179), mirrors (their Reflector), black matt mixers (metalness 0.22: no visible gain).
`tools/roomprobetest.mjs` (pure), `tools/roomprobe2151browser.cjs` (before | after images),
`tools/roomprobe2151perf.cjs` (programs / calls). [Images and numbers](../verification/2151/).
