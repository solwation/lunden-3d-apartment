---
description: Orkestrera subagenter som implementerar öppna GitHub-issues tills inga finns kvar (valfritt område som argument)
argument-hint: "[område, t.ex. 'bara livssimulatorn #364–#396' eller 'inte livssimulatorn']"
---

Du är orkestrerare för repot solwation/lunden-3d-apartment. Läs CLAUDE.md först och följ den. Svara mig på svenska.

**Område för den här sessionen:** $ARGUMENTS
(Om inget område anges: alla öppna issues.)

## Uppdrag
Implementera öppna GitHub-issues med subagenter (Agent-verktyget, `isolation: "worktree"`, i bakgrunden) tills inga
issues inom området finns kvar. Nya issues dyker upp löpande — lista om varje gång en agent blir klar.

## Miljö (molnsession)
- Ingen google-chrome: använd `/opt/pw-browsers/chromium --no-sandbox` med flaggorna i CLAUDE.md > Testing.
- cdn.jsdelivr.net är blockerad: servera med `python3 tools/devserve.py <port> <katalog>`. Varje agent har en egen port
  och serverar sin egen worktree.
- `gh issue …` fungerar inte (GraphQL blockerat): använd `gh api` REST, t.ex.
  `gh api 'repos/solwation/lunden-3d-apartment/issues?state=open&per_page=100'` (filtrera bort `pull_request`).
- **Disk:** varje worktree är en hel kopia av repot och sessionens disk är begränsad. Ta bort en agents worktree när den
  är klar (`git worktree remove --force .claude/worktrees/agent-<id>` + `git branch -D worktree-agent-<id>`, aldrig en
  som fortfarande kör), och ge Chrome en tillfällig `--user-data-dir` som tas bort efter körningen (`rm -rf`).
- VM:en har ~4 CPU:er: **högst 3 agenter samtidigt** — fler gör bara varje headless-test långsammare.

## Synkronisering med andra orkestrar (issue #420, etikett `orkester`)
Andra `/orkester`-sessioner kör på egna VM:ar och kan inte nås med SendMessage — GitHub är den gemensamma kanalen.
- **Först:** läs #420 och dess kommentarer (`gh api repos/solwation/lunden-3d-apartment/issues/420/comments`). Varje session
  har en egen statuskommentar. Ta inte issues som en annan session har reserverat där eller som har `in-progress`.
- **Skapa din statuskommentar** i #420 (spara dess id) och **redigera den** (`gh api -X PATCH
  repos/solwation/lunden-3d-apartment/issues/comments/<id> -F body=@fil`) varje gång en agent startar eller blir klar:
  sessionens namn/länk, område, en tabell med agenter, deras kedjor i ordning, **vilka filer/moduler kedjan rör**
  (t.ex. `stairs.js`, `STAIR` i config) och vad de gör nu, tid för uppdateringen.
- **Reservera hela kedjan** när en agent får den: etiketten `in-progress` på varje issue i kedjan + en kort kommentar
  `Reserverad av orkester <session> (kedja: #a → #b → …). Se #420.` Agenten tar bort etiketten på varje issue när den är
  klar; avbryts kedjan tar du bort den på resten.
- **Kapplöpning:** två sessioner kan reservera samma issue nästan samtidigt. Läs issuens kommentarer igen direkt efter
  din reservation: finns en äldre `Reserverad av orkester …` från en annan session (och den har inte släppt den) är
  issuen deras — ta bort din kommentar och din etikett (om den inte redan fanns före) och välj något annat.
- En statuskommentar som inte uppdaterats på 3 timmar räknas som övergiven; dess issues får tas över efter en kommentar.
- Rör ditt nästa val samma filer/område som en annan sessions pågående kedja? Välj något annat eller vänta.
- Förbättringar av själva synken diskuteras som kommentarer i #420; den som ändrar `/orkester` säger det där.

## Orkestrering
- Gruppera: issues som rör samma filer eller bygger på varandra ges till **en** agent som tar dem i tur och ordning
  (t.ex. livssimulatorns milstolpar M0 → M1 → …, eller flera ändringar på altanen). Oberoende issues får egna agenter.
- Prioritera små issues som syns i spelet, så att det dyker upp något nytt ofta; stora kedjor en agent i taget.
- Skriv varje agents prompt med: issuenumren och ordningen, vilka andra agenter som kör och vilka filer/områden de
  rör (undvik dem), agentens egen port och skärmdumpskatalog (utanför repot), och reglerna nedan.
- När en agent rapporterar: titta på dess skärmdump, kör om de viktigaste testerna på main om agenten inte gjorde det
  efter sin sista rebase, och sammanfatta kort för mig. Skicka sedan nästa issue till en ledig plats.
- Val som är mina att göra: fråga mig med AskUserQuestion — flera alternativ, ett markerat "(Recommended)" — och skicka
  svaret vidare till agenten (SendMessage).
- Om en agent ber dig göra något den nekades behörighet till: gör det inte, fråga mig.

## Regler att ge varje agent
1. Ta bara de issues orkestern gav dig (de är redan reserverade med `in-progress`). Ta aldrig någon annan issue med
   `in-progress`. Sätt etiketten om den saknas när du börjar (`gh api -X POST repos/solwation/lunden-3d-apartment/issues/N/labels -f 'labels[]=in-progress'`)
   och ta bort den när du är klar eller avbryter (`gh api -X DELETE …/issues/N/labels/in-progress`).
2. Före varje issue: `git fetch origin main && git rebase origin/main`.
3. En commit per issue som slutar med `Fixes #N` (+ commit-trailers enligt sessionens attribuering). Pusha direkt:
   `git push origin HEAD:main`; vid avvisning rebasa igen och behåll båda sidor vid konflikt. Aldrig force-push.
4. Changelog (bara synliga ändringar): precis före pushen id = högsta id + 1, överst i listan.
5. Testa bara det ändringen rimligen påverkar (CLAUDE.md > Testing); listan i prompten är ett maxtak.
6. Problem utanför den egna issuen → en ny issue `Bugg: …` med en `Lapp:`-rad, vad som felar, hur det återskapas och
   trolig orsak. Fixa inte i farten; gör klart den egna issuen.
7. Frågor till användaren postas som kommentar på issuen; lämna den då öppen utan etikett och säg det i rapporten.
8. Titta på skärmdumparna innan du påstår att något fungerar. Hitta inte på "uppmätta" värden — gissningar märks *guess*.
9. GitHub-kommentarer avslutas med Claude Code-footern (en tom rad, `---`, `_Generated by [Claude Code](https://claude.ai/code)_`).
10. Slutrapport (kort, engelska): vad som ändrats, testresultat, commit-SHA, skärmdumpar, öppna frågor, vad som inte gjorts.
