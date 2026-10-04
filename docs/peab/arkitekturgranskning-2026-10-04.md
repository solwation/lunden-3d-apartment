# Kv. Lunden – arkitekturgranskning och arbetsunderlag för Claude Code

Sammanställt 2026-10-04. Projekt: https://solwation.github.io/lunden-3d-apartment/

## Uppdrag till Claude Code

Granska och förbättra den befintliga modellen av Kv. Lunden i S:t Lars, Lund. Arbeta med de tio prioriterade punkterna nedan. Bostaden som står i centrum är L1007 i Parklängan, hus L.

Detta dokument innehåller den information som granskningen faktiskt har stöd för. Du ska kunna använda den utan att nå Peabs webbplats. Källänkarna är för spårbarhet; nätåtkomst är inte ett krav för att läsa och använda dokumentet.

**Viktig begränsning:** dokumentet innehåller inte kompletta fasad-, sektions- eller bygghandlingar. Exakta ersättningsmått saknas för flera punkter. Det går därför inte att slutligt verifiera alla tio issues med enbart denna fil. Där något saknas anges det uttryckligen tillsammans med vad du kan göra ändå. Markera dessa delar som preliminära; fyll inte luckorna med påstått exakta mått.

### Arbetsregler

1. Läs aktuell kod och eventuella lokala ritningar/foton innan du ändrar något. Granskningen nedan avser den publicerade kod som laddades via versionsparametern `v=d64e9f2`. Det är en observerad resursversion, inte en verifierad Git-commit. Nyare ändringar kan redan ha löst en punkt.
2. Gör skillnad mellan **bekräftad kodförenkling**, **uppgift i Peabs underlag**, **visuell tolkning**, **modellantagande** och **användarens uttryckliga anpassning**.
3. En kommentar i koden om en ritning är inte i sig oberoende ritningsbevis. Ange när en uppgift enbart kommer från kodkommentaren.
4. Följ befintliga användarbeslut om möbler, rumsanvändning och anpassningar. Återställ dem inte automatiskt till försäljningsritningen.
5. Implementera det som går att belägga. Behåll osäkra numeriska värden tills bättre underlag finns, men centralisera och märk dem som antaganden. En sådan punkt ska inte rapporteras som arkitektoniskt verifierad.
6. Låt saknad nätåtkomst stoppa endast den berörda verifieringen. Fortsätt med övriga punkter. Undvik upprepade försök att hämta blockerade URL:er.
7. Använd meter. `RH` betyder rumshöjd, `BH` bröstningshöjd från färdigt golv. Rumshöjd är inte automatiskt avståndet mellan två våningars färdiga golv.
8. Bevara fungerande navigering, kollisioner och spelmekanik när geometri ändras. Flytta fönster, glas, karmar och kollisionsöppningar tillsammans.

## Granskningsmetod och källor

Den interaktiva spelvyn gick inte att granska färdigt. Observationerna av spelet bygger på dess hämtade JavaScript-kod samt användarens tidigare skärmbild. Påstå inte att granskaren har gått runt i den publicerade modellen.

### S1 – informationsbroschyr

- Utgivare: Peab Bostad, Kv. Lunden.
- Fil: `lunden_informationsbroschyr-webb-2024-09-11.pdf`.
- URL: https://peabbostad.se/siteassets/projektbilder/kv.-lunden/lunden_informationsbroschyr-webb-2024-09-11.pdf
- Relevant vy: tryckt sida 16, PDF-sida 16 räknat från 1, alltså sidindex 15 vid programmering.
- Visuellt innehåll som används här: Parklängans gårdsfasad har tre tegelvåningar i samma huvudsakliga fasadliv. Fjärde/översta våningen är indragen med ljus fasad och privata takterrasser framför. En central tegelvolym bryter terrassraden.
- Detta är en illustration, inte en måttsatt fasadritning. Den stödjer fasadprincipen men ger inte exakta höjder, kulörkoder eller konstruktionsmått.

### S2 – planritningsbroschyr

