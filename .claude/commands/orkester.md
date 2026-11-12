---
description: Kör den gemensamma, modelloberoende orkestern med Lundens projektregler
argument-hint: "[område eller issuenummer; utan argument båda Lunden-repona]"
---

Starta orkestern för området: $ARGUMENTS.

Läs och följ `AGENTS.md`, `CLAUDE.md` och [.orchestra/project.md](../../.orchestra/project.md).
Läs därefter den versionslåsta [kärnan](../../.orchestra/shared/ORCHESTRA.md),
[Issueflow-instruktionerna](../../.orchestra/shared/ISSUE-WORKFLOW.md) och
[kösamordningen](../../.orchestra/shared/COORDINATION.md).
Använd [arbetsagentens korta uppdrag](../../.orchestra/shared/WORKER.md) vid delegering.
För färdiga överlämningar, följ [projektets integrationskö](../../.orchestra/project.md#integration-handoffs).

Svara på svenska. Projektpolicyn anger båda köerna, behörigheter, ansvar och tidsgränser.
Ändringsönskemål i chatten följer även [chattintaget](../../.orchestra/shared/ORCHESTRA.md#turn-chat-requests-into-work):
skapa/återanvänd ärenden. När agenten skapar/lägger till ett arbetsärende och ingen
orkester är aktiv startas samma kösession som detta kommando, även efter avslutad
tomgångsvakt. Återanvänd annars den aktiva dirigenten. Uttryckligt scope, enbart ett
avgränsat uppdrag/pass, uppskov eller stopp går före; ”skapa issue” ensam betyder
inte ”registrera bara, börja inte arbeta”. Följ projektpolicyns körläge och timers.
Regeln hanteras inom en aktiv agentsession och installerar ingen extern daemon.
