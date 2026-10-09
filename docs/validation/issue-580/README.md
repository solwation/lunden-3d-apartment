# Realgymnasiet / byggnad 88 — #580

## Identifiering och källor

OSM relation/1309427 är den kvadratiska byggnaden mellan 3 och 8 på [Hemsös karta](../../references/east-campus/hemso-karta-st-lars.png) (88). Realgymnasiet anger S:t Lars väg 88; den nutida bilden visar Realgymnasiets skylt och byggnad 1:s klocktorn bakom, vilket placerar kameran vid sydvästra hörnet. Underlag i [`sources.json`](../../references/east-campus/sources.json):

- [Hemsö By88](../../references/east-campus/hemso-byggnad-88-historisk.png), historiskt (efter 1960), okänt datum.
- [Realgymnasiet, Ednia](../../references/east-campus/ednia-realgymnasiet-byggnad-88.jpg), nutida, okänt datum; västfasaden till vänster, sydfasaden till höger.

Hemsö: Klas Anshelm 1959–60, helt kvadratisk; ”utåt sett ser det ut som om byggnaden har ett helvalmat tak men … taket består av fyra sågtandstak som alla är vända med fönstersidan inåt”.

## Bildanalys och modellbeslut

- Två våningar rött tegel (det historiska fotot ser mörkare ut; den nutida färgbilden avgör kulören). Den tidigare ljusa, generiska fasaden och det platta taket tas bort.
- Utskjutande tegelpelare mellan varje fönsterfack ger den vertikala rytmen; fönstren är breda, rektangulära, med vita karmar, mittpost och låg tvärpost. Modell: fack 3,15 m, fönster 2,1 m breda, pelare 0,5 m — **antaganden** i `SITE.east.facadeStyles.anshelm`.
- Djup vit takfot med synlig undersida (0,6 m, **antagande**).
- Tak: fyra sågtandstak som stiger från ytterkanten (lutning 0,25, högst 2,4 m, **antaganden**) och möter glasade lodytor mot innergården. Utifrån läses det som ett lågt valmat tak, som Hemsö beskriver.
- Innergården: OSM-hålet behålls öppet (Esri-flygbilden visar ett mörkt mittparti som inte kan avgöras säkert; ingen ändring utan bättre underlag). Innergårdens väggar får samma fönster.
- OSM-fotavtrycket är oförändrat.

## Jämförelse

Playwright-Chromium/SwiftShader, 15 juli 12:00, klart väder. Före = c4fa765 (#578), efter = denna ändring.

| Vy | Före | Efter | Referens |
|---|---|---|---|
| Sydvästra hörnet | [före](b88sw-before.png) | [efter](b88sw-after.png) | Ednia-bilden |
| Sydfasaden från gatan | [före](b88s-before.png) | [efter](b88s-after.png) | Hemsö By88 |
| Snett ovanifrån (tak och innergård) | [före](b88air-before.png) | [efter](b88air-after.png) | Hemsös beskrivning |
| Från L1007:s övervåning | [före](kitchenup-before.png) | [efter](kitchenup-after.png) | — |
| Sankt Lars väg | [före](street-before.png) | [efter](street-after.png) | — |

88 syns från Sankt Lars väg och från hemmets norrfönster till höger om skolan; där läses nu rött tegel med pelarrytm och breda fönster i stället för en ljus volym.

## Tester och prestanda

`eastbackdroptest.html` ALL PASS med nya kontroller: två våningar med breda raka fönster, sågtandstak som stiger inåt (7,37 → 9,11 m), glasade sågtandsytor mot innergården, innergården fortfarande öppen genom alla tak- och väggbatcher; 1 033/1 033 synliga fönster. Campus 41 575 → 45 711 trianglar (gräns 48 000). Inga nya batcher, ljus eller texturer; sågtandsglaset återanvänder #569:s reflekterande material.

`perfcount.html` efter: kök 339, vardagsrum 338, övervåning 323, uteplats 102, gården 87, östra gatan 51 calls. Jämfört med #578-mätningen är det +0–3 calls, men mellanliggande commits från andra ärenden (hallspegelns ljusslinga: +3 geometrier, +1 textur) ingår i samma mätning, så skillnaden kan inte tillskrivas 88 ensam; campus har fortfarande 8 batcher.
