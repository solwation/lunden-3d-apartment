# #2055 Layered short hair and a wound bun

Run: `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarshorthairtest.cjs http://localhost:8155 docs/verification/2055`
(component page `tools/avatarshorthair.html`; "före" = the branch base `28d532d1` (after the #2051 beard, #2053 long locks and #2054 curls); the commit was then rebased onto `13e9f85d` (#2060, the nose's width profile only, no hair code) and the node tests rerun there served under `/base/`, "efter" = the checkout; SwiftShader
with 4× MSAA, NeutralToneMapping; dagsljus = sun over the camera's shoulder, motljus = low sun behind the subject). Rows: light skin with
black, blond and red hair, medium skin with brown hair, dark skin with black and grey hair (three of them in the backlight and accessory sheets).

| Image | Shows |
|---|---|
| `kort.jpg` | short hair front, three-quarter and profile, before/after, daylight: overlapping locks break the outline, a faint side parting |
| `kort-bak.jpg` | short hair from behind, from above (the crown's layered locks and the parting) and the nape close up (tufted, uneven edge) |
| `kort-motljus.jpg` | short hair in backlight: three-quarter, profile and from behind |
| `knut.jpg`, `knut-bak.jpg` | the bun front / three-quarter / profile, from behind and above in daylight, profile in backlight: twisted ropes coiled round a darker core |
| `tillbehor.jpg` | short hair with cap, backwards cap, knitted hat, hat and headphones: still covering (the nape's tufts show below a cap) |
| `tillbehor-knut.jpg` | the bun with cap, knitted hat, hat and headphones |
| `skagg.jpg` | short hair with beard + moustache (front, three-quarter, profile in backlight) and the bun with a full beard: the #2051 beard unchanged beside the new hair |
| `andra-frisyrer.jpg` | curly and long hair (three-quarter in daylight, from behind in backlight): unchanged by #2055 |
| `samtal.jpg` | 1.5 m at the game's pixel density: short hair in daylight and backlight, the bun |
| `knut-rorelse.jpg` | the bun while walking (0.5 s), stopping (1.05–1.35 s) and turning (1.8–2.3 s): the #2014 sway moves the whole wound bun |
| `shorthair.json` | triangles, head and hair triangles, draw calls, the bun's sway offsets and the timing run |

Before: short hair and the bun's scalp read as one smooth shell (a helmet), the bun as a smooth ball on a torus. After: short hair has three
tiers of overlapping locks along the shell's strand flow whose lifted tips break the silhouette front, side and back; the nape and the hair
over the ears end in irregular tufts; the side parting is a groove where the scalp faintly shows; the bun is two three-ply ropes wound round
its axis over a darker core, with flat combed-back locks on its thin shell. Length, colour and character of both styles are kept; long,
beanie and curly styles are unchanged (identical triangle counts).

Checks: browser run PASS, no page or shader errors, one draw call per avatar in every variant, the bun sways (offsets up to 12 mm).
`node --test tools/avatarshorthairtest.mjs tools/avatarhairglosstest.mjs tools/avatarhairlinetest.mjs tools/avatarheadtest.mjs
tools/avatarswaytest.mjs tools/avatarnosetest.mjs tools/avatarcustomizertest.mjs tools/riggedavatartest.mjs tools/avatarbrowtest.mjs
tools/avatarlidstest.mjs tools/avatarexprtest.mjs tools/avatareyestest.mjs` 84/84 (budget, bumpy outline, tufts under the shell, the bun's
ropes coiling round the gloss axis inside the sway radius; the older budgets leave #2055's own triangles out, as for #2043/#2047/#2048).

Cost: head triangles (face parts 1–29, flyaways excluded) short 8916 → 9576 (+660, +7.4 %), bun 9276 → 10092 (+816, +8.8 %; ropes 720 +
core 80 + combed locks 280 − old ball 120 and torus 144); other styles unchanged. No texture, attribute, light, pass or draw call; one
uniform (`uShortHair`). Shader: the parting's few ALU ops for hair fragments of short hair, and one term in the #2050 line distance.
SwiftShader best-of-three after/before over four runs (the last on `28d532d1`): three-quarter close-up of short hair ×1.26, ×0.85, ×1.28,
×2.08; nine figures at 3–6 m ×0.99, ×0.92, ×1.09, ×1.58 — the base alone scattered ×1.6 between repeats on a heavily loaded host, so no
reliable ratio can be read; a software rasterizer is a pessimistic proxy, not a Surface (Iris 640) measurement.

Rebase note: on top of #2053, whose soft line stops thinning well below the line (hanging locks), the lowered short shell showed
as loose strips under the nape; `hairlineColor` now takes `below` (short hair only) so its cut-off covers that shell (`kort-bak.jpg`).

Limits: the locks are stylised cards (three vertices across) and can show a thin bright edge at grazing angles; the parting is a tint
(no real gap to the skin) and only on short hair; the bun's band (in the top's colour) now shows a sliver below the coil from behind; LOD
avatars are not given a cheaper variant here.
