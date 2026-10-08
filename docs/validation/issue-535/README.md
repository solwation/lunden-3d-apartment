# Skolområdet österut — #535

Sexton kartbaserade byggnadsfotavtryck ersätter nio gamla illustrativa volymer och kompletterar skolområdet. Hus L/A/B/C, Villa och HepCats två detaljkroppar behålls. Ingen interiör, ny gånggräns eller takåtkomst tillkommer.

## Inventering och källor

[Registrerade fotavtryck och stråk](registered-east.png): rött = nya kartfotavtryck, gult = befintlig Sankt Lars väg, cyan = kartans campusstråk. [OSM-snapshot](../../references/surrounding-views/osm-2026-10-08.json), [namngivna skolområden](../../references/surrounding-views/campus-areas-2026-10-08.json), [fem kartlagda träd](../../references/surrounding-views/east-trees-2026-10-08.json), [flygbild](../../references/surrounding-views/aerial-surroundings.jpg), [metadata](../../references/surrounding-views/sources.json). © OpenStreetMap contributors (ODbL); flygbild © Esri, Vantor, Earthstar Geographics and the GIS User Community. Hämtat 2026-10-08, bilddatum okänt. Registrering enligt #532: HepCat-ankare/58°, ungefär 3–5 m noggrannhet, inte inmätning. [Bildutbredning i EPSG:3857](image-extent.json).

[Lunds bevaringsprogram](https://bevaringsprogram.lund.se/wiki/Sankt_Lars_sjukhus) beskriver äldre paviljonger, förbindande lägre längor och parkens höga träd/alléer. Det används som arkitekturkontext, inte som höjdritning eller uppgift om dagens verksamheter.

| Orienteringshus | Kartfotavtryck | Tidigare modell / ändring |
|---|---|---|
| Montessori | 88457613 | Kort rektangel ersätts av lång kropp med flyglar |
| NTI, skolan över gatan | 88457612 | Tre rektanglar ersätts av sammanhängande paviljongfotavtryck |
| Realgymnasiet, byggnad 88 | relation/1309427 | Generisk volym ersätts av verklig ytterpolygon med öppen innergård |
| Consensum, långa tegelbyggnaden | 130681301 | Tre smala rektanglar ersätts av L-form |
| Sankt Thomas | 88457546 | Saknad volym kompletteras |
| Höjebro, byggnad 9 | 88457547 | Saknad lång kropp och flyglar kompletteras |
| Freinet / Framtiden | 88457552 / 88457606 | Saknade paviljonger kompletteras |
| Östra borggården, byggnad 2 | 130678797 | Saknad paviljong kompletteras |
| Kunskapsskolan / östra paviljongen | 88457581 / 88457601 | Saknade volymer kompletteras |
| Kastanjen | 88457565 | Saknad volym kompletteras |
| Fyra komplementhus | 88457558, 88457600, 130578352, 145221568 | Enkla bakgrundskroppar |

Totalt sexton fotavtryck. Den gamla oidentifierade `S:t Lars (old hospital)`-volymen tas bort för att undvika en påhittad extrabyggnad. Kartnamnen är orientering, inte aktuella verksamhetspåståenden. HepCat ändras inte och dubbleras inte med sitt kartfotavtryck.

## Antaganden och utförande

Alla nya våningsantal är visuella antaganden: huvudsakligen två våningar, en på Consensum/Kastanjen/komplementhus. Våningshöjd 3,6 m, NTI 4,3 m och Consensum 3,8 m; takresning 3/2 m. Sadeltaken följer fotavtryckets dominerande riktning; komplexa flyglar är förenklade och har inte verifierade takritningar. Realgym har ett förenklat plant tak med verkligt hål över innergården. Fasadkulörer, fönsterindelning, höjder och marknivåer är antaganden. Den befintliga fototolkade muren, växthuset och skolskorstenarna behålls; skorstenarna ryms nu på det korrigerade NTI-fotavtrycket.

`SITE.east` samlar kartpolygoner och mått. `sitebackdrop.js` bygger fem materialbatchar (tegel, tak, fönster/bågar, stråk och modern ljus fasad). Teglet återanvänder befintlig textur. Socklar når renderad terräng; den yttersta synliga markplattan förlängs till x 340 för att bära det östra parklandskapet, utan att ändra närterräng eller gångbarhet.

Kartans servicevägar och gångvägar binds ihop enligt egna source-id i konfigurationen. Bredd 4,5/2 m är antaganden. Fem träd har faktiska OSM-punkter; övriga trädrader och tre dungar är ungefärligt tolkade från flygbilden, inte individuellt kartlagda stammar. Totalt 62 träd använder befintliga säsongsinstanser och håller byggnader/angöring fria. Mellanrummen lämnas gräsbevuxna, inga uppfunna parkeringsantal eller fordon tillkommer.

12 703 trianglar i de fem campusbatcharna. Inga nya ljus eller renderpass. Mobilbilden använder Android/touchprofil 844×390, inte uppmätt fysisk telefon-fps.

## Webbläsarverifiering

Riktig Chromium/Three.js 0.170.0 med SwiftShader. Före = `202d65a` på 8162; efter = implementationen på 8149. Samma fria kameror, juni-dagsljus, explicit sommar/vintervegetation och snö.

| Kamera | Sommar före / efter | Vinter före / efter |
|---|---|---|
| Hus L:s östra gavel, x18/z−5 | [före](gable-summer-before.png) / [efter](gable-summer-after.png) | [före](gable-winter-before.png) / [efter](gable-winter-after.png) |
| Östra gatan, x20/z32 | [före](street-summer-before.png) / [efter](street-summer-after.png) | [före](street-winter-before.png) / [efter](street-winter-after.png) |
| Gården, x10/z20 | [före](courtyard-summer-before.png) / [efter](courtyard-summer-after.png) | [före](courtyard-winter-before.png) / [efter](courtyard-winter-after.png) |
| Hus A:s gångbara tak, x0/z51, ögon14,283 | [före](roof-summer-before.png) / [efter](roof-summer-after.png) | [före](roof-winter-before.png) / [efter](roof-winter-after.png) |

Befintliga hus och vegetation får skymma bakgrunden, särskilt från gården; inget flyttas för kamerorna. [Mobilprofil från östra gaveln](phone-after.png).

[Campustest](535-east.log): 16 unika källpolygoner, bevarad HepCat, plinthöjd, 1 255 verkliga utåtvända fönster mot fasad, innergårdens öppning, delad tegeltextur, fria träd/stråk och triangelbudget. [Västtest](535-west.log) kontrollerar tidigare område. Övriga regressionsloggar och renderingsmätning finns här tillsammans med bilderna.

[Renderingsmätning](535-perf.log): calls före→efter kök331→329, vardagsrum323→325, övervåning302→304, uteplats85→87, gård73→76. Cirka40–46 tusen fler renderade trianglar inklusive skuggpass/instansvegetation och utökad yttermark; tre färre texturer efter återanvändning/borttagna äldre fasadmaterial. [Gångtest](535-walk.log), [terrängtest](535-terrain.log) och [åparkstest](535-park.log) passerar.
