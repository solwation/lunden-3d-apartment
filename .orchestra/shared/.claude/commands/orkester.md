---
description: Kör orkestern på detta repo självt, med rotens kärna som installerad version
argument-hint: "[område eller issuenummer]"
---

Begärt område: $ARGUMENTS

Läs och följ [AI.md](../../AI.md), repots värdpolicy, och därefter kärnfilerna som
[läskartan](../../ORCHESTRA.md#read-map) i roten anger. Enligt AI.md startar `/orkester`,
med eller utan område, en obevakad kösession med AI.md:s köinställningar; ett givet
område avgränsar arbetet. Hur väntan görs, och vad en icke-interaktiv körning gör i
stället, står under *Wait mechanism* i AI.md. Repot konsumerar sig självt: rotfilerna är den installerade
kärnan och det finns ingen `.orchestra/shared`.
