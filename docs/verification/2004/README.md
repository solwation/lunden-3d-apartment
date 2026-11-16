# Avatarövergångar #2004

Runtimebas `a05683d4` med levererad gång #2003/#2006 och kropp #2001.
Slutsekvensen kombinerar detta med huvudpass #2002 (`3c1f9457`), på publicerad bas
`a018b022`. Förekolumnerna är frysta från `a05683d4`; #2001:s separata
utseendejämförelse använder i stället `3f7c3d0b`. Ingen gemensam före-SHA påstås.
Root äger integration, bildpublicering och stängning; arbetaren pushar/stänger inte.

Lästa ägartexter: CLAUDE, orchestra/worker, interactions, graphics/performance-kartan,
verification och local-development. Avatarfigurer/gameplay är uttryckligen uteslutna
från publicens AGENTS/upstream: ingen tillämplig överföring eller husmotsvarighet.

## Tre riskbaserade kontroller

1. `MOTION_OUT=docs/verification/2004/numeric.json node --test tools/avatarmotiontest.mjs`:
   verklig Avatar/IK i 30/60 Hz och växlande 120/30/60/20 Hz, fot-/leddata,
   stopp/vändning, ±π och teleportreset samt exakt synlig kontinuitet vid byte till
   ett sittankare 0,5 m bakom ståplatsen. Slutposer jämförs med samma produktions-IK.
   Den äldre gait/IK-sviten kördes en gång för de ändrade delade kodblocken: 8/8 gröna,
   inklusive #2006:s snabba sidledssteg. Ingen äldre browsersvit kördes.
2. En egen hållen komponentbrowser under `tools/browsertest.sh`: riktiga
   `Ghosts.track/beforeMirror` och `Ghost.push/draw` med 5 Hz snapshots, samma
   vila–gång–stopp–vänd–huk–sitt–res-sekvens före/efter. Ingen World eller fjärrtjänst.
   `sequence.json` registrerar varje 60 Hz-steg; `sequence.webm` visar 133 utvalda
   verkligt renderade ramar vid nominellt 12 Hz, med tid och kolumnetiketter.
   Stillbilderna är endast orienterande ögonblick, inte rörelsebevis.
3. Samma browser provar uttryckliga handmål, sitt/ligg/långsitt, gym, cykel,
   luft, simning och handföremål. Gym/cykel/ligg/långsitt med ett samtidigt generellt
   handmål och hållet föremål jämförs mot fryst baseline: båda händernas faktiska
   världspositioner ska överensstämma exakt. Lokal varm `Ghost.animate` mäts i fyra
   5 000-uppdateringsbatcher efter uppvärmning; budget satt före slutkontrollen till
   100 µs per uppdatering här, utan nytt mesh/material/draw. Detta är ingen global
   bildfrekvens-, fysisk Surface- eller telefonmätning.

## Metod och korrigeringar

Första browseransatsen fick HTTP-timeout innan komponenten kunde laddas:
servern överlevde inte den första shellbakgrunden. Felet finns i
`browser-launch-failure.txt`. Därefter användes verifierad egen server på 8804
med hållen process och en sammanhållen browser för alla renderade resultat.
Wrappern hade två globala lås men saknade fungerande systemd-scope på denna värd;
ingen hård minnesgräns påstås.

