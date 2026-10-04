# Lunden – plan för en spelbar livssimulator

> **Scope decided by the user afterwards (2026-10-04), overrides this plan:** not a whole Sims — this person and this flat only. No shop / ordering / delivery / grocery bag / budget (the food is in the fridge, freezer and pantry and is refilled by itself), no hunger / thirst, no food going bad, no disasters or illness, no family figures. LIFE-028, -029, -033 and -036 are dropped. The issues are tracked in epic #364.


Datum: 2026-10-04. Projekt: `solwation/lunden-3d-apartment`.

## Till Claude Code: uppdrag och avgränsning

Detta är en föreslagen produktplan och backlogg, inte en beskrivning av vad som redan är implementerat. Målet är att den befintliga promenadmodellen av lägenheten ska bli ett hem där spelaren kan handla, packa upp, laga enklare mat, äta, diska och städa med konkreta föremål.

Läs repots instruktioner och inventera befintlig kod innan implementation. Återanvänd befintliga dörrar, lådor, vitvaror, klocka, föremål, ljud och sparfunktioner där det går. Ändra inte den verifierade lägenhetsgeometrin för att förenkla spelmekaniken. Förvaring under trappan och sopor under vasken ska utnyttja motsvarande platser i modellen.

Alla `LIFE-xxx` nedan är planerings-ID:n, inte befintliga GitHub-nummer. Matcha mot befintliga issues och undvik dubbletter. Skapa eller ändra externa GitHub-issues först när användaren ber om det. Anpassa föreslagna modulnamn till repots struktur; de är inte påståenden om befintliga filer. Planen förutsätter inte nätåtkomst, betaltjänster, backend eller nya nedladdade modeller.

Första leveransen ska vara en sammanhängande vardagssituation, inte alla funktioner samtidigt. Föreslagen första spelbara milstolpe: **packa upp en matkasse, gör och ät en ost- och gurkmacka, släng resterna**. Därefter disk och dammsugning.

## 1. Spelkänsla och grundprinciper

- **Föremålen ska finnas i rummet.** Gurkan ligger i kylen, kniven i lådan och skärbrädan i sin förvaring. En meny får hjälpa till att välja handling, men ska inte ersätta hela den fysiska processen.
- **Orsak och verkan ska synas.** En skuren gurka blir kortare; skivor hamnar på brädan; smör och ost minskar; glas blir smutsiga; diskmaskinen gör dem rena; dammsugaren tar bort synligt damm.
- **Samma grundregler överallt.** Plocka upp, placera, öppna, använda, kombinera och lägga tillbaka ska kännas likadant oavsett föremål.
- **Precision ska vara frivillig.** Hjälpsamma placeringspunkter och animationer som styrs av spelet i stället för krav på millimeterprecision eller fri knivfysik.
- **Lek först, hushållsstraff senare.** Ingen tvingande hunger, ekonomi eller förruttnelse i första versionen. Sådant ska kunna aktiveras separat.
- **Respektera mobilen.** Hela huvudflödet ska fungera med touch, utan hover, högerklick eller tangentbord.
- **Behåll befintligt spel.** Lägg till ett livssimulatorläge; låt inte nya behov eller tidssystem bryta befintliga poäng, uppdrag eller promenadläge.

### Föreslagna spellägen

- **Fri lek:** obegränsad återfyllning via en tydlig knapp, inga ekonomiska konsekvenser, ingen mat som förstörs under frånvaro.
- **Vardag:** begränsade varor, inköp, lätt hunger/törst och städuppgifter.
- **Guidad situation:** exempelvis ”Gör en macka och återställ köket”, med valfria ledtrådar.

## 2. Konkreta spelbara vardagsflöden

### A. Handla och fylla kyl, frys och skafferi

1. Öppna inköpslista och välj gurka, ost, smör, bröd, mjölk och frysta ärtor.
2. Beställ en förenklad leverans; i första versionen behövs ingen butik eller bilresa.
3. En matkasse dyker upp på en bestämd plats i hallen.
4. Bär kassen till köket och ställ den på golv eller bänk.
5. Öppna kylskåpet och lägg in gurka, ost, smör och mjölk på tillåtna hyllplatser.
6. Lägg ärtor i fryslådan och brödet i skafferilådan.
7. Stäng förvaringen och lägg undan eller återvinn den tomma kassen.

Exempel på återkoppling: ”Fryslådan är full”, ”Öppna kylen först”, ”Matkassen är tom”. En vara ska aldrig försvinna för att målet är fullt.

