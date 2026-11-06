# Verifiering för ärende #1878

- `update-notice.png`: Visar uppdateringsrutan ("Ladda om sidan för att se den nya versionen.") som nu kontrollerar att ny HTML faktiskt är tillgänglig på servern innan omladdning påbörjas, samt ger tydlig feedback om servern fortfarande förbereder publiceringen.
- `countdown.png`: Visar automatisk uppdateringsnedräkning vid stillhet ("Uppdateras om 5"), som avbryts mjukt och tonar tillbaka om publiceringen inte är färdig eller vid nätverksfel.

Kontroller:
- `tools/updateflowtest.mjs` (15/15 PASS): Bekräftar att navigations-URL förses med `_update=<timestamp>`, att webbläsarens HTTP-cache (`max-age=600`) förbigås och inte återanvänder gammalt HTML-skal, att URL-parametrar och hash bevaras, samt att otillgänglig publicering och nätverksfel fångas utan omladdningsloop.
- `tools/startuptest.html` (20/20 PASS): Bekräftar att `prepareStartup` fungerar som avsett med bibehållna URL-vakter.
