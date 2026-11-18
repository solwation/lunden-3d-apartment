# #2111 Valbar hudvariation: fräknar, födelsemärken, ojämn ton

Komponentsida `tools/avatarskinvar2111.html`, körd av `THREE_DIR=… node tools/avatarskinvar2111browser.cjs http://127.0.0.1:8311 docs/verification/2111`
(headless Chromium, SwiftShader). "Före" serverar baslinjens `src/avatar.js`, `src/config.js` och `src/customizer.js` (33dc86f8), där de nya
utseendefälten okända och ignoreras. Samma utseende (frö 2) med variationen av / låg (Fräknar: Lite) / hög (Fräknar: Mycket, Födelsemärken, Lätt ojämn hudton).

| Bild | Visar |
|---|---|
| [fore-efter-spegel-hud1.png](fore-efter-spegel-hud1.png) | Spegelns egen förhandsvisning (`AvatarPreview`, ansiktsnärbild, 330 × 465 px), ljus hy: före överst, efter under; av / låg / hög |
| [fore-efter-spegel-hud4.png](fore-efter-spegel-hud4.png) | Samma med mörkare hy: variationen syns knappt (diskret, multiplicerar albedot) |
| [fore-efter-narbild-hud1.png](fore-efter-narbild-hud1.png) | Spegelavstånd (~0,95 m, 960 × 600): av / låg / hög sida vid sida, ljus hy |
| [fore-efter-narbild-hud4.png](fore-efter-narbild-hud4.png) | Samma, mörkare hy |

Enskilda rutor: `preview-*.png`, `mirror-*.png` (efter) och `before/` (före). Mätdata: [skinvar.json](skinvar.json).

Kontroller:
- `node --test tools/avatarskinvartest.mjs`: 5/5 (deterministisk placering även efter avkodning hos en annan spelare, fler fräknar behåller de färre,
  ögonlock/läppar/bryn hålls fria för alla 7 frön × två hudtoner, av som standard, `c`-taggens rundtur och att största möjliga trådkod är ≤ 60 tecken).
- `node --test tools/avatarcustomizertest.mjs`: 25/25 (out-of-range-exemplet ändrat från `c99` till `c999`, eftersom `c8`–`c895` nu bär hudvariationen).
- Browser: noll sid-/shaderfel; samma draw calls, trianglar och texturer före och efter i alla vyer; A/B hög mot av i samma program
  inom brus (värden i skinvar.json; värden starkt påverkade av hög värdlast, load ~12).

Kostnad: inga nya meshar, texturer, attribut, draw calls eller nätverksfält; en uniform-array `uSkinSpot[28]` + `uSkinVar` per avatarmaterial,
satt bara när utseendet sätts. Av: ett uniformtest per fragment. På: upp till 28 iterationer (~8 ALU var) bara på bar huvudhud framifrån.

Begränsningar: fräknarna projiceras framifrån på huvudets bindningsläge (inte på kinder som vänder åt sidan eller på armar/axlar); gamla klienter
som ser en `c` ≥ 8 tappar ögonfärgen (och visar ingen variation); 7 placeringsfrön per hudton.

Publicering: Pages/Worker success på `a859a1c`; före-bilder borttagna vid stängning och visas från den commiten.
