# Vägar bort i dimman — #1812

Kodrevision: `20ced5fa0e40df43d664a563bb3f66fb4ece0d46`. Före: `1fa9677f` (oförändrad baskod efter rapportimporten).

- `before-school-air.png`: Sankt Lars väg slutar synligt mitt i gräset nordväst om skolan.
- `after-school-air.png`: samma kamera visar väg och båda trottoarerna vidare ut i dimman. Den sista park-skarvjusteringen berör andra stråk utanför denna bild; jämförelsevyn är oförändrad.
- `after-school-ground.png`: färdig markvy längs fortsättningen och båda trottoarerna efter samtliga ändringar.

Flygkamera: `?shot&at=-215,-230,47,-25,65&cloud=&month=6&time=13&freeze&weather=clear`; markkamera: `?shot&at=-230,-288,83,-3` med samma tid/väder. Chromium 1248, SwiftShader, 1280×800, `testkit.shot` (kvalitet 3 och skuggor), lokal källa på port 8931 med tre.js 0.170.0. Klart väder: dimma 45–650 m. Bilder öppnade och granskade.

Kontroller:

- `THREE_DIR=/tmp/lunden-roaddeps-1812/node_modules/three node tools/roadendstest.mjs`: 24 kontroller godkända. Källpunkter/bredder bevaras, sju huvudändar och fondstråk slutar minst 700 m från hela WALK, skarvar och båda trottoarsidor stämmer. Faktiskt emitterade gamla/nya trianglar täcker 336 prover med 25 cm mellanrum vid parkklippen utan glipa. Planmarkens komponentgeometri: 4 358 tillagda trianglar i befintlig batch.
- Befintligt `edgebackdroptest.mjs` med tre.js 0.170.0: alla 36 kontroller godkända.
- Riktiga appen, flyg- och markvy: inga sidfel. Flygjämförelsen hade 23 draw calls både före och efter. Slutlig markvy: 22 draw calls. Inga nya material eller ljus. Detta är ingen prestandacertifiering för fysisk telefon.

Alla nya fortsättningar efter den sista kartpunkten är antagna tangenter, inte verifierad geografi. Promenadgränser och hus A/B/C/L ändras inte. Publik port spåras separat i kvarteret-lunden #230.
