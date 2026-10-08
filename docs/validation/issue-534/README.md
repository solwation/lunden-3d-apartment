# Karpvägen och västervyn — #534

Kartans västliga husrad, den östra längan vid Karpvägen och tre komplementbyggnader kompletterar parkmiljön. Karpvägens fortsättning får sin kartbaserade återgång mot nordväst, i stället för en generisk rak linje västerut. Huvudgatorna vid kvarteret, den befintliga garageinfarten och trapporna behåller sina anslutningar; gånggränsen utökas inte.

## Källor och antaganden

[Registrerad jämförelse med flygbilden](registered-west.png): röda byggnadsfotavtryck, gul Karpväg och cyan gång-/angöringsstråk samt ungefärligt avlästa parkeringsytor. [Kartans västervy](../../references/surrounding-views/osm-west.png), [OSM-snapshot](../../references/surrounding-views/osm-2026-10-08.json), [flygbild](../../references/surrounding-views/aerial-surroundings.jpg) och [källmetadata](../../references/surrounding-views/sources.json). © OpenStreetMap contributors (ODbL); flygbild © Esri, Vantor, Earthstar Geographics and the GIS User Community. Hämtat 2026-10-08, fotodatum okänt. [Bildens korrekta EPSG:3857-utbredning](image-extent.json) används med samma HepCat-ankare/58° som #532–533; horisontell noggrannhet ungefär 3–5 m, inte inmätning.

| Orienteringsvolym | OSM way | Våningar i modellen |
|---|---|---|
| Karpvägen 2–4 | 342815183 | 4, **antagande** |
| Karpvägen 6–8 | 342815182 | 4, kartans `building:levels=4` |
| Karpvägen 10 | 342815181 | 4, kartans `building:levels=4` |
| Östra längan vid Karpvägen | 88457595 | 3, **antagande** |
| Tre komplementbyggnader | 476125237/238/239 | 1, **antagande** |

Adressnamnen är orientering från kartvyn, inte en verksamhetskontroll. Hunnerupshemmet (88457603) och övriga byggnader längre norrut ingår inte; de lämnas till #530 utan dubbletter. Befintlig Villa-volym vid Karpvägen/parkhörnet behålls.

Fotavtryck och stignoder följer OSM-punkter med avrundning under 2 cm i registreringen. Våningshöjd 3 m, takresning 1,5 m (0,5 m på komplementhus), takdetaljer, fasadkulörer, fönsterplacering/indelning och marknivåer är **visuella antaganden**. Långsmala grå tak återges med låg resning längs byggnadernas dominerande riktning; detta är en förenklad tolkning av flygbilden, inte verifierade takritningar. Inga insidor, nya lägenheter eller tillgängliga tak skapas.

Karpvägens fjärrdel använder way 342815196, med en övergång till modellens befintliga närdel. Angöringen använder way 342815192/194 och 333642399. Gångstråken har egna way-id i `SITE.west.paths`. Tre parkeringsytor är ungefärliga polygoner avlästa på flygbilden; deras originalpixlar finns i konfigurationen. **Inga godtyckliga bilplaceringar, platsnummer eller påstådda parkeringsantal läggs till.** Stig-/körbredder och beläggningsdetaljer är antaganden.

## Mark, vegetation och kostnad

`SITE.west` samlar källfotavtryck och antaganden; `sitebackdrop.js` bygger de sju bakgrundsvolymerna med utåtvända fönster/bågar och socklar ner till befintlig renderad terräng. Byggnadernas antagna plana golvnivå utgår från högsta befintliga markpunkt på fotavtrycket; sockelhöjd är en modellövergång, inte känd källarhöjd. Kvarterets västra markprofil, garageinfart och trappor ändras inte.

Den gamla slumpade västrektangeln ersätts av elva trädlägen tolkade från flygbilden. Gångar, angöring och husfotavtryck hålls fria. Parkens lövträdsdungar/glänta från #533 fortsätter söderut; deras placering tar nu hänsyn till de nya byggnaderna. Alla träd använder befintliga instansbatchar och årstidsfunktion.

Fyra nya materialbatchar för fasader, tak, glas och beläggning, totalt 4 330 trianglar; inga nya texturer, ljus eller renderpass. Faktisk `perfcount` före→efter: kök 332→331, vardagsrum 319→323, övervåning 299→302, uteplats 84→85, gård 70→73 calls. Cirka 4–9 tusen fler renderade trianglar inklusive skuggpass, oförändrat texturantal. [Full logg](perf.log). Android-/touchbilden visar riktig mobilprofil 844 ×390, inte fysisk telefon-fps.

## Verifiering och jämförelsevyer

Riktig Chromium, Three.js 0.170.0/SwiftShader. Före = `c47b94f` på 8161, efter = implementationen på 8149. Identiska kameror; juni-dagsljus och explicit växling av årstidsfunktionen för lövad sommar respektive snö/avlövning.

| Tillgänglig kamera | Sommar före / efter | Vinter före / efter |
|---|---|---|
| Hus C:s sida, x −77,4/z 25, ögon −0,290 | [före](side-summer-before.png) / [efter](side-summer-after.png) | [före](side-winter-before.png) / [efter](side-winter-after.png) |
| Nordvästra hörnet, x −77,4/z −12, ögon 1,65 | [före](corner-summer-before.png) / [efter](corner-summer-after.png) | [före](corner-winter-before.png) / [efter](corner-winter-after.png) |
| Parkhörnet, x −77,4/z 62, ögon −1,35 | [före](parkcorner-summer-before.png) / [efter](parkcorner-summer-after.png) | [före](parkcorner-winter-before.png) / [efter](parkcorner-winter-after.png) |
| Hus C:s gångbara tak, x −62/z 25, ögon 18,317 | [före](roof-summer-before.png) / [efter](roof-summer-after.png) | [före](roof-winter-before.png) / [efter](roof-winter-after.png) |

Alla kameror kontrollerades fria; takplatsen identifieras faktiskt som `roof-Hus C`. [Mobilprofil från hus C:s sida](phone-after.png). Bebyggelsen får skymmas av befintlig och källtolkad vegetation; inga hus/träd rensas för kamerorna.

- [Västtest](west.log): alla kontroller passerar — sju faktiska polygoner, separata våningskällor, markkontakt, alla 497 utåtvända fönster mot verklig fasadgeometri, vägsväng, växt-/angöringsfrihet, oförändrad gånggräns och garageinfart samt batch-/triangelbudget.
- [Gångtest](walk.log), [terrängtest](terrain.log), [åparkstest](park.log): alla passerar, inklusive kvarterets trappor, cirka fem miljoner närliggande gångbara markpar, ådalens terrängkontakt och årstider.
- [Verkligt källarbesök](basement.log): alla passerar — garage/förrådsrum, riktiga dörrpassager, belysning och återställning/återupptagning med bilen på sin plats.
- [Prestandatest](perf.log): passerar. Inga shaderfel i mobil-/jämförelsebilderna.
