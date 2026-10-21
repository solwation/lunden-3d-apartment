# Kv. Lunden L1007 i 3D

Gå runt i lägenheten L1007 (Kv. Lunden, Peab) i webbläsaren som i ett FPS-spel: entréplan och
övre plan med trappan emellan, byggt direkt från den måttsatta planritningen
(`L1007_mattsatt_planritning.pdf`).

Skriv en befintlig privat adminkod i den vanliga chattrutan. Efter lyckad inloggning visas **Rapportera** och **Möblera** under textfältet. **Rapportera** öppnar en egen popup med textfält, sändknapp och status; en bild av spelvyn följer automatiskt med. **Möblera** startar ommöbleringen först när du klickar på knappen. Sessionen försvinner vid utloggning, omladdning eller utgången inloggningstid. Agenter granskar rapporterna och skapar GitHub-ärenden märkta `in-game`; rapporten tas sedan bort från kön. [Importguide för agenter](docs/development/report-import.md).

Chatten visar de senaste meddelandena även när utrymmet är trångt. Varje rad ligger kvar i upp till en minut; pratbubblan över spelaren försvinner efter tio sekunder.

På telefonen ligger laddningsskärmen kvar medan grafiken förbereds i små steg, tills hela den första 3D-bilden är klar. Tillfälliga nätfel när planritningen hämtas får ett automatiskt återförsök. Om starten ändå misslyckas eller fastnar visas ”Försök igen”, utan att din sparade plats eller ditt hem raderas. Grafiken arbetar mindre när du läser en lapp eller pausar, och vilar bakom uppmaningen att vrida telefonen.

Telefoner behåller mindre bildminne för färdigritade statiska ytor, inklusive färdig väggtext, och avstängda speglar. [Mätningen](docs/validation/issue-1359/README.md) visar en minskning i telefonprofil. Användaren bekräftade den 20 oktober 2026 att senaste testet på fysisk iPhone gick utan krasch; #1359 är stängd.

I rutan uppe till vänster visas antalet besökare över bildfrekvensen (FPS). FPS räknar visade 3D-bilder, uppdateras lugnt och visar ett streck när spelet är pausat eller dolt. Träfftexten håller sig fri från livsrutan även på små skärmar.

Bilen stannar för spelare i sin körväg även i svängar och vid backning.

Återplacering på höjder i området använder markens verkliga modellhöjd, så att kameran stannar över marken.

Promenadstråken i parken och längs Höje å samt vägarna i resten av området har lampor med varma ljusfläckar på marken efter skymningen. Lamporna följer även jordramperna vid den lilla träbron.

Med jetpacken kan du stiga genom ett molnlager och upp över ett tätt molnhav. Ovanför ligger marken dold under molnen även när vädret på marken är klart.

Vintervyerna kräver mindre ritarbete när trädens och klängväxternas löv har fallit.

Entréväxternas grafikgränser rymmer även lövens fulla vindsvängning vid bildkanten.

På telefonen slipper grafiken även rita föremål som ligger helt utanför bilden.

I källaren slipper grafiken rita hela föremål som är helt skymda av garagets synliga, täta tak.

På vintern har båda hästarna varsitt täcke och står synliga inne i hästhagens skjul, med halm på golvet, girlang och en varm ljusslinga. När snön försvinner försvinner täckena och pyntet och hästarna går ut i hagen igen.
Skjulet och vattenhon står nu närmare staketet vid grinden, med samma storlek och fri passage vid stättan. Placeringen är en uppskattning och väljs bara om marken är tillräckligt plan.

Alla spelare kan gå in i lekstugans hemliga klubbhus, oavsett längd. En hall med “LET’S PLAY!” leder till separata rum märkta BIO, BILJARD och SPEL. Bion har en stor duk, röda sammetsgardiner och två rader biostolar med fri mittgång. I SPEL står fyra färgtemade datorbord, två längs varje sidovägg och i BILJARD står bordets kortsida mot dörren med fri gång runtom. Dörren inifrån går alltid att använda för att komma ut. Sikta över biljardbordet och tryck E för att stöta, och vänta tills bollarna stannat inför nästa stöt.
Pussar fungerar bara mellan en Sarah och en Olof, i båda riktningarna; namnen får innehålla respektive namn men inte båda. Kom nära utan vapen och använd E/pekknappen: båda lutar sig fram, putar med läpparna och pussas med ett ”mmm-smack” och hjärtan. Den som börjar får +100 poäng för kärlek när pussen genomförs. Andra par och längre avstånd ger vanlig hälsning.

När du möblerar om står möbler ovanpå mattan och åter på golvet när de flyttas av den. Flyttar du själva mattan justeras höjden för möbler och saker som står kvar.

Soffan och fåtöljen har mjukt välvda dynor och diskreta kederkanter. I materialmenyn kan du välja en enskild kudde, pläd eller klädsel på soffan och fåtöljen. Förhandsvisa färg och mönster, bekräfta för alla besökare eller välj Original för att återställa just den ytan.

De tre Verona-delarna på uteplatsen har egna tygval för sina fasta sitt- och ryggdynor. Stålstommen och de lösa prydnadsdynorna behåller sitt utseende och sin vanliga väderstyrning.

Klockhusets fyra urtavlor visar samma tid som köksklockan i L1007, även när tiden pausas eller spolas. Tydliga markeringar och visare gör tiden lättare att läsa på håll.

**▶ Öppna: https://solwation.github.io/lunden-3d-apartment/**

På insidan av koppskåpets lucka i köket sitter en **uppdragslapp** med tre olika tillgängliga vardagsuppdrag som slumpas fram för den lokala kalenderdagen. Samma uppdrag och sparade delmål finns kvar hela dagen, även när du kommer tillbaka; klara uppdrag byts inte ut under dagen. Tips går att stänga av. Varje uppdrag har sin egen poängbelöning och belönas högst en gång per dag. När alla tre är klara får du dessutom **15 bonuspoäng, exakt en gång för dagen**. Tomma sopkärl behöver inte tömmas. Soppåsarna lämnas i de tre behållarna längs portikväggen mot lägenheten.

Hus A:s glasade port och väggarna bakom den syns även från L1007:s uteplats.

Häckarna vid våra och grannarnas uteplatser har lövstruktur, rundade hörn och en lätt ojämn ovankant.

