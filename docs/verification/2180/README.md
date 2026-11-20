# #2180 — rum bakom grannfönstren

Bas origin/main `337d1a75` (före = basens versioner av `config.js`, `exterior.js`, `glasspanes.js`, `surroundings.js`). Riktiga appen,
`?test=lazy`, juni, klart väder, fryst klocka, kl 12 och 21; `tools/roommap2180browser.cjs`, rådata [browser-both.json](browser-both.json).
Före-bilderna ligger i `before/`.

Hus A–C:s gårdsfasad: varje ruta visar ett rum (golv, tak, väggar, möbelblock) med gardiner, persienner, slöjor eller rullgardin;
kvällen: tända fönster är rum med lampa i stället för platta rutor. Mätt (SwiftShader, indikativt): draws 541→542 / 512→513, programs
124→125 / 120→122 (glaset delas i patchad och vanlig variant), render 40→38–66 ms (brus, ingen riktig GPU).