### B. Göra en ost- och gurkmacka

1. Ta fram skärbrädan och placera den på en ledig arbetsyta.
2. Hämta gurkan ur kylen och lägg den på brädan.
3. Öppna bestick-/redskapslådan och välj kökskniv. Smörkniv och osthyvel ska vara andra verktyg med andra handlingar.
4. Välj ”Skär en skiva” eller ”Skär tre skivor”. Visa en kort animation och skapa riktiga skivobjekt på brädan. Återstående gurka minskar.
5. Lägg tillbaka kniven eller sätt den på en ledig punkt på bänken. Hämta bröd ur skafferilådan.
6. Öppna brödpåsen och ta en skiva. Helt bröd + brödkniv kan komma senare.
7. Lägg brödet på en tallrik, öppna smöret och bred med smörkniven. Smörmängden minskar och brödet får ett synligt lager.
8. Hyvla ost med osthyvel, eller välj en stödd kniv för tjockare ostskivor i en senare utökning. Lägg ost och gurkskivor på mackan.
9. Bär tallriken till bordet. Ta upp mackan och ät den i några tydliga tuggsteg.
10. Lägg tillbaka kvarvarande mat, släng matrester och ställ undan smutsig disk.

Det ska även gå att äta bröd utan pålägg, lägga enbart gurka på en tallrik eller avbryta halvvägs. Ett recept får inte låsa spelaren i en enda sekvens.

### C. Dricka och använda diskmaskinen

1. Hämta ett rent glas från skåpet.
2. Fyll det med vatten vid kranen eller häll från en mjölkförpackning.
3. Drick; vätskemängden minskar och glaset markeras som använt.
4. Öppna diskmaskinen, dra ut korgen och placera glaset i en passande plats.
5. Lägg i fler föremål, skjut in korgen, stäng luckan och starta.
6. Visa förlopp och ljud. När programmet är färdigt blir innehållet rent.
7. Öppna, plocka ur och lägg tillbaka glaset i skåpet.

Diskmedel och flera program är senare detaljnivå. Ett saknat förbrukningsmaterial ska inte oväntat blockera den första versionens diskflöde.

### D. Slänga sopor under vasken

1. Samla gurkändar, smulor och tomma förpackningar.
2. Öppna skåpet/lådan under vasken.
3. Lägg matrester i matavfall och förpackningar i en förenklad återvinningsbehållare.
4. Behållarens fyllnadsgrad ökar synligt.
5. När den är full: knyt ihop påsen, ta ut den och sätt i en ny.
6. Bär påsen till en markerad avlämningsplats; exakt miljörumsplacering måste verifieras i modellen innan den beskrivs som verklighetstrogen.

Sorteringskategorierna är spelregler, inte ett påstående om fastighetens faktiska avfallssystem.

### E. Dammsuga med dammsugaren under trappan

1. Öppna förvaringen under trappan och ta fram dammsugaren.
2. Placera kroppen på golvet och ta kontroll över munstycket.
3. Slå på; välj ett förenklat rörelseläge som fungerar med touch.
4. För munstycket över smulor och damm. Bara smuts inom munstyckets räckvidd på åtkomlig golvyta försvinner.
5. Stäng av, töm vid behov och återställ dammsugaren under trappan.

Första versionen simulerar inte trasslande slang eller elkabel. Modellera inte om en befintlig dammsugare till en annan typ; abstrahera anslutningen. Kabel, uttag och sladdvinda kan bli ett senare tillval.

### F. En kort sammanhängande spelsession

Spelaren kommer hem med varor, packar upp, gör en macka, häller upp vatten, äter vid bordet, laddar diskmaskinen, slänger förpackningen och dammsuger smulorna. Spelaren lämnar köket och kommer tillbaka: alla varor, halvfärdiga föremål och maskintillstånd finns kvar.

## 3. Föremål och tillstånd som behövs

### Första innehållspaketet

- Mat: gurka, gurkskiva, brödskiva, brödpåse, smörförpackning, ostblock, ostskiva, mjölkförpackning, fryst ärtpåse, färdig/halvfärdig macka.
- Redskap: kökskniv, smörkniv, osthyvel och skärbräda. Brödkniv kan läggas till när helt bröd stöds.
- Servering: tallrik, glas och senare mugg/skål/bestick.
- Förvaring: kylhyllor, fryslådor, skafferilåda, redskapslåda och plats för rena glas/tallrikar.
- Avfall: matrest, tom förpackning, avfallsbehållare, lös soppåse och ny påse.
- Städning: dammsugarkropp, munstycke, damm/smulor och senare trasa/mopp.