Grannlägenheternas fönster och dörrar på L-husets fyra våningar har karmar, bågar, tätningar och glasreflektioner. Grannarnas glas döljer insidorna; L1007:s öppningsbara fönster och dörrar behåller sin genomsikt. Ytterdörrens handtag syns även när dörren är stängd. Lägenhetens dörrar har rundade ståltrycken och rosetter; badrum och WC har toalettvred och entrén har oval låscylinder och slutbleck.

Föremålet du siktar på blir diskret ljusare när det går att använda. Markeringen följer den aktuella handlingen, behåller föremålets vanliga material och försvinner när du tittar bort.

När du håller ett föremål visar en vit kontur var det kan placeras eller lämnas tillbaka. Markeringen följer aktuella möbler och syns bara vid ett giltigt mål inom räckhåll.

Kranarna i kök, tvätt och båda badrummen styrs med blandarspaken: den lyfts när vattnet sätts på och sänks när det stängs av.

Markeringen av föremål är optimerad för att minska ryck när blicken flyttas.

Skottens kollisionskontroll hoppar över avlägsna statiska ytor innan deras detaljerade träffkartor förbereds.

Ta jackan och skorna från hallgolvet och häng jackan på kroken eller i den öppna hallgarderoben; ställ skorna på skohyllans lediga plats. Fulla platser behåller det du bär, och undanlagda saker sparas mellan besöken.

Täcken rufsas när du lägger dig i en säng. Res dig och sikta på sängen för att välja Bädda eller lägga dig igen; över- och underslafen sparas var för sig. Avbruten bäddning lämnar täcket rufsigt.

Duka SKANSNÄS-bordet genom att bära ut tallrikar och dricksglas från skåpen och sikta på en av de sex dukplatserna. Varje plats rymmer en tallrik och ett glas; en upptagen plats behåller föremålet i handen. Dukning, mat på tallriken och vatten i glaset sparas mellan besöken.

Krukväxternas blad och stjälkar svajar mjukt när ett fönster eller en ytter-/uteplatsdörr är öppen. Regn och snö förstärker vinden; krukorna står stilla och rörelsen avtar när öppningarna stängs.

Duscharna sprutar smala, separata vattenstrålar från duschhuvudet ned till golvet.

På tvättbänken står en vattenkanna. Fyll den vid en rinnande kran och sikta på en krukväxt för att vattna: jorden mörknar och fönsterväxternas blad reser sig. Varje växt får en dos; tom kanna, redan vattnad växt och konstväxt ger en förklaring. Kannans vatten och bevattningen sparas även när krukor flyttas.

I tvättrummet finns en korg med smutsiga plagg. Ta ett plagg, öppna maskinluckan och sikta in i trumman för att lägga in det; stängda luckor och fulla maskiner stoppar lastningen. Starta tvättprogrammet på panelen med luckan stängd: efter 35 sekunder är plaggen rena och våta. Lägg den våta tvätten i torktumlaren och kör dess 25-sekundersprogram. Vik torra plagg med användhandlingen och lägg dem på tvätthyllan i en öppen sovrumsgarderob; när hyllan är full stannar plagget i handen. Öppnade maskinluckor pausar programmen; återstående tid, plaggens plats och tillstånd sparas mellan besöken.

En kylhylla visar två dubbel-IPA och två trippel-IPA från UntappdBolagets globala topplistor. Urval och riktiga etiketter uppdateras vid dagens första laddning; vid nätfel finns senaste kompletta urvalet kvar.

Bananerna äts uppifrån och ned. Bananskal och äppelskrutt stannar i handen när du ätit klart: lägg dem ifrån dig eller släng dem i matavfallet under diskhon. Kvarlagda och slängda rester sparas mellan besöken.

I kylen finns en äggkartong: öppna den, ta ett ägg och knäck det i stekpannan på hällen. Påslagen häll steker ägget, som kan serveras på tallrik eller macka och ätas. Pannan och tallriken behöver sedan diskas vid kökskranen.

Från 1 december till och med 6 januari står en hög julgran i vardagsrummets hörn till höger om vitrinskåpet (fåtöljhörnet vid dörren), med blinkande ljusslinga, julgranskulor, guldgirlang, stjärna i toppen och paket under. Den följer spelets datum (även kattkalenderns datumval) och är borta resten av året. Fåtöljen, pallen, golvlampan och sidobordet som står på granens plats göms så länge granen står där och kommer tillbaka när den flyttas eller säsongen är slut; E på granen tänder och släcker ljusen. I **Möblera om** kan granen flyttas som andra möbler, och platsen sparas till nästa jul.

Tryck **Enter** eller **§** (eller **>_** i poängbrickan på touch) för att öppna konsolen. I läget **Möblera om**: sikta på en möbel, tavla eller en lös spegel, välj med E/klick, sikta på golvet eller väggen och placera med E igen. Panelen visar stegen Välj och Placera. **R/Vrid** roterar och **X/Avbryt flytt** avbryter den valda flytten. **Klart** avslutar ommöbleringen. De lösa speglarna kan flyttas separat; badrummens fasta speglar behåller sina platser. TV:n placeras ovanpå bänkytan och följer med TV-bänken vid flytt och rotation. Vinstället och vitrinskåpet flyttas på väggar med innehållet kvar; SYMFONISK-lampan och högtalarna kan placeras på fönsterbrädor och bord. Föremål på möbler följer med; mattor flyttas för sig. Bekräftade placeringar delas via Cloudflare och sparas till nästa besök. Knappen **Återställ originalposition** (eller **Home** på tangentbordet) ber om bekräftelse och återställer sedan den valda möbeln eller tavlan med medföljande saker. **Återställ all möblering** varnar innan alla möbler, tavlor och lösa speglar i alla rum återställs. Båda återställningarna delas med alla besökare; **Avbryt** eller **Esc** ändrar ingenting. **§/Meny** öppnar möbleringsmenyn med fri muspekare; återställningarna finns under **Återställ möblering**. **Esc** avslutar möbleringsläget och avbryter en osparad flytt.

Dagens tre uppdrag ligger kvar hela den verkliga lokala kalenderdagen, med sparade delmål och markering av klara uppdrag. Nästa lokala kalenderdag väljs dagens uppdrag på nytt bland de tillgängliga uppdragen. När alla tre är klara visas ”Alla uppdrag avklarade” och dagens engångsbonus på **15 poäng**, utöver uppdragens individuella belöningar.

