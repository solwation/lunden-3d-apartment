# Bakgrunden söder om Höje å — #536

Befintliga Asylen/Hunnerup/Ideon Park-volymer och bostäderna vid sländegatorna bildar en tredimensionell fond på andra sidan ån. Totalt 54 kartfotavtryck, verkligt öppen innergård i byggnad 44, kartbaserade vägar och öppna fält samt glesa dungar. Ingen ny gånggräns, interiör eller spelinteraktion.

## Befintlig bebyggelse, inte planförslag

[Registrering mot flygbilden](registered-south.png): rött = befintliga byggnadsfotavtryck, cyan = kartvägar, gult = befintlig broväg. [Södra OSM-snapshot](../../references/surrounding-views/osm-south-2026-10-08.json), [kartbild](../../references/surrounding-views/osm-south-far.png), [flygbild](../../references/surrounding-views/aerial-surroundings.jpg), [källmetadata](../../references/surrounding-views/sources.json). © OpenStreetMap contributors (ODbL); flygbild © Esri, Vantor, Earthstar Geographics and the GIS User Community. Hämtat 2026-10-08, fotodatum okänt. Samma HepCat-ankare/58° som #532–535; ungefär 3–5 m noggrannhet, inte inmätning. [Korrekt bildutbredning EPSG:3857](image-extent.json).

[Kommunens Hunnerup 30/1-sida](https://lund.se/stadsutveckling-och-trafik/detaljplaner-och-oversiktlig-planering/detaljplaner/samrad-och-framat/hunnerup-30) beskriver ett planförslag med nya bostäder och arbetsplatser. Dessa framtida volymer införs inte. Modellens fotavtryck kommer från den befintliga OSM-geometrin, jämförd med flygbilden. Aktuell verksamhet eller genomförande av planen påstås inte.

Byggnaderna 41–47,48/49,54 och56–70 samt bostadsområdet vid Nattsländegatan/Hattsnäckegränden/Sävsländegatan finns med sina kartpolygontaggar i `SITE.south.buildings`; små fjärrkroppar har bara fasad och tak. Multipolygon relation 1309428 använder way 88457591 med hålet 88457550, inte en solid rektangel. Norra/östra/västra befintliga modeller dubbleras inte.

## Förenklingar och källgränser

Två hus har OSM-taggar för fyra våningar och valmat tak:42/way 88457576 och45/way 88457592. Övriga våningsantal är visuella antaganden: fyra på de större äldre husen 43/44/46/47/54, två på resterande. Våningshöjd 3 m, takresning 3,5/1,6 m, takdetaljer, kulörer och fönstermått är antaganden. Namn/adressnummer är orientering. Inga texturer, interiörer, beslag eller små fönsterbågar på fjärrhus. Enbart större landmärken får enkla fönster.

Takytorna klipps mot varje ursprunglig fotavtryckstriangel, så konkava flyglar eller innergårdar inte fylls igen av ett förenklat tak. Valmningen utgår från byggnadens dominerande riktning/boundingbox och är en förenklad silhuett, inte en verifierad takritning. Yttermarken fortsätter till±1000 m och z1000 med antagen parkhöjd−3,01 m; ingen sydlig höjdinmätning finns. Nära kvarterets terräng förblir densamma.

Kartans skogsytor 165719103/106 får totalt 70 glesa träd, utan stammar i hus eller öppna fält. OSM-fält/gräs/äng blir lågkostnadspolygoner. Trädstorlek 8–14 m, kronradie 3–5 m, art och exakt stamplacering inom skogsytan är antaganden. Enkla fyrsidiga stammar och en ikosaeder per krona ger avsevärt lägre detalj än åparkens närträd. Öppna luckor och djup kvarstår utan en sammanhängande bildridå. Befintliga åparksträd skymmer fonden naturligt.

Sankt Lars vägs gamla sista generiska punkt ersätts av den kartlagda anslutningen 26,53/188,72. Fonden fortsätter med kartans vägförgrening; bro/närväg och gånggräns behåller sina kopplingar. Vägbredder 6/4,5 m är antaganden. Fjärrbyggnader och träd har ingen avståndsbaserad geometriomkoppling; de använder stabila enkla instanser och tonas mjukt av vanlig dimma.

Klart väder får dimslut 650 m och kamerans klippavstånd 1000 m, så husgrupperna 250–475 m bort faktiskt syns. Regnets befintliga interpolation mot dimslut 80 m fortsätter. Yttermarkens kant ligger helt bakom dimman från alla tillgängliga kameror.

Fyra sammanslagna ytbatcher och två vegetationsinstanser, 9 503 trianglar totalt. Inga nya texturer, ljus eller skuggpass; fjärrobjekten kastar inte extra detaljskuggor. Mobilprofil 844×390 med Android-UA/touch, inte fysisk telefon-fps.

## Riktig webbläsare och kameror

Chromium/Three.js 0.170.0, SwiftShader. Före=`d69579b` på 8163, efter=implementationen på 8149. Identiska fria kameror, juni-dagsljus med explicit sommar/vintervegetation och snö.

| Tillgänglig plats | Sommar före / efter | Vinter före / efter |
|---|---|---|
| Parkgränsen x25/z63, ögon−1,35 | [före](park-summer-before.png) / [efter](park-summer-after.png) | [före](park-winter-before.png) / [efter](park-winter-after.png) |
| Uteplatsen x3/z14, ögon1,65 | [före](patio-summer-before.png) / [efter](patio-summer-after.png) | [före](patio-winter-before.png) / [efter](patio-winter-after.png) |
| Gården x−30/z29,2, ögon1,65 | [före](courtyard-summer-before.png) / [efter](courtyard-summer-after.png) | [före](courtyard-winter-before.png) / [efter](courtyard-winter-after.png) |
| Hus A:s gångbara tak x0/z51, ögon14,283 | [före](roof-summer-before.png) / [efter](roof-summer-after.png) | [före](roof-winter-before.png) / [efter](roof-winter-after.png) |

Från uteplats/gård skymmer de befintliga husen en stor del av fonden; inget rensas för bilden. [Telefonprofil vid parkgränsen](phone-after.png). [Sydtest](south.log) kontrollerar verkliga polygoner, innergårdens öppning, taggade/antagna våningar, gles skogsplantering, ytterkant/dimma och faktiska vinter/sommarinstanser. [Brotest](bridge.log) och [åparkstest](park.log) kontrollerar anslutningar och tidigare ågeometri.

Gång- och terrängregression passerar, inklusive kvarterets trappor och cirka fem miljoner markpar. [Gånglogg](walk.log), [terränglogg](terrain.log), [renderingsmätning](perf.log). Calls före→efter: kök329→330, vardagsrum325→331, övervåning304→310, uteplats87→93, gård76→82. Cirka3–11 tusen fler renderade trianglar, oförändrat texturantal. Ingen fysisk telefon-fps påstås.