### Håll tillstånd oberoende

Ett föremål behöver inte en enda enorm enum som `opened_dirty_half_eaten_in_fridge`. Dela upp egenskaper:

- Identitet: stabilt instans-ID och definitionstyp.
- Plats: exakt en av värld, hand, behållare eller kopplad komponent på exempelvis en tallrik.
- Mängd: gram, milliliter eller heltalsantal med uttrycklig enhet.
- Förpackning: stängd/öppen/tom.
- Matberedning: hel/skivad/bredd/sammansatt; temperatur och färskhet införs senare.
- Renhet: rent/använt/smutsigt; eventuell väta separat.
- Utrustning: av/på, laddning eller behållarfyllnad om den funktionen finns.
- Maskin: ledig/kör/pausad/klar; tillåtna övergångar definieras explicit.

Exempel: en öppnad smörförpackning kan ligga i kylen med 185 g kvar. En tallrik kan bära en halv macka och samtidigt vara smutsig. Det använda glaset kan innehålla 80 ml vatten.

## 4. Teknisk riktning – förslag, inte krav på omskrivning

### Gemensam interaktionsmotor

- Samma funktion räknar fram tillåtna handlingar för sikte/touch, verktyg, mål och aktuellt tillstånd.
- Varje handling har villkor, förbrukning, resultat, varaktighet och avbrottsregel.
- UI visar en tydlig orsak när handlingen inte går: stängd dörr, fel verktyg, fullt mål, slut på innehåll eller för långt avstånd.
- Kontrollera räckvidd och hinder. Spelaren ska inte kunna hämta en gurka genom en stängd kyl eller ett golv.
- Börja med en handplats. Skärbräda och mat ligger på bänken medan verktyget hålls; undvik ett krav på att hålla tre saker samtidigt.
- Tallrikar och matkassar fungerar som bärare med innehåll som följer med.

### Föreslagna moduler

- Item definitions: typ, taggar, modellreferens, volym/antal, tillåtna handlingar.
- Item instances: aktuellt tillstånd och placering.
- Containers: kyl, frys, låda, kasse, tallrik och maskinkorg med kapacitet och platser.
- Actions: pickUp, place, transfer, cut, spread, assemble, eat, pour, wash, discard, vacuum.
- Appliance state: diskmaskin och senare ugn/tvättmaskin.
- Simulation clock: gemensam kontrollerad tid för förlopp, inte en timer per pryl.
- Save adapter: serialisering till befintlig sparlösning med versionshantering.
- View adapter: skapar/uppdaterar synlig geometri från tillståndet.

Separera domänlogik från 3D-objekt så att exempelvis skärning och mängder kan testas utan rendering. Välj inte ett stort ECS-/fysikramverk bara för denna plan; använd befintlig struktur om den räcker.

### Exempel på atomär skärhandling

Föreslagen spelparameter, inte verkligt produktmått: gurka 300 g; en skiva 10 g.

1. Validera kökskniv i handen, gurka på skärbräda, tillräcklig mängd och ledig plats för resultat.
2. Reservera ingående objekt och utplats så att dubbeltryck inte startar samma jobb två gånger.
3. Spela animationen.
4. Commit: minska gurkan med 10 g och skapa exakt en skiva på 10 g i samma transaktion.
5. Avbrott före commit återställer reservationen utan förbrukning. Efter commit finns resultatet även om animationen bryts.

En gurka under 10 g får en explicit regel: skapa en sista mindre bit eller markera rest. Negativa mängder får inte förekomma. Sparning under animation ska antingen avsluta transaktionen säkert eller spara stabilt tillstånd före den.

### Sammansatta objekt

En macka består av bröd och tillagda ingrediensmängder. När ingrediensen hamnar på mackan flyttas den eller konsumeras till receptets komponentdata – aldrig både och. Tallriken är fortfarande separat. Vid tuggor minskar mackans återstående portion, inte tallrikens existens.

### Spara och tid

- Spara ID:n, innehåll, mängder, placering, renhet och maskiners återstående tid.
- Föreslagen standard: simuleringen pausas när spelet är pausat eller fliken är dold. Ingen förbrukning/förruttnelse under offline-tid i första versionen.
- Använd spelklocka, inte animeringsbildrutor, för maskinförlopp.
- Skydda sparfilen mot gamla scheman, saknade typer och ogiltiga behållarreferenser. Ge möjlighet att exportera/importera sparning och återställa till ett känt startläge.

