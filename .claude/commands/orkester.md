---
description: Orkestrera subagenter som implementerar öppna GitHub-issues tills inga finns kvar (valfritt område som argument)
argument-hint: "[område, t.ex. 'bara livssimulatorn #364–#396' eller 'inte livssimulatorn']"
---

Du är orkestrerare för repot solwation/lunden-3d-apartment. Läs CLAUDE.md först och följ den. Svara mig på svenska.

**Område för den här sessionen:** $ARGUMENTS
(Om inget område anges: alla öppna issues.)

## Uppdrag
Implementera öppna GitHub-issues med subagenter (Agent-verktyget, `isolation: "worktree"` i molnet, egen ext4-worktree lokalt i WSL, i bakgrunden) tills inga
issues inom området finns kvar. Nya issues dyker upp löpande — lista om varje gång en agent blir klar.

## Prioritetsordning — styr varje nytt issueval
- **Användarens omprioritering 2026-10-14:** huvudträffsutbyggnad och dess delar/teststöd har `priority: low`.
  Starta inte fler separata ögon-/pupill-/hår-/polygonregioner. Användaren föredrar fungerande stöd plus tre
  gemensamma huvud-hitboxar (nederdel, mitt, mindre topp). Gamla bodytexter om medium/exakt polygonacceptans
  är ersatta av detta nya spelkontrakt; nya barn ärver low. Pågående detaljarbete lämnas vid säker checkpoint
  med filer/resultat bevarade. Stäng ersatta oimplementerade detaljissues när den nya lösningen är verifierad.
  Denna förfining får inte blockera separata buggar/features eller bli ett påhittat prerequisite till dem.
- **Hög → medel → låg, äldst först inom varje nivå** enligt `created_at` (därefter issuenummer).
  Etiketterna är `priority: high`, `priority: medium`, `priority: low`; utan prioritet räknas som medel.
  Ändra inte befintliga prioriteter utan användarens uppdrag. Storlek, synlighet i spelet, filområde, korta kedjor,
  reservationer och önskan att fylla platser får inte sätta denna ordning ur spel.
- **Hämta hela kön före varje tilldelning, reservation, övertagande och kedjefortsättning:**
  `gh api --paginate 'repos/solwation/lunden-3d-apartment/issues?state=open&per_page=100'`.
  Filtrera bort pull requests, #420/etiketten `orkester` (samordning, inte implementationsarbete) och issues utanför
  användarens område. Sortera uttryckligen på prioritet och `created_at`; GitHubs listordning, `updated_at` och
  standardgränsen för `gh issue list` är inte prioritetsordning. Kontrollera vald issues aktuella etiketter och
  reservationer igen precis före start.
