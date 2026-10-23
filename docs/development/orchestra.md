# Orkesterns effektivitet och gemensamma instruktioner — 2026-10-23

Uppdrag: original #1520 och public #141. Ingen appändring.

## Vad underlaget visar

#1504 (ca20b62a74f21eaf78cd96eb524355bf50c032b2) använde två riktade serverfall
plus ett Chromiumprov med två klienter, produktionscallback och lokal PlayerRoom.
#1505 (8720a09a25069386e46da1a6812aae24fdc5a726) återanvände samma harness med
tre serverfall och relevanta ställningar. Felaktig beviskamera gav avgränsade omprov.
Båda dokumenterade komponentrenderingar som sådana och undvek fulla scen-, strids-
och plattformssvep. Se `docs/validation/issue-1504/README.md` och motsvarande #1505.

Det finns inget tillförlitligt tidsunderlag för en procentsats eller belägg för att
subagenter orsakade tidsvinsten. Ärendenas cirka tre minuter från skapande till
stängning är inte implementationstid. Upplevd snabbhet och faktisk kvalitet behöver
följas i kommande jämförbara leveranser.

## Hinder i de tidigare instruktionerna

Det ursprungliga kommandot hade 467 rader. Begränsad testning var redan en uttrycklig
regel, men kommandot krävde också uppdelning vid 8–10 filer, delsteg/push för varje
issue, framtida reservationskedjor och omfattande repetitioner. #1504/#1505 berörde
13–14 filer när dokument/bevis räknas, trots att ändringarna var sammanhängande.
Filantal var därför ett dåligt automatiskt delningskriterium. Namngiven modell och
obligatorisk Claude-attribution gjorde dessutom instruktionerna verktygsbundna.

## Genomförd ändring

- Gemensam modelloberoende kärna: kort plan, kritisk arbetsordning, hjälparnas exakta
  ansvar, en integrationsägare, riskbaserade kontroller och en granskning.
- Små sammanhängande ärenden levereras i ett steg. Dela bara när självständigt nyttiga
  leveranser motiverar det. Hjälpare för testförberedelse/granskning kräver inte delärenden.
- En aktuell issue per arbetare; inga framtida reservationer som standard. Båda köerna
  hämtas samtidigt, men kraven på färsk fullständig kö och efterföljande claimkontroll kvarstår.
- Återanvänd giltiga bevis efter orelaterad rebase. Fel eller ändrade relevanta indata
  utlöser riktat omprov. 10 minuter verifiering är en omprövningspunkt, inte dispens.
- github-dashboard/public/ISSUEFLOW.md styr labels/status. Prioritet bedöms efter
  påverkan/brådska; barn- och porttak bevaras. Samtliga igenkända arbetslabels tas bort
  vid paus/integrationsväntan. Guiden gäller GitHub; ingen GitLab-kompatibilitet påstås.
- Projektpolicy behåller två repo-köer, prioritet, ägarskap, 300 s polling, 60 min bevakning,
  30 min livstecken, högst två arbetare, intake, bildkrav och publicgränser.
- Arbetsagenten får ett kompakt uppdrag och relevanta filer, inte hela samordningshistoriken.

## Distribution

`solwation/dirigenten-och-orkestern` innehåller bara generiska Markdowninstruktioner,
exempelpolicy, licens och granskad Issueflow-kopia med källrevision/licens. Ingen historik
eller appkod från Lunden exporteras. Båda projekten använder en squashad Git subtree i
`.orchestra/shared`, med lokal policy utanför den och explicit release/SHA.

Subtree ger direkt läsbara filer efter vanlig kloning. Submodul hade också gett en exakt
pin men krävt initierad separat checkout. En flytande URL hade gett nätberoende och
föränderligt beteende; ett paketregister tillför ingen nytta för en liten textsamling.
Kärnändringar görs i eget rent repo och får en ny release; båda projekten uppdateras
uttryckligen. Importens mergehistorik bevaras vid rebase. Ingen automatisk import/push.

## Avgränsad verifiering

Plan: granska diff/länkar/regelmotsägelser, prova subtree-installation och uppdatering
med bevarad lokal policy i ett engångsrepo, samt publicprojektets obligatoriska
`npm test`/`npm run build` och Pages. Inga appbeteenden ändras; ingen ny browserkörning.
En oberoende läsgranskning täcker liten fix, hjälpare, testfel, reservationsrace och
misslyckad köhämtning. Slutresultat och revisionslänkar dokumenteras i respektive issue.

Framöver noteras grova tider för plan/setup, implementation, verifiering/granskning och
publiceringsväntan i befintlig slutkommentar, med omprovsorsaker och återöppningar.
Ingen tidsvinst påstås innan sådant jämförbart underlag finns.