Tidiga numeriska prov hittade för låg fot under partiell huk samt förändrad
fotvinkel på ett låst stöd under start. Rättningen håller markskorna plana även
under huken och låter ankarets pitch följa samma kontakt. Den första sittbanan
blandade lokala mål utan rootframe-kompensation och lät benen skära stolen.
[underkänd mellanbild](https://github.com/solwation/lunden-3d-apartment/blob/718154af0ef92b458d34bc0495b65989a4b9eb8a/docs/verification/2004/before/interim-sit.png) visar det underkända mellanresultatet; det är inte en
ursprunglig baslinje eller ett godkänt resultat. Ny bana bevarar föregående
synliga höft/fötter vid rootbytet och landar sedan på den oförändrade sittposen.

Det första MediaRecorder-försöket kördes i fixturens styrda klocka och gav fel
klipplängd. Slutklippet byggs därför från den deterministiska rörelsens faktiska
canvasramar i en separat tom sida med native klocka; den sidan kör ingen avatar
eller World. En begränsad Playwright-ffmpeg saknade PNG-dekoder; det försöket
ändrade inga produktfiler och används inte som videobevis.

## Begränsningar

Stopp och större stillastående vändningar får visuella omtag. Jämn gång/löpning
behåller #2003/#2006:s kurvor. Navigation, kameran, fysiska rooten, nätformatet och
träffregler ändras inte. Stort positionshopp byter plats direkt och återställer
ankare i stället för att animera genom rummet. Vanliga sitt/ståbyten inom den
befintliga platsens ram blandas; explicita ligg-/gym-/cykelposer behåller sina
slutliga kontaktmål. Ingen terräng-IK, möbel-/klädkollision eller anatomisk
muskelsimulering införs. Extrem acceleration kan fortfarande ge korta visuella
avvikelser; huvudplanens konstnärliga referens är ingen AAA-produktionsgaranti.

`combined.json` anger `revision=c370d766`, som var bas-HEAD med efterföljande
okommitterade runtimekorrigeringar vid capture. Den HEAD-strängen är alltså inte
ett påstående om exakt körd commit: dess registrerade SHA256-värden binder
slutsekvens, 16 kontrakt, varm budget och browserversion till
exakta SHA256 för produktionskällorna och det använda capture-underlaget.
`seat-clearance.json` mäter verkliga thigh→knee och knee→foot mot stolskivans y=.45
samt XZ-interiör (1 cm indrag från kanten). Baseline har åtta fjärrsegmentträffar;
efter har egen/fjärr noll. Detta mäter centrumlinjer, inte tygets hela volym.
`start-contact.json` mäter första stödets faktiska världsdrift. Snapshot-rooten
interpoleras före poseflaggan, så en kort övergång bär nu synliga mål i världsramen
även under denna befintliga nätinterpolation; den fysiska rooten ändras inte.

Reproducerbar slutdriver: `CHROME_PATH=/path/to/chrome tools/browsertest.sh node
tools/avatarmotionbrowser.cjs http://127.0.0.1:8804 docs/verification/2004`.
Den faktiska hållna körningen återupptogs under implementationen; CLI avslutades normalt med exit 0.
`recovery/held-runner.cjs`, `recovery/final-capture.cjs` och `browser.txt` bevarar
hur samma browser användes. Slutdrivern sammanför samma capture/prober utan manuell väntan.
Slutlig browser: Chrome 156.0.8078.4 / SwiftShader, 16/16 kontroller gröna;
startstödets drift var <1e-15 m i båda konsumenterna. Varm kostnad före
16,2–17,4 µs och efter 21,3–29,3 µs per Ghost.animate, fyra batcher om 5 000.
Kostnaden ligger under den lokala 100 µs-budgeten; värdlast påverkar tiderna.
Alla sju riktade Node-kontrakt passerade (fem rörelse-/kontinuitetsfall,
ett explicitpose-guardfall och ett återstarts-/fotstegsräknarfall). Den ändrade
räknaren verifierades även med den berörda gait/IK-svitens åtta Node-prov: totalt 15/15 gröna. De nio capturehasharna stämde mot disk efter
browserns avslut. Därefter tillkom två avgränsade rättningar: root-carry får bara gälla
ordinary(key), aldrig explicit gym/cykel/luft; återstartens fasbyte synkar en intern
stegbaslinje utan att öka footfalls eller skapa ett fotstegsljud. Båda har riktat
Node-bevis och kördes inte i någon ny browser. De ändrar ingen fångad rörelsebana. `final-source.json` innehåller både originalets
capturehashar och färdig kods exakta hashvärden med dessa två skillnader redovisade. Hela diffen och samtliga fem slutbilder
är visuellt granskade; rörelsen bedöms med klippet och tidsdata tillsammans.

Efter segmentgranskning hittades att Ghost.draw interpolerade mot sittrooten
innan sittflaggan slog om. Enbart omräkning vid flaggbytet räckte därför inte.
Den slutliga rättningen bär även synliga mål i världsramen under just den
befintliga 0↔1-snapshotövergången. Den första startkontakten tappades också
under gait-inblend: nu styr faktisk stöd-/svingfas ankaret tills det första
lyftet, med en kontinuerlig anslutning till den bevarade svingkurvan. Förebilden ska publiceras med pinnad kommentar och därefter
rensas av integrationsägaren.

Root har granskat slutdiff, fem orienteringsbilder, kontrakt/tidsdata och
slutmanifest. Samtliga final-source-hashar är verifierade, och de två
efterföljande ändringarnas tidigare källor går att rekonstruera exakt. Bilder
och klipp publicerades före stängning, pinnade till718154af; underkänd
mellanbild tas bort i resolvingcommit medan den pinnade länken består.