Spindelmannendräkten ligger i en byrålåda i Walter och Kians rum; med den klättrar man på ytterväggar och skjuter nät. Andra spelare ser dräkten på din avatar; när du tar av den återkommer ditt vanliga utseende. Vid nätets drag och luftsving hålls händerna närmare kroppen, med en avslappnad vänsterhand och fri sikt.

Skott och fall använder samma liv. Ett lägre skadligt fall tar halva maxliven; två sådana fall utan återhämtning dödar. Ett högre fall dödar direkt. Överlever du får du en skadereaktion och stannar där du landade; bara död ger svart bild och återstart utomhus. Det gäller även utan vapen, medan spindelmannendräkten behåller sin mjuka landning.

En liten kompass överst visar N, S, V och Ö. Den röda pilen pekar mot geografiskt norr när du vänder dig. Kompassen döljs tillfälligt medan notiser visas.

Diskreta kantlinjer på väggar, dörrar och fast inredning gör hörn och rumsgeometri lättare att urskilja, även i trapphuset och hissen. Skarvar mellan byggdelar på samma plana väggyta filtreras bort; verkliga hörn och öppningar behåller sina accenter.

## Styrning

| Tangent | |
|---|---|
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> / piltangenter | gå |
| Mus | titta |
| <kbd>Shift</kbd> | spring |
| <kbd>Mellanslag</kbd> | hoppa (lågt, klarar den klippta häcken framför L-huset; med Spindelmannendräkten mycket högre; på touch knappen ⤒) |
| <kbd>C</kbd> | håll inne för att huka dig (sittande: res dig; <kbd>Ctrl</kbd> fungerar också) |
| <kbd>←</kbd> <kbd>→</kbd> | vrid |
| <kbd>E</kbd> | öppna/stäng dörren du tittar på, klappa katten eller välja Ta upp, läsa lappen |
| <kbd>F</kbd> | möbler av/på |
| <kbd>Q</kbd> | mätläge av/på: välj två ytor med klick (📏 och två tryck på touch); nästa klick börjar ett nytt par, måtten är ungefärliga modellmått |
| <kbd>M</kbd> | ljud av/på |
| <kbd>Tab</kbd> | håll inne för att se statistiken (<kbd>T</kbd> låter den ligga kvar) |
| <kbd>K</kbd> | visa/dölj bara minikartan (den syns annars ihop med statistiken) |
| <kbd>Esc</kbd> | släpp musen |

**Touch (mobil, surfplatta, Surface):** välj *Touch* på startskärmen (på telefon och surfplatta finns
bara en *Börja*-knapp). Spelbildens storlek följer skärmens visningsyta även vid rotation under laddningen. Vänster tumme är en joystick
(tryck ut den helt för att springa), dra med höger tumme för att titta, och tryck på knappen som
dyker upp för att öppna och stänga dörrar. 📊 visar statistiken.

**iPhone:** sidan blir bara helskärm som app, så den ber dig först lägga till den på hemskärmen
(Dela → *Lägg till på hemskärmen*). Appen har egen statistik, skild från webbläsarens.

Entréhallen har en svart IKEA NISSEDAL-spegel, 65 × 150 cm.
Garderobernas stängda skjutdörrar har täckta fogar även från sneda vinklar.
Öppna dörrar och garderober — ibland sitter det en katt där och tvättar sig, även i städklädkammaren under trappan. Gå fram och tryck
<kbd>E</kbd> eller välj **Klappa** för att klappa katten eller kattungen. Välj **Ta upp** (2 på tangentbordet) för att bära den i famnen medan den spinner. Miele har fortfarande Ta upp som första val. Klicka eller tryck Krama för en kram, och använd E mot golvet för att sätta ner den: den jamar och går därifrån. Håller du redan något kan du klappa katten med E. 🐈 Statistiken (katter, dörrar, steg …) sparas i webbläsaren; varje
sak du gör visas som en liten bricka ("✋ Klappat katt +1").

*Avsluta* på Escape-menyn försöker stänga fönstret. Om webbläsaren blockerar det visas hjälp för att stänga manuellt.

*Återställ* på startskärmen ställer tillbaka hela hemmet som vid första besöket (dörrar, lampor, saker,
gardiner, möblerna, klockan) — uppsatta teckningar, poängen, namnet på topplistan och kattfotona finns kvar.

Klockan går i realtid: ett dygn tar 24 timmar och följer din egen klocka och dagens datum — de små lamporna tänds själva när det skymmer, taklamporna tänder du med knapparna vid dörrarna. Solen går som i Lund. Med klockan på köksväggen (E) kan du spola tiden fram och tillbaka och pausa (”Nu” tar dig tillbaka till riktiga tiden), och på kattalmanackan bredvid (E) väljer du datum, för att se hur ljuset faller en junimorgon eller en decembermorgon.

I alla fönster sitter plisségardiner som dras upp nerifrån: gå fram och tryck <kbd>E</kbd>, dra upp och ner med
<kbd>W</kbd> <kbd>S</kbd> (eller ▲ ▼), <kbd>E</kbd> när du är klar. De mörka i sovrummen gör rummet mörkt mitt på dagen.

Alla gardinskenor i taket går från vägg till vägg. I köket hänger även den korta, ljust botaniskt mönstrade kappan över hela bredden, med fönstret fritt under sig.

Vardagsrummet har tre gardinlängder med stora, täta mörkgröna bladformer på vit botten, efter fotot av IKEA-tyget, på en takskena från vägg till vägg, även över balkongdörren. Dra dem åt sidan med <kbd>A</kbd>/<kbd>D</kbd> eller ◀/▶ så att dörren och fönstret lämnas fria.

Högtalarna och bilradion har sex musikkanaler med två låtar var. Även datorn, laptopen och Kaffeturbo spelar
inspelad musik. Under *Om musiken* i menyn finns musiker och källor; alla inspelningar har CC BY 4.0-licens och kan provspelas där.
Låtarna har full längd och stereo. Musiken laddas först när den spelas; om inspelningarna inte kan hämtas förblir det tyst.

Regnljudet är dämpat så att andra ljud hörs bättre, med fortsatt extra dämpning inomhus och i stängd bil.

