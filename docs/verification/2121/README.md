# #2121 Manhole covers and drains: verification

Cast-iron covers (`src/drains.js`, `STREET_DRAINS` in `src/config.js`, every place and size *guess*): round manhole covers
(raised studs, a worn raised edge, a dark frame round a dark gap) on the centre line of Sankt Lars väg and Karpvägen, gully
grates (dark slots, frame, bars across the gutter) against the kerb on both sides, and three small square grates on courtyard
walks. Placement is deterministic; a cover that would touch a repair patch, a crossing, the bridgehead island, another road
(junction, the drive's mouth) or lie where there is no kerb moves along by the first free shift, else is dropped:
5 manholes + 19 gullies on Sankt Lars väg, 2 + 6 on Karpvägen, 3 courtyard grates. One merged, vertex-coloured, flat mesh
(2564 triangles) in the street group, each vertex a few mm over its own ground; no texture, no collision, no shadow casting;
hidden in the snow months.

## Checks

1. `node --test tools/drainstest.mjs`: 6/6 pass. Deterministic; every street cover's footprint is on its own road's asphalt
   and on no other road; manholes on the centre line; gullies against the kerb (outer edge `kerbGap` from the asphalt's edge,
   no road just outside); no cover touches the patches (#2103 included), the zebra, the bridgehead crossing or the island,
   nor another cover; courtyard grates on a paved walk clear of bollards, benches and trees; geometry faces up, lies exactly
   `lift` (+ `step` for the raised parts) over the given ground, < 4000 triangles; the phone material has no compile hook
   (plain vertex-coloured standard program), the desktop one carries `wet2099-paint`. Also passing: `streetweartest` 5/5,
   `wetgroundtest` 3/3, `cobbledcorner2077test` 3/3, `busstoprestoretest` 2/2.
2. Browser (`tools/drains2121browser.cjs`, SwiftShader, 1280 × 800, 10 June 2026 13:00, clear; plus the street in rain):
   `before` serves the base revision's `config/street` modules. No page or shader errors.

| View | Draws before → after | Triangles | Textures | Programs |
|---|---|---|---|---|
| street | 148 → 149 | 677795 → 680359 | 43 → 43 | 74 → 75 |
| manhole | 54 → 55 | 379623 → 382187 | 30 → 30 | 51 → 52 |
| gully | 68 → 69 | 404879 → 407443 | 33 → 33 | 56 → 57 |
| karpvagen | 162 → 162 | 664629 → 665965 | 51 → 50 | 77 → 78 |
| courtyard | 87 → 88 | 463805 → 466369 | 36 → 36 | 62 → 63 |
| rain-street | 149 → 150 | 677795 → 680359 | 43 → 43 | 75 → 76 |

+1 draw and +2564 triangles where the mesh is in view, +1 program on desktop (the wet/litter/lampwash-patched vertex-colour
material), no texture, light or pass. Geometry: 7692 vertices × (position + normal + colour) = 277 kB. Karpvägen's ±1
draw/texture is the frame's own lazy-loading noise.
   Phone profile (`LOWMEM=1`, `&lowmem`): street 134 → 135 draws, 74 → 74 programs; courtyard 89 → 90 draws, 66 → 66
   programs. The phone material (no wet patch; the scene-wide lamp-wash patch is added later like everywhere) compiles to a
   program the scene already has: no extra program variant (#2118).

## Images

`street.jpg`, `manhole.jpg`, `gully.jpg`, `karpvagen.jpg`, `courtyard.jpg`, `rain-street.jpg`: after.
`before/*-before-after.jpg`: the same camera before (left) and after (right), half size.

## Limits

- Places, spacing and sizes are *guess*: there is no drainage drawing. The covers are flat (a few mm of layering, no relief or
  text) and carry no roughness variation between frame, studs and bars.
- The optional link to #2099 (puddles collecting nearest the grates) is not done: it would need the grate positions in the
  shared wet-ground shader, which #2119 is changing in parallel. The covers themselves darken and shine with the wet street.
- Phones get the covers with a hook-free material: they stay dry-looking in rain there.

Publicering: Pages/Worker success på `82db1be`; bild-URL:er HTTP 200 före stängning.
