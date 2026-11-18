# Betongplattornas ljusreaktion — #2074

Jämförelsebas: **6e1576aa078b70730e73bb4ffb805dc32e1b3959**.
`browser.json` binder den första gröna komponentkörningen till exakta produkt-/fixturhashar.
`portik-retake.json` binder de slutliga två portikvyerna till den rättade fixturen och
oförändrad produktkod. `selection.json` redovisar exakt bevarande mot basen.

## Bilder och resultat

Tre egna parade JPG-ark, **före vänster / efter höger**, öppnade och granskade:

- `patio-paired.jpg`: faktisk World-uteplats nära och från gånghöjd.
- `terrace-portik-paired.jpg`: faktisk L1208-takterrass överst, portikgolvet underst.
- `snow-paired.jpg`: snötäckt World-uteplats överst, skyddat portikgolv i januari underst.

Varje ruta är native **1100×720**, utan skalning på **2200×1476** med 36 px rubrikrad.
Fogar och plattkanter får låg ljusreaktion; betongens befintliga färgprickar förblir
plana färgdetaljer. Kulör, halvförband, 40 cm-plattor och alla gång-/byggnadshöjder består.
Snötäcket visar fortsatt en slät yta. Portiken behåller sin synliga plattläggning även
på vintern. Bump skapar ingen verklig förskjutning, silhuett eller parallax.

Den första granskningen upptäckte att portikens bboxcentrum hamnade bakom ett hörn.
Ett första kameraomtag visade sommargolvet, men vintervyn skymdes fortfarande av annan
arkitektur. Därför korrigerades bara de två portikvyerna vidare: de visar nu det
verkliga emitterade portikgolvet separat, med övriga meshar tillfälligt dolda lika
före/efter. Inga illustrativa golv byggs och ingen produktkod ändrades. Övriga gröna
uteplats-/terrass-/snö-/sommaråterställningsprov kördes inte om. En separat start
stoppades direkt av avslutad lokal server (connection refused); servern återstartades
för samma smala omtag. Slutligt portikomtag passerade första körningen med isoleringen.

Bara nedre portikrader ersattes; de tidigare gröna övre raderna ritades åter i native
pixlar och JPG-arken kodades om. Inga proportioner eller utsnitt skalades. Dåliga
portikbilder sparas inte separat. Historiska portikkameror i första browser.json är
ersatta av `portik-retake.json` och används inte som visuellt bevis.

## Tre kontrollgrupper

1. `node --test tools/pavingsurfacetest.mjs`: **3/3 pass** (`node.txt`): meterskala,
   halvförband/repeat, mjuk övergång, strukturella kanaler oberoende av färgbrus,
   cachad linjär karta och verklig exposed/sheltered snöhantering.
2. `node --check` för hjälpare och två ändrade konsumenter, `git diff --check` samt
   exakt selektionskontroll: all tidigare config är byteidentisk utanför det egna
   PAVING_SURFACE-blocket. World/exterior är exakt basen med bara import/materialanrop
   utbytta. Hela patio.js, seasons.js och data/plan.json är oförändrade.
3. Egen matchad Chromium/SwiftShader-körning via värdens wrapper, MSAA, DPR1,
   NeutralToneMapping. Faktisk World.M.patio/plate och buildExterior med originalets
   egna plan/fönster/material; dekor dold lika för att inte täcka plattorna. Noll sid-,
   shader- eller konsolfel och noll externa anrop. Sju provvyer per fas inklusive
   snö/sommaråterställning; endast de två skymda portikvyerna rättades separat.

Originalet är en statisk ES-module-sajt utan npm-byggsteg. Inget nytt globalt test,
World-start, mobilprofil eller äldre browserregression ingick. Browserpeakar:
**623 MiB** ursprunglig körning, **595 MiB** slutligt portikomtag, båda under 4 GiB.

## Bevarande och renderkostnad

Befintliga färgkartor för World och portik har exakt samma pixel-SHA256, dimensioner
384×384 och repeat före/efter. All emitterad geometri är ändlig; attribut/index,
begränsningslådor och **15 542 928 geometriattribut-/indexbyte** har identiska hashvärden.
Det inkluderar byggd exteriör även när dekor är dold. Alla geometri- och meshfunktioner,
öppningar, collision/walkingSupport och World-placeringar är orörda.

| Faktisk komponentvy | Ritanrop före/efter | Trianglar före/efter |
| --- | ---: | ---: |
| World uteplats nära | 10 / 10 | 15 078 / 15 078 |
| World uteplats gånghöjd | 24 / 24 | 59 550 / 59 550 |
| L1208-takterrass | 36 / 36 | 62 546 / 62 546 |
| Snö på World uteplats | 24 / 24 | 59 550 / 59 550 |
| Återställd sommar | 24 / 24 | 59 550 / 59 550 |
| Isolerat faktiskt portikgolv sommar | 1 / 1 | 68 / 68 |
| Isolerat faktiskt portikgolv vinter | 1 / 1 | 68 / 68 |