- Utgivare: Peab Bostad, Kv. Lunden.
- Fil: `lunden-planritningsbroschyr-webb-2024-12-18.pdf`.
- URL: https://peabbostad.se/siteassets/projektbilder/kv.-lunden/lunden-planritningsbroschyr-webb-2024-12-18.pdf
- PDF-sida 19, sidindex 18, tryckt uppslag 36–37: flera av de övre etagelägenheterna, inklusive standardgruppen L1202/L1203/L1206/L1207/L1208 samt L1204 och L1209.
- PDF-sida 24, sidindex 23, tryckt uppslag 46–47: suterräng och våning 1.
- PDF-sida 25, sidindex 24, tryckt uppslag 48–49: våning 2 och 3.
- PDF-sida 26, sidindex 25, tryckt uppslag 50–51: våning 4 och 5.
- Orientering: norrpilen är diagonal på översikterna. Bildens överkant får inte automatiskt likställas med geografiskt norr.

### S3 – lägenhetsunderlag L1007

- Projektsida: https://peabbostad.se/projekt/skane/kv.-lunden/l1007/
- Den granskade bostadsritningen är gemensam för L1002–L1007.
- Bostaden är 126 m², fördelat på två plan om 63 m². Uteplats anges till 22 m².
- Nedre plan: rumshöjd cirka 3,0 m, med lokala sänkningar.
- Övre plan: rumshöjd cirka 2,8 m, med lokalt cirka 2,4 m vid de norra sovrummens fönster. Badrums-/tvättzoner har lokala uppgifter om 2,5 m.
- Övre norra sovrum: BH 0,7 m i stora sovrummet och BH 0,9 m i sovrum 3.
- De två södra rummen på övre plan har BH 0,7 m i det granskade originalunderlaget. Se särskilt issue 10 om ett senare användarbeslut.
- Exakt bjälklagstjocklek, komplett sektion och produktionsritning för trappan ingår inte i detta dokument.

### S4 – granskad modellkod

- https://solwation.github.io/lunden-3d-apartment/src/config.js
- https://solwation.github.io/lunden-3d-apartment/src/exterior.js
- https://solwation.github.io/lunden-3d-apartment/src/surroundings.js
- https://solwation.github.io/lunden-3d-apartment/src/stairs.js
- https://solwation.github.io/lunden-3d-apartment/src/world.js

Leta efter motsvarande filer i repot. Symbolnamnen nedan är bättre sökankare än radnummer, som lätt ändras.

### Tidigare sammanställt ritningspaket, om det redan finns i arbetsmiljön

Paketet heter `Lunden_3D_underlag`. Relevanta filer är `ritningar/00_situationsplan.*`, `01_suterrang.*`, `02_vaning_1.*`, `03_vaning_2.*`, `04_vaning_3.*`, `05_vaning_4.*`, `06_vaning_5.*` och `07_L1007_original_sida_1.*` samt `07_L1007_original_sida_2.*`. Där finns även `original/`, `text/` och `sources.json`. Filnamnen är en sökhjälp, inte ett påstående att filerna medföljer denna Markdown-fil.

## Redan korrigerat – återinför inte det gamla fasadfelet

Användarens äldre skärmbild visade de två översta våningarna som ett sammanhängande ljust fasadparti mot gården. Den granskade `exterior.js` innehåller redan en senare korrigering, markerad `#337`:

- Våning 1–3 mot gården: tegel i huvudsak samma fasadliv.
- Våning 4 mot gården: indragen ljus fasad med takterrasser framför.
- Central tegelvolym vid L1205 bryter terrassraden.
- Mot gatan/loftgången används en annan fasadprincip. Flytta inte automatiskt gårdssidans lösning till gatufasaden.

Kontrollera att den aktiva renderingsvägen verkligen använder detta. Koden visar att korrigeringen finns; den tidigare skärmbilden bevisar inte att den senaste versionen fortfarande är fel. Behåll denna princip när övriga issues åtgärdas.

## Issue 01 – Säkerställ våningshöjder och vertikal referens

**Prioritet:** 1, påverkar hela kvarteret. **Status:** måttosäkerhet, inte bevis för att alla byggnadshöjder är fel.

### Observerat

I `config.js`:

```js
SLAB = 0.25; // uttryckligen markerat som guess
LEVELS = [
  { name: 'Entréplan', floor: 0, ceiling: 3.0 },
  { name: 'Övre plan', floor: 3.0 + SLAB, ceiling: 2.8 },
];
// Inom respektive konfigurationsobjekt:
HUS_L.storeyHeight = 3.0;
SITE.storey = 3.0;
```

Kodutdragen i dokumentet beskriver den granskade konfigurationen och är inte färdiga patchar.

RH 3,0 och 2,8 m för L1007 stöds av bostadsunderlaget. `SLAB=0.25`, höjden mellan övre våningar och samma generella våningshöjd för A/B/C är däremot inte verifierade här. Fel ger fel taknivåer, fönsternivåer, siktlinjer och trappans totalhöjd.

