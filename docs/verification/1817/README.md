# Hela hästhagen till fots — #1817

Kodrevision: `5b97b6725ac78cf9546262d7232c23d6d19373fe` på basen `b7dbf569` (vägfortsättningarna från #1812). Baslinjens beteende kommer från oförändrad WALK.x0 −260 i `1be3007d`; #1812 ändrar inte gånggränsen eller hagkollisionen.

- `before-west-blocked.png`: den kontinuerliga promenaden från stättan stannar vid en osynlig gräns x −259.78, trots att hagen fortsätter västerut.
- `after-west-reached.png`: samma promenad kommer fram till västpartiet x −272.32, z 310.48. Kameran står på den faktiskt nådda platsen; ingen teleport eller flygning användes mellan hagpunkterna.

Bilderna är olika nådda platser under samma gångrutt, inte en kosmetisk före/efter-jämförelse. Staketet är oförändrat. Det går nu att följa hela den inhägnade gångytan, medan staket, stängd grind, träd och å fortfarande är hinder.

Kontroller, Chromium 1248 / SwiftShader, lokalt på port 8933, tre.js 0.170.0:

- `tools/paddockgeotest.mjs` med den pinnade tre-resolvern: 11/11 godkända, inklusive att hela staketlinjen med kroppsmarginal ligger inom WALK och före terrängkanten.
- `THREE_DIR=/tmp/lunden-roaddeps-1812/node_modules/three node tools/roadendstest.mjs`: 24/24 godkända med den ändrade WALK-gränsen (vägändarna beräknas dynamiskt och ligger fortfarande bortom dimman).
- `tools/browsertest.sh node tools/paddockwalktest.cjs http://127.0.0.1:8933 docs/verification/1817`: 9/9 godkända. En initial start utanför befintlig stätta, sedan 20 134 produktionsuppdateringar av Player via nord (−164.5,214.5), väst (−272.5,310.5), syd (−265,327), tillbaka och ut över stättan. Inga flyg-/vatten-/byggnadsräddningshändelser eller sidfel. Försök vidare västerut stoppas av själva staketet vid x −274.11, innanför den nya yttergränsen −285. Stängd grind och vattenskydd kvar. Råresultat: `baseline.json` och `result.json`.

`testkit.shot` fångade 1280×800 med kvalitet 3 och skuggor; bilderna öppnades och granskades. Hela testet gick via browser-wrappern (slutkörningens topp 1465 MiB). Ingen fysisk telefon eller generell prestandaförbättring är verifierad. Enda produktändringen är WALK.x0 −260 → −285, fortfarande 65 m innanför ritad terräng. Hus A/B/C/L ändras inte. Neutral navigation överförs separat av dirigenten; ponnyer/personligt gameplay överförs inte.