## 5. Milstolpar och byggordning

- **M0 – stabil grund:** LIFE-001–008. Föremål går att flytta, förvara och spara på dator och mobil.
- **M1 – första vardagsflödet:** LIFE-009–017. Fyll förråd, gör en macka, ät och släng rester i en enkel behållare.
- **M2 – återställ köket:** LIFE-018–023. Drick, diska, sortera och bär ut avfall.
- **M3 – städa hemmet:** LIFE-024–027. Smuts uppstår, dammsugaren används och ställs tillbaka.
- **M4 – sammanhållen vardag:** LIFE-028–031. Inköp, frivilliga behov, guidning och genomtestat helt flöde.
- **Senare expansion:** LIFE-032–036. Matlagning, hållbarhet, tvätt, växter och familjeliv.

LIFE-008 gäller kvalitet från början; LIFE-031 är den samlade slutkontrollen, inte första tillfället då tester görs. Bygg inte M4 eller expansionen innan M1 fungerar väl.

## 6. Föreslagna GitHub-issues

Använd rubriken som titel. Varje punkt nedan kan bli en egen issue. Storlek S/M/L är relativ komplexitet, inte en tidsuppskattning. L-punkter bör delas i implementation och innehåll när befintlig kod inventerats. Förslag på etiketter: `life-sim`, `interaction`, `food`, `cleaning`, `appliance`, `persistence`, `mobile`, `testing` samt aktuell milstolpe.

### LIFE-001 – Inventera befintliga system och skapa ett testscenario

- Milstolpe M0; storlek S; beroenden: inga.
- Kartlägg interaktion, vitvaror, öppningsbara objekt, klocka, poäng, sparning och touchstyrning. Markera återanvändning respektive saknat stöd.
- Skapa ett reproducerbart utvecklarläge med tom arbetsbänk och några testföremål; påverka inte normal sparning.
- Acceptans: dokumenterade integrationspunkter och startläge; inga påståenden om funktioner som inte testats; befintligt spel startar oförändrat.

### LIFE-002 – Gemensamma föremålsdefinitioner och instanser

- M0; M; beroende LIFE-001.
- Inför stabila ID:n, typdefinitioner, mängdenheter, taggar, plats och oberoende tillstånd enligt avsnitt 3.
- Acceptans: två gurkor är olika instanser; inga negativa mängder; ett objekt har exakt en plats; logiken går att testa utan 3D-renderare.

### LIFE-003 – Gemensam interaktionsmeny för dator och touch

- M0; M; beroende LIFE-002.
- Visa riktat föremål, tillåtna handlingar och begripliga blockeringsorsaker. Inför räckvidd och hinderkontroll.
- Acceptans: samma handling kan göras med tangent/mus och touch; inga handlingar genom stängda luckor; textetiketter fungerar utan färgkodning; menyer blockerar inte kameran oavsiktligt.

### LIFE-004 – Ta upp, bära, placera och rotera föremål

- M0; M; beroende LIFE-003.
- En aktiv handplats, placeringsförhandsvisning och tydliga fästpunkter på bänk/bord/golv. Återanvänd befintlig föremålsflyttning om den finns.
- Acceptans: full hand ger besked; avbruten placering behåller föremålet; objekt kan inte tappas genom golv; felplacering kan återställas till senaste giltiga plats.

### LIFE-005 – Förvaringsplatser och kapacitet

- M0; M; beroende LIFE-004.
- Koppla containrar till kylhyllor, fryslådor, skafferi och redskapslådor. Första kapacitetsmodell: explicita platser och storleksklasser, inte fri packningsfysik.
- Acceptans: flytt till full behållare ändrar ingenting; stängd förvaring kräver öppning; placerade objekt följer rörliga lådor; inga dubletter när dörrar öppnas igen.

### LIFE-006 – Bär innehåll på tallrik och i matkasse

- M0; M; beroende LIFE-005.
- Bärare kan innehålla andra föremål som följer med vid transport. Kontrollera tillåtna innehållstyper och förhindra cirkulär containernästning.
- Acceptans: en matkasse med tre varor behåller dem under flytt; mat på tallrik följer med; en behållare kan inte innehålla sig själv eller en av sina föräldrar.

### LIFE-007 – Versionshanterad sparning av livssimulatorns tillstånd

- M0; M; beroende LIFE-002, LIFE-005, LIFE-006.
- Integrera med befintlig sparfunktion. Spara innehåll, mängder och plats; bygg säkra migreringar och kontrollerad återställning.
- Acceptans: omladdning bevarar innehåll i en buren kasse; skadad/äldre sparning hanteras utan tyst dataförlust; nya itemtyper kräver inte att hela hemmet nollställs.

