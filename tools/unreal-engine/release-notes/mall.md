# Lunden {{version}} för Windows

{{nyheter}}

## Installera

1. Ladda ned [{{setup}}]({{setupUrl}}) (64-bitars Windows).
2. Kör filen. Den installerar Lunden för din egen Windowsanvändare, utan administratörsbehörighet, och lägger en genväg i
   Startmenyn. Startprogrammet hämtar spelets innehåll och uppdaterar det före varje spelstart.
3. Avinstallera under **Inställningar → Appar → Installerade appar**. Dina sparade spel ligger kvar.

## Kontrollera filen

- Utgivare: **{{publisher}}** (Microsoft Artifact Signing, tidsstämplad signatur).
- SHA-256 för `{{setup}}`: `{{sha256}}`
- Startprogrammet byggdes från commit `{{commit}}` och kontrollerar själv varje nedladdad fil mot det signerade
  uppdateringsmanifestet ({{channel}}).

## Om Windows visar en SmartScreen-varning

En ny signerad fil kan vara ovanlig för Windows. Stäng varningen och högerklicka på den nedladdade filen i Utforskaren.
Öppna **Egenskaper → Digitala signaturer**, välj **{{publisher}}** och öppna **Information**. Windows ska ange att den
digitala signaturen är giltig. Avbryt installationen om signaturen saknas, utgivaren skiljer sig eller Windows fortsätter
att blockera filen. [Microsofts beskrivning av SmartScreen](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation)

Webbversionen spelas som vanligt på https://solwation.github.io/lunden-3d-apartment/.
