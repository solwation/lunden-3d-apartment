# #2061 The beard's sideburn meets the hairline's sideburn

Run: `PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/avatarsideburntest.cjs http://localhost:8161 docs/verification/2061`
(the #2051 component page `tools/avatarbeard.html`; "före" = origin/main `37f40b65` (after #2053 long hair, #2054 curls, #2055 short hair,
#2058 kiss, #2060 nose width; every src module this branch changes served from it under `/base/`), "efter" = the rebased checkout;
SwiftShader with 4× MSAA, NeutralToneMapping; dagsljus = sun over the camera's shoulder, motljus = low sun behind the subject). Rows: light
skin with black or blond hair, dark skin with black or grey hair; f1 = full beard, f2 = moustache, f3 = beard + moustache.

| Image | Shows |
|---|---|
| `kort.jpg` | short hair: every facial-hair option, the sideburn in profile and three-quarter from behind, before/after |
| `langt.jpg` | long hair, the same views |
| `lockigt.jpg` | curly hair, the same views |
| `motljus.jpg` | backlight: short, curly and long hair with beards |
| `tillbehor.jpg` | cap + headphones with short, curly and long hair |
| `narbild.jpg` | the sideburn up close, in profile and the #2051 profile view |
| `oversikt.jpg` | the #2051 profile and three-quarter views and 1.5 m |
| `sideburn.json` | triangles, beard triangles, draw calls and the before/after timing runs |

Before: the full beard stopped at a horizontal top with a hard, nearly vertical back edge in front of the ear (the grid's edge above the
jaw had no feather), and a strip of skin lay between it and the scalp's tapering sideburn (#2050): the hair's V came down to the beard's
top with skin on both sides of it. After: behind the cheek the beard's top follows the visible hairline a few degrees inside the hair, so
the beard is dense where the hair thins and the hair covers where the beard thins; the sideburn reaches up under the hair on both sides of
the V and the back edge in front of the ear thins out over 9°. The beard thins to 12 % of its thickness at the line, so it lies under the
scalp shell instead of on it. Long and curly hair's curtains cover the sideburn as before; the moustache alone has no sideburn and is
unchanged; the cap and headphones cover as before.

Checks: browser run PASS, no page or shader errors, one draw call per avatar. `node --test tools/avatarsideburntest.mjs` 4/4 (the mapped
hairline against a ray probe of the real head, dense up to the line and nothing 14° inside the hair, the cheek unchanged and a feathered back
edge, flat under the hair shell); all avatar node tests (`tools/avatar*test.mjs` + `tools/riggedavatartest.mjs`) 210/210 on the rebased revision.

Cost: triangles unchanged for every option (the same 32 × 12 grid, its top rows reaching higher; integrated head 10,728 / 10,040 / 10,804
for f1 / f2 / f3; beard 888 / 200 / 964). No texture, attribute, varying, light, pass or draw call. Shader: one 21-entry constant table
lookup in the beard's top function and a changed back-edge factor (a few ALU operations per beard fragment). The before/after runs in
`sideburn.json` (×1.08 close-up, ×1.08 crowd, SwiftShader under shared load) are within the scatter #2051 recorded for the same harness
(×0.92 – ×1.68); a software rasterizer is a pessimistic proxy, not a Surface (Iris 640) measurement.

Limits: the beard and hair are shaded differently (a matte undercoat under the beard, gloss on the hair), so where they overlap a dark
beard can read slightly darker than the hair's lit V; Olof's grey beard on dark hair keeps its colour contrast. Curly hair's curtain still
leaves its own skin wedge below the ear behind the jaw (not the sideburn, unchanged). The hairline is mapped at a fixed 9.8 cm skin
radius (≈ 2° off at the temple, where the sideburn is not used; the test bounds it).
