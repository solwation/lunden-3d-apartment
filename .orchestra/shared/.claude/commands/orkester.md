---
description: Kör orkestern på detta repo självt, med rotens kärna som installerad version
argument-hint: "[område eller issuenummer]"
---

Begärt område: $ARGUMENTS

Läs och följ [AI.md](../../AI.md), repots värdpolicy. Läs därefter kärnan direkt från
roten: [ORCHESTRA.md](../../ORCHESTRA.md), [ISSUE-WORKFLOW.md](../../ISSUE-WORKFLOW.md)
och [COORDINATION.md](../../COORDINATION.md). `/orkester`, med eller utan område, startar
en obevakad kösession med de köinställningar som AI.md anger: köavläsning var 300:e
sekund och 60 minuters bevakning efter att kön tömts. Ett givet område avgränsar
fortfarande arbetet. Ett enstaka avgränsat pass utan timer körs bara när det uttryckligen
begärs. Ställ inga frågor i chatten; en fråga som bara underhållaren kan besvara postas
på issuet med labeln `user question`.
Använd [WORKER.md](../../WORKER.md) vid delegering.

Repot konsumerar sig självt: arbetskopians rotfiler är den installerade kärnan och det
finns ingen `.orchestra/shared`. Behåll användarens avgränsning; att läsa eller underhålla
filerna startar ingen obevakad kö.
