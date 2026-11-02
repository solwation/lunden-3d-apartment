# #1788 Vänd gymmet mot vägen och lägg till saknad byggnad på andra sidan

Headless Chromium (SwiftShader), 1280×720, `month=9&day=15&weather=clear`, DOM overlays hidden. `fore-` = origin/main (#1762), `efter-` = denna ändring.

- `fore-mot-norr.png` / `efter-mot-norr.png`: `?at=-60,-190,41,-28,80`, rapportens exakta vy (`eb39f76b-8d7f-4a15-828e-f94e6702c213.jpg`) över Sankt Lars väg mot kröken. Före: gymmet visar sluten tegelvägg mot vägen med glaspartiet dolt bortåt baksidan, och kullen till vänster är helt tom gräsmatta. Efter: gymmet har glasfasaden och glashörnet vänt direkt mot Sankt Lars väg, och Grenhuset (Internationella Engelska Skolan Lund, OSM 88457557) står på andra sidan vägen.
- `fore-rapportvy.png` / `efter-rapportvy.png`: `?at=-135,-85,15,-35,75`, översiktsvy längre söderifrån längs Sankt Lars väg.
- `fore-fran-vagen.png` / `efter-fran-vagen.png`: `?at=-120,-290,95,-4,4`, närbild från Sankt Lars väg söder om kröken mot gymmet och Grenhuset.

## Kontroller och acceptans
1. **Geometrisk placering och väg-clearance**: Inga kollisioner med Sankt Lars väg eller gångvägar. Grenhuset står minst 12.7 m från vägens mittlinje (minst 7.7 m från trottoaren) och minst 4.3 m från gångväg 145221574. Inga träd krockar (`treeFeet` 0 träffar i Grenhuset).
2. **Prestanda och ritbudget**: `tools/eastbackdroptest.html` ALL PASS (campus triangles 82 488 / budget 84 700; +136 trianglar, 0 nya draw calls eller texturer då allt delas i backdropens befintliga `facade`/`roof`/`glass`-batcher). Utåtriktade fönster 1090/1090 PASS.
3. **Visuell kontroll från rapportvyn**: `efter-mot-norr.png` bekräftar att glaspartiet är vänt mot vägen och Grenhuset kompletterar området på motsatt sida.
