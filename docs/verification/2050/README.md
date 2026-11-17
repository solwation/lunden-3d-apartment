# #2050 Soft hairline

Run: `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarhairlinetest.cjs http://localhost:8150 docs/verification/2050`
(component page `tools/avatarhairline.html`; "före" = the branch base `37d922df` served under `/base/`, "efter" = the checkout; SwiftShader
with 4× MSAA, NeutralToneMapping; daylight = sun over the camera's shoulder, motljus = low sun behind the subject). Rows: light skin with
black, blond and grey hair, dark skin with black, blond and grey hair (medium skin with brown hair in the style/accessory sheets).

| Image | Shows |
|---|---|
| `kort.jpg` | short hair front, three-quarter and profile, before/after, daylight |
| `motljus.jpg` | three-quarter and profile in backlight, and the nape from behind, before/after |
| `halvnara.jpg` | the forehead at ≈ 0.3 mm/px, daylight and backlight (short) and long hair: single hairs thinning towards the skin, baby hairs, temple recessions |
| `detalj.jpg` | the forehead/temple edge up close (≈ 0.17 mm/px), daylight, backlight and the bun |
| `frisyr-long.jpg`, `frisyr-bun.jpg`, `frisyr-curly.jpg`, `frisyr-beanie.jpg` | every other hairstyle front / three-quarter / profile (daylight) and from behind (backlight) |
| `tillbehor.jpg` | cap, knitted hat (long hair), hat (curly), round and square glasses with headphones: still covering, no gaps |
| `samtal.jpg` | 1.5 m at the game's pixel density, daylight and backlight, short and long |
| `utan-msaa.jpg` | the no-MSAA fallback (`&test`, or a device without antialiasing): front, profile, detail, 1.5 m |
| [before/kort-fore.jpg](https://github.com/solwation/lunden-3d-apartment/blob/HEAD/docs/verification/2050/before/kort-fore.jpg) (removed at closure) | the base alone (front, three-quarter, profile) |
| `hairline.json` | triangles, hair triangles and draw calls (with and without MSAA), and the timing run |

Before: the scalp shell ended in a hard, polygonal and tufted edge against forehead, temples, sideburns and nape. After: the hair thins
over ≈ 9 mm into the skin as single hairs along the strands with short fine baby hairs at the forehead and temples, temple recessions,
sideburns that taper to a point and a soft nape, for every hairstyle (the long and curly curtains keep their own edges) and under the
beanie hairstyle's cuff. At 1.5 m the line reads as a soft gradient instead of a cut edge. Hats, glasses and headphones cover as before.

Checks: browser run PASS, no page or shader errors, one draw per avatar with and without MSAA. `node --test tools/avatarhairlinetest.mjs
tools/avatarheadtest.mjs tools/avatarbrowtest.mjs tools/riggedavatartest.mjs tools/avatarcustomizertest.mjs tools/avatarswaytest.mjs
tools/avatarexprtest.mjs tools/avatareyestest.mjs tools/avatarlidstest.mjs` 68/68 (coverage profile, line shape, the shell under the line in every
style, flyaways not rooted in the band, no new attribute; the #2002/#2012/#2040/#2043/#2047 budgets).

Cost: 0 triangles (the shells keep their columns, `AVATAR_HAIR.cols`), no texture, attribute, light, pass or draw call; one uniform.
Shader: one branch for hair fragments within ≈ 16° of the line (crown and curtains skip it): a 14-step segment search, three segment
distances and a 5-cell hashed hair loop. SwiftShader best-of-three after/before over four runs on a host at load average 15–26: full-frame
forehead close-up ×1.26, ×1.68, ×1.20, ×2.00; nine figures at 3–6 m ×1.16, ×1.26, ×1.11, ×1.40 — the base itself scattered ×2 between
repeats, so only "measurably more in a frame full of hairline" can be read from it; a software rasterizer is a pessimistic proxy, not a
Surface (Iris 640) measurement, which was not available.

Limits: without MSAA the edge is a dithered cut-out (stable per pixel, grainy up close); hairs are stylised (≈ 0.2 mm wide) and run along
the meridians (no swirl at the crown's parting); the long and curly curtains' own front edges (#2053/#2054) and beard edges (#2051) are not
softened here; the customizer's 2D face sketch is unchanged.