### Åtgärd

- Separera färdig golvnivå, fri rumshöjd, bjälklagszon och takuppbyggnad i datamodellen.
- Ange källa/status för varje nivå. Ändra inte `SLAB` till ett annat godtyckligt normalvärde.
- Kontrollera våningsstrukturen från S2: A har suterräng + plan 1–4; B suterräng + plan 1–3; C plan 1–5; L plan 1–4. Detta är antal nivåer, inte bevis för samma höjd per nivå.
- Om sektionsritning saknas: behåll nuvarande preliminära höjder, dokumentera beroendena och lämna verifieringen öppen.

**Acceptans:** inga dubbelt räknade bjälklag; varje golv- och taknivå har tydlig härledning; antagna värden syns i utvecklardokumentationen. Slutlig exakthet kräver sektion/plushöjder.

## Issue 02 – Ersätt generiskt fönsterrutnät på hus A, B och C

**Prioritet:** 2. **Status:** bekräftad kodförenkling; korrekt fullständig ersättningsgeometri saknas i denna fil.

### Observerat

`SITE.bay=3.0` och `SITE.storey=3.0`. `facadeTexture` i `surroundings.js` skapar många vanliga fönster som ett återkommande mönster: cirka 1,3 × 1,5 m, BH 0,8 m, i moduler om 3 × 3 m. Loggior och entréer har också separat geometri; hela byggnaderna är alltså inte enbart generiska lådor.

### Åtgärd

- Inför fasadspecifika öppningslistor per hus, sida och våning, i stället för att låta en global modul bestämma alla fönster.
- Bevara redan individuellt modellerade loggior och entréer.
- Använd lokalt tillgängliga originalritningar för lägenhetsfördelning och horisontell placering. För höjd och spröjs-/karmindelning krävs säkrare fasad-/fönsterunderlag.
- Om underlag saknas: behåll befintligt rutnät som uttrycklig reservlösning. Markera de fasader som ännu inte är avritade; hitta inte på en varierad fasad och kalla den korrekt.

**Acceptans:** bekräftade fasader har individuella öppningsdata och rätt antal öppningar; kvarvarande reservfasader är identifierade. Rendering, hörnloggior och kollisioner fortsätter fungera.

## Issue 03 – Kontrollera gårdsnivå, sluttningar, ramper och stödmurar

**Prioritet:** 3. **Status:** vissa nivåskillnader stöds av plan, mellanliggande terräng är uppskattad.

### Tillgängliga uppgifter

Översikterna i S2 anger ungefär 3 m nivåskillnad mot park/å-rum, en ramp med cirka 0,9 m nivåskillnad i öster och trappor med ungefär 1,4 m i öster respektive omkring 1 m i nordväst. Uppgifterna avser olika platser. Summera dem inte till en enda generell höjdskillnad.

Modellen innehåller redan en upphöjd gård och en garagevolym. `SITE.terrain.park=-3` och `slope=8`. Åtta meter är en uppskattad horisontell utbredning, inte ett verifierat markmått. Modellen har dessutom varierande nivåprofiler längs östra och västra sidan.

### Åtgärd

- Gör gårdens referensnivå explicit och skilj relativa modellnivåer från verkliga plushöjder.
- Bevara de dokumenterade nivåskillnaderna som lokala villkor.
- Kontrollera att rampens övre och nedre anslutning möter rätt ytor utan språng; kontrollera trappor, garageinfart och mark runt hus A/B.
- Låt inte en generell slänt gå genom gårdens stödmur eller husens socklar.
- Exakt lutningsförlopp, murhöjder och brytpunkter kräver markplanering/sektion. Behåll dokumenterade preliminära profiler om detta saknas.

**Acceptans:** sammanhängande gångbara ytor, korrekta lokala nivårelationer, inga flytande socklar eller mark genom öppningar. Visuell rimlighet får inte rapporteras som inmätt terräng.

## Issue 04 – Modellera Parklängans övre gatufasad självständigt

**Prioritet:** 4. **Status:** bekräftad återanvändning av öppningsgeometri.

### Observerat

I `buildExterior` i `exterior.js`, i loopen för våning 3–4:

```js
const holes = shift(north, core ? x0 : ox, roofTop);
facade(renders, x0, x1, roofTop, upperTop,
       loftD - eps, true, holes, false);
```

