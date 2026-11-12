# Kattmodeller: aktuell implementation och historisk GLB-utvärdering (#1892, #1929)

Faktagranskad 2026-11-12 mot `c1aa5154` och de källbundna resultaten nedan.
Rapporten från #1892 (2026-11-10) beskrev en främmande riggad prototyp och en
föreslagen migration. Dess jämförelse 27→1 draw calls, 96,3 procent färre anrop,
eliminerat GC-lagg och utlovade mobilvinster gäller **inte dagens produktionskatt**.
En GLB-fil eller färre trianglar bevisar inte högre bildfrekvens på en telefon.

## Aktuell faktiskt använd katt

Efter återställningen i #1910 och ytändringen i #1918 bygger `src/cat.js` den
etablerade artikulerade Mesh-hierarkin. Det historiska filnamnet
`models/cat-rigged.glb` betyder inte att katten är en `SkinnedMesh`:
`src/catmodel.js` och `CatSpawner.setupRigged()` installerar matchande oföränderliga
geometribuffertar. Befintliga delreferenser, ras-/kattungeformer, material och
proceduriella poser styr fortfarande modellen. Ingen 26-bensrigg, `AnimationMixer`
eller generell främmande pälsatlas ersätter dessa delar.

De 37 formerna behåller sina färger, ögon och individuella tecken. Den neutrala
GLB-filen innehåller ingen personlig pälsbild eller besökarhand. Mieles befintliga
kartor används av produktionsmaterialet; de bakas inte om till prototypens UV-karta.
Saknad eller ogiltig modell lämnar det proceduriella receptet kvar.

`createCatPuppet()` och OutdoorCats använder samma recept för närmodellen och
befintliga sammanslagna avståndsmodeller. Det finns 12 konfigurerade utekatter vid
den granskade revisionen, men alla renderas inte samtidigt som närmodeller.
Avstånd, synlighet, öppna/slutna ögon och pose påverkar antalet anrop. Klättringen
använder de etablerade tassdelarna; prototypens `Joint15`/`Joint18`/`Joint22`/`Joint26`
är ingen aktuell produktionsmappning.

Svansen är fortfarande dynamisk `TubeGeometry`. I `CatSpawner.pose()` kasseras och
byggs den om när sitt-/ståblandningen eller svanslyftet ändrats mer än 0,004 sedan
senaste bygget. Den byggs alltså inte ovillkorligen varje bildruta, men
geometriallokeringarna är heller inte eliminerade. Ingen GC-profil eller fysisk
telefonmätning här visar om eller hur mycket detta påverkar bildflytet.

## Källbundna resultat och deras gränser

| Jämförbar kattkomponent | #1910 / #1915-bas | Efter #1918 |
| --- | ---: | ---: |
| Inskickade kattanrop, öppna ögon | 24 | 22 |
| Inskickade katttrianglar, öppna ögon | 10 008 | 2 672 |
| Inskickade anrop / trianglar, slutna ögon | 22 / 8 968 | 20 / 2 512 |
| Unika behållna attribut-/indexvyer, en fallbackkatt | 68 912 B | 75 728 B |
| Neutral GLB, rå filstorlek | 45 880 B | 56 324 B |

[#1918:s jämförelse, rådata, konsumenter och källhashar](../verification/1918/README.md)
redovisar de aktuella komponentresultaten. Anrop och trianglar är faktiskt
inskickade av renderaren, med fixturemarken borträknad; råa meshantal räknas inte
som renderanrop. Buffertvyerna omfattar även dolda delar och svans, med delade vyer
räknade en gång. De är varken total JavaScript-heap eller GPU-minne.
Buffertvyerna ökade 9,89 procent och filstorleken 22,76 procent i denna ändring;
lägre triangelantal är inte en uppmätt total minnes- eller laddningsvinst.

Jämförelsen kördes i Playwright Chromium/SwiftShader, 640×480, med tio
uppvärmningsprov och 30 uppmätta render-/`gl.finish`-prov. Tider nära timerns
upplösning ger inget belägg för hårdvaruvinst. Komponentposer, CatSpawner,
OutdoorCats, samlingsbilder, foton och saknad-GLB-fallback har avgränsad evidens i
#1918; detta är ingen ny fullscen-, batteri-, GC- eller mobil-FPS-mätning.
Rå filstorlek är inte uppmätta komprimerade överföringsbyte.

[Inventeringen #1915](../verification/1915/README.md) är en daterad baslinje från
2026-11-12 (`4d017980`), före senare ytändringar. Dess 24 anrop/10 008 trianglar
är inte dagens kattbudget. Även andra modeller har egna senare resultat:
[Avatar #1916](../verification/1916/README.md),
[förstapersonshänder #1917](../verification/1917/README.md),
[ponnyer #1919](../verification/1919/README.md) och
[änder #1921](../verification/1921/README.md).
Deras formförbättringar och kostnader måste bedömas per faktisk konsument;
en enda generell GLB-besparing kan inte tillämpas på dem.

## Historik: prototypen från 2026-11-10 (#1892)

Den [ursprungliga utvärderingen](https://github.com/solwation/lunden-3d-apartment/blob/b83605b51ea13a65e81fa5442c7db58364a065e8/docs/development/rigged-cat-evaluation.md)
publicerades i `b83605b5`. Den utgick från en
främmande katt med 26 ben och sex klipp, inspirerad av
`solwation/solwation-on-twitch`, och föreslog `AnimationMixer`, klippövergångar,
benstyrda tasskontakter och en canvasbaserad variantatlas. Rapporten angav
242 696 byte för den dåvarande filen samt 27→1 anrop per katt och ett hypotetiskt
nio-kattsexempel (243→9). Detta är historiska prototypuppgifter, inte en
källbunden före/efterjämförelse av dagens verkliga konsumenter. Påståendena om
~140 KB komprimerad överföring, texturgenerering under 2 ms, noll
bildruteallokeringar och eliminerade mobilhugg saknar tillämpligt mätbevis här.

#1894 införde en främmande modell, men #1910 återställde originalets former,
material och posegränssnitt efter förlorade varianter och en OutdoorCats-krasch.
#1918 förbättrade därefter ytor och proportioner inom samma gränssnitt.
`tools/riggedcattest.html` är nu en hänvisning till
`tools/riggedcatproduction.html`; `tools/riggedcattest.mjs` kontrollerar den
nuvarande artikulerade modellens struktur och paritet. Det gamla påståendet
”100% PASS” för prototypen beskriver inte dessa senare prov eller visuell kvalitet.

## Slutsats och publik tillämpning

Den tidigare migrationsrekommendationen är ersatt av det aktuella målet:
högre realism med acceptabel prestanda, bedömt i jämförbara hela modeller,
vanliga användarvyer och faktiska konsumenter. Filformat och skelett är
implementationsval; framtida prestandapåståenden behöver egna källbundna
mätningar med angiven miljö och begränsningar.

Den publika versionen behöll sin anonyma proceduriella katt och har ingen
motsvarande GLB-migration eller denna rapport. Relevant generisk form-/färg-
anpassning från #1918 spåras separat i
[public #268](https://github.com/solwation/kvarteret-lunden/issues/268).
Den innebär ingen överföring av personliga pälsbilder, namn, spel eller tjänster.
Denna faktarättelse ändrar inga modeller eller produktionsinställningar.
