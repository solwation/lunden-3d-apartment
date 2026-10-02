# Delad värld (Cloudflare Worker)

Uppsatta teckningar, teckningen på skrivbordet i Sovrum 3 och kattfoton delas mellan alla besökare via en liten
Cloudflare Worker med KV-lagring (#178, #119). Utan den fungerar allt som förut, bara lokalt i webbläsaren.

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

- **Inga hemligheter i repot.** KV-id:t i `wrangler.toml` och adressen i `src/config.js` är inte hemliga.
  Nödbromsnyckeln (`ADMIN_TOKEN`) ligger som Worker-secret i Cloudflare och lokalt i
  `~/.config/lunden-l1007/admin-token`.
- **Skydd:** skrivning är öppen (en publik sida kan inte gömma en nyckel), så workern tar bara emot JPEG/PNG upp
  till 300 kB, högst 100 teckningar och 20 kattfoton, max 30 skrivningar per minut och IP, och CORS bara från
  `https://solwation.github.io` (och localhost).
- **Nödbroms:** töm allt (eller bara en del) om något olämpligt hamnar där:
  `curl -X DELETE -H "Authorization: Bearer $(cat ~/.config/lunden-l1007/admin-token)" <adress>/admin/all`
  (`/admin/drawings`, `/admin/catphotos`, `/admin/paper`).
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
| `GET` / `PUT /paper` | teckningen på skrivbordet `{ image, updated }` |
| `GET /catphotos`, `GET` / `PUT /catphotos/:id` | kattfoton (de 20 senaste) |
| `DELETE /admin/:what` | nödbroms, kräver `ADMIN_TOKEN` |
