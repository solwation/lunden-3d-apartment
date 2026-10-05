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

- **Privat hem:** mat, gurkor, smulor och möbler skickas inte till Workern.
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
  (`/admin/drawings`, `/admin/paper`, `/admin/scores`). Ta bort ett enda olämpligt namn från topplistan:
  `curl -X DELETE -H "Authorization: Bearer $(cat ~/.config/lunden-l1007/admin-token)" "<adress>/admin/scores?id=<namnet>"`.
- **Topplistan:** en rad per webbläsare (slumpat id), namn högst 20 tecken (`<>&"` och styrtecken tas bort), och en
  poäng kan inte växa snabbare än 600 per minut (en ny rad börjar på högst 3000) – fusk blir litet.
- **Stänga av:** sätt `CLOUD_URL = ''` i `src/config.js` och pusha.
- **Automatisk omdriftsättning (valfritt):** `.github/workflows/cloud.yml` driftsätter om workern när
  `cloudflare/**` ändras på main, om repot har secrets `CLOUDFLARE_API_TOKEN` (en API-token med *Workers Scripts:
  Edit* och *Workers KV Storage: Edit*) och `CLOUDFLARE_ACCOUNT_ID` (GitHub → Settings → Secrets and variables →
  Actions). Utan dem hoppar jobbet över steget.
- **Lokalt utan Cloudflare:** `node cloudflare/dev.mjs 8144` kör samma worker med minneslagring; öppna sajten med
  `&cloud=http://localhost:8144`. `tools/cloudtest.html` testar mot den. `&sync=debug` loggar synken i konsolen.

## API

| Anrop | |
|---|---|
| `GET /drawings` | lista: id, yta, plan, position, normal, vridning, tid, `updated` |
| `GET /drawings/:id` | bilden |
| `PUT /drawings/:id` | metadata + `image` (data-URL); senaste `updated` vinner |
| `DELETE /drawings/:id` | slängd |
| `GET` / `PUT /paper` | teckningen på skrivbordet `{ image, updated }` (ingen 24h-gräns) |
| `GET /scores` | topp 20 `[{ name, score }]` |
| `POST /scores` | `{ id, name, score }` (text/plain eller JSON) |
| `DELETE /admin/:what` | nödbroms, kräver `ADMIN_TOKEN` |
