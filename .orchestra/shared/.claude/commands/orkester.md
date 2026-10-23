---
description: Kör orkestern på detta repo självt, med rotens kärna som installerad version
argument-hint: "[område eller issuenummer]"
---

Begärt område: $ARGUMENTS

Läs och följ [AI.md](../../AI.md), repots värdpolicy. Läs därefter kärnan direkt från
roten: [ORCHESTRA.md](../../ORCHESTRA.md), [ISSUE-WORKFLOW.md](../../ISSUE-WORKFLOW.md)
och [COORDINATION.md](../../COORDINATION.md) för ett pass utan område eller ett
uttryckligen godkänt köpass. Utan begärt område väljer dirigenten själv valbara issues
i ett obevakat, avgränsat pass utan timer. Ställ inga frågor i chatten; en fråga som
bara underhållaren kan besvara postas på issuet med labeln `user question`.
Använd [WORKER.md](../../WORKER.md) vid delegering.

Repot konsumerar sig självt: arbetskopians rotfiler är den installerade kärnan och det
finns ingen `.orchestra/shared`. Behåll användarens avgränsning; att läsa eller underhålla
filerna startar ingen obevakad kö.
