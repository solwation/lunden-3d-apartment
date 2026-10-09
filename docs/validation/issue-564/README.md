# Skolfasad #564

## Bildanalys före modellering

Underlag: [frontfoto](../../foton/skolbyggnad-fasad-frontalt.jpg),
[gatuvinkel](../../foton/skolbyggnad-fasad-gatuvinkel.jpg) och
[tegelmur från hemmet](../../foton/rakt-over-gatan-tegelmur-skolbyggnad.jpg).

Frontfotot visar två fönster per våning på vardera yttre paviljongfronten.
Bottenvåningens fönster har flack segmentbåge, vit omfattning och slutsten;
övervåningen har rak överkant, profilerat krön och utskjutande fönsterbänk.
Vita poster och smalare spröjs delar glaset i små rutor. Hörnpartierna är
sammanhängande vita med tunna liggfogar, utan tegelglipor mellan stenarna.
En ljus sockel och ett våningsband fortsätter längs fasaden. Takfoten har
flera vita steg och en tandad fris på paviljongfronterna. Teglet är varierat
rödbrunt med dämpad fog, inte jämnt orange med vit fog.

Gatuvinkeln bekräftar dessa detaljer på sidofasaderna. Taket är lågt,
mörkgrått falsat plåttak med skorstenar; inget stort tegelfält reser sig
över gatufasadens takfot. Träd döljer delar av mittpaviljongen och
förbindelselängorna. Fönsterantal där, exakta profilbredder, mått och
taklutningar är därför **antaganden**, inte inmätta fakta.

## Modellbeslut

OSM-polygonen 88457612 behålls oförändrad som enda byggnadskropp.
Ett lågt valmat tak följer hela polygonens utskjutande paviljonger och
förbindelselängor: höjden begränsas av avståndet till fasadkanterna,
inte av hela byggnadens längsta sida. Ingen tegelgavel läggs ovan takfoten.
Fönsterrytmen anges per polygonkant; de synliga ytterfronterna har två
fönster per våning, övriga antal markeras som antaganden i konfigurationen.
Skolans tegel och plåtfalsar använder två små delade texturer. Alla
fönster och lister sammanfogas med campusets befintliga glas-/listbatcher.

## Webbläsarverifiering

Chromium med SwiftShader, 9 oktober klockan 12, klart väder; samma kameror
före/efter vid gatan rakt fram, snett från öster, nära fasaden och genom
hemmets fönster. Desktop 1280 × 800 och emulerad touch 844 × 390.
Bilderna sparades i sessionskatalogen `/tmp/lunden-564-{before,after}-*`.
Båda gatufotona jämfördes med gatubilderna, och närbilden kontrollerades
för bågar, spröjs, fogade hörn och profiler. Från hemmet läses nu samma
låga vita takfot och paviljongrytm som i fotot; de stora tegelgavlarna
är borta. Taköversikten bekräftar att inget tak ersätter kartpolygonen
med tre fristående rektanglar.

`eastbackdroptest.html`: alla kontroller godkända, inklusive exakt
källpolygon för alla 16 hus, 1 243 faktiskt synliga fönster, skolfönstrens
antals-/bågkontroller och öppet Realgymnasium-atrie.
`perfcount.html`: godkänd, inklusive adaptiv upplösning och kvalitetsnivå.
Inga nya ljus eller extra renderpass. Totalt campus: 20 047 → 21 357
trianglar (+1 310), 5 → 7 batcher, två nya texturer (256² tegel, 64² plåt).

| Desktopvy | Draw calls före → efter | Trianglar före → efter | Texturer före → efter |
|---|---:|---:|---:|
| front | 55 → 57 | 388781 → 390055 | 10 → 12 |
| angle | 69 → 71 | 398467 → 399741 | 12 → 14 |
| facade | 43 → 45 | 277967 → 279241 | 12 → 14 |
| home | 168 → 170 | 479441 → 480715 | 33 → 35 |

Mobilformatet ger samma ökning: två calls, två texturer och 1 274
synliga trianglar i de jämförda vyerna. Detta är emulering, ingen fysisk
Surface Pro- eller iPhone-mätning.

Sekventiell mätning i samma Chromium-process, nio uppvärmda bildrutor
per vy (`renderer.render` + `gl.finish`): median vid gatan 6,10 → 4,50 ms,
från hemmet 6,90 → 6,80 ms. Skillnaderna är brus i mjukvarurenderaren,
inte belägg för snabbare rendering. GPU-timerextensionen annonseras men
ger inga färdiga queryresultat här; separat GPU-tid kan inte redovisas.
Mätningen visar ingen tydlig ökning av bildrutetiden i denna miljö, men
ersätter inte hårdvarutest på Surface Pro eller fysisk telefon.
