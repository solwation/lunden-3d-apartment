# Delad värld (Cloudflare Worker)

Uppsatta teckningar delas mellan besökare via en Cloudflare Worker med Durable Object-metadata och bilder i KV.
Skrivbordsteckningen delas också; kattfoton är personliga. Samma worker håller
en global topplista (#198): startskärmen frågar efter ett namn (valfritt) och poängen skickas. Utan den fungerar allt som förut, bara lokalt i webbläsaren.

## Slå på det

Kör på din egen dator, i repots rot:

```
./cloudflare/setup.sh
```

Det kräver bara Node.js (https://nodejs.org). Skriptet loggar in dig i Cloudflare (webbläsaren öppnas första
gången), skapar KV-lagringen om den saknas, driftsätter workern, sätter en nödbromsnyckel, skriver in workerns
adress i `src/config.js` (`CLOUD_URL`) och frågar om ändringen ska committas och pushas. Sajten börjar synka när
den är pushad. Skriptet går att köra om hur många gånger som helst – det som redan finns återanvänds.

## Bra att veta

- **Privat hem:** mat, gurkor och smulor skickas inte till Workern.
  Hemmets lokala lagring delas av flikar i samma webbläsarprofil; olika profiler/enheter har egna hem.
  Uppsatta teckningar, skrivbordsteckningen, spelarantal och den separata topplistan är gemensamma.
- **Teckningarnas livslängd:** 24 timmar från senaste accepterade uppsättning/flytt (servertid).
  Läsning och återförsök av samma uppdatering förlänger inte tiden. Ett Durable Object-alarm rensar
  utgångna poster och deras bilder; nästa synkning tar ner dem i klienterna. Befintliga teckningar
  utan sluttid får 24 timmar när regeln först aktiveras. Gamla återförsök får HTTP 410 och kan inte
  återuppliva en utgången teckning.

- **Flytt av teckningar:** samma tecknings-id behålls. Flytten visas direkt lokalt och andra klienter
  hämtar positionerna var tionde sekund. Senaste `updated` vinner; vid samma millisekund vinner
  den sist behandlade uppdateringen. Klienternas klockor bör vara rätt inställda.
  `DrawingRoom` (SQLite Durable Object) ordnar ändringarna och lagrar metadata så att samtidiga
  flyttar inte skriver över andra teckningar. Befintlig metadata importeras automatiskt från KV
  vid första anropet; bilderna ligger kvar i KV. Medan en teckning hålls kvar i handen visas
  dess förra position på andra klienter tills den sätts upp eller läggs på skrivbordet.
  Publicera Workern med den nya `DRAWINGS`-bindningen före klienten.
  Regressionstest: `node cloudflare/drawing-sync.test.mjs`.

- **Inga hemligheter i repot.** KV-id:t i `wrangler.toml` och adressen i `src/config.js` är inte hemliga.
  Nödbromsnyckeln (`ADMIN_TOKEN`) ligger som Worker-secret i Cloudflare och lokalt i
  `~/.config/lunden-l1007/admin-token`.
- **Skydd:** skrivning är öppen (en publik sida kan inte gömma en nyckel), så workern tar bara emot JPEG/PNG upp
  till 300 kB, högst 100 teckningar, max 30 skrivningar per minut och IP, och CORS bara från
  `https://solwation.github.io` (och localhost).
- **Nödbroms:** töm allt (eller bara en del) om något olämpligt hamnar där:
  `curl -X DELETE -H "Authorization: Bearer $(cat ~/.config/lunden-l1007/admin-token)" <adress>/admin/all`
  (`/admin/drawings`, `/admin/paper`, `/admin/scores`, `/admin/games` för datorspelens topplistor). Ta bort ett enda olämpligt namn från topplistan:
  `curl -X DELETE -H "Authorization: Bearer $(cat ~/.config/lunden-l1007/admin-token)" "<adress>/admin/scores?id=<namnet>"`.
- **Topplistan:** en rad per webbläsare (slumpat id), namn högst 20 tecken (`<>&"` och styrtecken tas bort), och en
  poäng kan inte växa snabbare än 600 per minut (en ny rad börjar på högst 3000) – fusk blir litet.
- **Stänga av:** sätt `CLOUD_URL = ''` i `src/config.js` och pusha. Det stänger också av kraschrapporterna.
- **Kraschrapporter (#629):** när spelet kraschar eller kastar ett fel skickas en liten teknisk rapport till workern, så att
  händelseförloppet kan undersökas efteråt. En stängd flik bevisar inte i sig minnesbrist. Det som skickas: tid, var i lägenheten
  man var, grafiknivå, bildfrekvens, antal geometrier/texturer, uppskattat grafikminne, de senaste tangent-/tryckhändelserna,
  felmeddelande och version, webbläsarens user-agent och skärmstorlek, samt ett slumpat id för just den webbläsaren. Inget namn,
  ingen text man skrivit och ingen IP sparas. Rapporterna ligger i KV i 14 dagar, högst 20 per webbläsare och dygn, 400 totalt.
  Version 2 sparar upp till 12 mätpunkter (cirka 24 sekunder) före felet: laddningsfas, bildräknare, bildfrekvens,
  renderingsmängd och försenad körning. Varje separat grafikbortfall och återställning får ett gemensamt händelsenummer
  och tid till återställning. Dessa händelser slås inte ihop i den öppna listan; återförsök räknas fortfarande bara en gång.
  Högst 12 rapporter skickas per sidladdning. Minnestalen är uttryckligen ofullständiga uppskattningar från bland annat
  texturernas källbilder, inte uppmätt GPU-minne. Historiken finns kvar även när en död flik rapporteras vid nästa start.
  `warm` visar uppvärmningens tekniska fas/räknare; `worst` är [CPU-millisekunder, ändring i antal shaderprogram,
  skuggomritning 0/1, uppvärmningsdetalj] för en lång bildruta. #720 bevarar dessa begränsade fält både i lagring och
  anonymiserad läsning, utan fri text eller ändrad generell djupgräns. Gamla `worst` som redan tappats vid mottagning
  kan inte återskapas; fixen gäller rapporter som skickas in efter Worker-driftsättningen. Giltigt `warm` som redan
  lagrats kan däremot bli synligt. Saknad äldre diagnostik betyder inte att en lång bildruta aldrig inträffade.
  Typen `layout` (#567) skickas när spelets canvas inte fyller skärmen (vit remsa efter rotation) och innehåller alla mått.
  Grafikhändelsernas ögonblicksbild kan också visa `worst` för den långsammaste färdiga CPU-bildrutan sedan
  senaste hjärtslaget och `beatAgeMs` för provets ålder. `layout` visar aktuella skärmmått och `context.surface`
  senaste storleks-/rotationshändelsens typ och tid sedan sidstart. Detta mäter inte GPU-tid eller kraschorsak;
  gamla rapporter saknar de nya fälten. Publicera Worker-vitlistan före klienten när de publiceras separat.
  Diagnostiken kan läsas offentligt först när både uppdaterad Worker och klient kör; den vanliga repo-publiceringen
  sköter respektive tjänst, och en lokal test betyder inte att Worker redan publicerats.
  Anonymiserad, öppen läsning utan nyckel: `curl <adress>/crash/public`. Läs dem med nödbromsnyckeln: `curl -H "Authorization: Bearer $(cat ~/.config/lunden-l1007/admin-token)" <adress>/crash`
  (lista, nyast först) och `<adress>/crash/<id>` (hela rapporten). Töm dem: `curl -X DELETE -H "Authorization: Bearer …" <adress>/admin/crash`.
- **Automatisk omdriftsättning (valfritt):** `.github/workflows/cloud.yml` driftsätter om workern när
  `cloudflare/**` ändras på main, om repot har secrets `CLOUDFLARE_API_TOKEN` (en API-token med *Workers Scripts:
  Edit* och *Workers KV Storage: Edit*) och `CLOUDFLARE_ACCOUNT_ID` (GitHub → Settings → Secrets and variables →
  Actions). Utan dem hoppar jobbet över steget.
- **Lokalt utan Cloudflare:** `node cloudflare/dev.mjs 8144` kör samma worker med minneslagring; öppna sajten med
  `&cloud=http://localhost:8144`. `tools/cloudtest.html` testar mot den. `&sync=debug` loggar synken i konsolen.

## Flerspelare: andra spelare som spöken (#666)

Andra besökare syns som genomskinliga spöken med namnskylt (namnet från startskärmen, annars "Anonym"). Positionerna går
**inte** via KV utan via en WebSocket till en Durable Object, `PlayerRoom` (`cloudflare/players.js`), en enda instans för
alla (`idFromName('world')`) med Hibernation API. Klienten (`src/ghosts.js`) skickar sin position högst 5 gånger per sekund
och bara när den ändrats; står man still går bara ett hjärtslag var tionde sekund, som Cloudflare besvarar automatiskt utan
att väcka objektet. Klienten kopplar ner när fliken döljs, på startskärmen och efter 2 minuter utan rörelse.

**Vad det kostar** (Workers Paid, $5/månad – siffrorna är *enligt prislistan, verifiera* på
cloudflare.com/plans/developer-platform; de kunde inte kontrolleras härifrån):
- Durable Object-anrop: 1 miljon/månad ingår, sedan $0,15 per miljon. Varje anslutning är ett anrop; inkommande
  WebSocket-meddelanden räknas 20:1 (20 meddelanden = 1 anrop); utgående (det rummet skickar vidare) räknas inte.
- Tid: 400 000 GB-s/månad ingår. En instans à 128 MB som är vaken dygnet runt i 31 dagar ≈ 335 000 GB-s, alltså inom det som
  ingår även i värsta fall (med hibernation sover den när ingen rör sig). `DrawingRoom` delar kvoten men är bara vaken under
  korta anrop.
- Räkneexempel: en spelare som rör sig hela tiden skickar 18 000 meddelanden i timmen = 900 debiterade anrop; rör man sig
  halva tiden ≈ 450. Det ingående räcker alltså till ungefär 1 100–2 200 spelartimmar per månad.
- Workers-anrop (10 miljoner ingår) och lagring (en skrivning av räknaren per 100 meddelanden) är försumbara.

**Hårt månadstak:** rummet räknar själv debiterade anrop (anslutningar + inkommande meddelanden/20, avstängningar räknas
som hela anrop) per kalendermånad (UTC) i sin egen lagring (`bill:ÅÅÅÅ-MM`). Når räkningen `PLAYERS.monthlyCap`
(800 000, under den ingående miljonen) stängs alla anslutningar och nya nekas (kod 4001) resten av månaden; Workern minns
nekandet så att nya försök inte ens når objektet, och klienten försöker inte igen samma månad. Därmed kan flerspelaren inte
kosta mer än de $5. Högst 100 meddelanden kan gå oräknade om objektet skulle slängas ur minnet.

**Gränser per anslutning:** högst 6 meddelanden/s (fler kastas, 5 sådana sekunder stänger anslutningen), högst 256 byte per
meddelande, högst 30 spelare samtidigt, stängs efter 60 s utan meddelande eller hjärtslag. Bara sajtens ursprung (och
localhost) får ansluta från en webbsida. Rummet tar bara emot position och riktning, kontrollerar och avrundar dem och skickar
aldrig vidare annan text än det rensade namnet (högst 20 tecken, som topplistan) och rensad chattext (#675, nedan).

**Strid (#667):** håller två spelare var sitt vapen syns de fullt för varandra och kan träffa varandra. Skytten skickar ett
litet meddelande per skott, även missar (vapen, startpunkt, riktning, ev. fart och vem som träffades), så att den andra ser
pilen, bollen, nätet eller hugget. Skotten delar positionernas budget på högst 5 meddelanden per sekund (de skickas först,
positionen väntar), så **det högsta antalet inkommande meddelanden per spelare ändras inte** och kostnadsräkningen ovan
gäller fortfarande (i praktiken lite fler meddelanden medan man skjuter och står still). Rummet skickar skottet vidare bara
från någon som håller det vapnet och bara till andra som håller vapen (utgående kostar inget), kontrollerar en träff mot
vapnets räckvidd, hur ofta och högst 60 poäng per minut (`COMBAT` i `cloudflare/players.js`) och svarar båda. Liv räknas per
anslutning i rummet; inget om striderna sparas. Ryms helt inom samma månadstak.

**Chatt (#675):** konsolen blir en chatt när rummet är på. Klienten skickar `{ t: 'm', m: text }`; rummet rensar texten
(bara ren text: styr-, nollbredds- och riktningstecken bort, blanksteg hopslagna, högst 140 tecken) och skickar
`{ t: 'm', i, n, m }` till de andra med det rensade namnet (`n` tomt = "Anonym"); klienterna visar den alltid som text,
aldrig som HTML. Gränser (`CHAT` i `cloudflare/players.js`): per anslutning tre i rad, sedan en per sekund och högst 12 per
minut; hela rummet högst 120 per minut. För många ger `{ t: 'mx' }` tillbaka (utgående, kostar inget). Ett chattmeddelande
är ett vanligt inkommande meddelande: det räknas i månadstaket (1/20 anrop), ryms i samma 5 meddelanden/s som positionerna
och kan inte vara större än 256 byte. Inget sparas: ingen historik, ingen KV-skrivning, nya spelare ser inget gammalt.
Fuskkoder (`/day`, `help`, de hemliga) körs i webbläsaren och skickas aldrig. Kostnad: även 120 meddelanden i minuten
dygnet runt vore ≈ 270 000 debiterade anrop i månaden (taket på 800 000 gäller ändå), men i praktiken gör de få som chattar det
försumbart jämfört med positionerna.

**"skriver…" (#676):** medan någon skriver i chatten skickar klienten bara en flagga `{ t: 'k', on: true|false }` (aldrig
bokstäverna): på vid första tangenten, igen var 6:e sekund medan man skriver, av när man skickar, stänger eller gör en paus.
Rummet skickar `{ t: 'k', i, on }` till de andra, men bara vid en ändring: av alltid, på tidigast 0,5 s efter förra gången,
en påminnelse om att man fortfarande skriver tidigast efter 5 s (`CHAT.typingEveryMs` / `typingRepeatMs`); ett skickat
meddelande slår av den. Högst ett par meddelanden per skrivpaus – samma budget och samma månadstak som allt annat, inget sparas.

**Hälsningar (#673):** en spelare kan hälsa på en annan. Klienten skickar bara ett nummer på en fras ur en fast lista
(aldrig fri text) och vem hälsningen gäller; rummet tar emot högst en hälsning var tredje sekund per spelare och bara till
någon som finns i rummet, och skickar den vidare till alla andra (de ser den som hälsar vinka). Hälsningen går inom samma
5-Hz-budget som positionerna, så kostnadsräkningen ovan ändras inte.

**Ordfilter och tysta (#719):** rummet byter en kort lista grova ord (`ROUGH` i `cloudflare/players.js`, samma lista i
`src/chatfilter.js`) mot `***` i varje chattrad innan den skickas vidare – hela ord, oavsett versaler – så det gäller alla
klienter. Att tysta en spelare (`/tysta namn` i chatten) sker bara i den egna webbläsaren tills sidan laddas om; inget skickas
eller sparas. Test: `node --test cloudflare/chat.test.mjs`.

**Stänga av:**
- Klienten: `GHOSTS.enabled = false` i `src/config.js` (och pusha), eller `?mp=0` i adressen för en enskild besökare.
  Utan `CLOUD_URL` är den helt av.
- Nödbromsen: `curl -X DELETE -H "Authorization: Bearer $(cat ~/.config/lunden-l1007/admin-token)" <adress>/admin/players`
  stänger alla anslutningar och nekar nya (kod 4003) tills den slås på igen med `curl -X PUT …/admin/players`.
  `DELETE /admin/all` drar samma broms. `curl -H "Authorization: Bearer …" <adress>/admin/players` visar månadens räkning.
- Lokalt: `node cloudflare/dev.mjs 8146` kör rummet med WebSocket på Node (`cloudflare/devws.mjs`); tester:
  `node --test cloudflare/players.test.mjs`, `tools/ghosttest.cjs` och `tools/chattest.cjs` (två webbläsarsidor).

## API

| Anrop | |
|---|---|
| `GET /drawings` | lista: id, yta, plan, position, normal, vridning, tid, `updated` |
| `GET /drawings/:id` | bilden |
| `PUT /drawings/:id` | metadata + `image` (data-URL); senaste `updated` vinner |
| `DELETE /drawings/:id` | slängd |
| `GET` / `PUT /paper` | teckningen på skrivbordet `{ image, updated }` (ingen 24h-gräns) |
| `GET /cinema/posters` | bions dagliga affischer (#1575): `{ day, items: [{ id, title, channel }], stale }`; 503 utan nyckel, 502 när det aldrig funnits en lyckad lista |
| `GET /playroom/posters` | lekstugans riktiga affischer (#1670): `{ day, rooms: { hall, spel, biljard: [{ src, w, h, title, artist, licence, licenceUrl, page }] }, stale }`; 502 när det aldrig funnits en lyckad pool |
| `GET /beer-shelf` | complete global DIPA/TIPA selection with original label images; 503 on any source failure |
| `GET /scores` | topp 10 `[{ key, name, score, updated, avatar? }]`; `key` är en publik radnyckel (hash av id:t, #1585), det privata id:t skickas aldrig; `avatar` är radens utseendekod |
| `POST /scores` | `{ id, name, score, avatar? }` (text/plain eller JSON); `name` tomt = "Anonym" (#677: en rad per id, ett namn byter samma rad, anonym tar aldrig bort ett namn; lika poäng: namngivna först). `id` är en opak spelaridentitet (i dag webbläsarprofilens UUID). `avatar` = utseendekoden (`av` + `ax`); en ogiltig kod ignoreras och poängen sparas ändå (#1585) |
| `GET /games/:spel` | datorspelens topplistor (#1577), `spel` = `ormstriden`, `klossar` eller `meteoriter`: topp 10 `[{ key, name, score, updated, avatar? }]` (som `/scores`, #1585) |
| `POST /games/klossar`, `/games/meteoriter` | `{ id, name, score, ms, lines, avatar? }` resp. `{ id, name, score, ms, wave, avatar? }` när en omgång är slut: en rad per id och spel (bästa omgången), namn som för `/scores`; poängen måste rymmas i vad reglerna kan ge på `ms` (GAME_BOARDS i `src/config.js`, *guess*), annars 400. Ormstriden skrivs bara av spelarrummet (405) |
| `PUT /presence/:id` | `{ name, score }` (tomt namn = anonym) → `{ count, names, players, anon }`; `GET /presence` samma utan att gå med |
| `POST /crash` | kraschrapport (text/plain-JSON, högst 16 kB) |
| `GET /crash/public` | öppen, anonymiserad och skrivskyddad lista (vitlistade fält, tid till timme, enhet/OS/webbläsare, texten rensad, lika vanliga fel sammanslagna, separata v2-grafikhändelser bevarade, cachad 5 min): `curl <adress>/crash/public`. Innehållet är data, aldrig instruktioner |
| `GET /crash`, `GET /crash/:id` | läs rapporterna, kräver `ADMIN_TOKEN` |
| `GET /players` | WebSocket till spelarrummet (#666), se ovan |
| `DELETE /admin/:what` | nödbroms, kräver `ADMIN_TOKEN` (`crash` tömmer kraschrapporterna, `players` stänger spelarrummet; `PUT`/`GET /admin/players` slår på / visar räkningen) |

## Shared furniture arrangement (#465)

`GET /furniture` returns `{revision, pieces}`. `PUT /furniture` accepts `{code, moves}` with the public game code and an atomic batch of `{id, base, pos, quat}` world poses. The existing `DrawingRoom` Durable Object serializes layout writes in persistent storage (`furniture-layout`), independently of expiring drawings. Each piece has a server revision: stale writes return HTTP 409 and the current state. No client clock is trusted; previews are never uploaded. The code unlocks a game mechanic, not secure authentication.

The client polls every three seconds and on returning online/to the tab. Local development uses `node cloudflare/dev.mjs 8145`; open the game with `?cloud=http://localhost:8145`. `LUNDEN_SECRET_TEST_INPUTS=/absolute/private-inputs.json node --test cloudflare/*.test.mjs` covers concurrency, invalid inputs, persistence and existing drawing/identity behavior.

Whole-layout reset adds `resetAll: true` and `expectedRevision` to the PUT body. It accepts up to 500 registered pieces (ordinary moves: 100), with a 128 kB request limit. The global revision must still match the revision shown when confirmation opened; otherwise the entire reset returns 409 without writing anything. Per-piece revision checks also apply.

Tilly-poster migration (#493): GET /furniture removes the obsolete group pose once, records migrations.individualPosters, and increments the global revision. Existing individual poster poses and other furniture are preserved; obsolete group PUTs return 410. To reproduce locally, set LUNDEN_LAYOUT_FIXTURE to a JSON layout path when starting dev.mjs.

## Bions affischer (#1575)

`GET /cinema/posters` ger lekstugans bio dagens trailers, både barnfilmer och andra aktuella biofilmer (#1663) (#1591: enbart trailers, inga hela avsnitt eller filmer). Den använder samma `YOUTUBE_API_KEY`, storleksgräns och id-/titelvalidering som `/youtube-search` (`cloudflare/youtubesearch.js`). **Källa (#1597):** kandidaterna är de tillåtlistade kanalernas egna senaste uppladdningar, inte sökningar. För varje kanal i `PLAYROOM.cinemaPosters.worker.channels` (barnkanaler) och `worker.cinemaChannels` (#1663: svenska distributörer och biografer) hämtas uppladdningsspellistan (`UU…`) med `playlistItems.list?part=snippet,contentDetails` (högst `perChannel` = 50, 1 enhet per kanal). Kvar blir uppladdningar med "trailer" i titeln från de senaste `recentDays` dagarna (barnkanaler) eller `cinemaRecentDays` (90, *guess*) dagarna (biokanaler, en uppskattning av vad som går på bio nu). De tidigare tre trailersökningarna (`search.list`, 100 enheter styck) gav i praktiken inga tillåtlistade barnmärkta trailers, så Workern svarade 502 och bion visade bara de generiska affischerna. Kandidaterna tas turvis från kanalerna, högst `maxVetted` (200). HTML-entiteterna i YouTubes titlar avkodas till ren text, och affischens titel blir filmens namn (`filmTitle`: "Minions & Monsters | Final Trailer" → "Minions & Monsters", hashtaggar bort; #1602: även `⏐`, `│` och `｜` delar titeln). Klienten ritar bara texten på en canvas. **Språk (#1600):** de godkända trailerna rangordnas efter `snippet.defaultAudioLanguage` och `defaultLanguage`. Den sämre av de kända taggarna gäller, eftersom DreamWorksTV Worlds dubbningar har kanalens standardljud `en` men egen metadata `nl`/`fi` (kontrollerat live 2026-10-25); `und`/`zxx`/`mul` räknas som okänt. innan en-per-film och `maxPerChannel` tillämpas (#1663: efter dagens blandning, så språket går först och dagens ordning avgör inom ett språk): först svenska, sedan engelska (`worker.languages`), sedan okänt och sist övriga språk, nyast först inom varje språk. En kanals utländska dubbningar (DreamWorksTV Worlds nederländska och finska Netflix-trailers) tar alltså bara platser som inget bättre vill ha. Samma serie på två språk känns inte igen som samma film, eftersom titlarna är översatta. Varje affisch i svaret har fältet `lang` ("ljudspråk/metadataspråk" som videos.list gav dem), så att rangordningen kan kontrolleras i den levande listan; klienten ignorerar det.

- **Kvot:** en lyckad omgång per dygn (Europe/Stockholm): 21 barnkanaler + 8 biokanaler × 1 + `videos.list` 1 per 50 kandidater (högst 4) = högst 33 enheter. En misslyckad dag försöker igen tidigast efter `retryHours` (6 h), utom när `filterVersion` har ändrats sedan försöket; då försöker den direkt (#1597), så att en driftsättning inte väntar.
- **Filter (#1589):** kandidaterna granskas innan något publiceras. `videos.list?part=status,contentDetails,snippet` (1 enhet per 50 id:n) kräver `madeForKids` (utom för kanaler i `worker.cinemaChannels`, #1663: användarens beslut är allt som inte är åldersbegränsat på YouTube), `embeddable`, `privacyStatus: public` och att `ytRating` inte är `ytAgeRestricted`. Kanalen måste finnas i `worker.channels` eller `worker.cinemaChannels` (verifierade kanal-ID:n, #1589/#1663; ej bekräftade 2026-10-28: Warner Bros. Pictures Sverige, Paramount Sverige, UIP Sverige, TriArt Film); tomma listor ger inga affischer. **Trailers (#1591):** videons egen titel måste innehålla "trailer" och längden vara 1 s till `worker.maxTrailerSeconds` (300 s; direktsändningar/premiärer utan längd faller bort). En trailer per film (samma filmnamn två gånger visas en gång). Ord i `worker.blockWords` i titel/kanal sorteras bort (sedan #1663 även skräck/våld, *guess*). **Dagens urval (#1663, `pickPosters`):** hela den godkända poolen blandas med Stockholmsdagen som frö (samma för alla besökare samma dag, nytt nästa dag), ordnas sedan efter språk, högst `worker.maxPerChannel` (2) per kanal; `kidsShare` (hälften, *guess*) av platserna går till `madeForKids`-trailers och resten till övriga, och en grupp som inte räcker fylls ut med den andra. De valda visas bästa språk och nyast först. Färre godkända än platser ger färre affischer (klienten fyller med generiska), noll godkända eller ett API-fel ger `upstream` så att gårdagens filtrerade lista (`stale`) används. `filterVersion` är 8 (#1663), så listor från äldre filter serveras aldrig (webbläsarens sparade lista har fortfarande `v: 3`; dess innehåll var redan filtrerat).
- **Cache:** KV-nyckeln `cinema-posters` = `{ day, filter, items, triedDay?, tried?, triedFilter? }` (`filter` = `worker.filterVersion`; listor utan den, alltså ofiltrerade från före #1589, serveras aldrig), plus en kopia i isolatets minne. Ett isolat utan dagens lista läser KV innan det söker, så att andra isolat inte söker om. Svaret har `Cache-Control: public, max-age=1800`.
- **Reserv:** misslyckas dagens hämtning (eller en av kanalerna, då används de andra) lämnas den senaste lyckade listan ut med `stale: true`. Har det aldrig funnits en lista blir svaret 503 (ingen nyckel) eller 502. Klienten visar då sin egen sparade lista eller generiska affischer utan klick. **Robusthet (#1605):** en enskild affisch som inte klarar valideringen (tom titel, för långt `lang`) tas bort för sig; en titel som bara består av hashtaggar behåller dem. En hämtad lista som ändå underkänns räknas som ett misslyckat försök (`tried`, högst ett försök per `retryHours`) och skrivs aldrig över den senaste lyckade listan. Misslyckades KV-läsningen skrivs ett misslyckat försök inte till KV, så att en lista som isolatet inte kunde läsa finns kvar.
- **Bilder:** miniatyrerna hämtas direkt från `i.ytimg.com`, som svarar `Access-Control-Allow-Origin: *`, så det behövs ingen bildproxy i Workern.
- **Test:** `node --test cloudflare/cinemaposters.test.mjs` (falsk fetcher och KV: urval och filter, dygnscache, validering, fel och reserv).

## Lekstugans riktiga affischer (#1670)

`GET /playroom/posters` (`cloudflare/playroomposters.js`) ger hallens, SPEL:s och BILJARD:s affischer som riktiga bilder från **Wikimedia Commons**. Ingen nyckel behövs.

- **Källa:** en handplockad tillåtlista (`POOLS`) med 112 filnamn i fyra teman. Varje fil granskades 2026-10-29: den är barnvänlig och stående och har en fri licens på sin filsida. Teman: `film` (35 amerikanska stumfilmsaffischer från 1920-talet, public domain), `game` (38 spelomslag: Sierra On-Lines retroboxar under CC BY-SA 4.0, indiestudiors egna CC-omslag och några public domain), `music` (31 affischer från WPA Federal Music Project och amerikanska konsertturnéer samt en operettaffisch, public domain) och `billiard` (8 biljardannonser från 1800-talet och tidigt 1900-tal, public domain utom en under CC BY 2.0). Kategorier används inte, eftersom vem som helst kan lägga till filer i dem. En ny fil ska granskas på samma sätt innan den läggs i sitt tema.
- **Licens per bild:** en gång per dygn (Europe/Stockholm) frågar Workern Commons API (`prop=imageinfo`, `iiurlwidth=330`, `extmetadata` LicenseShortName/LicenseUrl/Artist, högst 50 filer per anrop, alltså 3 anrop, med en egen `User-Agent`) om varje fils *nuvarande* licens. Bara `LICENCES` godtas: public domain/PDM, CC0, CC BY och CC BY-SA. Raderade filer, andra licenser, filer som inte är JPEG/PNG, liggande bilder och miniatyrer utanför `upload.`/`thumb.wikimedia.org` faller bort. Varje bild i svaret har `licence`, `licenceUrl`, `artist` (HTML borttagen, ren text) och `page` (filsidan). CC BY-affischer får upphovsperson och licens i en rad under bilden (klienten).
- **Dagens urval (`pickRooms`):** varje tema blandas med `${dag}:${tema}` som frö, alltså samma för alla besökare samma dag och nytt nästa dag. SPEL får 9 spel, BILJARD 6 musik och 3 biljard och hallen det som blir över: 6 film, 2 musik och 2 spel. Ingen fil visas två gånger.
- **Cache och reserv:** KV-nyckeln `playroom-posters` = `{ version, day, pool, triedDay?, tried? }` plus en kopia i isolatets minne. Misslyckas dagens hämtning används den senaste godkända poolen (`stale: true`, men med dagens urval). Ett nytt försök görs tidigast efter 6 h. Svaret har `Cache-Control: public, max-age=1800`.
- **Bilder:** miniatyrerna laddas direkt från Wikimedia, som svarar `Access-Control-Allow-Origin: *` (kontrollerat 2026-10-29 för både `upload.` och `thumb.wikimedia.org`). Därför behövs ingen bildproxy. Commons spårningsparametrar (`utm_*`) tas bort.
- **Test:** `node --test cloudflare/playroomposters.test.mjs` med falsk Commons och KV. Testet täcker licens-/värd-/formatfilter, att samma datum ger samma urval och två datum olika, dygnscache, reserv och väntan samt routen.

## Daily beer shelf (#511)

`GET /beer-shelf` reads [UntappdBolaget's global style lists](https://untappdbolaget.se/top-10?rank=global) through its public Worker, `/top-lists`, `/sb-products/:category` and `/enrichment/:category`. The source's `globalByStyle` uses normalized global scores. Double IPA styles (excluding Triple) and Triple IPA styles are merged separately; the first two distinct beers in each group are joined to actual package type/volume and original Systembolaget product photos or Untappd labels. The prepared 2026-10-08 selection is four cans (473/440/440/440 ml); bottles are rendered when the source actually supplies them.

The adapter allows only known source/image hosts, bounded responses and a 6.5-second source deadline. All metadata and all four images must succeed. It writes no KV state and pins no failed images in a server day-cache. Browser image decoding and atomic persistent cache replacement own daily success; failed loads retain the previous whole selection and can retry on another load. No source credentials are required. `node --test cloudflare/beershelf.test.mjs` tests ranking, catalogue joins, packaging, complete images, source failures and GET-only behavior with offline fixtures.

The `global_fetch_strictly_public` compatibility flag allows the public source Worker request on the same workers.dev zone ([Cloudflare fetch documentation](https://developers.cloudflare.com/workers/runtime-apis/fetch/)); local Node does not enforce this production routing rule.


Layout-testernas två verkliga inmatningar måste tillföras explicit i en extern, ospårad JSON-fil `{ "codes": [<första kanoniska inmatningen>, <andra kanoniska inmatningen>] }` (#853/#854). Sätt `LUNDEN_SECRET_TEST_INPUTS` till filens absoluta sökväg; saknad/felaktig provisionering stoppar testet, utan hårdkodad reserv eller skip. [Protokoll, kompatibilitet och native browser-prov](../docs/development/storage.md#versioned-layout-credentials-853). Nuvarande deploy-workflow kör inga Node-/browser-tester och behöver därför inte testinmatningar; en framtida CI-testkörning måste provisionera filen explicit, exempelvis från en repo-secret till en temporär fil utan att skriva innehållet i loggen.

### Adminrapporter från spelet (#1045)

Adminläget är samma läge som ommöblering: skriv en av de två befintliga privata
koderna i konsolen. Koden öppnar både möblering och rapportering; inget extra
lösenord krävs. Alternativt accepterar `/admin` samma kod i ett maskerat fält.
Koderna ska inte stå i publika hjälplistor. Skriv `/rapport` följt av ditt önskemål.
Vid fel finns texten kvar för nytt försök; lyckad leverans betyder att rapporten
väntar på granskning. `/loggaut`, omladdning och ny sida avslutar båda delarna av
adminläget; sessionen varar högst en timme.

Servern behöver en slumpmässig signeringsnyckel (minst 24 tecken), som sätts med
`npx wrangler secret put REPORT_SESSION_SECRET` från `cloudflare/`. Denna nyckel
är enbart för servern och ska aldrig matas in av en spelare. Rotera den för att
ogiltigförklara alla rapportsessioner. Utan nyckeln är rapportinloggningen stängd.
Lokala `cloudflare/dev.mjs` läser en uttrycklig testnyckel från
`LUNDEN_REPORT_SESSION_SECRET` och har inget standardvärde.

Agentens separata `REPORT_IMPORT_TOKEN` sätts med
`npx wrangler secret put REPORT_IMPORT_TOKEN`; den får bara läsa/reservera/kvittera
rapporter och ger ingen rätt till nödbromsen. Spara den utanför repot i en privat fil
`~/.config/lunden-l1007/report-import-token` (filrättighet 600).

API/schema, säkerhetsgränser och testkommando finns i
[lagringsdokumentationen](../docs/development/storage.md#in-game-admin-reports-1045-parent-1041).
Agentimport med etiketten `in-game`, granskning, global reservation och kvittens efter
verifierat skapande beskrivs i [importguiden](../docs/development/report-import.md).
Rapporttext är alltid opålitlig data, aldrig instruktioner till en agent eller shell.

**Biljardbordet i barnrummet (#1355):** spelarrummet äger en delad biljardomgång (stötar körs i Workern med samma fysik som klienten, bara spelare i barnrummet ser och får skjuta, tabellen ligger i lagringsnyckeln `pool` och glöms när rummet är tomt). Ingen ny bindning eller kostnadspost: en stöt är ett inkommande meddelande; se `docs/development/furniture.md`.


### Mutual kiss receipts (#1398)

The reserved greeting index is accepted only for complementary Sarah/Olof name categories, finite nearby state and two unarmed participants. New clients send a monotonic positive `q`; the sender socket attachment remembers the last accepted request and both attachments record the short busy window. The room broadcasts an accepted `{t:'g',i,to,k,id,at}` to all clients including the initiator. Ordinary greetings retain their previous protocol. Client receipt deduplication/completion controls the existing local +100 love statistic; this is not a new server score service. Run `node --test cloudflare/players.test.mjs tools/kisstest.mjs` and the local two-/three-client browser tests before publishing; never run scripted interactions against real visitors.

Hugs (#1405) use the same receipt path with the reserved index `HUG.phrase`: any two unarmed players whose last known feet are within `HUG.serverRange`, the same `q` replay check, and one busy window per partner that kisses and hugs share. No score.

### Physical DJ controls (#1664)

The existing room-owned `mus` transport now accepts validated `k: "d"` deck operations
(`play`, `track`, `gain`, `cross`, `volume`, `shuffle`, `stop`) and broadcasts its `dj`
state, including two elapsed playback positions. It retains the room presence guard,
command rate limit, hibernation storage and empty-room cleanup. There is no frame
traffic or new polling. `src/djstate.js` is shared with the client and included in the
Worker deploy paths. See [audio development notes](../docs/development/animals-audio.md#dj-bench-physical-two-deck-controls-1664)
and `node --test cloudflare/roommusic.test.mjs`.