### LIFE-008 – Återanvändbara handlingar med säkra avbrott

- M0; M; beroende LIFE-003, LIFE-007.
- Inför validering, reservation, commit och avbrott för tidskrävande handlingar. Lägg till tester för dubbeltryck och sparning mitt i handling.
- Acceptans: en handling förbrukar ingående mängd exakt en gång; avbrott före commit ger ingen förlust; scenbyte/paus lämnar inte föremål permanent låsta.

### LIFE-009 – Startsortiment och påfyllning av kyl, frys och skafferi

- M1; M; beroende LIFE-005, LIFE-006, LIFE-007.
- Skapa första innehållspaketet från avsnitt 3 och en leveranskasse med tydligt definierade startmängder. Fri lek får en explicit återfyllningsknapp.
- Acceptans: spelaren kan packa upp minst en kylvara, en frysvara och en skafferivara; återfyllning kan inte oavsiktligt duplicera buren mat; alla startvaror är synliga och identifierbara.

### LIFE-010 – Redskapslåda och val av rätt verktyg

- M1; S; beroende LIFE-004, LIFE-005, LIFE-009.
- Lägg kökskniv, smörkniv, osthyvel och skärbräda i avsedda förvaringsplatser. Definiera verktygstaggar för skära, breda och hyvla.
- Acceptans: spelaren kan välja verktyg och lägga tillbaka det; fel verktyg ger begripligt besked; ett nytt verktyg kan registreras utan en specialskriven UI-meny.

### LIFE-011 – Skärbräda som arbetsstation

- M1; S; beroende LIFE-006, LIFE-010.
- Skärbrädan har plats för råvara och ett begränsat antal resultat. Placeras på befintlig köksbänk.
- Acceptans: brädan måste vara giltigt placerad före skärning; kniv och gurka kan användas med en handplats; full bräda blockerar innan gurka förbrukas.

### LIFE-012 – Skär gurka till användbara skivor

- M1; M; beroende LIFE-008, LIFE-011.
- Implementera enskild skiva och valfritt litet batchval med styrd animation. Använd förbyggda skivformer och förändrad återstående gurka, inte fri mesh-kapning.
- Acceptans: exakt mängdbalans mellan återstod och skivor; flera skivor kan plockas upp; kort rest hanteras; snabbtryck ger inga gratis skivor; omladdning bevarar återstoden.

### LIFE-013 – Öppna brödpåse och ta fram en brödskiva

- M1; S; beroende LIFE-008, LIFE-009.
- Bröd hämtas ur skafferilåda; påsen öppnas och lämnar ut en skiva åt gången.
- Acceptans: antal minskar; tom påse ger ingen mat; påsen finns kvar som tom förpackning; brödskivan kan placeras på tallrik utan recepttvång.

### LIFE-014 – Bred smör och hyvla ost

- M1; M; beroende LIFE-010, LIFE-013, LIFE-008.
- Smör kräver öppnad förpackning, smörkniv och bröd på arbetsyta. Osthyvel skapar en ostskiva från ostblocket.
- Acceptans: smör och ost förbrukas med definierade mängder; för lite innehåll ger konsekvent restregel; smör syns på brödet; redskap markeras som använda.

### LIFE-015 – Bygg och bär en macka

- M1; M; beroende LIFE-012, LIFE-014, LIFE-006.
- Lägg ost/gurka på bröd; lagra ingredienskomponenter och visualisera lager. Tillåt enkla fria kombinationer, inte bara ett enda hårdkodat recept.
- Acceptans: tillsatt ingrediens försvinner från ursprungsplatsen exakt en gång; macka kan flyttas med tallrik; halvfärdig macka sparas; överdrivet många lager begränsas begripligt.

### LIFE-016 – Ät i tuggor och lämna använd disk

- M1; S; beroende LIFE-015, LIFE-008.
- Ät med enkel animation/ljud och några visuella steg. Hunger är inte ett krav ännu; emitera en händelse för senare behovssystem.
- Acceptans: portionen minskar och kan inte ätas två gånger; sista tuggan tar bort maten men inte tallriken; tallriken blir använd; spelaren kan avbryta mellan tuggor.

### LIFE-017 – Enkel avfallsbehållare under vasken

