# #1836 – Ta i på utegymmet

Automatcykeln är ersatt av verklig insats. Färska F-tryck eller tydliga vertikala touchvändningar höjer mätaren; utan insats sjunker den. Först topp följd av full återgång till noll ger en repetition. Samma `onRep(n, stationId)` och befintliga poäng/dagstak/Utegymmare används. E, Space/C och touchens Avsluta träningen behålls. Ingen avatar-, sparnings- eller synkändring och ingen publik spelport.

`OUTDOOR_GYM.effort` är uttryckliga spelgissningar: +0,2 per puls, −0,42 per aktiv sekund, minst 0,07 s mellan accepterade pulser, 28 CSS-pixlar mellan touchvändningar och högst 0,25 s per godkänt mätarsteg. Hållning/autorepeat och envägsdrag ger inte löpande kraft. Toppen armerar en rep, fortsatt pumpning kan hålla den uppe men aldrig ge flera reps. Avbrott/stationsbyte nollställer. Paus/menyer/bakgrund fryser och avvisar insats.

## Tillräckliga kontroller

- `THREE_DIR=/path/to/three node --test tools/gymefforttest.mjs tools/gymrepstest.mjs cloudflare/boards.test.mjs cloudflare/medals.test.mjs`: **35/35 gröna**. Ren kraftmodell och touchvändningar; faktiskt OutdoorGym för alla tre stationer, passiv/partial/entry/pause/abort/switch; befintliga verkliga stats-, dagstaks-, JSON-/ny-dag-, medalj- och Worker-kontrakt. `contracts.txt`.
- `tools/browsertest.sh node tools/gymeffortbrowser.cjs GAME OUT`: **49 funktionella kontroller gröna**, 23 tangentbord och 26 touch, återanvända per profil enligt nedan. Alla tre stationer går igenom verkligt E-/touchinträde, passiv nollkraft/nollbelöning, faktiska snabba F-tryck eller CDP-touchvändningar, topp utan tidig rep och full nedgång med exakt +1 rep/+1 befintlig poäng. Räckhäv/step-up flyttar kameran, bänkpress flyttar stocken. Desktop avslutar med E, Space respektive C; touch avslutar via den riktiga action-knappen. Inga extra reps efter exit, HUD/effort stängs och inga sidfel. `result.json`, `touch-result.json` och loggarna.
- Hållen F autorepeat avvisas, F ändrar inte möblering. Envägsdrag ger ingen touchkraft, träningsgesten ändrar inte kameravinkel. Touch utanför träningsytan ger varken look, analogstyrning eller kraft. Verklig paus fryser mätare/poäng och döljer tränings-HUD. Inga ändrade Rest-/score-/medalj-API:er.
- En riktad slutkontroll efter CSS-kaskadrättningen ger `pad.hidden=true`, **computed display=none** på desktop och E/Space/C-footer. `hud-capture-result.json` och korrekt `keys-pullup-effort.png`. De gröna funktionella profilerna behövde inte köras om.

## Sammansatt geometri och bevisgräns

Den faktiska browserrundan använder #1835:s frysta nya konstruktor/decor/utseendekonfig tillsammans med #1836:s effort-init, metoder och effort-konfig via modul-route. Stationernas target/spot/origin/stock/world-gränser behålls. `sources.json` har både egna filer och exakta sammansatta runtimehashar; fryst snapshot låg i sessionens `state/1836-combined`. Därmed gäller de sex verkliga inputfallen den kommande nya utrustningen, inte enbart gamla konstruktionen. Geometrin och dess budget/frigång ägs och verifieras separat av #1835; denna ändring tillför bara DOM/CSS-HUD och transient state. Inga ljus eller 3D-batcher tillkommer här.

## Bilder

- `keys-pullup-effort.png`: grön toppmätare med 0 reps före återgång, F-/avslutsinstruktioner och korrekt dold touchruta.
- `touch-press-effort.png`: egen upp-/neryta i liggande telefonläge och mätare nära toppen, ännu 0 reps.
- `touch-press-one-repetition.png`: tillbaka vid botten, singular ”1 repetition”, vanlig +1-poängbadge och synlig avslutsknapp.

Alla tre bilder är visuellt granskade. Två äldre desktopbilder som visade den felaktigt synliga touchrutan används inte som slutbevis.

## Fixturehistorik och begränsningar

Första körningen hann färdigt hela desktopprofilen men telefonens porträttläge blockerades av spelets befintliga rotationsskärm innan någon touchövning. Exakta rådata finns i `diagnostic-portrait.json`; dess övergripande false avser den ofärdiga andra profilen, inte de 23 redan godkända desktopkontrollerna. Dessa återanvänds i det samlade `result.json`.

Första landscape-fixturen väntade på fokus med appens vanliga loop stoppad utan att stega den; den avgränsade återstående touchkörningen stegade även väntans vanliga frames och är grön. En mellanliggande retry nådde inte appen efter att den egna devservern fått SIGTERM; ingen featurekörning påstås för den. Inga produktfel härleddes från dessa setupfel. Initial desktop-CSS hade lika specifika hidden/flex-regler i fel ordning; en specifik pad[hidden]-regel rättar det, med endast ny computed-style-kontroll och representativ desktopbild.

Chromium 1248/SwiftShader, desktop 1000×700 och emulerad iPhone/touch 844×390, juni/dagsljus, befintligt `test=lazy` och normal fullkvalitetsbildpass via testkit. Tangenter och touchhändelser är nativa; själva appstegen körs deterministiskt under kontroll. Ingen fysisk telefon eller hårdvaru-FPS påstås. Normala touchkontroller spärras endast under aktiv gym-Rest och återställs vid exit; inga nya menyer eller generella sprintfunktioner. A/B/C/L-layoutsvep är inte tillämpligt på denna gemensamma spelkontroll.


Dirigentens sammanslagning med #1835 klarade 37/37 riktade Node-kontrakt (integration-contracts.txt). Konstruktorn/kontrollen/decor/config motsvarar den gemensamma browserkällan; endast oberoende importordning skiljer i outdoorgym.js (integration-source-review.txt). Första lokala geometry-teststarten saknade Three-paketet och körde därför inte detta prov; befintlig beroendecache länkades och den sammanslagna sviten är grön. Ingen ny browserrunda behövdes efter källgranskningen.


Levererat i `e21ca752b49a129f3909019707898f2d7479ddf4`. [Pages](https://github.com/solwation/lunden-3d-apartment/actions/runs/41630419839) och [Worker](https://github.com/solwation/lunden-3d-apartment/actions/runs/41630419760) lyckades; Worker-loggen bekräftar faktisk Wrangler-deploy och den publika sidans version.json visar `e21ca75`. Dirigentens kombinerade diff-/bildgranskning är klar. Verifieringslänkarna ovan är permanenta; eventuella resultatbilder är granskade och bytekontrollerade. Ingen rutinmässig omkörning av gröna kontroller efter orelaterad integration. Ärendet stängs genom efterföljande verifieringscommit och aktiva etiketter tas bort.
