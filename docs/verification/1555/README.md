# Takgranskningen vid Karpvägen – #1555

Utgångspunkt: original `79da388f998a30c32198c37df0ab29de6f7b9649`. En faktisk
appsession med `?cloud=&shot&at=-130,90,0,0&time=12&month=6&freeze&test=lazy`
gav råartefakten `/tmp/orkester-codex-20261024/verify1555/initial.json`
(utanför repot, SHA-256 `03e19dd7f699ccc9882f1574951f383408c64e3224238960b9214311f3b2a77b`).
Byggnadsnamn och fotavtryck i artefakten överensstämmer exakt med denna checkouts
`src/config.js`; alla produktkällor är oförändrade från utgångscommiten.

Diagnosen visade att kollisionsytorna redan finns och matchar de ritade taken.
Komplementbyggnadens innerpunkt hade taket på 3,74 m, men första strålträffen var
en trädkrona på 16,46 m; vid kanten var motsvarande värden 3,44 och 17,56 m.
Karpvägen 10:s kanttak låg på 8,67 m, medan trädkronan träffades på 12,71 m.
Det förklarar de tre missade landningarna. Vid komplementbyggnadens vägg låg
fixture-spelarens fötter tidigare ungefär 3,23 m över noll när väggen slutade
kring 3,29 m; med `PLAYER.stepUp` 0,45 m överlappade kroppen inte väggen.
Den kunde därför passera **ovanför** den. Källrevision `bad16e07` ändrade enbart
ritade gavelfyllningar, inte dessa takytor eller väggsegment.

Ändringen begränsas till `tools/roofaudittest.html`. Takstrålen bortser från
scenobjekt som heter `tree-crowns ...`, men behåller alla högre riktiga tak och
byggnadsvolymer. Träd räknas fortfarande vid kontrollen av väggprovets startplats.
Väggprovet använder den aktuella kantens `RoofWall.y1` och spelarens `stepUp` för
att lägga kroppen under väggen; om segmentet saknas blir det ett fel. Ett positivt
testkrav ser till att **båda** namngivna taken verkligen provas i mitten och vid
kanten och att komplementbyggnadens vägg verkligen flygs emot.

Hus A/B/C använder separata blocktak och ingår i den ordinarie takgranskningen.
Hus L:s tak byggs av `src/exterior.js` och delar inte de mappade västra husens
takstråle eller den ändrade fixture-koden. Övriga väst-, öst-, nord- och sydhus
granskas av samma körning; ingen produktgeometri, öppning, fotavtryck eller
renderbudget har ändrats.

Den publika `kvarteret-lunden` använder `tools/roofaudit-check.mjs`, vars
takprov tar höjden direkt från `bld-*`-ytans `s.y` och vars väggprov redan använder
ytans kantnivå. Det finns varken scenstrålen genom trädkronorna eller ett fast
`ground+3`-prov att föra över. Ingen publik port eller publik issue behövs för
denna ursprungliga testkorrigering.

## Verifiering

Den ordinarie `node tools/runtests.cjs --jobs 1 --port 8355 roofaudittest`
passerade i Chromium/SwiftShader på 1 min 15 s med **60 byggnader, 42 faktiska
väggförsök, 0 läckor och 0 missade tak**. Före korrigeringen rapporterade ärendet
39 väggförsök, 1 läcka och 3 missade tak. De tre västra komplementbyggnaderna
`476125237`, `476125238` och `476125239` har nu varsin loggad väggflygning;
det lägre höjdvillkoret är korrekt eftersom en kropp kan vara över `ROOFS.aloft`
och samtidigt under deras takkant. Takprovets kriterier har inte lättats.

De positiva målbevisen i råloggen är:

| Byggnad och prov | Ritat tak | Landning / väggresultat |
| --- | ---: | ---: |
| Karpvägen 10, mitt | 11,57 m | 11,56 m |
| Karpvägen 10, 1,2 m från kant | 8,67 m | 8,67 m |
| Komplementbyggnad 476125238, mitt | 3,74 m | 3,74 m |
| Komplementbyggnad 476125238, 1,2 m från kant | 3,44 m | 3,44 m |
| Komplementbyggnad 476125238, vägg | topp 3,29 m | fötter 2,74 m; slut utanför vid (−133,49; 78,48) |

`PASS both west roof centres and edges audited; outbuilding wall exercised`
är ett nytt positivt krav, så grönt resultat kan inte uppnås genom att hoppa
över de namngivna punkterna. Hus A/B/C hade också godkända mitt- och kantlandningar.
Sankt Lars väg 46 saknar provpunkt innanför `WALK`; det är en
redovisad gräns för denna granskning, inte ett nytt takfel.

Rålogg och maskinell sammanfattning:
`/tmp/runtests-48037/{roofaudittest.log,summary.json}`; SHA-256
`22d388f12e466846e91f4b5df38a9bedc7ca3a3a39c1bca6f6e487689d01eb53`
respektive `6930b076653c6976c65d6a27ed236b661d46b970f67b70e417f517d3b2577e98`.
Sammanfattningen visar den verkliga appens iframe på 900×600 med
`?shot&time=12&month=6&freeze&cloud=`, utan `&test`; inga FAIL-rader.
Fixturens SHA-256 före/efter: `6b4571b9e58b890539fec4b2ee5b2fef6e86c3d200fce5cf3fd66be2dd49b616`
→ `50252d4ae13e5d5ffa1bd1e9eacb35a61f116b1ad1c15c35a01cab2f3d3931c7`.
`git diff --check` och Node-syntaxgranskning av det inbäddade skriptet passerade.

Det finns inget ändrat visuellt produktresultat och därför ingen ny resultatbild
eller ändringslogg. Ingen fysisk enhet eller produktionsserver har provats.
