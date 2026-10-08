# Höje å och parkstråken — #533

Åns kartregistrerade sträckning från #532 kompletteras med varierande bredd/slänter, huvudstigar, avgränsade äldre lövträdsdungar, buskage och låg strandvegetation. Fjärrmiljön ligger utanför det **oförändrade** gångområdet (`OUTDOOR.z1 = 64`).

## Underlag och osäkerheter

- [Kartsnapshot](../../references/surrounding-views/osm-2026-10-08.json): © OpenStreetMap contributors (ODbL), hämtad 2026-10-08. Åns centrumlinje är way 137217705; stigarnas respektive way-id ligger i `SITE.riverPark.paths`. Den lilla västliga gångbron är way 51890085, `surface=wood` — skild från de två Sankt Lars-broarna i #532.
- [Registrerad planjämförelse](registered-park.png): blå ålinje, gula huvudstigar, gröna ungefärliga träddungar och orange bevarad gräsglänta över [flygbilden](../../references/surrounding-views/aerial-surroundings.jpg). © Esri, Vantor, Earthstar Geographics and the GIS User Community. Fotodatum okänt; Lunden syns under byggnation. [Exportens verkliga kartutbredning](image-extent.json) används, inte en felaktig linjär latitud–pixelmappning.
- [Kommunens naturreservatsunderlag 2021, PDF-sida 33](../../references/surrounding-views/hojeadalen-reserve-2021-page-33.png) beskriver högstammiga äldre lövträd och en mindre ravin genom Sankt Lars-parken. [Original-PDF](https://lund.se/download/18.1803745417f44c54940236b1/1649254859593/Beslut%20om%20naturreservat%20i%20H%C3%B6je%C3%A5dalen%20inkl.%20bilagor.pdf).
- [Vattenrådets rapport 2016, PDF-sida 11](../../references/surrounding-views/bridge-water-report-2016-page-11.png), figurer 5–7, visar **historisk** strandmiljö vid Sankt Lars väg med slänter, höga träd, buskage och låg vegetation. [Original-PDF](https://hojea.se/rapporter/Analys_daemnpaaverk_Hoejeaa_Lund_2016_11_28_inkl_bil.pdf). Figur 8 gäller Knästorp och används inte som lokal placering.

Samma HepCat-ankare och 58° kompassbäring som #532. Horisontell registrering är ungefärlig (cirka 3–5 m), inte en inmätning. Ålinje och stigpunkter följer källkoordinater; dungarnas utbredning och gläntan är en ungefärlig tolkning av flygbilden. **Enskilda träd, antal, artfördelning, kronmått, stigbredder, vattenbredd, släntbredder och den lilla träbrons detaljer är visuella antaganden.** Ingen individuell trädinventering eller absolut RH2000-höjd påstås.

Kvarterets befintliga relativa parkfall på 3 m behålls. Vatten −6,2 och botten −6,8 relativt lägenhetens golvnoll är kvarvarande modellantaganden från #532. Bredden varierar 6–9 m och slänterna 3–15 m; smalare antagen bank vid den lilla västliga bron gör att stigarna ansluter på parkplanet. Interpolation ger kontinuerliga övergångar.

## Implementation och kostnad

`SITE.river` samlar bredd/släntprofiler och terrängens detaljnivå. `SITE.riverPark` samlar stigpunkter, dungar, glänta och vegetationsmått. `riverbridge.js` interpolerar närmaste källsegment. `riverpark.js` bygger 15 huvudstråk, den lilla träbron och strandtuvor i **tre materialbatchar**, 5 452 trianglar, utan nya texturer, ljus eller renderpass.

Den tidigare jämnt slumpade parkrektangeln ersätts av 90 större lövträd i sex dungar, 95 buskage och 190 låga strandtuvor. Placering är deterministisk inom källtolkade dungar och lämnar stigar, vatten och den centrala gläntan fria. Parkens träd och buskage återanvänder befintliga instansbatchar och årstidsfunktion. Höjd/storlek varierar; grenar och buskarnas trädelar finns kvar vintertid, kronor försvinner. Låg strandvegetation blir torrbrun. Peab-placerade gårdsträd behåller sina positioner.

Endast åkorridoren får finare terrängtrianglar. Gemensamma kantvärden håller gränsen mot grövre celler sammanhängande. Stigar och parkväxter använder **den renderade triangelns höjd**, så de inte svävar över analytiskt rundade slänter. Stigen vid huvudbroarna följer banken under däcken; den lyfts inte upp av spelarens däckfråga.

Faktisk `perfcount`: kök 331→332, vardagsrum 316→319, övervåning 297→299, uteplats 81→84, gård 67→70 calls. Cirka 91–92 tusen fler renderade trianglar inklusive befintliga skuggpass; klart mindre än en tät terräng över hela fjärrmarken. Texturantal oförändrat. [Full logg](perf.log), inklusive adaptiv kvalitetsväxling. Mobilbilden kontrollerar en riktig Android-/touchprofil, **inte uppmätt fysisk telefon-fps**.

## Webbläsarverifiering och tillgängliga vyer

Riktig Chromium, Three.js 0.170.0 och SwiftShader. Före = `6102d14` på port 8160; efter = implementationen på 8149. Identiska kameror och samma juni-dagsljus. Årstidsfunktionen växlas uttryckligen till lövad juni respektive avlövad/snötäckt januari för jämförelsen.

| Vy | Sommar före / efter | Vinter före / efter |
|---|---|---|
| Parkplan, x 25/z 63, ögon −1,35 | [före](park-summer-before.png) / [efter](park-summer-after.png) | [före](park-winter-before.png) / [efter](park-winter-after.png) |
| Gårdens gångstråk, x −30/z 29,2, ögon 1,65 | [före](courtyard-summer-before.png) / [efter](courtyard-summer-after.png) | [före](courtyard-winter-before.png) / [efter](courtyard-winter-after.png) |
| Uteplats, x 3/z 14, ögon 1,65 | [före](patio-summer-before.png) / [efter](patio-summer-after.png) | [före](patio-winter-before.png) / [efter](patio-winter-after.png) |
| Hus A:s gångbara tak, x 0/z 51, ögon 14,283 | [före](roof-summer-before.png) / [efter](roof-summer-after.png) | [före](roof-winter-before.png) / [efter](roof-winter-after.png) |

Hus A:s tak identifieras faktiskt som `roof-Hus A`. Markkamerorna kontrolleras fria. Hus B skymmer ån från gårdens valda gångstråk; byggnaden behålls. Uteplatsens skymning behålls också. Tak- och parkvyer visar dungar, gläntor, stigar och båda huvudbroarna. [Mobilvy 844 ×390](phone-after.png).

- [Parktest](park.log): samtliga kontroller passerar — verkliga OSM-punkter, dungar/glänta, varierade kronor, buskar, strandtuvor, fyra bankprofiler, tre batchar, faktisk terrängkontakt (stigarnas avstånd högst 2,5 cm), lilla bron och faktisk säsongsväxling.
- [Brotest](bridge.log): samtliga kontroller passerar — huvudbroarnas källplacering, däck, anslutningar och faktisk vattenyta under vägbron.
- [Gångtest](walk.log) och [terrängtest](terrain.log): samtliga befintliga rutter, kollisioner, nivåer och cirka fem miljoner närliggande markpar i gångområdet passerar; inga träd på vägar/gångar.
- [Prestandatest](perf.log): passerar, inga shaderfel i fotograferingen/mobilprofilen.

Bakgrundshus och omgivningen väster/öster/söder utvecklas separat i #534–536. Deras nuvarande förenklingar rättas inte genom att flytta parkens källgeometri.
