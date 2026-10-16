# Klocktornets tid

Klockhuset behåller plats, storlek och urtavlornas radie. Fyra dynamiska urtavlor följer samma `day.hour` som köksklockan i L1007. Paus, spolning och dygnsbyte har ingen separat timer.

Verifierat med `tools/towerclocktest.cjs` i Chromium/WebGL: samtliga fyra sidors tim-/minutvisare jämförs mot den faktiska `WallClock`, inklusive tio tider, paus, spolning i båda riktningar och midnatt. Både full och enklare campusgeometri passerar. Bilderna är från den riktiga campusbyggaren med plan mark, utan lägenheten. Kontrollernas ljus följer verklig DayCycle; ingen fysisk telefonprestanda påstås.

- [Urtavlan på nära håll, 09:00](clock-close.png)
- [100 meter söderifrån, 09:00](tower-100m-day.png)
- [Samma 100 meter, 03:00](tower-100m-night.png)

Tiden blir lättare att läsa genom tydliga markeringar och kraftigare visare. Urtavlan har naturlig storlek och blir fortfarande liten på stort avstånd; bilderna återger hela kameravyn utan förstoring av själva klockan.

Två extra instanserade draw calls och144 klocktrianglar, efter borttagning av gamla statiska visare/innerurtavlor. Den isolerade campusrenderingen har10 calls och71425/29766 trianglar för desktop/low-memory. Den fulla appens campusregression passerar med75415 trianglar, oförändrade16 byggnadsavtryck och1013 verkliga fönster. Ursprungliga köksklockans UI-test passerar också med kontroller av tornets synkronisering före och efter tidskontrollerna.
