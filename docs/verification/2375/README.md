# Integritetsinformationen före Spela

Windows-menyn läser tio gemensamma textblock och sju Windows-specifika block från `index.html`. I Windows-avsnittet står när startprogrammet försöker ansluta till det delade rummet, vilka uppgifter som skickas, hur man spelar med `--offline`, var sparfilen ligger och hur spelet hanterar kraschfiler. De gemensamma styckena är byteidentiska med webbversionen i `a9cebcd9`. [Webbreferens före spelstart](web-before-join.png)

[Startmenyn](unreal-start-menu.png) · [Överst i integritetstexten](unreal-privacy-before-play.png) · [Flerspelarläget i Windows](unreal-privacy-multiplayer.png) · [Lokal sparning och kraschdata](unreal-privacy-windows.png)

På Windows 11 med Epic UE 5.8.4 byggdes menyn mot källorna från `db15bd0c` med rättelsen i det här ärendet. Båda byggstegen och kontrollen efter ny editorstart gav noll fel och noll varningar. Menypaketets SHA-256 är `5c8fe0e8679c652c093c75f89bf0bf4edd9ae3ac325a4bfab60de5c838162db8`. Både `test_ui` och `test_network_shared` passerade utan varningar.

GPU-provet kör produktionsspelets GameMode och standardmeny i en tillfällig PIE-nivå med en isolerad sparfil. Knappen **Integritet och cookies** öppnar texten medan spelet är pausat. Provet läser alla 17 textblock från den byggda widgeten och jämför dem med källan. Page Down-funktionen nådde slutläget 723,85 i rullningsytan. I bilden på 1280 × 960 går hela sista stycket om kraschdata att läsa. I en kontrollbild gjordes enbart det stycket genomskinligt. Då ändrades 4 385 pixlar i styckets tre textrader med mer än 24 av 255 i minst en färgkanal. Resten av menykortet hade noll sådana pixeländringar.

Med en tom filkatalog för startprogrammets spelartransport mäter provet när spelet publicerar sin första närvaropost. Katalogen är tom på startmenyn, efter läsningen och vid återgången. När **Spela** stänger menyn och återupptar spelet dyker den första närvaroposten upp. Överföringen vidare till två webbklienter verifierades separat i [treklientsprovet för #2292](../2292/README.md).

## Kör GPU-provet igen

Använd Epic UE 5.8.4 och den byggda menyn i en Windows-checkout. Kopiera `tools/unreal-engine/tests/capture_ui.py` till projektets tillfälliga `Content/Python/test_ui_capture.py`. Sätt `LUNDEN_CAPTURE_PREJOIN` till en ny, tom katalog och ge editorn samma katalog i `-LundenPlayersBridge`, kodad som i startprogrammet. Kör `UnrealEditor-Cmd` med `-EnablePlugins=PythonAutomationTest -RenderOffScreen -unattended -nosplash -nosound -nop4`, `-TestExit="Automation Test Queue Empty"` och `-ExecCmds="EXECFILE <kommandofil>"`. Kommandofilen innehåller följande två rader.

```text
LevelEditor.ToggleImmersive
Automation RunTests Editor.Python.Lunden.test_ui_capture; Quit
```

Kommandofilen låter startmenyn öppnas på samma sätt som när man startar spelet. Testresultatet finns i `Saved/privacy-before-play.json`, bilderna i underkatalogen `screenshots` bredvid den isolerade filkatalogen. Ta bort den tillfälliga testkopian efter körningen.
