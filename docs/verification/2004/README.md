# Avatarövergångar #2004

Pågående integrationsunderlag. Runtimebas `a05683d4` med levererad gång #2003/#2006 och kropp #2001.
Huvud #2002 kopplas in efter publicering för den gemensamma slutbedömningen i #2000.
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
`before/interim-sit.png` visar det underkända mellanresultatet; det är inte en
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

Slutliga hashes, browserutfall, budget, kombinerad huvud-SHA och granskning fylls i
vid överlämningen. Förebilden ska publiceras med pinnad kommentar och därefter
rensas av integrationsägaren.
