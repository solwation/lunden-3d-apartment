# #2046 Brows of hairs

Run: `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarbrowtest.cjs http://localhost:8146 docs/verification/2046`
(component page `tools/avatarbrow.html`; "före" = the branch base `b5cb5c95` served under `/base/`, "efter" = the checkout; SwiftShader
with 4× MSAA, NeutralToneMapping; daylight = sun over the camera's shoulder, motljus = low sun behind the subject). Rows: light skin with
blond and red hair, medium with black and grey, dark with black and grey (brows follow the hair colour).

| Image | Shows |
|---|---|
| `nara.jpg` | face close-up (≈ 0.46 mm/px) front and three-quarter, before/after |
| `detalj.jpg` | one brow up close (≈ 0.17 mm/px), before/after, daylight and backlight: single hairs, dense blunt head by the nose, sparse thin tail, soft edges |
| `reglage-mimik.jpg` | after: the brow slider's thickness min/max and height min/max, surprise (before/after) and grimace (three-quarter) |
| `samtal.jpg` | 1.5 m and 3 m at the game's pixel density (70° over 1080 px), daylight and backlight, before/after |
| `utan-msaa.jpg` | the no-MSAA fallback (`&test`, or a device without antialiasing): close-up before/after, detail, 1.5 m |
| [before/nara-fore.jpg](https://github.com/solwation/lunden-3d-apartment/blob/b8ece3c8/docs/verification/2046/before/nara-fore.jpg) (removed at closure) | the base alone (close-up, three-quarter, detail) — removed when the issue is resolved |
| `brow.json` | triangles, brow triangles and draw calls (with and without MSAA), and one timing run |

Before: solid, plastic tubes with hard edges standing 2.6 mm off the forehead. After: a thin layer 0.7 mm above the skin whose
hairs rise steeply by the nose and lie down outwards, densest at the head and thinning towards the tail, with single hairs against the
skin; they keep the hair colour, the slider and the #2031 expressions (surprise lifts them, the grimace draws them in), and at 1.5 m they
read as a soft brow of about the old weight (no shimmer: the hairs fade to their mean coverage once several share a pixel).

Checks: browser run PASS, no page or shader errors, one draw per avatar in both MSAA and no-MSAA pages. `node --test
tools/avatarbrowtest.mjs tools/avatarheadtest.mjs tools/avatarexprtest.mjs tools/avatareyestest.mjs` 18/18, `avatarcustomizertest` + `riggedavatartest` 35/35 (budget, the slider pivot's
indexed order, outward winding, taper, no new attribute; the #2002/#2012/#2040 head budgets).

Cost: brows 96 → 168 triangles per avatar (+72, ≈ +2 % of the ≈ 3,600-triangle face/head parts; budget `AVATAR_BROW.budget` 200);
no texture, attribute, light, pass or draw call. Shader: one fragment branch for brow fragments only (3 hashed hair tests, a few dozen
ALU) and one line in the no-MSAA roughness. SwiftShader best-of-three after/before over four alternating runs on a host at load average
14–23: full-frame face close-up ×1.03, ×1.12, ×0.84, ×0.87; nine figures at 3–6 m ×1.06, ×1.18, ×1.14, ×0.82 — within the noise; a
software rasterizer is a pessimistic proxy (masked branches), not a Surface (Iris 640) measurement, which was not available.

Limits: without MSAA the uncovered brow is coloured as skin (`uBrowSkin` × the eye-socket tone), which leaves a faint lighter arc
under the brow on light skin in extreme close-up; hairs are stylised (≈ 0.24 mm wide, about 3× real) and only rise outwards (no
downward-combed upper row); the thickness slider scales the hair pattern with the brow (thick brows look softer); the customizer's 2D
face sketch is unchanged.
