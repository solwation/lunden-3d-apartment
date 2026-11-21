# Dörrar och portknappar i den sammansatta spelnivån

Bilderna kommer från spelvyn i Windows PIE på `L_Lunden`, Unreal Engine 5.8.4 (58902052), med den ordinarie spelbelysningen klockan 14.00 den 15 november 2026 i klart väder. Bildprovet använde gångjärn, dörrmått och knappositioner från [den provade exportrevisionen](https://github.com/solwation/lunden-3d-apartment/tree/bf9718ae3e862bda6d484050e49fc5381d6c2b6b).

## Trapphus

Hus A, B och C visas uppifrån och ned. Vänster bild visar dörren stängd och höger bild visar samma dörr efter ett tryck på E. Kameran står kvar på samma plats. I alla tre trapphusen syns både dörrbladets insida och utrymmet bakom öppningen.

![Tre bildpar från Unreal. Lägenhetsdörren öppnas i Hus A, Hus B och Hus C.](trapphus.jpg)

## Garage

Uppifrån visas en ståldörr, en förrådsbur och en glasad parkdörr. Även här är dörren stängd till vänster och öppen till höger. Ståldörren lämnar fri sikt mot garaget och parkdörrens ram och glas svänger tillsammans. Förrådsbladet rör sig men dess nät ser ut som en tät vit skiva i Unreal. [Materialuppföljning #2399](https://github.com/solwation/lunden-3d-apartment/issues/2399)

![Tre bildpar från Unreal. Ståldörren, förrådsburen och den glasade parkdörren fotograferade från samma sida före och efter öppning.](garagedorrar.jpg)

## Garageportens knappar

Övre raden visar den gula uteknappen på sin stolpe och porten öppen efter knapptrycket. Nedre raden visar inneknappen på väggen och porten stängd efter nästa knapptryck. Båda knapptrycken kom via spelarens vanliga E-inmatning. Portvyerna är fotograferade från respektive knapps sida efter portens nio sekunders rörelse.

![Uteknapp och öppen port ovanför inneknapp och stängd port, fotograferat i Unreal.](portknappar.jpg)

## Samma kamera i webben och Unreal

Webbreferensen togs i Chromium med ordinarie spelrenderer, klart väder och frusen klocka vid samma datum och tid. Spelarens öga och riktpunkt sattes till de omräknade PIE-koordinaterna. Webbens vertikala bildvinkel beräknades från Unreals horisontella 86° och bildformatet 16:9. Jämförelsebildernas utsnitt är 768 × 640 pixlar från vardera originalet på 1280 × 720, utan storleksändring.

På webben syns förrådet mellan nätets trådar även när dörren är stängd. Den verkliga 64 × 64-texturen hade 1 892 av 4 096 texlar under materialets alfagräns 0,5. I den testade `kvarteret.glb` består samma blad av 182 trianglar med UV-koordinater. Det är dubbelsidigt och använder ett enda material, `bas_ffffff_r100_m0_tex_ds`. Det saknar både `baseColorTexture` och `alphaMode`, vilket ger opak rendering. Det vita bladet syns redan i spelvyn med HUD bortvald. [Webbens materialkälla](https://github.com/solwation/lunden-3d-apartment/blob/554cd47e6200dbb4c03cea53a8521f52014e7745/src/garage.js#L1112) · [Uppföljning #2399](https://github.com/solwation/lunden-3d-apartment/issues/2399)

Nedre bildparet visar den öppna lägenhetsdörren A1004 i Hus A. I samma 48 × 48 pixlar på nischväggen var medelvärdet för Y′ 128,2 på webben och 179,2 i Unreal. På hallväggen bredvid var värdena 234,3 och 229,2. Nischen hade därmed 55 % av hallens ljushet på webben och 78 % i Unreal. Y′ beräknades som 0,2126 R + 0,7152 G + 0,0722 B från originalbilderna. Mätfältens övre vänstra hörn var (500, 240) och (290, 240), räknat från originalets övre vänstra hörn. Strålar genom fälten i samma GLB träffar två väggytor med bevarade vertexfärger. Triangelns linjära RGB var (0,2714, 0,2589, 0,2310) i nischen och (0,8849, 0,8849, 0,8516) i hallen. Bildparet mäter den återgivna kontrasten men isolerar inte effekten av ljus eller tonkurva. [Webbens nischgeometri](https://github.com/solwation/lunden-3d-apartment/blob/554cd47e6200dbb4c03cea53a8521f52014e7745/src/corehouse.js#L169)

Väggskylten till vänster om öppningen bär den blå texten A1004 på webben. I Unreal syns bara den ljusa skyltytan. En stråle genom skyltens text träffar skyltgeometrin cirka 4 mm framför väggen i GLB-filen. Skylten har UV-koordinater men materialet `bas_ffffff_r100_m0_tex` saknar `baseColorTexture`. Webbspelet använder en skyltatlas på denna yta. [Webbens skyltmaterial](https://github.com/solwation/lunden-3d-apartment/blob/554cd47e6200dbb4c03cea53a8521f52014e7745/src/corehouse.js#L273)

![Detaljer från samma kamera. Webben till vänster och Unreal till höger. Överst stängd förrådsbur, nederst öppen dörr A1004 med väggskylt och nisch.](webb-och-unreal.jpg)

## Så verifierades bilderna

[Bildfixturen](../../../tools/unreal-engine/tests/capture_door_groups.py) valde en exporterad bottenvåningsdörr per hus, ett blad av varje garagetyp och båda portknapparna. För vart och ett av de sex dörrbladen jämförde den gångjärnet med exporten inom 1 cm och öppningsvinkeln inom 1°. Den kontrollerade också att `ChangeCount` ökade exakt ett steg per manöver och att knapparna på sina exporterade positioner satte porten i väntat läge.

Windowsprovet `Editor.Python.Lunden.test_door_groups_capture` slutade med `Success` och `LUNDEN_DOOR_PICTURES_OK 16`. Alla 16 PNG-original var 1280 × 720 pixlar och hade giltig CRC för varje PNG-block samt filslut direkt efter IEND. Bildparen här behåller hela spelvyn. De saknar HUD eftersom spelets `shot` kördes utan `showui`.

Som komplement till aktörsmätningen jämfördes mittentredjedelen av bildens bredd och mitthälften av höjden för de fasta kamerorna. Med varannan pixel i varje riktning gav det 38 520 provpunkter per dörrpar. Andelen där minst en RGB-kanal ändrades med mer än 24 av 255 var 91,6 % för Hus A, 94,3 % för B och 86,7 % för C. För stål-, förråds- och parkdörrarna var motsvarande andelar 73,5 %, 98,2 % och 81,5 %.

Vid bildleveransen återstod den separata ordinarie körningen av `test_interaction`, `test_exterior_route` och `test_facades` på den sammansatta nivån. Där hör de fullständiga dörrkontrakten, gångvägarna och portens automatiska stängning hemma. Nischens bildpar kan återanvändas vid kalibreringen av tonkurvan. [Tonkurva och exponering #2396](https://github.com/solwation/lunden-3d-apartment/issues/2396)
