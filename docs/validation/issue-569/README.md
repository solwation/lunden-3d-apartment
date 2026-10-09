# Grannfönster #569

A-, B- och C-husens 199 listade fasadöppningar behåller sina planlägen,
våningshöjder och fasadindelningar. De får vit karm, separat
båge, mörk tätning, post och överljusspröjs: 597 ogenomskinliga glasrutor.
Fönstermått kommer från befintliga `SITE.facades`; profiler och djup är
visuella antaganden i `NEIGHBOR_OPENINGS.site`, med samma indelning som
fasadernas tidigare atlas. Loggier och entréer behåller sina antracitkarmar.
Soldatförband över/under fönstren ligger kvar.

Alla nya glasrutor och loggiaglas använder `neighborGlass()`, samma enda
128-pixels CubeTexture som redan används i L-längan. Ingen insida exponeras,
inget ljus eller reflektionspass tillkommer. Reflektionerna är en generisk
utomhusmiljö och ändras med siktvinkeln, inte en exakt spegling av platsen.
Vid mörker sänks reflektionens intensitet. De befintliga kvällsrutinerna
behålls, med en ljusyta per glasruta så att poster och spröjs syns även
när det lyser; de tre rutorna delar samma rutin och färg.

## Beslut om närliggande hus

Skolan 88457612 rakt mittemot hemmet får samma material. Den har redan
riktiga bågar och spröjs från #564: ingen fasad eller fönsterindelning
ändras och ingen ny geometri behövs. Glaset flyttas till en separat batch,
vilket tillför en draw call när skolan syns och återanvänder ABC-materialet.
Därmed begränsas utökningen till huset som tydligt läses genom hemmets
fönster och från gatan. Övriga bakgrundshus behåller enklare glas och
atlasfasader; detaljering av hela den avlägsna omgivningen ingår inte här.

## Verifiering

Chromium/SwiftShader, oktober 9 kl 12, klart väder, samma kameror före/efter:
hemmet mot A, gården mot B, sned närvy av B, Karpvägen mot C och skolans
fasad. Desktop 1280 × 800 samt emulerad touch 844 × 390. Före/efterbilder
finns i sessionens `/tmp/lunden-569-{before,final}-{desktop,touch}-*.png`.
Nattbilder vid kl 22 visar svagare blå glasreflektion och befintliga
upplysta hem; nya poster/spröjs förblir synliga mellan ljusrutorna.
Skolans välvda bottenvåningsfönster och raka övre fönster behåller alla
vita detaljer. Inga nya material sätts på L1007:s riktiga glas.

`neighboropeningstest.html`: godkänd för L-längans tidigare beteende och
ABC: alla 597 glasrutors centrum synliga, kvar i de ursprungliga öppningarna,
fönsterljus exakt inom varje glasruta, delad reflektionsmiljö och
nattdämpning. Hemmets dörr och verkliga öppningsbara fönster fungerar.
`eastbackdroptest.html`: godkänd, inklusive samtliga exakta källpolygoner,
1 243 exponerade fönster, skolans bågar/antal och 21 357 campus-trianglar.
`perfcount.html`: godkänd inklusive kvalitetsskalning och adaptiv upplösning.

## Renderingskostnad

ABC, första steg: en extra draw call för tätningarna, 14 328 extra
trianglar i vyn från hemmet och inga nya texturresurser. Vita karmar och
bågar går i befintlig vit listbatch; nytt glas ersätter loggiaglasets batch.
Nattmaskerna tillför därefter 796 trianglar i samma instansbatch, med samma
kvällsrutin. Skolutökningen tillför en glasbatch, inga trianglar, texturer,
ljus eller renderpass. I vyer bort från skolan kan dess egen glasbatch
kullas separat; 462 tidigare medritade glastrianglar faller då bort.

| Desktopvy | Draw calls före → efter | Trianglar före → efter | Texturer före → efter |
|---|---:|---:|---:|
| home | 390 → 391 | 697289 → 711951 | 53 → 53 |
| courtyard | 112 → 113 | 377107 → 391769 | 54 → 54 |
| angle | 99 → 100 | 366955 → 381617 | 54 → 54 |
| karp | 199 → 200 | 587809 → 602471 | 57 → 57 |
| school | 45 → 46 | 279241 → 279241 | 59 → 59 |

Mobilformatet ger samma ökning i dessa vyer: en call och 14 662
trianglar vid A/B/C, en call och inga nya trianglar vid skolan. Inga
nya texturresurser. Totalt finns två nya batcher, men i dessa vyer syns
bara en i taget. Bilder och mätvärden gäller emulerad touch, inte fysisk
iPhone eller Surface Pro.

Sekventiell mätning från hemmet, samma Chromium-process och villkor,
nio uppvärmda bildrutor (`renderer.render` + `gl.finish`): median
32,2 ms före och 13,5 ms efter. Andra agenter kör också webbläsare i
denna miljö; variationen är stor och minskningen ska inte tolkas som
att ändringen gör spelet snabbare. Varken dessa mjukvarutider eller
emulerad touch kan verifiera bildrutetiden på Intel Iris 640 eller iPhone.
GPU-extensionen annonseras men queryresultat blir inte tillgängliga här
(kontrollerat vid #564), så separat GPU-tid kan inte redovisas. Beslutet
att utöka bara skolan bygger på de små, reproducerbara resursökningarna
ovan, inte på en påstådd FPS-vinst.

| Sekventiell desktopmätning | Median före (ms) | Median efter (ms) |
|---|---:|---:|
| home | 32.2 | 13.5 |
| courtyard | 5.3 | 14.6 |
| school | 5.1 | 7.8 |
