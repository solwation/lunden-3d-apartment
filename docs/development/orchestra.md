# Orkesterns effektivitet och gemensamma instruktioner — 2026-10-23

Uppdrag: original #1520 och public #141. Ingen appändring. De daterade besluten nedan
är historik; aktuell körning följer [den lokala projektpolicyn](../../.orchestra/project.md).
Kapacitetsändringen 2026-11-12 beskrivs [nedan](#aktuell-kapacitet--användarbeslut-2026-11-12).

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
- github-dashboard/public/ISSUEFLOW.md styr labels/status. Originalets prioritet bedöms efter
  påverkan/brådska; barntak och den nu bredare publikregeln nedan bevaras. Samtliga
  igenkända arbetslabels tas bort vid paus tillbaka till backlog. En färdig överlämning
  använder `integration-ready` med bevarad integrationsägare, revision och bevis utan aktiv
  slot; aktiv integration byter till `in-progress`. Föräldrar behåller sin sammanfattande
  status medan barn är aktiva eller integrationsklara. Guiden gäller GitHub; ingen GitLab-kompatibilitet påstås.
- Projektpolicy behåller två repo-köer, prioritet, ägarskap, 300 s polling, 60 min bevakning,
  30 min livstecken, då högst två arbetare, intake, bildkrav och publicgränser.
  Tvåtaket ersätts av det senare kapacitetsbeslutet nedan.
- Arbetsagenten får ett kompakt uppdrag och relevanta filer, inte hela samordningshistoriken.

## Distribution

`solwation/dirigenten-och-orkestern` innehåller bara generiska Markdowninstruktioner,
exempelpolicy, licens och granskad Issueflow-kopia med källrevision/licens. Ingen historik
eller appkod från Lunden exporteras. Båda projekten använder en squashad Git subtree i
`.orchestra/shared`, med lokal policy utanför den och explicit release/SHA.

Subtree ger direkt läsbara filer efter vanlig kloning. Submodul hade också gett en exakt
pin men krävt initierad separat checkout. En flytande URL hade gett nätberoende och
föränderligt beteende; ett paketregister tillför ingen nytta för en liten textsamling.
Kärnändringar görs i eget rent repo och får en ny release. Sedan användarens beslut
2026-10-28 importerar dirigenten nya stabila releaser automatiskt i båda projekten
som lågprioriterat underhåll vid nästa köval, utan att avbryta pågående arbete.
Hela mellanliggande diffen granskas, importen låses till exakt release/SHA och
mergehistoriken bevaras vid rebase. Se [projektpolicyn](../../.orchestra/project.md#upstream-update-discovery).
Ingen bakgrundsschemaläggare installeras.

## Avgränsad verifiering

Plan: granska diff/länkar/regelmotsägelser, prova subtree-installation och uppdatering
med bevarad lokal policy i ett engångsrepo, samt publicprojektets obligatoriska
`npm test`/`npm run build` och Pages. Inga appbeteenden ändras; ingen ny browserkörning.
En oberoende läsgranskning täcker liten fix, hjälpare, testfel, reservationsrace och
misslyckad köhämtning. Slutresultat och revisionslänkar dokumenteras i respektive issue.

Framöver noteras grova tider för plan/setup, implementation, verifiering/granskning och
publiceringsväntan i befintlig slutkommentar, med omprovsorsaker och återöppningar.
Ingen tidsvinst påstås innan sådant jämförbart underlag finns.

## Aktuell köordning — användarbeslut 2026-11-04

Alla ärenden i `solwation/kvarteret-lunden` har `priority: low`, inte enbart portningar.
Regeln omfattar även självständiga ändringar, buggar, underhåll, föräldrar/barn och
samordning; bara ett senare uttryckligt användarundantag ändrar detta. Högre eller
saknade publika prioriteter korrigeras vid skapande och inför köval/tomgångskontroll,
med bevarat ägarskap, arbetsstatus och beroenden samt efterföljande föräldratak.
Alla startbara originalärenden väljs först. Originalet använder normal prioritet internt;
publika lågprioriterade ärenden väljs äldst först. Ett senare uttryckligt undantag
påverkar bara publikens interna ordning. Redan aktivt arbete får slutföras.

Detta är lokal värdpolicy, ingen ändring i `.orchestra/shared`. Originalets leverans
spåras i [#1860](https://github.com/solwation/lunden-3d-apartment/issues/1860), publikens
motsvarighet i [#252](https://github.com/solwation/kvarteret-lunden/issues/252).
Portuppföljning, innehållsgränser, barnprioritetstak och övriga arbetsregler behålls.


## Chattintag i v0.8.1 — #1874

Installerad kärna: `264e867d17b4f938b09cdb01794025e7b0113c5d`
([release v0.8.1](https://github.com/solwation/dirigenten-och-orkestern/releases/tag/v0.8.1)).
Hela diffen från v0.8.0 granskades före squashsubtree-importen: en ny chattintagsregel
och samordnad dokumentation, ingen appkod eller ändring av prioritet, ägarskap,
publicering och bevakningstider. Subtree-ancestry och trailers behålls.

En ändringsönskan skapar/återanvänder ärenden och startar/återupptar avgränsat arbete
utan separat `/orkester`, också efter avslutad tomgångsvakt. En aktiv dirigent
återanvänds och explicita uppskjutningar gäller fortfarande. En sådan önskan
startar inga nya kötimers och utökar inte omfattningen till hela backloggen; det
uttryckliga `/orkester`-kommandot behåller projektets kösession. Enbart läsning
startar inget arbete. Verifiering: full dokumentdiff, relativa länkar/ankare och
motsägelser mot lokala regler. Ingen visuell runtimeändring eller changelogpost.
Publicuppföljning: [#255](https://github.com/solwation/kvarteret-lunden/issues/255).

## Aktuell kapacitet — användarbeslut 2026-11-12

Dirigenten väljer själv aktiv kapacitet efter faktisk runtimegräns, CPU/minne/swap,
kopplade uppgifter samt browser- och integrationskö. Root under aktivt arbete,
hjälpare och granskare räknas; färdiga ägda `integration-ready` väntar utan aktiv
slot. Fyra tillgängliga runtimeplatser kan alltså rymma root plus tre andra aktiva
roller, men är inget krav att fylla eller ett permanent tak för andra runtimer.

Bedöm vid start/återupptagning, ledig slot, inför dispatch och märkbar laständring;
skala upp eller ned utan rutinfråga. Redovisa mätunderlag, vald kapacitet och varför
lämplig kapacitet lämnas ledig. Resurstryck eller växande granskningskö ger avlastning,
med bevarat arbete/ägarskap. En publicerare och serialiserad dyr browserverifiering
med gemensamt lås består, liksom isolering och original/public-prioriteringen.
Se [full lokal regel](../../.orchestra/project.md#dynamic-active-capacity).

De generiska riktlinjerna är redan släppta i kanoniska
[core #66 / v0.13.0](https://github.com/solwation/dirigenten-och-orkestern/releases/tag/v0.13.0)
(`1c3a22994d5725f3bbf14accd247fe1b6689925d`).
Denna lokala instruktion ändrar inte den versionslåsta subtree-kärnan; en granskad
releaseimport och dess exakta proveniens levererades separat i
[#1934 / v0.13.1](https://github.com/solwation/lunden-3d-apartment/issues/1934). Originalets värdanpassning
spåras i [#1935](https://github.com/solwation/lunden-3d-apartment/issues/1935), publikens
separata lågprioriterade motsvarighet i
[#273](https://github.com/solwation/kvarteret-lunden/issues/273).

[Leverans och scenariokontroll](https://github.com/solwation/lunden-3d-apartment/issues/1935#issuecomment-6820614205) dokumenterar kapacitetsregeln och dess tillämpning.