`north` är öppningslistan som även används för bostäderna på de nedre våningarna. Den flyttas upp för övre etagelägenheter. Det innebär att separata övre bostadstyper inte får självständigt definierade gatufasader. Att samma mönster eventuellt passar en viss del verifierar inte hela raden.

S2 visar övre etagelägenheter med entré via loftgång på byggnadens plan 3 och ett övre bostadsplan på plan 4. Dessa ska inte förväxlas med L1007:s två plan. Standardgruppen L1202/L1203/L1206/L1207/L1208 har 54 m² på det nedre och 45 m² på det övre bostadsplanet.

### Åtgärd

- Skapa egna öppningsdata för övre bostadstyper och den centrala L1205.
- Skilj husets våningsnummer från varje lägenhets interna planindex.
- Kontrollera entrédörrar mot loftgången, övervåningsfönster och ändlägenheter var för sig.
- Om planbilder finns lokalt: härled horisontella lägen från dem. Om de saknas: separera datamodellen men behåll numeriska reservvärden som obekräftade. Denna fil innehåller inte samtliga gatufönsters koordinater.

**Acceptans:** den övre gatufasaden är inte längre ofrivilligt kopplad till ändringar i L1007:s fönster; bekräftade mått har egen källa. Loftgång, dörrar och räcken ansluter utan skärningar.

## Issue 05 – Verifiera taken på hus A, B och C

**Prioritet:** 5. **Status:** modellerade tak med uppskattade formmått.

### Observerat

`SITE.hipRoof` har `rise: 1.5` och `overhang: 0.32`. Modellen använder låga valmade tak. Dessa siffror är modellvärden, inte verifierade takmått i denna granskning.

### Åtgärd

- Ge varje hus möjlighet till separat takform, nockhöjd, takfot och utsprång.
- Kontrollera tillgängliga illustrationer som stöd för form, men mät inte exakta höjder ur perspektivbilder utan känd geometri.
- Behåll befintlig preliminär takform om bättre underlag saknas. Lägg inte till takkupor eller teknikutrymmen utan stöd.
- Kontrollera takfotens anslutning till fasaden och att husens olika nivåantal inte blir utjämnade av en gemensam takregel.

**Acceptans:** takgeometri följer respektive hus och har dokumenterade antaganden. Exakt lutning och höjd förblir öppna tills takplan/sektion finns.

## Issue 06 – Verifiera central tegelvolym vid L1205

**Prioritet:** 6. **Status:** huvudprincip stöds visuellt; flera detaljmått är uppskattade.

### Observerat

S1 visar en central tegelvolym som bryter den indragna övervåningen. I modellen finns motsvarande del i `HUS_L.court.core`:

```js
{ loft: 3.0, rise: 0.9, back: 1.5,
  loftWin: { x0: 0.62, x1: 2.0, sill: 0.15, head: 2.3 } }
```

`loft` används som breddparameter; `rise` som höjd över angränsande tak; `back` som utbredning bakåt från indragets linje. Kodkommentarerna beskriver delen som loft ovan hisstopp. Särskilt höjdökningen och bakåtdjupet är uttryckliga antaganden. Alla värden i kodblocket är inte lika väl styrkta.

### Åtgärd

- Bevara att denna del bryter terrassraden. Gör den inte till en vanlig kopia av övriga övre lägenheter.
- Håll bredd, bakåtdjup, fasadläge, takhöjd och fönstermått oberoende och spårbara.
- Exakt höjd över tak får inte härledas enbart från en intern rumshöjd eller fönstrets BH.
- Saknas sektion/fasad: behåll nuvarande preliminära värden och rapportera vilka fem mått som inte är verifierade.

**Acceptans:** rätt principiell silhuett och placering vid mittpartiet; inga påhittade precisionsanspråk för höjd och djup.

## Issue 07 – Differentiera takterrasserna mellan lägenhetstyper

**Prioritet:** 7. **Status:** återkommande modellgeometri behöver kontrolleras mot variationer i underlaget.

### Tillgängliga fakta och modellvärden

