# #1795: southern villas and terraced houses (Google 3D review 2026-11-02)

`side-by-side-<h>.jpg`: left Google 3D reference (`03_sodra_bebyggelse_<h>`), middle game before
(`spel-03_sodra_bebyggelse_<h>.png` from #1792), right game after. Same cameras and recipe as in
`docs/references/google-3d-2026-11-02/README.md` (`at` values of the "Used" column, feetY = alt - 50).
Camera positions match only roughly (+-10-20 m); all colours and pitches are *guess* values read by eye.

Change: each villa/terrace and each white Sankt Lars väg house takes one entry from a small palette (facade, roof colour,
roof rise) chosen by a hash of its OSM id (`SITE.south.villas` / `whiteHouses` in `src/config.js`). No new geometry or draw calls.

Measured (headless Chromium, swiftshader, `&test`), south facade/roof vertex batches identical before/after:
9338 / 1942 triangles desktop, 9338 / 1726 `&lowmem`; draw calls desktop 760 (h000) and 112 (h180) both before and after.
`tools/southbackdroptest.html`: ALL PASS (75 checks). The "before" server ran on origin/main b79b5ab8, which also has #1790, so
whole-frame triangle counts differ by unrelated river changes; the south batches are the comparable figure.
