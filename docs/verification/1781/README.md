# #1781 – fiskespöet kommer tillbaka under bron

`1-spo-tillbaka-under-bron.png`: spöet ligger åter på sin hemplats under bilbron (mellan pelarna) efter att ha legat borta längre än `FISHING.respawn` (240 s, *guess*) – det enda spöet, flyttat tillbaka.

Check: `tools/fishrespawntest.cjs` 14/14 (tid via injicerad klocka): hemma vid start; hållet 3x tidsgränsen ger ingen återgång; nedlagt långt bort startar timern; strax före tidsgränsen ligger det kvar; efter den är det hemma med exakt ett spö; dolt uppdragssteg "hitta spöet" kvar; keep.js `ra` sparas, omladdning före tidsgränsen räknar vidare, efter den ligger spöet hemma; linan ute (spöet i handen) ändrar inget.