- M1; S; beroende LIFE-005, LIFE-009, LIFE-013.
- Första versionen accepterar matrester och tomma förpackningar i en tydligt märkt spelbehållare. Full sortering kommer i LIFE-022.
- Acceptans: luckan måste öppnas; avfall tas bort från handen och ökar fyllnadsgrad; full behållare ger besked utan föremålsförlust; kniv/tallrik kan inte råka slängas med samma snabbhandling.

### LIFE-018 – Häll upp och drick vatten eller mjölk

- M2; M; beroende LIFE-008, LIFE-009, LIFE-016.
- Glas har kapacitet i ml och synlig fyllnadsnivå. Kran fyller vatten; mjölkförpackning förbrukar innehåll. Blandning av olika vätskor kan blockeras i första versionen.
- Acceptans: glaset kan inte överfyllas; fyllning stoppas vid kapacitet; drickande minskar volym; mjölkpaketet töms korrekt; glaset blir använt. Inget avancerat vätskefysiksystem krävs.

### LIFE-019 – Renhet, avskrapning och enkel handdisk

- M2; M; beroende LIFE-016, LIFE-017, LIFE-018.
- Renhet kopplas till användning. Matrester kan skrapas i soporna; trädisk/andra otillåtna föremål kan diskas för hand vid vasken.
- Acceptans: användning smutsar ned berörda redskap; avskrapning tar bort mat men gör inte föremålet rent; handdisk kräver åtkomst till vasken och avslutas med rent föremål.

### LIFE-020 – Lasta diskmaskinens korgar

- M2; M; beroende LIFE-005, LIFE-019.
- Koppla befintlig lucka/korg till föremålsplatser för glas, tallrikar och lämpliga redskap. Definiera taggen `dishwasherSafe` som spelregel.
- Acceptans: rätt plats krävs; full maskin blockerar lastning; föremål följer korgen; innehåll med kvarvarande mat/vätska hanteras med tydlig tömningsregel; stängd lucka hindrar plock.

### LIFE-021 – Diskprogram, återstående tid och urplockning

- M2; M; beroende LIFE-020, LIFE-007, LIFE-008.
- Inför ett kort justerbart spelprogram med tillstånden ledig, kör, pausad och klar. Vid öppning pausas programmet; återstart fortsätter återstående tid.
- Acceptans: endast innehåll som faktiskt diskats blir rent; nya föremål kan inte läggas in mitt i körning utan definierad omstart; tillstånd överlever omladdning; rent glas kan ställas tillbaka i skåpet.

### LIFE-022 – Sortera sopor och skapa full soppåse

- M2; M; beroende LIFE-017, LIFE-019.
- Utöka till matavfall, restavfall och förenklad förpackningssortering. Spelaren kan knyta ihop och bära en full påse.
- Acceptans: sorteringshjälp visar rätt spelkategori; fyllnad överförs till påsen, inte dupliceras; ny påse krävs enligt vald detaljnivå; tidigare sparad enkel sopbehållare migreras.

### LIFE-023 – Bär ut sopor och återställ behållaren

- M2; S; beroende LIFE-022, LIFE-004.
- Lägg in en markerad avlämningspunkt. Verifiera verklig placering separat; använd vid behov en explicit provisorisk spelpunkt.
- Acceptans: endast avfallspåse kan lämnas där; samma påse ger bara en tömning; spelaren kan gå tillbaka och använda en ny påse under vasken.

### LIFE-024 – Smulor och damm på åtkomliga ytor

- M3; M; beroende LIFE-012, LIFE-016, LIFE-007.
- Generera små mängder smulor från matberedning/ätande och valfritt långsamt damm. Registrera yta och position; inför tak för antal synliga partiklar/fläckar.
- Acceptans: smuts skapas på relevant yta, inte under golvet; sparning bevarar mängd; smuts kan inte växa obegränsat; sandlådeläget kan stänga av automatisk nedsmutsning.

### LIFE-025 – Ta fram och ställ tillbaka dammsugaren under trappan

- M3; M; beroende LIFE-004, LIFE-005.
- Koppla förvaringsplats, dammsugarkropp och munstycke till ett tydligt användningsläge. Återanvänd modellens befintliga dammsugare om sådan finns.
- Acceptans: förvaring måste öppnas; läget går att lämna och återuppta; kroppen hamnar inte i trappans vägg; spelaren kan ställa tillbaka och stänga förvaringen.

### LIFE-026 – Dammsugning som tar bort lokal smuts