- S2: standardgruppen L1202/L1203/L1206/L1207/L1208 har takterrass 11 m².
- S2: L1204 har takterrass 10 m² och L1209 har 12 m².
- För standardgruppen visar planunderlaget fönster med BH 1,2 m samt dörr mot terrassen på övre planet. Nedre gårdssidan har BH 0,8 respektive 0,6 m.
- Modellen använder `HUS_L.court.setback=1.9`. Kodkommentaren härleder detta från fasaddjup 11,11 minus 9,21 m. Behandla detta som kodens måtthärledning tills respektive måttlinje har kontrollerats.
- Övriga nuvarande värden: `parapet=0.3`, `rail=1.1`, `deck=0.06`, `screen=1.8`. Parapet, räcke och däck är antaganden enligt kommentaren. Skärmvägg 1,8 m anges där med hänvisning till bofakta; generalisera inte till alla skärmar utan kontroll.

### Åtgärd

- Ange terrassens polygon och tillhörande lägenhets-ID, så att ytan kan räknas ut.
- Jämför användbar terrassyta med 10/11/12 m², med hänsyn till ritningens avrundning och väggar. Gör inte hela längan lika bara för att en generisk bredd är enklare.
- Härled inte en unik bredd och ett unikt djup ur endast arean: flera former ger samma area.
- Kontrollera vad räckeshöjden räknas från. Addera inte automatiskt `parapet + rail` om `rail` redan avser överkant över färdigt terrassgolv.
- Kontrollera tröskel, däcknivå, skiljeväggar och anslutningen till mittpartiet.

**Acceptans:** separata terrassdata där bostadstyper skiljer sig, rimlig areakontroll och tydlig höjdreferens för räcket. Exakta konturer som saknar mått lämnas preliminära.

## Issue 08 – Kontrollera gavlar och ändlägenheter

**Prioritet:** 8. **Status:** delvis specialmodellerat, delvis uppskattat.

### Observerat

`exterior.js` har redan ett undantag för L1008:s norra fasad via `HUS_L.endUnitNorthHidden`. Det finns också separata `gableWindows`. Dessa får inte raderas under förevändning att alla lägenheter ska bli lika.

Flera gavelfönsters placeringar och storlekar i konfigurationen är uppskattade. De två gavlarna och de övre ändlägenheterna behöver egna kontroller. Denna fil innehåller inte en komplett verifierad gavelöppningslista.

### Åtgärd

- Koppla varje gavelöppning till rätt sida, byggnadsvåning och bostadstyp.
- Kontrollera L1001/L1008 respektive L1201/L1209 som egna typer där tillgängligt underlag medger det.
- Kontrollera även anslutningen mellan gavel, loftgång och de yttre trappvolymerna. Påstå inte att dessa saknas; modellen har dem redan.
- Bevara nuvarande specialfall tills ett bättre underlag motiverar ändring. Flytta inte ett uppskattat fönster till en ny uppskattad position utan att redovisa det.

**Acceptans:** speglingar och ändtyper hanteras uttryckligen; inga öppningar hamnar i bjälklag, innerväggar eller trappvolymer; kvarstående osäkerheter listas per gavel.

## Issue 09 – Kontrollera L1007:s trappa och lokala taksänkningar

**Prioritet:** 9. **Status:** geometri beroende av antagna mått.

### Observerat och beräkning

Modellens stegfördelning är 4 + 8 + 3 = 15 plansteg. `stairs.js` beräknar sättsteget som `RISE / (N_TREADS + 1)`. Med modellens nuvarande våningshöjd 3,25 m blir detta 3,25 / 16 = 0,203125 m, alltså cirka 20,3 cm. Det är en beräkning ur modellen, inte ett uppmätt eller föreskrivet trappmått. Denna granskning gör ingen bedömning av regelefterlevnad.

`SOFFITS` använder följande modellutbredningar:

```js
[
  { level: 0, x0: 0.2, x1: 2.06, z0: 3.05, z1: 7.6, height: 2.5 },
  { level: 1, x0: 0.2, x1: 5.55, z0: 0.46, z1: 1.96, height: 2.4 },
  { level: 1, x0: 0.2, x1: 1.42, z0: 5.05, z1: 7.6, height: 2.5 },
]
```

RH-uppgifterna stöds av bostadsunderlaget; de exakta polygonerna ovan är modellkoordinater. Den norra sänkningens djup på 1,5 m är uppskattat. Förväxla inte lokal RH 2,4 m vid fönstren med rumshöjd i hela sovrummet.

### Åtgärd

- Håll trappans totalhöjd kopplad till färdiga golvnivåer från issue 01.
- Kontrollera plansteg, sättsteg, svängda steg, vilplan och öppning mot trappritning om den finns lokalt.
- Kontrollera frihöjd geometriskt där man går; kontrollera att översta steget möter övre golvet och att kollisionerna följer trappan.
- Bevara dokumenterade rumshöjder. Markera sänkningarnas ännu osäkra utbredning separat.

