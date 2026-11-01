# #1786 — the pale grey slabs by the courtyard hedges

**Cause.** The slabs are Hus L's patio screen walls (skärmväggar, H 1.8 m, bofakta; `plan.json` `site.fences`), intentional and in the
right place: a raycast from the #1782 Kanel pose (camera −38.6, 0.9, 23.4 looking at −38.6, 0.1, 21.2) hits the merged neighbour fence
batch in `src/exterior.js` at x −35.85, z 16.5–17.6 (colour `0xa7b6aa`, `mats.fence`). They looked like stray planes because they were
5 cm boxes in one flat grey-green colour with no structure. No LOD/culling proxy, wall shell or collision helper is involved.

**Fix.** Peab's courtyard render (`docs/peab-radhusrad-innergard.png`) shows the screens as greige-olive vertical boards in a light cream
frame. `src/screenwall.js` gives every screen wall a shared canvas board texture (UVs in metres along the wall, over its height) and an
end post at each end, sampled from the cream rail (`SCREEN_WALL` in `src/config.js`, all *guess*). Thickness, extents, collision,
occluder rectangles and furniture clearances are unchanged; the posts are merged into the existing batches, so no material or draw call
is added.

- `1-fore-kanelvy.png` / `2-efter-kanelvy.png` — the #1782 Kanel pose before / after.
- `3-fore-nara.png` / `4-efter-nara.png` — closer, at a neighbour patio west of L1007 (camera −33.4, 1.6, 21.5).
- `5-efter-egen-uteplats.png` — L1007's own patio with both screen walls and the string lights (world.js's own two meshes).
- `6-efter-takterrass.png` — the roof-terrace screens (same batch and material) from above the courtyard.

**Houses checked.** Hus L: affected — the neighbours' patio screens and the roof-terrace screens (`exterior.js` fence batch) and L1007's
own two patio screens (`world.js`); all fixed through the shared `screenWallParts` / `M.fence`. Hus A, B, C: not applicable — their
courtyard ground floors have loggias with railings and loggia plants (`surroundings.js`), no screen walls (Peab render
`docs/peab-innergard-ost.png`).

**Checks.** Phone perfcount (`tools/perfcount.html?cloud=&lowmem&w=844&h=390&quality=0&month=12`): start 336 calls / 753 045 tris
(≤ 370), ALL PASS. `tools/runtests.cjs --test-only patiotest.html patiodecortest.html`: both PASS (collision to the screen wall,
furniture/crowns inside the screen walls).
