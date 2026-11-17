# #2051 Beards and moustaches that grow from the skin

Run: `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarbeardtest.cjs http://localhost:8151 docs/verification/2051`
(component page `tools/avatarbeard.html`; "före" = the branch base `1fe1aba1` served under `/base/`, "efter" = the checkout; SwiftShader
with 4× MSAA, NeutralToneMapping; dagsljus = sun over the camera's shoulder, motljus = low sun behind the subject). Looks: light, medium
and dark skin with black, grey and red beards; facial 1 = full beard, 2 = moustache, 3 = beard + moustache.

| Image | Shows |
|---|---|
| `nara.jpg` | six looks with beard + moustache: front, three-quarter and profile, before/after |
| `varianter.jpg` | every facial-hair option on light and dark skin: front, three-quarter, profile and from below (the neck line), before/after |
| `motljus.jpg` | backlight: three-quarter, profile and 1.5 m, before/after (the #2040 rim and flyaways kept) |
| `detalj.jpg` | the cheek edge and the moustache/mouth up close (≈ 0.2 mm/px), daylight and backlight, before/after |
| `mimik.jpg` | smile, talking and kiss (#2031 / #1122 / #1398) at the mouth, before/after, and three-quarter after |
| `tillbehor.jpg` | cap (forwards / backwards) + headphones with each option, front, three-quarter, profile in backlight |
| `samtal.jpg` | 1.5 m and 3 m at the game's pixel density (70° over 1080 px), daylight and backlight |
| `utan-msaa.jpg` | the no-MSAA fallback (`&test`, or a device without antialiasing): before/after, cheek edge, 1.5 m |
| `before/fore.jpg` (removed at closure) | the base alone: the three options front / three-quarter / profile / below / cheek edge / moustache |
| `beard.json` | triangles, beard triangles and draw calls (with and without MSAA) and the before/after timing runs |

Before: the shell was projected onto the skull/jaw ellipsoids and stood 4–17 mm off the real face (cheek edge 4–10 mm, the moustache
alone 8–15 mm, measured by ray probe), with a saw-toothed cheek line, a hard vertical edge in front of the ear, a lifted rim under the
chin, column stripes, and a moustache that floated as a rectangular strip with cut-off ends. After: every option lies on the head's real
skin (its faded edges within 1 mm, checked by `tools/avatarbeardtest.mjs`); the cheek line, the edge behind the jaw and the neck line thin
out into single hairs, the line under the nose and lip is crisp, the upper cheeks are a little patchy; hairs run down and converge towards
the chin and run outwards from the philtrum on a moustache; the moustache alone sits on the upper lip above the vermilion with drooping,
pointed ends. The #2041 oval opening, talking, smile and kiss work without gaps (the beard follows the skin), the cap and headphones are
unaffected, and in backlight the silhouette is hairs with the #2040 rim.

Checks: browser run PASS, no page or shader errors, one draw call per avatar with and without MSAA. `node --test tools/avatarbeardtest.mjs`
4/4 (density edges, moustache taper, the faded edges on the real skin for all three options, budget); all avatar/rigged node tests
(`tools/avatar*test.mjs`, `tools/rigged*test.mjs`) 197/197, including the #2002/#2012/#2040/#2043 head budgets.

Cost: triangles unchanged for facial 1 and 3 (888 / 964 incl. flyaways; head 8,156 / 8,232); the moustache alone 124 → 200 (+76, +1 % of
its 7,392-triangle head); budget `AVATAR_BEARD.budget` 1,000. No texture, attribute, varying, light, pass or draw call. Shader: one branch
for beard fragments (density from (a, e), up to 3 hashed hairs per lane pattern, both patterns only in facial 3's blend above the mouth; the
root density only near edges; no hair loop once lanes are sub-pixel). Same-page A/B on a 640 px full-frame beard close-up (beard branch on
vs off, median of 8 alternations): ×1.065 with MSAA, ×1.00 without. The before/after runs in `beard.json` (separate builds, host load
average 19–30) scatter from ×0.92 to ×1.68 and do not resolve the difference; a software rasterizer is a pessimistic proxy, not a Surface
(Iris 640) measurement, which was not available. Building a bearded variant adds a ray probe of the head (once per option and figure,
≈ 15–30 ms in node, then cloned).

Limits: without MSAA the uncovered beard is coloured as skin (`uBeardSkin` × cheek/lip/under-jaw tone, `skinShade` 0.7), which leaves a
faint band at the cheek edge on light skin; the hairs are stylised (≈ 0.26 mm wide) and the black beard's interior reads mostly as
shading; the hard line between the scalp's sideburn and the beard in profile is the scalp hairline (#2050), not the beard.
