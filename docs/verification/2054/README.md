# #2054 Curly hair as curl volumes

Run: `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarcurlstest.cjs http://localhost:8154 docs/verification/2054`
(component page `tools/avatarcurls.html`; "före" = the branch base `1a5fab00` served under `/base/` (its `src/avatar.js` + `src/config.js`, the #1377
tubes), "efter" = the checkout; SwiftShader with 4× MSAA, NeutralToneMapping; daylight = sun over the camera's shoulder, motljus = low sun
behind the subject). Hair length: "lockigt" the middle, "kort lockigt" the shortest, "långt lockigt" the longest setting.

| Image | Shows |
|---|---|
| `lockigt.jpg` | front, three-quarter, profile and back in daylight, before/after; light and dark skin with black, brown and blond hair |
| `motljus.jpg` | the same views and looks in backlight |
| `kort.jpg`, `langt.jpg` | shortest and longest hair length: front, three-quarter, profile (daylight) and back (backlight) |
| `nara.jpg` | the forehead up close (daylight, backlight) and 1.5 m at the game's pixel density (long) |
| `tillbehor.jpg`, `tillbehor-2.jpg` | cap, cap backwards, knitted hat, hat, headphones, knitted hat + headphones |
| `mossa-kant.jpg` | the knitted hat's, cap's and hat's lower edge from behind up close: nothing pokes through |
| `sway.jpg` | a 120° turn and stop with long curly hair, 0.15 – 1.6 s: the curtain swings out and settles, the curls move with it |
| `curls.json` | triangles, hair triangles and draw calls per variant, the sway offsets, and the timing run |

Before: curly hair was 24 tubes winding over a smooth shell plus tube ringlets on the curtain; the shell showed between them and the
whole read as worms. After: packed curl clumps of varied size, elongation and direction, small and tight along the hairline and at the
nape, larger over the crown, half sunk into a thinner, darker shell, with ringlets hanging from the curtain past an uneven hem; a fine
coil-and-strand pattern (colour and shading normal) replaces the straight meridian strands, and the strand gloss breaks into short
glints along the curls. The silhouette is uneven; the shell no longer reads as a smooth surface. Hats and the headphones' band cover
the curls (their reach is capped near the knitted hat's edge); the hair-length slider moves curls by their centres, so short hair has
round curls rather than squashed discs.

Checks: browser run PASS (no page or shader errors, one draw per avatar, the curtain sways). `node --test tools/avatarcurlstest.mjs
tools/avatarheadtest.mjs tools/avatarnosetest.mjs tools/avatarhairlinetest.mjs tools/avatarhairglosstest.mjs tools/avatarswaytest.mjs
tools/avatarbeardtest.mjs tools/riggedavatartest.mjs …` 107/107 (budget, whole clumps anchored at their centre and never read as
flyaways, reach under headwear, curls above the soft front hairline, no new attribute, deterministic builds; the older #2002/#2012/#2048
budgets leave the curls' growth over the 5040 tube triangles out, as for #2043/#2047/#2048).

Cost: curly head-bone triangles 14,796 → 15,996 (+8.1 %, budget ≤ +10 %; 130 clumps × 48 = 6,240 in place of 5,040 tube triangles),
whole figure 20,616 → 21,816; the other hairstyles unchanged. One uniform (`uCurly`); no attribute, texture, light, pass or draw call.
Shader: curly hair fragments evaluate the field four times (colour once, the normal three times) — a few sines each — and the gloss
direction one rotation. Timing (`curls.json` `cost`, best-of-three after/before, SwiftShader at 640 px on a host shared with other
browser jobs): a full-frame curly head close-up ×1.25 (529 → 658 ms), nine curly figures at 3–6 m ×1.44 (1008 → 1448 ms), the base
itself scattering ×1.5 between repeats (1008–1511 ms) — so only "measurably more in frames full of curly hair" can be read from it;
a software rasterizer is a pessimistic proxy, not a Surface (Iris 640) measurement, which was not available.

Limits: the curls are stylised (domain-warped pattern, no individual hairs); the curly curtain's flat sheet still forms its front edge
behind the ear in profile; flyaways still grow from the curls; up to the #1966 far figure (from 30 m, unchanged) the full curls are drawn;
the customizer's 2D sketch is unchanged.

| `integrerad.jpg` | the conductor's rerun of `lockigt.jpg` on the revision rebased onto #2053 long hair, before = `2137f52d` |