- M3; M; beroende LIFE-024, LIFE-025.
- På/av, ljud och begränsad arbetsyta framför munstycket. Använd kontrollerad rörelse utan fri slangfysik.
- Acceptans: smuts försvinner endast när dammsugaren är på och munstycket är tillräckligt nära; inte genom väggar eller på våningen ovanför; städningen fungerar med touch; ingen helrumstömning efter ett klick.

### LIFE-027 – Töm dammsugare och torka av bänken

- M3; M; beroende LIFE-026, LIFE-022, LIFE-019.
- Lägg till begränsad dammbehållare/påse enligt modellens typ. Lägg till trasa för bänksmulor och synliga fläckar, inte en ny generell fysikmotor.
- Acceptans: full dammsugare ger begriplig återkoppling; tömning för över innehåll till avfall; trasa rengör rätt yta och blir smutsig; den går att skölja vid vasken.

### LIFE-028 – Inköpslista, beställning och leverans

- M4; M; beroende LIFE-009, LIFE-007.
- Gör den tidigare testleveransen till ett spelbart flöde. Visa lagerbrist och låt spelaren välja varor. Valfri spelbudget hålls separat från befintliga poäng.
- Acceptans: en order levereras exakt en gång; sparning under väntan duplicerar inte kassen; fri lek kan beställa utan budget; inga riktiga köp eller externa betaltjänster används.

### LIFE-029 – Frivillig hunger, törst och vardagstid

- M4; M; beroende LIFE-016, LIFE-018, LIFE-021.
- Enkla, justerbara behov som påverkas av ätande/drickande och gemensam spelklocka. Ingen medicinsk realism eller exakt näringsmodell eftersträvas.
- Acceptans: behov kan stängas av; paus/flikbyte stoppar progression enligt tidsregeln; mackor ger endast effekt för faktiskt uppäten mängd; befintliga tidsfunktioner fortsätter fungera.

### LIFE-030 – Guidade vardagsuppdrag och hjälp

- M4; M; beroende LIFE-023, LIFE-026, LIFE-028.
- Inför ”Packa upp”, ”Gör en macka”, ”Återställ köket” och ”Städa efter mellanmålet”. Reagera på domänhändelser i stället för en hårdkodad klicksekvens.
- Acceptans: spelaren kan göra giltiga steg i annan ordning; delmål räknas inte dubbelt; tips kan stängas av; uppdrag tvingar inte spelaren att slänga användbara saker eller köpa onödigt.

### LIFE-031 – Genomtesta hela vardagen och mobilprestandan

- M4; M; beroende LIFE-021, LIFE-023, LIFE-027, LIFE-028, LIFE-029, LIFE-030.
- Kör sessionen från avsnitt 2F på dator och mobil/touch. Mät före/efter i samma scen och dokumentera testad enhet; sätt prestandabudget utifrån faktisk baslinje.
- Acceptans: inget blockerande fel från leverans till återställt kök; återladdning mitt i minst fem olika steg fungerar; antal geometrier/lyssnare/timers växer inte vid upprepning; touch når alla nödvändiga handlingar.

### LIFE-032 – Nästa matlagningspaket: kaffe, rostat bröd och stekt ägg

- Expansion; L; beroende LIFE-031.
- Dela vid implementation i tre issues: vatten/kaffe/mugg; brödrost; stekpanna/ägg/spis. Återanvänd mängder, maskintid, smuts och servering.
- Acceptans: råvara förbrukas en gång; på/av och avbrott fungerar; resultat kan ätas/drickas; redskap ger disk. Undvik brand- och skademekanik i första utökningen.

### LIFE-033 – Valbar färskhet, kylning, frysning och upptining

- Expansion; L; beroende LIFE-031.
- Skilj fryst/kyld/rumstempererad från färskhet; definiera förenklade spelparametrar per varutyp. Dessa är inte livsmedelssäkerhetsråd.
- Acceptans: samma tidsmodell används överallt; funktionen går att slå av; gammal sparning får säkra standardvärden; spelet förstör inte all mat under spelarens frånvaro med standardinställning.

### LIFE-034 – Tvättcykel från tvättkorg till garderob

- Expansion; L; beroende LIFE-031.
- Smutstvätt, tvättmaskin, torkning, vikning och förvaring. Återanvänd containrar, maskintillstånd och renhet, men lägg till våt/torr som separat dimension.
- Acceptans: plagg återkommer rena men inte automatiskt torra; maskiner sparar förlopp; förvaring kan bli full utan föremålsförlust. Dela i lastning, program och torkning/vikning.

### LIFE-035 – Växter, dukning och fler små vardagssysslor