**Acceptans:** gångbar sammanhängande trappa utan nivåsprång, rimliga visuella anslutningar och en tydlig lista över mått som väntar på trappritning/sektion. Ändra inte antalet steg enbart för att få ett mer vanligt sättstegsmått.

## Issue 10 – Lös källkonflikten för södra sovrumsfönstret

**Prioritet:** 10. **Status:** konflikt mellan originalunderlag och senare användaranpassning; ingen automatisk återställning.

### Observerat

För `Sovrum 2` på övre planet innehåller `WINDOWS`:

```js
{ level: 1, facade: 'south', x: 3.85,
  sill: 0.9, head: 2.25, transom: 0, width: 1.2, blind: 'dark' }
```

Kodkommentaren hänvisar till användarens uppgift i `#107` om att fönstret ska vara mindre än i det andra södra rummet. Samma kommentar säger att PDF:n visar 1,41 m bredd och markerar modellens bredd, BH och överkant som gissningar. Den tidigare granskade originalplanen anger BH 0,7 m för det södra sovrummet. Cirka 1,41 m ska behandlas som ritningsavläsning, inte här som ett verifierat produktmått för fönsterbeställning.

### Åtgärd

- Läs lokal issuehistorik, användaranteckningar och foton om de finns. En nyare verifierad uppgift kan ha företräde framför den äldre försäljningsritningen.
- Skilj på användaruppgiften **mindre fönster** och de gissade siffrorna **1,2 m / BH 0,9 m / överkant 2,25 m**. Den första bevisar inte de senare.
- Behåll användarens mindre fönster tills konflikten är utredd. Märk måtten som preliminära.
- Dokumentera originalalternativet BH 0,7 m och ritningsavläst bredd cirka 1,41 m som referens. Inför inte en ny överkantshöjd utan stöd.

**Acceptans:** modellen och dokumentationen visar vilket underlag som styr. Punkten är verifierad först när fönstermåtten har stöd i rätt ritningsrevision, uppmätning eller tydligt måttsatt underlag.

## Genomförande utan nätåtkomst

1. Inventera aktuell kod samt befintliga `docs/`, ritningar och bildreferenser. Sök bland annat efter symbolerna och kommentarerna ovan. Gör inget antagande om att tidigare ZIP-paket redan är uppladdade.
2. Markera vilka issues som redan är lösta i aktuell kod. Behåll den korrigerade gårdsfasaden.
3. Genomför säkra förbättringar: separata fasaddata, tydliga höjdreferenser, per-typ-data och dokumenterade antaganden. Undvik stora omskrivningar som inte behövs för de konkreta punkterna.
4. Använd återgivna fakta i denna fil för nivåantal, RH/BH och kända terrassareor. Påstå inte att filen innehåller mått som saknas.
5. Behåll fungerande preliminär geometri där exakta ersättningsmått saknas. Markera statusen `väntar på underlag` i arbetsrapporten.
6. Kontrollera modellen visuellt från gård, gata, båda gavlarna och en översiktsvy. Kontrollera L1007:s trappa och sovrumsfönster från insidan. Om körmiljön hindrar visuell kontroll, redovisa det och vilka kodkontroller som faktiskt gjorts.

## Rapportera tillbaka per issue

- Status: redan löst / implementerat och kontrollerat / delvis förbättrat / väntar på underlag.
- Ändrade filer och vilken konkret geometri eller datakoppling som ändrades.
- Vilka mått som är ritningsstödda, avlästa eller fortfarande antagna.
- Verifiering som faktiskt utförts, gärna före-/efterbilder från samma kamera.
- Exakt saknat underlag, om någon del återstår.

## Saknat underlag som ger störst förbättring

Följande handlingar skulle göra en framtida modell väsentligt mer exakt. De finns inte komplett återgivna i denna fil:

1. Måttsatta fasader för hus A, B, C och L, alla väderstreck.
2. Sektioner med färdiga golvnivåer, bjälklag och taknivåer, särskilt genom Parklängan och L1205.
3. Markplaneringsritning med plushöjder, murar, ramp- och trappanslutningar.
4. Trappritning och undertaks-/sektionsunderlag för L1007.
5. Senaste fönsterförteckning eller reviderade lägenhetsritning för L1007.

Håll dessa verifieringsbehov öppna. Att ersätta en gissning med en annan är inte en färdig arkitekturkorrektion.