En ytterligare textur laddas upp; båda materialens bump/roughness binder samma karta.
Portikens isolerade vy har texturer **1 → 2**, geometrier **1 → 1**; även de andra
matchade vyerna har samma geometriantal och exakt en ytterligare uppladdad textur.
Inga nya draw, pass, lampor, geometrier eller återkommande uppladdningar i produkten.
Native Standard-shader gör bump-samplingar (tre höjdvärden) och roughness-sampling
med tillhörande UV-data. Ingen FPS-, GPU-tids- eller fysisk-enhetsprestanda påstås.

## Skala, minne och snö

En delad **384×384 RGBA8 DataTexture**: R strukturell foghöjd, G absolut roughness,
linjär utan färgrymdsomvandling, repeat över samma 2,4×2,4 m (6×6 plattor), flipY
registrerad mot CanvasTexture, trilineära mippar och anisotropi8.
Tillkommande **589 824 RGBA8-basbytes / 786 424 nominella mipbytes** (cirka 0,75 MiB),
plus **589 824 bytes** CPU-array. Mipnivåerna summeras från faktisk storlek till 1×1;
föraroverhead och annan GPU-allokering ingår inte.

PAVING_SURFACE innehåller visuella antaganden: 1,5 mm bump, 2 mm nominell bevel med
minst 1,25 texlar vid den befintliga 160 px/m-upplösningen (7,8125 mm filterfotavtryck),
face roughness 0,93 och fog 0,99. Den befintliga nominella 8 mm-fogen avrundas fortfarande
till en pixel, precis som färggeneratorn tidigare. Inga nya profil-/platsmätningar påstås.

World registrerar fortfarande samma exponerade färgmaterial med registerSnow. Enbart
dess nya material tar bort auxiliary maps under snö och återgår till roughness 0,95;
sommar återställer exakt samma färg-/skalärkartobjekt. Portikens separata material
registrerar ingen snöhook: alla dess materialvärden är identiska mellan juni/januari.
Shared seasons.js och andra materials roughness/map-policy ändras inte.

## Omfattning och reproduktion

Detta är produktionskomponenter med kontrollerade två fixture-ljus, ingen full
World-/Player-/Navigation- eller appbelysningskontroll. Portikgolvet inspekteras isolerat
för fri sikt. A/B/C:s fristående mark-/accessbyggare använder andra material; de får
inte Hus L:s plattkarta. Geometri och gångytor ändras inte i något hus.

```sh
node --test tools/pavingsurfacetest.mjs
# Egen lokal server i repositoryroten på 8192, lokala Three 0.170.0-installationen tillgänglig.
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/pavingsurface2074browser.cjs http://127.0.0.1:8192 docs/verification/2074
# Vid återskapande av enbart de två korrigerade portikvyerna efter första JSON/ark:
PLAYWRIGHT_MODULE=/path/to/playwright tools/browsertest.sh node tools/pavingportik2074retake.cjs http://127.0.0.1:8192 docs/verification/2074
```

En svensk changelogpost (preliminärt 1604), README och eget grafik-/verifieringsavsnitt.
Neutral publicöverföring följs separat i kvarteret-lunden#296: bara ytmodulen,
eget konstantblock och publika materialanrop; inga personliga patio-byggare, bilder,
inredningar, gameplay eller tjänster ska kopieras. Integrationsägaren publicerar egna
resultatbilder, bäddar in revisionsbundna bilder före stängning och kontrollerar CI.

## Integrationsbindning

Dirigenten bevarar exakt testade paving/exterior/patio/seasons-bytes från7a1044a8. World har enbart de två förväntade pavingraderna ovanpå redan accepterat skärmväggsmaterial; config har enbart PAVING_SURFACE ovanpå föregående accepterade bytes. Alla äldre changelogposter behålls och1604 är unik. Källbundna gröna komponentresultat återanvänds efter dessa oberoende tillägg, utan nytt brett omtag.

## Publicering

Kod/bilder `b3905e33b2f986f8db11217bc357badadd364b4f`; faktiska run-ID [44272270280, 44272270316] success på exakt revision. Alla bilder HTTP200 och inbäddade före stängning: https://github.com/solwation/lunden-3d-apartment/issues/2074#issuecomment-6973958773. Slutkvittot är enbart dokumentation; originalets sökvägsfilter utlöser ingen ny apppublicering.