- Expansion; M; beroende LIFE-031.
- Förslag på separata små issues: fylla vattenkanna och vattna; duka flera platser; bädda säng; hänga jacka och ställa skor; fylla på toalettpapper.
- Acceptans: varje syssla har synlig före-/eftereffekt och sparas; ingen funktion behöver ett parallellt eget inventariesystem.

### LIFE-036 – Familjemedlemmar som enkla autonoma figurer

- Expansion; L; beroende LIFE-031.
- Börja med en figur som kan gå till en ledig stol, äta serverad mat och lämna disk. Full social simulering, dialog-AI och multiplayer ingår inte.
- Acceptans: figuren reserverar stol/föremål och konkurrerar säkert med spelaren; tar inte saker som spelaren håller; kommer loss vid blockerad väg; aktiviteter kan stängas av.

## 7. Definition of Done för varje gameplay-issue

- [ ] Befintliga lösningar inventerade och återanvända där lämpligt.
- [ ] Förutsättningar, tillståndsövergångar, resultat och avbrott dokumenterade.
- [ ] Visuell förändring och begriplig återkoppling finns.
- [ ] Handlingen fungerar med touch samt datorstyrning där den kan testas.
- [ ] Föremål och mängder dupliceras eller försvinner inte vid dubbeltryck/avbrott.
- [ ] Sparning/omladdning stödjer det nya tillståndet och migrerar gammal data.
- [ ] Relevanta automatiska tester finns för domänlogiken; manuell 3D-kontroll är dokumenterad separat.
- [ ] Ljud upphör vid paus, borttaget objekt och scenbyte; inga växande timers eller lyssnare.
- [ ] Arkitektur, möblering och befintliga spelmekaniker har inte ändrats utanför uppgiften.
- [ ] Eventuella nya modeller/ljud har klarlagd användningsrätt; enkla egna former är godkänd första leverans.

## 8. Viktiga tester och kantfall

- Försök skära utan kniv, utan bräda, genom stängd låda och när brädan är full.
- Skär sista biten gurka; kontrollera att ingående massa motsvarar återstod plus resultat.
- Tryck två gånger på ”Bred” under animation: endast en portion smör används.
- Försök placera en matkasse i sig själv och lägga tallriken i en behållare som är för liten.
- Flytta tallrik med halv macka; spara, ladda om och fortsätt äta.
- Ät sista tuggan; tallriken ska finnas kvar och vara använd.
- Försök hälla i fullt glas och från tom mjölkförpackning.
- Försök lägga glas i full diskmaskin, starta med öppen lucka och plocka ur under körning.
- Pausa/flikbyt mitt i diskprogram; kontrollera exakt den valda tidsregeln.
- Släng avfall när behållaren är full; håll kvar avfallet tills det finns plats.
- Bär ut samma påse: ingen andra tömning eller belöning får uppstå.
- Dammsug med maskinen av, genom vägg och mot smuts på annan våning: ingen smuts tas bort.
- Avbryt dammsugarläget i trappan: spelaren får tillbaka kontrollen och utrustningen hamnar säkert.
- Återställ utvecklarscenario utan att skriva över spelarens ordinarie hem.

## 9. Medvetet uppskjutet

- Fri fysisk kapning av godtyckliga 3D-meshar.
- Realistisk vätske- och smetfysik, slangtrassel och individuellt simulerade smulor utan objekttak.
- Full butik, stadstrafik och leveranslogistik.
- Multiplayer, konton, molnbackend och riktiga köp.
- Medicinskt detaljerad hunger/näring eller verklighetstrogna hållbarhetsråd.
- Full familje-AI, skador, brand och andra omfattande följdsystem.

## 10. Rekommenderad första beställning till Claude Code

Inventera enligt LIFE-001 och återrapportera vad som redan finns. Implementera därefter M0 och M1 i små verifierbara steg, med återanvändning av befintliga system. Målet är att kunna ta emot en matkasse, fylla kyl/frys/skafferi, ta fram gurka/skärbräda/kniv, skära gurka, ta bröd, breda smör, hyvla ost, bygga och äta en macka samt slänga rester under vasken. Spara och återladda mitt i flödet. Vänta med disk, dammsugning och ytterligare expansion tills detta sammanhängande flöde fungerar.

Rapportera för varje steg: planerings-ID, vad som ändrats, hur det testats, vilka begränsningar som finns och vilket nästa beroende är. Rapportera inte en issue som klar bara för att dess UI eller 3D-modell finns – hela handlingen och dess tillståndsförändring ska fungera.
