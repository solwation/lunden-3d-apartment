# Höje ås två broar vid Sankt Lars väg, #532

[Registrerad modellplan mot flygbilden](registered-plan.png). Rött: vägbrons kartlinje, gult: GC-brons kartlinje inklusive anslutningar, blått: åns kartlinje. GC-däcket är 40 m, kortare än OSM-sträckan inklusive anslutningar (cirka 45,5 m). Vägbrons kartsträcka är cirka 45,8 m; detta är inte ett verifierat konstruktionsmått.

## Underlag och registrering

- [Källmetadata och bilder](../../references/surrounding-views/sources.json), hämtade från den tidigare referensbranchen `docs/northern-surroundings-2026-10-08`. Kartor © OpenStreetMap contributors; flygbilder Esri, Vantor, Earthstar Geographics och GIS User Community. Fotodatum okänt, byggprojektet är under uppförande.
- [OSM-geometri hämtad 2026-10-08](../../references/surrounding-views/osm-2026-10-08.json): vägbron `23873379`, GC-bron `44447984`, Höje å `137217705`. Endast relevanta karttaggar sparas. Kartgeometri är inte inmätning/fastighetsgräns.
- [Lunds kommun](https://intranatet.lund.se/oppet-innehall/forskola-och-skola/naturskolan/uteklassrum/lunds-uteklassrum/sankt-lars-parken-som-uteklassrum) skiljer betongbalkbron från intilliggande stålfackverksbro.
- [Hjalmarssons](https://hjalmarssons.se/verksamhetsomrade/broar/) beskriver den levererade GC-bron vid Sankt Lars väg som 40 m fackverk. Företagets allmänna montagebild används inte som platsfoto.
- [Historisk rapportbild 2016](../../references/surrounding-views/bridge-water-report-2016-page-12.png) visar vägbrons stöd under däcket. Historiskt formstöd, inte bevis för alla nutida detaljer; den då fotograferade mindre cykelbron likställs inte med den nyare 40 m-bron.

`sitegeo.js` använder samma **58°** som `DAY.planNorth`/FOJAB-pilen och en lokal tangentprojektion. Ankaret är mittpunkten för HepCat Stores OSM-footprint `130578353` (13,181015825 E /55,684965075 N), matchad till befintlig Peabbaserad modell x=32,3/z=−0,4. Därmed ligger vägbron nära x=23,6/z=122,9 och GC nära x=18,0/z=123,8. Horisontell registrering bedöms grovt ±3–5 m; inget inmätt läge eller exakt bygghöjd påstås. [Flygbildens exportextent](image-extent.json) använder Esris projektion/aspektkorrigering, inte felaktigt antagen linjär skalning av ursprunglig bbox i lat/lon.

## Modell och antaganden

Vägbrons betongdäck, landfästen, stödgrupper och räcken modelleras separat från det 40 m långa GC-däcket med stålfackverk. GC-anslutningarna möter befintliga gångstråk; gamla vägsidegångar tas bort över bron så de inte svävar i mellanrummet. Sankt Lars vägs fjärrdel följer kartans ändpunkter; vägen i det befintliga gångområdet ändras inte.

**Alla höjder och konstruktionsdetaljer är antaganden:** däck −3 m (befintligt parkplan), vatten −6,2 m, botten −6,8 m; vägdeck 7,2 m brett/45 cm tjockt, GC 3 m brett/18 cm tjockt, räcken 1,1 m, fackverk 1,45 m. Tre modellerade stödgrupper, sektioner, färger och anslutningsbredder är illustrativa. GC:s 40 m är den enda leverantörsbelagda däcklängden. Material och tvärsnitt ersätter inte en konstruktionsritning.

Åfårans horisontella lokalsektion följer kartlinjen för att vattnet verkligen ska passera under broarna. En mjuk terrängsänkning (antagen bredd 8 m och 10 m bank) ersätter den tidigare raka vattenrektangeln på markhöjd. Träd placeras inte i vatten/submergerad bank. Detaljerad ådal, parkstigar och strandvegetation hanteras i nästa ärende **#533**; dessa bankmått är inte kontrollerade hydrologiska mått. Fjärrterrängen täcker vattengeometrins utbredning.

`OUTDOOR` är oförändrat: objekten syns bortom z=64 men gör inte området fritt gångbart. Solskuggor använder befintlig pipeline. Fyra materialbatchar för båda broarna och vatten, 2 770 trianglar; inga nya ljus/reflektionspass/objekt per räckesstolpe.

## Verifiering och bilder

Riktig Chromium/Three.js 0.170.0/SwiftShader. Före = `558617b` på port 8159, efter = aktuellt på 8149.

| Tillgänglig vy | Före | Efter |
|---|---|---|
| Parkplanet x=25/z=63, ögon −1,35 m, vinter | [bild](park-before.png) | [bild](park-after.png) |
| Hus A:s gångbara tak x=0/z=51, ögon 14,28 m, vinter | [bild](roof-before.png) | [bild](roof-after.png) |

Båda platserna kontrollerades fria; taket identifieras faktiskt som `roof-Hus A`. Kamerorna är identiska före/efter. [Sommar från parkplanet](summer-park-after.png) / [sommar från taket](summer-roof-after.png): befintlig lövvegetation behålls och får skymma. [Mobilvy](phone-after.png): Android-/touchprofil 844 ×390; inte uppmätt fysisk telefon-fps.

- `bridgetest.html`: samtliga kontroller passerar — riktig scen, båda OSM-ändpunkterna, geografisk round-trip, däck/anslutningar, separat GC, 40 m, renderbudget och oförändrad gånggräns. En **verklig vertikal ray under vägbron träffar vattenytan**, inte en dold mark-/vägplatta.
- `walktest.html`: alla befintliga vägar och kollisioner passerar.
- `terraintest.html`: nivåer, socklar, trädfria vägar och cirka fem miljoner närliggande markpar i gångområdet passerar.
- `perfcount.html`: passerar; kök 331 och övervåning 297 calls som före, vardagsrum 313→316, uteplats 78→81, gård 64→67 (tre tillkommande brobatchar där de är i frustum). Ca 3 000–4 000 fler trianglar i dessa vyer, inga nya texturer. Faktiska mätvärden i loggen.