Vädret hämtas från [Open-Meteo.com](https://open-meteo.com/) (väderdata under CC BY 4.0); källan anges på startskärmen.

De 100 senaste nyhetspunkterna står på lappen på frysen i köket (gå fram och tryck <kbd>E</kbd>). Det som
tillkommit sedan ditt senaste besök är markerat *Nytt*. Huvudträffsuppdateringar samlas under **Förbättringar för huvudträffar.** Nerf-optimeringar samlas under **Förbättringar för Nerf-skott.**

På touch ligger spelknapparna samlade nere till höger med större träffytor och mellanrum. Hoppa och huka har fasta platser ovanför handlingsknappen; utrustning och livsmätare flyttar inte runt dem. Flera handlingar visas i två kolumner som kan rullas när utrymmet är trångt. Vänster tumme går och höger tumme drar för att titta.

På touch använder tydliga dörrar, lådor och luckor korta texter som **Öppna**, **Stäng** och **Dra ut**. Små föremål behåller sina namn, till exempel **Ta smörkniven**, och förflyttningar till ett särskilt mål anger vart föremålet hamnar. Diskmaskinens korgar kan väljas även mellan metalltrådarna; tallrikar, glas och bestick i dem går fortfarande att plocka upp. Kylens grönsakslåda och frysens fyra lådor kan dras ut, fyllas och skjutas in; innehållet följer med och sparas mellan besök. Skjut in lådorna innan du stänger luckan.

## Köra lokalt

```
python3 -m http.server 8137
```

Öppna sedan http://localhost:8137/ i Chrome.

## Hur det funkar

`tools/extract_plan.py` läser väggar, fönster, dörrar, trappa och fast inredning direkt ur
PDF:ens vektordata och skriver `data/plan.json`. Sidan (`index.html` + `src/`) bygger 3D-modellen
med three.js. Mått som inte finns i ritningen (bröstningshöjd, bjälklag, nedsänkt tak i sovrummen
m.m.) ligger samlade i `src/config.js`.

Huset (Hus L, Parklängan), Å-husen A, B och C, vägarna och nivåskillnaden ner mot S:t Lars park
och gården med pergola, grill, lekplats och boulebana är uppmätta på Peabs situationsplan och översiktsplaner (sidor ur planritningsbroschyren ligger i
`docs/peab/`). Solen går efter verkliga väderstreck: entrén vetter mot östnordost. Entréstråket längs hus L är fritt från parkerade cyklar; cykelparkeringen vid kvarterets hörn har sina ställ kvar. Alla nio befintliga cyklar på nordvästra gården kan användas med E eller touchknappen: WASD/joysticken kör, E eller avstigningsknappen kliver av på en säker ståplats. Vid omladdning står spelaren säkert och cyklarna återgår till sina ställ.

Hus A:s och Hus B:s norra uteplatser mot gården har golv i nivå med gården, så du kan stå på dem.

Rutschkanan på gården används med E eller touch vid stegen eller plattformen: du klättrar upp, åker synligt längs rännan och kliver av på fri mark. E, mellanslag eller touch avbryter åket.
De två gungorna på lekplatsen används med E eller touchknappen. Sätet och kedjorna rör sig medan sittvyn följer med; E, mellanslag, C eller touchknappen reser dig på fri mark.

Inredningen följer våra materialval i Peabs tillvalsportal: köket med grågröna Form Tall-luckor,
överskåp och kyl/frys enligt vår köksritning, Ek Chalk-parkett, klinker i hall och våtrum, kakel i
badrum och WC/dusch, samt tillvalsdörren till Allrum (fyra sovrum på övre plan).
Hällen har en fasad glaskant och tydliga touchreglage; köksfläkten har borstat stål,
filtergaller och separata LED-spottar. [Bilder före och efter](docs/validation/issue-1043/README.md).

Mått på ritningen är ungefärliga (≈, avrundade till 5 cm). Kontrollera kritiska mått mot Peabs
byggritning.

Teckningar som tejpas upp och teckningen på skrivbordet kan delas mellan alla besökare via en
Cloudflare Worker (kattfotona är personliga och stannar i webbläsaren) – slå på det med `./cloudflare/setup.sh` (se `cloudflare/README.md`).

Mer om lägenheten: https://peabbostad.se/projekt/skane/kv.-lunden/l1007/

Du kan hämta en reservrulle i HAVBÄCK, byta en tom toalettrulle och lägga tillbaka papphylsan. Rullar och återstående papper sparas mellan besöken.

Utvecklingsregler och läsanvisningar finns i [CLAUDE.md](CLAUDE.md). Välj minsta tillräckliga kontroller enligt [den riskbaserade verifieringspolicyn](docs/development/verification.md#verification-policy). Därifrån når du ämnesfilerna i `docs/development/` för bland annat arkitektur, interaktioner, livssimulering, grafik, sparning, verifiering och drift.

Källaren följer Peabs plan för cykelrum och förrådsområden under hus L, C, B och A. De 15 extra hyrförråden skiljs från ordinarie lägenhetsförråd; antal och indelning av ordinarie burar är illustrativa. [Planjämförelse, avgränsningar och webbläsartester](docs/validation/issue-523/README.md).

Uteplatsens stora solfjäderspalm har en öppen rundad kruka med jord, fiberrik stam och veckade bladfingrar med mjuk vindrörelse. [Bilder och verifiering](docs/validation/issue-524/README.md).

Vägbron och den separata gång- och cykelbron vid Sankt Lars väg syns över en nedsänkt Höje å, även bortom gångområdets gräns. Vattnet, stranden och dalbotten följer nu ett svagt fall nedströms; vattenstånd och djup är fortfarande uppskattningar. [Kartjämförelse, vyer och antaganden](docs/validation/issue-532/README.md).

Höje å omges av varierande slänter, kartans huvudstigar, öppna gräsytor, större lövträdsdungar och strandvegetation som följer årstiderna. [Underlag och jämförelsevyer](docs/validation/issue-533/README.md).
Jordrampernas öppna sidor vid den lilla träbron är tätade mot den ritade marken, så slänterna hänger inte längre som tunna skivor ovanför åstranden.

Den norra serviceinfarten söder om ån följer kartans fyra väglänkar och ansluter till Sankt Lars väg och parkeringarnas korta tillfarter. Vägbredd och asfalt är illustrativa antaganden; den befintliga promenadgränsen är oförändrad.
Den södra tvärvägen och den smala servicevägen bakom hus 45 binder också ihop kartans vägnät; deras bredder och beläggning är illustrativa.

Gräsmattorna på gården och längs gatan har fin grässtruktur och ojämna gröna toner; på hösten gulnar de och på vintern täcks de av snö.

Västervyn har kartans husrad och angöring längs Karpvägen, som fortsätter mot nordväst förbi öppna parkytor. [Fotavtryck och sommar-/vinterjämförelse](docs/validation/issue-534/README.md).

Eastern campus (#535): `SITE.east` and `sitebackdrop.js` replace nine illustrative blocks with sixteen mapped footprints, including Montessori wings and Realgym’s actual courtyard hole. HepCat’s detailed geometry stays. Shared brick texture, five exterior batches, sourced access/paths and approximate aerial avenues/groves using existing seasonal tree instances; unchanged OUTDOOR. All heights/floor counts/roof details remain assumptions. `eastbackdroptest` checks source geometry, actual outward windows, open courtyard and tree/access clearance. [Inventory, sources and browser comparison](docs/validation/issue-535/README.md).

Southern backdrop (#536): `SITE.south`/`southbackdrop.js` add 54 existing mapped footprints, a real courtyard hole, simple landmark windows and hip/gable roof silhouettes, sourced roads/open fields and 70 low-detail seasonal woodland trees. Four merged surfaces plus two instanced meshes, no new textures/lights/interiors or OUTDOOR expansion. Clear-weather fog ends at 650 m; camera far 1000 m, outer ground edges hidden. Rain retains its 80 m fog target. Untagged dimensions/height/roof details remain assumptions; proposed Hunnerup 30 buildings excluded. `southbackdroptest` checks sources, real courtyard aperture and seasonal buffers. [Sources, budgets and before/after](docs/validation/issue-536/README.md).

De adresserade lågbyggnaderna söder om ån har enkla fönster längs långsidorna; gavlar och sju osäkert klassade byggnader lämnas blanka.

Northern surroundings (#530): `SITE.north`/`sitebackdrop.js` add three missing exact footprints; seven western bodies from #534 and eastern campus bodies remain unique. Far Sankt Lars väg follows its mapped northwestern turn; sourced Källby/Alvägen paths, aerial pixel parking traces and seasonal avenue/grove trees complete the ground. Five exterior batches, shared textures, unchanged OUTDOOR. All untagged heights/roof/parking/tree details are assumptions; no old proposed buildings. `northbackdroptest` checks source polygons, actual outward window rays and no duplicates. [Registration controls, sources and before/after](docs/validation/issue-530/README.md).

Road and footpath junctions use exact carriageway-edge clipping, including oblique approaches and pavements at sharp bends; the [environment guide](docs/development/environment.md#paths-and-roads-audit-1341) lists the geometry and browser checks.

HUD-badgarna har samma skal, tydligare poäng och plats för kompassen även på smala liggande skärmar. Tid visas ovanför väderikon och temperatur i en gemensam, smalare ruta.

Andra spelare har mindre namnskyltar med sina poäng, uppdaterade i samma spökskylt. Deras figurer hukar när de faktiskt är nere, även under rörelse; samma pose syns i din spegel. När någon bär en katt syns rätt katt i figurens famn, även i spegeln; katten försvinner när den sätts ner eller stuvas undan på cykeln. Din standardfigur har samma längd hos andra som i din egen spegel.

Skadade liv återhämtas med ett liv per verklig minut upp till max, även utan vapen. I flerspelarläget håller servern din livmätare och motspelarnas indikatorer i synk; utan anslutning använder spelet samma lokala liv.

Ölhyllans lokala etiketter får avkodas klart även när tung uppstart passerar nätverkets tidsgräns.

Uppdragslappen visar dagens tre uppdrag med deras egna poäng och sparade delmål. Ett klart uppdrag står kvar som klart tills den lokala kalenderdagen byts.

Nollställning av statistiken rensar även dynamiska räknare, så inga gamla poäng ligger kvar.

Stridens skottkontroller kan hoppa över tomma delar av stora modeller efter en begränsad bakgrundsförberedelse; lokala träffytor kopierar världskoordinater utan en tillfällig array per hörn; fysisk telefonverifiering återstår. [Mätning och begränsningar](docs/validation/issue-715/README.md).
Gevärets, trollstavens och spindelnätets huvudträffar använder tre enkla boxar för huvudets nederdel, mitt och smalare topp. De följer spelarens storlek, riktning och hukning; hår, ögon och små animationer påverkar inte skadan. En huvudträff tar två hjärtan, en kroppsträff ett. Väggar stoppar skott och serverbekräftade träffar visar ”Träff!” eller ”Huvudträff!”. Ljussabelns sving kan ge huvudträff längs siktriktningen, och jetpackens nedåtriktade låga när den träffar huvudet. Övriga kontakter behåller kroppsskadan. Bågens pil kan också ge huvudträff längs sin fallande bana; första kropp eller hinder stoppar en senare huvudträff.

Olofs bil kommer fram lite snabbare och har en grön ÖVNINGSKÖR-skylt baktill när han är i bilen.

Skott behåller föremålens egna träffregler även när hinderkontrollen är uppvärmd.

Nerfpilar når upp till 25 meter och en bekräftad spelarträff hörs med en egen tydlig ton. De första skotten kan räknas som bom medan hinderdata förbereds. [Verifiering och begränsningar](docs/validation/issue-714/README.md).

Dyra browserprov sparar avslutade delresultat före bilder, med källhashar och separat status för scenario, bilder, städning och faktisk CLI-exit. [Artifact-konvention](docs/development/verification.md#artifact-checkpoints-881).

Historik för äldre cachade klienter (v1): följande detaljer om huvudregioner ersätts i nya klienter av de tre boxarna ovan.

En verifierad smal nedre mittdel av näsan kan också ta två hjärtan när spelaren står still. Celler utanför stödet fortsätter ge vanlig skada; figurens form ändras inte.

Gevärsträffar på verifierade främre sidoceller av spelarfigurens näsa kan också
ge dubbel skada. Täckta, osäkra eller ännu overifierade celler ger fortsatt vanlig
kroppsskada; detta är inte ett löfte om hela näsan eller alla animationstillstånd.

#938 adds a narrow left-temple confirmation after a greeting for targets whose first valid standing p/r/c never changed on that connection. A private permanent history flag survives hibernation; right/changed/crouched/legacy targets retain #932's post-greeting fallback. Actual native pose/history and ordinary Worker/HP/receipt verification lives in `tools/riflelefttest.cjs`; no geometry, animation timer or wire changes. #935 remains open for the remaining family.

Layout crash diagnostics also label surface-size faults separately from hidden
or visible projection mismatches; all original reports and thresholds remain.
See [storage](docs/development/storage.md) and the targeted
[`layoutdiagnostictest`](tools/layoutdiagnostictest.cjs) verification.

A narrow left-temple rifle contact also supports one server-normalized yaw quantum
from the first standing pose after greeting. Movement, crouching or leaving that
private corridor permanently closes this additional permission; it adds no pose
timer or animation change. See [interaction rules](docs/development/interactions.md)
and [targeted verification](docs/development/verification.md).

The narrow Front skull band also supports an accepted greeting combined with
a standing yaw change inside the original private first-heading ±.02 corridor
(#955). It uses a separate server permission and the unchanged measured region;
leaving that corridor, movement, crouching or unknown history stays body-only.
`tools/riflefrontcombotest.cjs` verifies actual native wave/turn contacts and a
fresh Worker receipt. No timer restores pose eligibility or changes publication
thresholds, geometry, damage counters or other surface families.

Front rifle head support is explicitly bounded: fresh unturned before greeting,
immutable standing after greeting, the trusted first-heading±.02 standing turn,
and their greeted-turn combination. Unsupported points/rays, larger turns,
movement/crouch and unknown history keep the extra Front body fallback. See the
[declared matrix](docs/development/interactions.md) and
[criterion evidence](docs/development/verification.md); parent closure does not
imply arbitrary all-pose support or close other head-surface families.

A separate bounded standing-turn history now supports the same narrow left-temple
surface after a larger turn following greeting. It preserves the older tiny-turn
rule and permanently closes on accepted movement, crouching or corridor escape.
See [interaction rules](docs/development/interactions.md) and
[verification](docs/development/verification.md); larger lateral remainders remain
tracked in #935.

The existing bounded Rear leaf also works after an accepted greeting when the
server's original private first-standing `headPoseFixed` is explicitly true
(#951). Changed or unknown history cannot use this immutable permission; the
independent bounded-turn exception is described below. Neither uses a
wave-completion timer or new geometry. See the
[scoped native and real-room evidence](docs/development/verification.md#immutable-rear-after-greeting-951).



On prepared phones, resizing the drawing buffer waits while the opaque rotation
screen or hidden document covers the view, then catches up before rendering again.
CSS/input sizing and the original context-restore/reload behavior remain intact;
[finite native evidence and remaining iPhone check](docs/development/performance.md#covered-phone-viewport-resize-669-2026-10-14).

The existing Rear patches also accept a greeted standing player's small accepted
yaw correction when the unchanged private first-standing corridor remains valid
(#952). This separate permission does not reopen larger turns or position/stance
changes; see the [finite verification](docs/development/verification.md#small-yaw-rear-after-greeting-952).

Legacy cached clients only: the independent first-turn Rear permission (#962) also supports a first exact
serialized ±.04 rad heading change after greeting, followed by that same heading.
Ordinary Ghosts publication needs no weapon swap. Other accepted heading/p/c
changes permanently invalidate only this new branch. Rounded ±π aliases such
as 3.14 → −3.10 remain body1; unwrapped 3.14 → 3.18 is supported. Broader
turn/recovery behavior remains #941. See the
[finite verification](docs/development/verification.md#first-ordinary-turn-rear-962).

Legacy cached clients only: #950 adds a narrow central Nose depth family for rifle hits on a player whose first standing position, heading and crouch state have never changed on that connection. It reuses private immutable history and the original Nose geometry/6mm entry guard; other Nose families and ordinary body fallback stay independent. See [verification](docs/development/verification.md#immutable-central-nose-depth-950).

Legacy cached clients only: #967 adds a separate style0 RIGHT head-hit family after one small negative standing
turn following a greeting. A conservative whole-cell prism guard keeps uncertain
contacts at body1; later movement, crouch or another turn disables this family.
Style2 now uses the same rule (#968); old long-hair refinement #973 is superseded by #974.
Existing head-hit families keep their own rules. See the
[source-bound certificate](docs/development/verification.md#continuous-style0-right-cell-967).

Legacy cached clients only: #971 adds a source-derived immutable Nose ray prism alongside the four existing Nose families. It covers additional central-side cells without changing the original 6mm entry guard; the remaining anatomical details are superseded by #974. See [verification](docs/development/verification.md#immutable-nose-prism-971).

The five existing courtyard bicycles can also be ridden with E or the touch action, using the same controls and safe standing reload as the NW bicycles (#906).
Nerf uses the same three approximate head boxes as the rifle along its falling muzzle
path (#894): the server confirms two hearts for the head, one for the body, while
walls, range, shot timing and kill receipts keep their existing rules. See the
[interaction contract](docs/development/interactions.md) and
[focused verification](docs/development/verification.md#nerf-shared-head-boxes-894).

Jetpack flames now stop at solid walls and corners before damaging another player,
while open passages and side contacts within the flame volume remain valid (#978).

The actual entrance/lobby shells in Houses A, B and C remain visible beyond the lift/stair detail distance, using each house’s existing dimensions. House L’s open portik remains a through-passage (#976).

På alla datorer, även laptopen, väljer man YouTube eller Spel med E eller
tryckknappen. Ormstriden är ett gemensamt ormspel: ät, väx och få de andra
att krocka med din kropp. En större orm vinner vid huvudkrock. Styr med pilar,
WASD, mus eller pekskärm; lämna datorn för att lämna matchen. Fyra färgtemade
datorbord står i lekstugan, två längs varje sidovägg. En person styr varje dator
och samma arena delas med datorerna hemma.

Interagera direkt med bioduken, även från biostolarna, för att öppna
filmvalet med förslag, bildkort och sökning efter filmer eller kanaler. Sökningen
väljer filmer som tillåter inbäddning och visning utanför YouTube. Välj en film
så spelas den på den nästan väggbreda bioduken för alla i lekstugan; även egna YouTube-länkar fungerar.
Duken har 40 cm till golv och tak, med mörkröda sammetsgardiner ut till sidoväggarna.
En person i taget väljer film och styr paus och uppspelning. Tillbaka till rummet
släpper kontrollen medan filmen fortsätter. Aktivera ljudet med knappen vid behov.
Filmen stängs av när den sista personen lämnar lekstugan. Videon måste tillåta
inbäddning. Lekstugan håller regn, snö och hagel utanför taket. Alla väggar har golvlister, tydliga hörn och mjuka
kontaktskuggor, med samma grundteknik som i L1007. Rundade stoppade biostolar,
veckade gardiner, trästruktur och ett plankgolv ger lekstugan ett mjukare uttryck.
Biljardbordet står mitt i biljardrummet med fri yta innanför dörren. Discolampans strömbrytare fungerar som tidigare (#1365).

Husets tre TV-apparater kan också visa YouTube direkt på skärmen. Gå nära
och använd E/tryckknappen, eller sikta med fjärrkontrollen i handen och klicka.
Varje TV har en egen gemensam film och en person som styr åt gången. Filmen
stängs av när sista tittaren lämnar TV-rummet. Vanliga TV-kanaler finns i
filmvalet; fjärrkontrollens strömknapp fungerar fortfarande. När du väljer film
stängs väljaren direkt och en Loading...-animation visas på själva skärmen tills
filmen spelar. Spola tio sekunder framåt/bakåt med fjärrkontrollens pekknappar,
J/L när du håller den eller spolknapparna i filmvalet; alla följer samma position.

Kattpärmen har fyra fasta samlarkortsplatser på varje sida: varje kattvariant
har sin egen plats och de oupptäckta visas som silhuetter. Tryck på ett funnet
kort för kattens mötesbilder, fakta och vanliga Spara/Kasta-knappar; befintliga
bilder och äldre foton finns kvar. Pärmen kan även läsas på en stående telefon (#1379).
Basketball PvP follows the real release and falling throw, including the existing
ball radius and glass/solid/floor obstruction before the first contact (#980).
The server confirms head2/body1; the original basket physics and scoring remain.
See the [basketball launch contract and native checks](docs/development/interactions.md#basketball-pvp-launch-980).

The representative one-hand grip audit (#912) retained the existing cup, fish-finger,
wine-bottle/glass and coffee-scoop poses after native state checks and15 inspected
component views. See the [audit scope and native/render driver](docs/development/interactions.md#representative-one-hand-grip-audit-912);
it makes no general guarantee for every object or scaled fallback.

Mattornas gemensamma materialbibliotek finns under Möblera om → Meny: förhandsvisa
färg eller mönster på en av de sex mattorna, bekräfta för alla besökare eller
avbryt. Originaltyget kan återställas utan att mattan flyttas. Mattornas höjd är
oförändrad; långlugg och övriga tygfamiljer följer separat. Kontrakt/prov:
[materialbiblioteket](docs/development/interactions.md#shared-rug-material-library-995).

Gardinerna i alla sex rum har ett eget tygbibliotek i möbleringsläget (#997): sikta på gardinen och välj original, linnebeige, blågrått, salviagrönt, ränder eller rutor. Förhandsvisningen är lokal; bekräftat tyg delas med besökarna. Gardinerna flyttas inte och deras vanliga öppna/stäng-läge behålls.


Soffan, fåtöljen, pallen, gamingstolen, barnstolen och sminkpallen har egna
klädselval under **Möblera om → Meny → Välj tyg och mönster**. Förhandsvisa
lokalt och bekräfta för besökarna, eller återställ originaltyget; ben, stommar
och lösa kuddar/plädar behåller sina material.

IDANÄS-sängens stomme, gavel och lådfronter kan också få eget tyg i samma
materialbibliotek. Sänglinne, träben och lådornas insidor behåller sina material.


Uteplatsens dekorativa kuddgrupper och dynboxens fleecepläd kan väljas separat
i möbleringens befintliga tygyteväljare. Kuddvalet följer med till dynboxens
förvarade kopior genom väder och årstider; Original återställer originaltyget.
Vardagsrumsmattan kan nu väljas som blågrå långlugg i Möblera om (#1009). Luggen har verklig mjuk geometri; förhandsvisning, avbryt och Original uppdaterar också stödet under möbler och lösa föremål. Bekräftat val delas med besökarna, och mattans sparade placering behålls.


Dubbelsängens lakan, örngott, täcke, stickade fotpläd och lilla kudde har separata
tygval i Möblera om. Stommens tyg väljs som tidigare; Original återställer varje
linnegrupp för sig, och bäddning och sparning behåller sitt vanliga beteende.
MYDAL-sängarnas sängkläder (#1020): båda våningssängarna har separata val för lakan, örngott och täcke på under-/överslaf i det gemensamma tygbiblioteket. Originalmönstren, bäddning och liggplatser bevaras.
HEMNES-dagbäddens två madrassöverdrag, överkast och fem olika kuddar har egna
tygval i Möblera om. Original återställer varje textils ursprungliga utförande;
trästomme och lådor behåller sina material.

Crash diagnostics (#669): `tools/crashviewporttest.cjs` checks real console focus and startup navigation with explicitly simulated visual-viewport insets; this does not certify an Android keyboard. The physical iPhone follow-up #1359 was closed after the user reported a crash-free test on 2026-10-20.
Parasollväven och långlampans respektive DANI-lampans tygskärm kan väljas i
Möblera om. Original behåller vävdetaljerna; parasollets vikning och lampornas
vanliga tändning och glöd fungerar som tidigare.
De två SYMFONISK-högtalarnas tygfronter, SYMFONISK-lampans svarta
stickade högtalarbas och de tre Nest-enheternas tyg kan väljas separat i
**Möblera om → Meny → Välj tyg och mönster**. Förhandsvisa och bekräfta
för alla besökare eller välj Original. Lampglas, skärmar och reglage
behåller sina material; musik, smarta svar och lampans ljus fungerar som tidigare.

Handdukarnas tyg kan väljas i materialbiblioteket: badrummens två par, Tvätts vita handduk, handduken över RÅGRUND och den befintliga kökshandduken på ugnens handtag. Varje handduk har egen yta; Original återställer dess ursprungliga tyg och band. Torkning, lucka och stol fungerar som tidigare.
Sparade saker på möbler behåller sin världsplats när du återvänder eller laddar
om sidan. Att läsa in möbleringen flyttar dem inte en extra gång; en senare
bekräftad möbelflytt tar fortfarande med sakerna som står på möbeln.


När du cyklar håller båda förstapersonshänderna i de befintliga handtagen. Det du höll stuvas tillfälligt och samma föremål återkommer när du kliver av; nekad på-/avstigning lämnar det orört. Kopp, vanliga sparade föremål och Life-mat följer med via befintlig sparning till säker stående återkomst. Omladdning med katten, teckningen eller lösa pappret återstår i #1035 inom #984; samma-besöks-stuvningen är gemensam.

Även påbörjad frukt, fiskpinne, pommesportion och kyckling som stuvats under cykling återkommer efter omladdning, med kvarvarande mat och samma portion. Återkomsten är stående; källmängder dras inte av en gång till. Vanliga ostuvade saker behåller sin tidigare sparning.
När du cyklar håller båda förstapersonshänderna i de befintliga handtagen. Det du höll stuvas tillfälligt och samma föremål återkommer när du kliver av; nekad på-/avstigning lämnar det orört. Kopp, vanliga sparade föremål och Life-mat följer med via befintlig sparning till säker stående återkomst. Omladdning med äldre tillfälliga mat-/pappersmodeller eller katten återstår i #1034/#1035 inom #984; samma-besöks-stuvningen är gemensam.

Måltavlan står mellan rampen och trappan på södra baksidan, med ryggen mot staketet och ringarna mot gården.

Öl från kylhyllan kan hällas i vanliga glas. En hel ursprunglig ölportion återställer ett liv även när den dricks delvis direkt och delvis ur flera glas; hällning, spill och bortkastad dryck ger inga liv.


Fine Höje å height references and the reproducible account-free point-API extraction are documented in the [environment guide](docs/development/environment.md#fine-ground-height-references-for-höje-å-1349). The reference data does not establish submerged bed depth or the apartment’s absolute floor elevation.

Phone detail visibility (#1361): existing opaque wall rectangles, window infill, door lintels and the actual stair-opening slab conservatively hide fully covered distant boxes on phones. Nearby focus and layer7 physical traces retain their policy; individual distance thresholds are unchanged. This is a partial reduction; the landscape budget still fails and remains tracked by #1383.

Browser fixture repair (#1372): the runner supplies isolated output directories and a local Worker to the statistics/rest-pose fixtures. Statistics installs the shared verbatim-main collaborators; the plain reciprocal Nerf body-hit fixture aligns its native peers to the actual held muzzle and uses a fixed standing look. Gameplay and special apartment/diagnostic modes are unchanged.

Desktop terrain (#1462): two fixed groups of complete existing cells reduce off-screen terrain submissions; the original query mesh and phone master remain unchanged.

Street lights (#1466): distant additive ground glows fade with scene fog; nearby pools and lamp geometry remain unchanged.

Paddock surface (#1420): the existing worn track and field follow the actual terrain triangles, preserving their footprints and original70/48mm lifts.

Southern plateau (#1381): the existing terrain grid now draws through z460, with ten documented LM ground controls and consistently placed buildings, parking and paddock. Heights remain a relative model (not surveyed floors); the protected northern terrain and bridge geometry are preserved. Public transfer is tracked in kvarteret-lunden#98.

Southern road bank (#1382): eleven LM ground controls and five separate cross-sections shape the southern road crest and both slopes; a bounded interpolated branch joins the plateau. Bridge deck heights remain explicit assumptions; the GC approach surface follows the same road/terrain sampler. Public transfer: kvarteret-lunden#99.

Phone rendering (#1383): complete opted-in furnishings share a visibility decision from outside the home; actual floor and retaining-wall support hides covered geometry. Nearby use and physical objects remain intact. See development/performance.md for profiles and limitations.

Helt skymda telefonmodeller kan nu döljas tillsammans även bakom olika verkliga väggytor
(#1456). Synliga delar och nära användning behålls; högsta telefonprofilens återstående
ritanropsöverskridande följs i #1453.

Shelter hay (#1396): both ponies walk to their own low hay box and visibly eat its shrinking portion.
Patting pauses the meal; winter/rain shelter and ordinary grass grazing remain available. The ambient
portions refill automatically while nearby; this adds no hunger or inventory system.

Cat albums (#1399): each variant holds eight normal encounter photos. Saved photos remain protected
from rotation, and older archives above eight retain every photo with clear archive/full information.

Cat encounter photos (#1400): a cat's first pet or hug makes one private encounter photograph.
Pickup alone and repeated interactions do not duplicate it. A kept Miele remembers the photo attempt
across reload, independently of discovery; petting, hugs and their ordinary points remain available.

När du går under gården slipper visningen rita hela terrassdekoren och pergolornas lampor genom ett täckande garagetak (#1387).

Pergolornas oförändrade lampor bedöms nu som två hela grupper, så onödigt arbete bakom
garagetaken minskar (#1438). Båda telefonprofilerna klarar sina befintliga gränser;
standardprofilens återstående triangelöverskridanden i källare och hall följs i #1439/#1431.
Den neutrala offentliga överföringen följs separat i kvarteret-lunden#115.

Utsikten upp mot terrasserna kräver mindre ritningsarbete bakom lägenhetens täta väggar och golv (#1421).

Bus boarding asphalt (#1417) joins the existing mapped kerb to the actual bus-bay
edges without moving the platform; see [environment verification](docs/development/environment.md#bus-boarding-apron-1417).

The bus platform and tactile strip also follow the actual terrain triangles (#1429),
keeping their existing heights and stopping grass from protruding through the walking surface.

De befintliga öppningarna till markloggiorna i Hus A, B och C går nu att gå igenom åt båda håll.

Phone entrance pots (#1455): the existing twenty L-house planters share six rigid pot/soil
color batches, retaining the original leaves, physical objects and shadow casters.

Uteplatsens vy mot huset kräver mindre onödigt ritarbete genom att hela häckar bedöms var för sig på datorn; telefonens häckar är oförändrade (#1458).

Phone entrance foliage (#1457): four additional color batches retain each plant’s
original wind origin, leaves, physical meshes and original shadow casters.

Östra campusets fasta materialgrupper ritas separat på dator för snävare naturlig vyavgränsning; telefonens geometri är oförändrad (#1461).
