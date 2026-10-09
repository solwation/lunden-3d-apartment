# Issue 589 — lighter campus facades on phones

Phones and tablets (`lowMemory` in `src/lowmemory.js`, the same detection as #585; `&lowmem` forces it) build the east
campus (`src/campusfacades.js`) and the school (`src/schoolfacade.js`) at a `lite` level (`CAMPUS_LOD` in `src/config.js`):

- dropped: dentils, quoin joints, the two side mullions and all but one rail of the glazing bars;
- merged: each stepped cornice becomes one profile over the same height at its deepest step (`oneProfile`);
- flattened: window sills and crowns are front planes instead of boxes;
- coarser: arches in 3 segments (6–10 on desktop), clock dials in 12 (16), roofs on a 2× coarser grid.

Unchanged: every body, section, eave and ridge height, roof outline, colour, brick texture, every window (count and
position), the risalit, pediment, great window and the clock tower. Same eight batches; no new draw calls.

## Numbers

Playwright Chromium / SwiftShader. Before = 21df3a2, after = this change.

`tools/eastbackdroptest.html` (east backdrop triangles): desktop 75 351 → 75 351 (budget 78 000), phone
(`?lowmem`) 75 351 → 33 676 (budget `CAMPUS_LOD.maxTris` 36 000, *guess*; ~21 k before #576). The new check builds every
campus facade at both levels: same windows, eaves, ridges and tower height, 23 854 of 59 085 triangles. ALL PASS both ways.

`tools/perfcount.html?lowmem&w=390&h=844` (phone frame) triangles, calls unchanged at every spot:

| Spot | Calls | Before | After |
|---|---|---|---|
| start | 186 | 52 259 | 52 259 |
| kitchen | 182 | 470 709 | 429 034 |
| living | 231 | 567 491 | 525 816 |
| upstairs | 220 | 615 581 | 573 906 |
| patio | 85 | 412 837 | 371 162 |
| courtyard | 82 | 422 039 | 380 364 |
| garage | 109 | 567 215 | 525 540 |
| east | 44 | 338 183 | 296 508 |

Desktop `tools/perfcount.html`: identical before and after (e.g. kitchen 341 calls / 619 646 triangles).

## Screenshots

15 July 12:00, clear. Desktop detail vs the phone level in the same 1280×800 frame:
[byggnad 8](b8-desktop.jpg) / [phone level](b8-phone-detail.jpg),
[school](school-desktop.jpg) / [phone level](school-phone-detail.jpg),
[overview](overview-desktop.jpg) / [phone level](overview-phone-detail.jpg).
Phone frame 390×844 before / after: [Klockhuset](b1-phone-before.jpg) / [after](b1-phone-after.jpg),
[Sankt Lars väg](street-phone-before.jpg) / [after](street-phone-after.jpg).

Close up the phone level shows plainer windows (four panes instead of twelve) and a single cornice; from the street and
the flat the buildings read the same.
