# Gräs vid skolorna — #1813

Kodrevision: `a241d1badcb71238bbe5ae00a85f460bb5b8bd47`, verifierad ovanpå `48cf6fdd` (#1818, med fungerande skolgungor). Baslinjen är samma bas utan #1813-ändringen.

- `before-summer.png` och `after-summer.png`: samma juniöversikt före/efter. De platta klargröna ovalerna får samma grässtruktur, skala och tonvariation som terrängen runtomkring.
- `before-autumn.png` och `after-autumn.png`: exakt samma novemberöversikt före/efter. Skolgräset följer nu omgivningens höstton; sand och lek-/sportytor behåller sina färger.

Kamera/ljus: `?shot&at=195,15,40,-38,125&cloud=&month=6&day=2&time=13&freeze&weather=clear`, sedan månad 11 utan annan kameraförändring. Chromium 1248/SwiftShader, tre.js 0.170.0, lokal port 8937; `testkit.shot`, 1280×800, kvalitet 3 och skuggor. Alla fyra bilder öppnades och granskades.

Kontroller:

- `tools/browsertest.sh node tools/schoolgrasstest.cjs http://127.0.0.1:8937 docs/verification/1813 before` / `after`: sommar-/höstbilder, 0 sidfel. Samma vy: juni 321→322 draw calls, 816 967 trianglar både före och efter; november 321→322 calls, 820 175 trianglar både före och efter. Råa renderjämförelser: `render-metrics.json`.
- Slutligt kontrakt: `after --contract-only`, 5/5 PASS. Alla 51 510 faktiska access/lawn-positioner och normaler är identiska, liksom samtliga draperade källpolygoner/lift och andra skolparts. Lawn-materialet använder samma grässkala/UV, shader, färg och delade textur som standardterrängen i sommar och höst. Snö tar bort texturen och använder samma vita färg; sommar efter snö återställer samma map. Rådata: `before.json`, `after-contract.json`.

Det första säsongsprovet valde fel referens: den första seasonal-grass-materialinstansen hörde till gatans avsiktligt mörkare gräs, inte standardterrängen. Fixture-valet korrigerades till materialet med GRASS.summer; endast kontraktdelen upprepades. Produktkoden och de giltiga renderbilderna ändrades inte av den rättningen. Ingen misslyckad assertion redovisas som godkänd.

Fem befintliga lawn-poster (tre bas, två desktopdetaljer) flyttas från access till en east-lawn-batch, med exakt samma trianglar/höjder. Ett extra synligt batch-anrop; inga nya trianglar, texturer eller ljus. Inga breda prestanda- eller fysiska telefonpåståenden. Skolornas gungor från #1818, sand, lek-/sportytor, A/B/C/L, terräng och gånggränser ändras inte. Neutral gräs-/renderingport till publika projektet hanteras separat av dirigenten.