- **Kompakt read-only-hämtning (#926):** `python3 tools/orkester_queue.py --issue 715 --issue 669 --out-dir /tmp/lunden-queue`
  kan ersätta den manuella köhämtningen/sorteringen ovan. Varje körning hämtar hela öppna kön och aktuell body samt
  **alla kommentarer** för #420 och varje `--issue`, med explicit `per_page=100`, `--paginate` och HTTP/Link-kontroll.
  Tabellen behåller `orkester:`-ägaretiketter; föräldra-/barnuppgifter är bara information, aldrig automatiska hinder.
  Fulla råfält, sid-/kommentarsantal och start/sluttid sparas i en unik atomisk snapshot **utanför repot**. Läs valda
  bodies/hela kommentarhistoriken och #420 i filens `requests[].data` före beslut; tabellen ersätter inte den läsningen.
  Ett exempel för full valda-data-läsning är `jq '.requests[] | select(.endpoint | contains("state=open") | not) | {endpoint,data}' SNAPSHOT`.
  **CLI1 betyder ingen komplett färsk kö**: använd aldrig en äldre fil som ersättning eller välj den senaste lyckade filen
  efter ett fel. Gör en ny körning inför varje nytt urval och igen med valt `--issue N` direkt efter en separat reservation
  för race-kontrollen; även då läses alla kommentarssidor. Verktyget reserverar/ändrar inget, tolkar inga beroenden och
  har ingen polling, snapshot-inläsning eller långlivad cache. En hämtning är tidsstämplad men inte en atomisk GitHub-vy.
- **Ta det första startbara ärendet i den sorterade kön.** Ett ärende får hoppas över bara om det redan arbetas på
  (`in-progress`/aktiv annan agent), har en giltig annan reservation enligt samordningsreglerna, eller är konkret
  blockerat av ett olöst beroende, ett användarsvar eller en fysisk enhet som saknas. Kontrollera aktuell body,
  kommentarer och #420; anta inte att ett svårt eller stort ärende är blockerat. Ett föräldraärende med återstående
  delissues hanteras via sina delar; välj högst prioriterade startbara del och notera varför föräldern inte startas.
- **Saknad fysisk enhet blockerar inte automatiskt felsökning eller implementation.** Användarens krasch/lagg är
  redan ett felunderlag: bilda en tydligt märkt teori, granska kod och rapporter, verifiera den riskabla kodvägen med
  tillgängliga verktyg och leverera en avgränsad, reversibel åtgärd när det finns stöd för den. Enbart mer telemetri
  och en vag begäran att användaren ska testa får inte ersätta möjlig egen felsökning. Markera fysisk verifiering
  som kvarvarande acceptans, inte hela ärendet som blockerat, så länge konkreta diagnos-/åtgärdssteg finns. Efter
  leverans: ange vilken publicerad ändring som ska provas, ett kort konkret förlopp och vad användaren ska observera.
- **Redovisa varje överhoppat högre prioriterat eller äldre ärende i #420:** nummer, prioritet, konkret hinder och
  vad som krävs för att det ska bli startbart. Skriv också prioritet och skapandetid för varje valt ärende.
  Kontrollera hindren igen vid nästa tilldelning; en gammal anteckning om väntan räcker inte. Lägre prioritet får
  startas först när alla ärenden före det valda ärendet är hanterade eller har dokumenterade hinder.
- **Kedjor är förslag, inte en förtur.** Efter varje färdig issue rapporterar agenten till orkestern och inväntar
  ett nytt val från den uppdaterade kön innan nästa issue startas, även om nästa är reserverad i samma kedja.
  Släpp eller flytta väntande reservationer om ett högre prioriterat eller äldre startbart ärende kommit in.
  Avbryt inte redan påbörjat arbete bara för att kön ändrats; den nya ordningen gäller nästa start.
- **Beroenden och nedbrytning:** nya delissues ärver förälderns prioritet vid skapandet. Krävs ett befintligt lägre
  prioriterat beroende för att låsa upp ett högre prioriterat ärende, dokumentera sambandet och varför beroendet
  måste göras först i #420; ändra inte dess etikett. Välj annars startbart arbete i ordinarie prioritetsordning.
  Filkonflikter hanteras genom ansvarsfördelning och rebase, inte genom att välja lägre prioritet för enkelhetens skull.

## Miljö (molnsession)
- Ingen google-chrome: använd installerad Playwright Chromium med flaggorna i [verifieringsguiden](../../docs/development/verification.md).
- cdn.jsdelivr.net är blockerad: servera med `python3 tools/devserve.py <port> <katalog>`. Varje agent har en egen port
  och serverar sin egen worktree.
- `gh issue …` fungerar inte (GraphQL blockerat): använd `gh api` REST, t.ex.
  `gh api 'repos/solwation/lunden-3d-apartment/issues?state=open&per_page=100'` (filtrera bort `pull_request`).
- **Disk:** varje worktree är en hel kopia av repot och sessionens disk är begränsad. Ta bort en agents worktree när den
  är klar (`git worktree remove --force .claude/worktrees/agent-<id>` + `git branch -D worktree-agent-<id>`, aldrig en
  som fortfarande kör), och ge Chrome en tillfällig `--user-data-dir` som tas bort efter körningen (`rm -rf`).
- VM:en har ~4 CPU:er: **högst 3 agenter samtidigt** — fler gör bara varje headless-test långsammare.

## Miljö (lokal WSL)
- Repot under `/mnt/c/...` går via 9p-bryggan och är ~100× långsammare. Kör orkestern i ext4-spegeln
  `~/lunden-3d-apartment` (remote `winc` pekar på /mnt/c-kopian, se den globala CLAUDE.md).
- `isolation: "worktree"` skapar worktreen under sessionens arbetskatalog, alltså på /mnt/c om sessionen startades där.
  Starta därför agenterna **utan** `isolation`, och låt varje agent skapa en egen worktree på ext4:
  `git -C ~/lunden-3d-apartment fetch origin main && git -C ~/lunden-3d-apartment worktree add --detach ~/lunden-wt/<namn> origin/main`.
  Agenten arbetar bara där och tar bort den när den är klar (`git -C ~/lunden-3d-apartment worktree remove --force ~/lunden-wt/<namn>`).
- Saknas google-chrome används Playwright Chromium (`~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome --no-sandbox`).
  Ge varje körning en tillfällig `--user-data-dir` och servera med `tools/devserve.py` på agentens egen port, precis som i molnet.
- Om en tidigare orkestersession har krashat: läs dess statuskommentar i #420 och kommentarerna på de reserverade
  issuerna. Leta efter rester i `~/lunden-wt/` och `git worktree list` (i både ext4- och /mnt/c-kopian). Fortsätt
  sedan kedjorna och redigera den gamla statuskommentaren i stället för att skapa en ny.

## Synkronisering med andra orkestrar (issue #420, etikett `orkester`)
Andra `/orkester`-sessioner kör på egna VM:ar och kan inte nås med SendMessage — GitHub är den gemensamma kanalen.
- **Etikett för aktiv orkester:** välj ett unikt, stabilt orkester-id och använd samma id i statusen, reservationerna
  och etiketten `orkester: <id>` (t.ex. `orkester: codex-orkester-priority-20261013`). Återupptagning behåller id:t.
  Skapa etiketten vid sessionsstart om den saknas (`gh api -X POST repos/solwation/lunden-3d-apartment/labels
  -f 'name=orkester: <id>' -f color=5319e7 -f 'description=Aktivt arbete hos orkester <id>'`). Ange den exakta
  etiketten och gärna filterlänken i din statuskommentar, så användaren kan filtrera i GitHubs Issues-vy.
- **Märk varje issue när arbetet börjar:** lägg till både `in-progress` och den egna `orkester: <id>` i samma
  etikettanrop (`gh api -X POST repos/solwation/lunden-3d-apartment/issues/N/labels -f 'labels[]=in-progress'
  -f 'labels[]=orkester: <id>'`). Ge alla arbetsagenter orkester-id:t och etiketten i deras prompt. Orkestern
  kontrollerar etikettparet efter start och vid varje statusuppdatering; komplettera också egna redan aktiva issues
  när denna regel införs eller en session återupptas. Högst en aktiv orkesteretikett per issue.
- **Etiketten följer aktivt arbete, inte en framtida kö:** reserverade men ännu inte startade kedjeissues och
  föräldrar utan eget aktivt arbete får ingen orkesteretikett. Ta bort den egna orkesteretiketten tillsammans med
  `in-progress` när arbetet avslutas, issuen stängs/återöppnas, reservationen släpps eller agenten avbryts/väntar
  utan att arbeta. Vid överlåtelse eller tillåtet övertagande uppdateras ägaretiketten enligt samordningsreglerna;
  ta inte bort en annan aktiv orkesters etikett. Historiken ligger kvar i reservations- och statuskommentarerna.
- Prefixet `orkester:` ändrar inte prioriteten och är inte samma etikett som samordningsetiketten `orkester`.
  Filtrera aldrig bort arbetsissues ur kön bara för att de har en orkester-id-etikett. Etiketterna ersätter inte
  reservationskontrollen eller kapplöpningsreglerna nedan.
- **Först:** läs #420 och dess kommentarer (`gh api repos/solwation/lunden-3d-apartment/issues/420/comments`). Varje session
  har en egen statuskommentar. Ta inte issues som en annan session har reserverat där eller som har `in-progress`.
- **Skapa din statuskommentar** i #420 (spara dess id) och **redigera den** (`gh api -X PATCH
  repos/solwation/lunden-3d-apartment/issues/comments/<id> -F body=@fil`) varje gång en agent startar eller blir klar:
  sessionens namn/länk, område, en tabell med agenter, deras kedjor i ordning, **vilka filer/moduler kedjan rör**
  (t.ex. `stairs.js`, `STAIR` i config) och vad de gör nu, tid för uppdateringen.
- **Reservera hela kedjan** när en agent får den, med en kort kommentar på varje issue i kedjan:
  `Reserverad av orkester <session> (kedja: #a → #b → …). Se #420.` Etiketten `in-progress` sätts däremot **bara på den
  issue som agenten arbetar med just nu**. Agenten sätter den när den börjar på en issue och tar bort den när issuen
  är klar. Väntande issues i kedjan har bara reservationskommentaren, och kedjan syns i statuskommentaren. Avbryts
  kedjan tar du bort etiketten och skriver en kommentar om att reservationen är släppt.
- **Kapplöpning:** två sessioner kan reservera samma issue nästan samtidigt. Läs issuens kommentarer igen direkt efter
  din reservation: finns en äldre `Reserverad av orkester …` från en annan session (och den har inte släppt den) är
  issuen deras — ta bort din kommentar och din etikett (om den inte redan fanns före) och välj något annat.
- En statuskommentar som inte uppdaterats på 3 timmar räknas som övergiven; dess issues får tas över efter en kommentar.
- Rör det högst prioriterade startbara ärendet samma filer/område som en annan sessions pågående kedja? Dela upp
  ansvaret i olika block/moduler enligt nedan. Välj inte ett lägre prioriterat eller yngre ärende bara för att undvika
  samma fil; endast en konkret beroendeblockering får motivera att det hoppas över, och den redovisas i #420.

### Så att inget låser sig (förtydligande 2026-10-12, ur användarens önskan: allt ska bli klart så fort som möjligt)
Samordningen får aldrig vara skälet till att en agentplats står tom eller ett issue ligger still. Därför:
- Alla regler om att fylla platser, reservera och ta över nedan tillämpas **efter prioritetsordningen ovan**.
- **Fråga inte användaren** om du ska fylla en ledig plats. Har du färre agenter än taket (3 per VM) och finns något
  ledigt eller övertagbart: starta en agent direkt. Att välja nästa issue är ditt val, inte användarens.
- **Reservationer går ut snabbt:**
  - En reservationskommentar utan `in-progress` där ingen agent startat inom **30 minuter** är **ledig** – vem som helst
    med ledig plats får ta den (kommentar `Övertagen …` på issuen och i #420).
  - En issue med `in-progress` utan commit, kommentar eller statusuppdatering på **90 minuter** (inte 3 timmar) får
    tas över efter en kommentar, om dess agent inte syns köra (status i #420 saknar agenten, eller sessionen har
    uppdaterat sin kommentar senast för mer än 90 minuter sedan).
  - Reservera bara det en agent **startar på nu** plus högst **två** issues närmast därefter i kedjan; resten får vara
    oreserverade tills det finns en agent till dem.
- **Väntande på användaren eller en fysisk enhet** (t.ex. iPhone-test) ska inte hålla en reservation: släpp issuen med
  `Väntar på: <vad>` som kommentar och i #420, och ta den inte själv förrän svaret finns. Den räknas inte som arbete
  att fylla en plats med.
- **Avbruten agent** (API-fel, spend limit, krasch): återuppta den (SendMessage) eller släpp dess issues inom 30 minuter;
  ta bort etiketten `in-progress` från det den lämnat.
- **Filkonflikt är inget skäl att vänta.** Dela upp efter ansvar i #420 (egna moduler/block per issue, t.ex. `CORE_B` mot
  `CORE_C`), rebasa före varje push, behåll båda sidor vid konflikt. Samma fil, olika issues: den som pushar först vinner,
  den andra rebasar – ingen behöver be om lov.
- **Skriv alltid hur många platser som är lediga** i raden `Senast uppdaterad` i din statuskommentar (`lediga platser: N`),
  så att andra orkestrar ser var det finns kapacitet.
- **Dela kapaciteten — ta hellre över och släpp hellre än att stå still.** Målet är att alla orkestrar håller sina
  agentplatser fyllda (3 per VM) och att inget arbete ligger reserverat utan att någon kör det. Kolla på varje
  agent-klar och varje gång du har färre än 3 agenter igång:
  - **Du har ledig plats** och inget eget att starta → ta över arbete som en annan session reserverat men **inte
    påbörjat** (issue med bara reservationskommentar eller bara i dess "Kö", utan `in-progress`). Välj
    den högst prioriterade startbara issuen, äldst först, även om den ligger tidigt i kedjan. Skriv en kommentar i #420
    (vad du tar, vad de behåller, vilka filer ni båda rör) och `Övertagen av orkester <session> (tidigare reserverad av
    <andra>) …` på varje issue. Rör aldrig en issue som har `in-progress` eller som en agent är mitt i.
  - **Du har mer reserverat än du hinner köra** (issues långt bak i en kedja som inte startar inom ca 30 minuter) och
    en annan orkester har ledig kapacitet (läs dess statuskommentar: färre än 3 agenter eller "inga agenter igång")
    → **släpp** dem: ta bort reservationen med `Reservationen släppt av orkester <session> – ledig för andra` på
    issuen och i #420, så att de kan tas. Reservera i övrigt bara kedjor som en agent startar på nu, plus högst det
    som rimligen hinns med härnäst.
  - Blir din issue övertagen: lämna den utan diskussion. Vill du behålla något, skriv det som kommentar i #420 så
    släpper den som tog över. Vid kapplöpning gäller den äldsta reservationen/övertagandet.
  - Delar ni filer efter en överlåtelse (t.ex. samma modul eller protokoll): dela upp efter ansvar i #420, lägg nya
    delar i egna block/moduler, rebasa före varje push och behåll båda sidor vid konflikt.
- Förbättringar av själva synken diskuteras som kommentarer i #420; den som ändrar `/orkester` säger det där.

## Orkestrering
- Gruppera: issues som rör samma filer eller bygger på varandra ges till **en** agent som tar dem i tur och ordning
  (t.ex. livssimulatorns milstolpar M0 → M1 → …, eller flera ändringar på altanen). Oberoende issues får egna agenter.
  **Men håll kedjorna korta: högst 2 issues per agent** (3 bara om varje är liten), och ge hellre två parallella agenter än en
  lång kedja när issuesna rör olika data/filer (t.ex. Hus B och Hus C i var sin `CORE_*`-post, olika moduler, olika tester).
  En agent som kör i flera timmar kan dö (spendgräns, krasch) och då hänger allt på vad som hunnit pushas.
- **Bryt ner stora issues innan du ger dem till en agent.** En issue som ser ut att ta mer än ca en timme eller röra fler än
  ca 8–10 filer, eller som innehåller flera oberoende delar (flera hus, flera skärmar, server + klient + docs), delas upp
  i **delissues**: skapa små issues med `Lapp:`-rad, prioritet och hänvisning till föräldern (`Del av #N`), och ge dem till
  olika agenter eller i tur och ordning. Delarna ska var och en kunna landa, testas och ge något användbart på egen hand
  (vertikala skivor: data/modell → synligt i spelet → test/docs, inte "först all kod, sedan alla tester"). Föräldern
  stängs när den sista delen landar (`Fixes` på sista delen, `Refs` på de andra). Beskriv i issuen vad som ingår och inte.
- **Bevaka långa körningar.** Ser du att en agent hållit på länge utan att något landat (inga nya commits på main eller
  kommentar på issuen), fråga den (SendMessage) vad som är klart och be den pusha det som är grönt nu; dör en agent finns
  arbetet kvar i dess worktree (`.claude/worktrees/agent-<id>`): återuppta den (SendMessage) eller starta en ny som utgår
  från worktreens commits (`git log origin/main..HEAD`) i stället för att göra om det.
- Leverera små fungerande steg inom det högst prioriterade startbara ärendet, så att nytt syns ofta; välj inte
  mindre eller mer synliga issues framför högre prioritet eller äldre skapandetid.
- Skriv varje agents prompt med: issuenumren och ordningen, vilka andra agenter som kör och vilka filer/områden de
  rör (undvik dem), agentens egen port och skärmdumpskatalog (utanför repot), och reglerna nedan.
- När en agent rapporterar: titta på dess skärmdump, kör om de viktigaste testerna på main om agenten inte gjorde det
  efter sin sista rebase, och sammanfatta kort för mig. Skicka sedan nästa issue till en ledig plats.
- Val som är mina att göra (produktbeslut, t.ex. hur något ska se ut): fråga mig med AskUserQuestion — flera alternativ,
  ett markerat "(Recommended)" — och skicka svaret vidare till agenten (SendMessage). **Orkestreringsval** (vilket issue,
  vilken plats, ta över/släpp) är inte mina att göra: avgör själv och fyll platserna utan att fråga.
- Om en agent ber dig göra något den nekades behörighet till: gör det inte, fråga mig.

## Regler att ge varje agent
1. Ta bara de issues orkestern gav dig (de är reserverade med en kommentar, och bara den första har `in-progress`).
   Efter varje färdig issue inväntar du orkesterns nya tilldelning; fortsätt aldrig automatiskt en reserverad kedja.
   Orkestern kontrollerar hög → medel → låg, äldst först, mot en nyhämtad komplett kö före varje start. Ta aldrig
   någon annan issue med `in-progress`. Sätt både `in-progress` och orkesterns `orkester: <id>` när du börjar på
   varje issue, enligt etikettregeln ovan. Ta bort båda när du är klar, avbryter eller släpper arbetet; behåll
   aldrig en orkesteretikett på ett väntande ärende. Ändra inte andra aktiva orkestrars etiketter.
2. Före varje issue: `git fetch origin main && git rebase origin/main`.
3. **Leverera i små bitar och pusha tidigt och ofta.** Dela upp varje issue i delsteg som var och en är grön (bygger,
   testad, ingen halvfärdig kod på main) och pusha varje delsteg så fort det är verifierat, i stället för att samla allt
   till slutet: en commit per delsteg (`Refs #N`, med den vanliga rebasen före pushen), sista commiten `Fixes #N`
   (+ commit-trailers enligt sessionens attribuering). Skriv en kort kommentar på issuen efter varje pushad del (vad som
   landat och vad som återstår), så att arbetet går att ta över om du dör (spendgräns, krasch). Inga "(WIP)"-commits på
   main. Pusha direkt: `git push origin HEAD:main`; vid avvisning rebasa igen och behåll båda sidor vid konflikt. Aldrig
   force-push. Blir issuen större än väntat: leverera den fungerande delmängden, lägg resten som nya delissues med
   `Lapp:`-rad och prioritet (`Del av #N`) och stäng inte föräldern förrän allt är klart.
4. Changelog (bara synliga ändringar): precis före pushen id = högsta id + 1, överst i listan.
5. Testa bara det ändringen rimligen påverkar ([verifieringsguiden](../../docs/development/verification.md)); listan i prompten är ett maxtak.
6. Problem utanför den egna issuen → en ny issue `Bugg: …` med en `Lapp:`-rad, vad som felar, hur det återskapas och
   trolig orsak. Fixa inte i farten; gör klart den egna issuen.
7. Frågor till användaren postas som kommentar på issuen; lämna den då öppen utan etikett och säg det i rapporten.
8. Titta på skärmdumparna innan du påstår att något fungerar. Hitta inte på "uppmätta" värden — gissningar märks *guess*.
9. GitHub-kommentarer avslutas med Claude Code-footern (en tom rad, `---`, `_Generated by [Claude Code](https://claude.ai/code)_`).
10. Slutrapport (kort, engelska): vad som ändrats, testresultat, commit-SHA, skärmdumpar, öppna frågor, vad som inte gjorts.
