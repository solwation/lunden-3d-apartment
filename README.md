# Kv. Lunden L1007 i 3D

**Kliv in i en lägenhet som ännu inte är byggd.** Lunden är en levande 3D-värld av lägenhet L1007
i Kv. Lunden i Lund, byggd måttsatt från Peabs planritning. Gå runt i rummen, öppna dörrar och lådor,
möblera om, laga mat, klappa katterna och gå ut i kvarteret — med riktigt väder och Lunds sol och tid.
Allt i webbläsaren, utan installation.

### ▶ [Spela nu](https://solwation.github.io/lunden-3d-apartment/)

Fungerar på dator, surfplatta och mobil.

## Det här kan du göra

- **Utforska hemmet** — varje rum, garderob, låda och lucka i rätt mått. Mät med måttbandet om du undrar hur stort något är.
- **Leva vardag** — koka kaffe, stek ägg, diska, tvätta, vattna växterna och bädda sängen. Det du gör sparas till nästa besök.
- **Möblera om** — flytta och vrid möbler och tavlor, och byt färg och mönster på soffan, kuddarna och gardinerna.
- **Gå ut** — kvarteret, gården, Höje å med fiskar, ekorrar och fåglar, hästhagen, fotbollsplanen och lekstugans hemliga klubbhus.
- **Följ tiden** — dygnet och årstiderna följer Lund, vädret är det riktiga, och i december står julgranen i vardagsrummet.
- **Spela tillsammans** — träffa andra spelare, prata, krama, spela boule eller fotboll och tävla på topplistan.
- **Dagens uppdrag** — lappen i koppskåpet ger tre nya vardagsuppdrag varje dag.

Tips: nyheterna sitter på lappen på frysen i köket.

## Så spelar du

**Dator**

| Tangent | |
|---|---|
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | gå (<kbd>Shift</kbd> springer) |
| Mus | titta |
| <kbd>E</kbd> | använd det du tittar på: öppna, ta upp, klappa, läsa |
| <kbd>Mellanslag</kbd> | hoppa |
| <kbd>C</kbd> | huka |
| <kbd>Q</kbd> | måttband |
| <kbd>F</kbd> | möbler av/på |
| <kbd>M</kbd> | ljud av/på |
| <kbd>Tab</kbd> | statistik och karta |
| <kbd>Esc</kbd> | släpp musen |

**Mobil och surfplatta:** vänster tumme går, höger tumme tittar, och knapparna nere till höger dyker
upp när det finns något att göra. På iPhone lägger du först till sidan på hemskärmen
(Dela → *Lägg till på hemskärmen*) för helskärm.

## Windowsversionen av Lunden

<!-- stable-windows-download -->
Den stabila Windowsversionen är ännu inte publicerad.
<!-- /stable-windows-download -->

**Om Windows visar en SmartScreen-varning.** En ny signerad fil kan vara ovanlig. Stäng varningen och högerklicka på den
nedladdade filen i Utforskaren. Öppna **Egenskaper → Digitala signaturer**, välj **Svep Design Center AB** och öppna
**Information**. Windows ska ange att den digitala signaturen är giltig. Avbryt installationen om signaturen saknas,
utgivaren skiljer sig eller Windows fortsätter att blockera filen. [Microsofts beskrivning av SmartScreen](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation)

## För utvecklare

Kör lokalt med `python3 -m http.server 8137` och öppna http://localhost:8137/. Hur projektet är byggt
står i [CLAUDE.md](CLAUDE.md) och [docs/development/](docs/development/); den tidigare, långa README:n
finns i [docs/development/readme-archive.md](docs/development/readme-archive.md).

Väderdata från [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0). Musiken har CC BY 4.0-licens;
musiker och källor finns under *Om musiken* i spelets meny.
