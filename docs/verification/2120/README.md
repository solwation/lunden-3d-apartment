# #2120 Grannfönstrens kvällsvanor

`THREE_DIR=… BEFORE_SURROUNDINGS=<dd9088d0:src/surroundings.js> tools/browsertest.sh node tools/windowlights2120browser.cjs http://localhost:8320 OUT before|after`
(headless Chromium, SwiftShader, 12 november, klart väder, fryst klocka). "Före" serverar baslinjens `src/surroundings.js` (dd9088d0).
Varje bild: före till vänster, efter till höger.

| Bild | Visar |
|---|---|
| [fore-efter-court-17.jpg](fore-efter-court-17.jpg) | Hus A:s södra fasad från gården kl. 17: före lyser en tredjedel likadant, efter bara de tidiga |
| [fore-efter-court-20.jpg](fore-efter-court-20.jpg) | Kl. 20: de flesta tända, i varmt, neutralt och svalt ljus |
| [fore-efter-court-23.jpg](fore-efter-court-23.jpg) | Kl. 23: ungefär hälften kvar |
| [fore-efter-court-02.jpg](fore-efter-court-02.jpg) | Kl. 02: före helt mörkt, efter några nattugglor |
| [fore-efter-wide-17.jpg](fore-efter-wide-17.jpg) … [wide-02](fore-efter-wide-02.jpg) | Bred gatuvy mot Hus A–C och villan; blått tv-sken i några fönster kl. 20/23 |

Mätdata: [browser-before.json](browser-before.json), [browser-after.json](browser-after.json) (735 fönsterquads).

| Timme | Tända före | Tända efter | Blå tv |
|---|---|---|---|
| 17 | 36 % | 12 % | 0 |
| 20 | 82 % | 72 % | 63 |
| 23 | 35 % | 48 % | 33 |
| 02 | 0 % | 8 % | 0 |

Kontroller:
- `node --test tools/windowscheduletest.mjs`: 5/5 (samma nyckel ger samma vana, andel tända per timme på 4000 fönster
  12:0 % 16:4 % 17:11 % 18:24 % 20:74 % 21:80 % 22:67 % 23:44 % 0:28 % 1:14 % 2:7 % 4:1 % 6.5:19 %, mjuk ramp, färger och flimmer inom gränser,
  inga nya material/ljus i `buildWindowLights`).
- Browser: noll sid-/shaderfel; samma draw calls (552 gård, 476 bred) och programantal före/efter; 59 tv-fönster bytte färg efter 400 ms;
  full omräkning av alla fönster 0,2–0,3 ms.

Kostnad: inga nya ljus, draws, material, texturer eller shadervarianter (telefonprofilen oförändrad). CPU: omräkning högst var 0,01 h
spelklocka (~0,2 ms) och tv-flimmer var 0,12 s (bara tv-fönstrens färger, en uppladdning av befintlig instansfärgsbuffert, 735 × 12 byte).

Begränsningar: Hus L:s egna gårdsfönster (`neighborLitGlass`) har fortfarande ett gemensamt emissivt material; nivåerna är *guess*.
Additiva rutor mättas nära vitt, så färgskillnaden mellan varmt och neutralt är diskret.
