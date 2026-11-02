# Sittplatser och skolgungor — #1818

Kodrevision: `24a8b503f924b7a99c71f6167c7059a569d88159`. Verifieringsbasen innehåller #1812 (`b7dbf569`); senare orelaterade leveranser ändrar inte dessa kontroller.

- `south-bus-bench-seated.png`: faktisk sittvy från glas-/metallkuren söder om bron, den bänk som visas i originalrapporten. Native E/C fungerar och återgår exakt till instegsplatsen.
- `bus-bench-seated.png`: faktisk sittvy från skolmurens hållplatsbänk efter native E; native C återgick exakt till instegsplatsen.
- `school-swing-seated.png`: faktisk rörlig sittvy från skolgungan efter en riktig touch på Handling; kameran följde sitsen och Res dig gick tillbaka till instegsplatsen.
- `school-swing-result.png`: utvändig resultatvy som gör den fungerande skolgungans två sitsar och kedjor lätta att bedöma.

Det finns 47 nya mål i den verkliga scenen: 33 dekorplatser (23 stolar, sju solstolar, tre soffor), två hållplatsbänkar, fyra skolbänkar och åtta gungsitsar. Dekorens ursprung, mark-/terrasshöjd och rotation kommer från respektive builders faktiska frame. Alla nya fast placerade sittmål återgår till sin sparade instegsplats; andra Rest-ägare och träning lämnas oförändrade.

Kontroller:

- `THREE_DIR=/tmp/lunden-roaddeps-1812/node_modules/three node tools/outdoorseatstest.mjs`: 15 PASS. Renderad desktop/phone-katalog, golv/kuddhöjd/soffrotation, LOD utan spökmål, exakt Rest-retur, rörlig/fryst/återgående gunga och 90°-ramens pick-/ritrotationsparitet. Skolgungor: en gemensam dynamisk batch, 288 trianglar som ersätter 96 statiska sitstrianglar, inga nya texturer eller ljus.
- `tools/browsertest.sh node tools/outdoorseatsbrowser.cjs http://127.0.0.1:8934 docs/verification/1818`: 9/9 PASS. Full inventering, 96 befintliga Rest-spotar och befintlig gårdsgunga, riktig E/C vid skolmuren samt touch-montering, rörelse och avstigning på skolgungan. Sitsen flyttade 0,21 m, kameragap 0, båda avstigningarnas positionsgap 0. Inga sidfel. Rådata: `result.json`.

- Riktad komplettering `--south-bus-only`: 6/6 PASS för glasbänken i originalrapporten, inklusive native E/C och positionsgap 0. Gungor kördes inte om. Rådata: `south-bus-result.json`.

Chromium 1248/SwiftShader, tre.js 0.170.0, lokal port 8934; bildfångst med `testkit.shot`, 1280×800, kvalitet 3 och skuggor. Bilderna öppnades och granskades. Touch kördes via riktiga DOM-taps i Chromium med touchstöd, inte på en fysisk telefon. Två första harnessförsök avbröts före touchkontrollen: `?shot` lämnade HUD-föräldern dold, och touchprofilen visade Starta i stället för desktopens Touch-knapp. Den korrigerade verifieringen går genom den verkliga synliga startknappen; ingen produktkod ändrades för dessa setupfel.

Hopfällda campingstolar i garageförvaring är inte uppställda sittplatser. Hus A/B/C/L, terräng, möbellayout och andra befintliga sittflöden ändras inte. Detta är interaktionsgameplay och förs inte över till publika projektet.
