# Separat inställningsmodal (#1518)

`tools/menusettingstest.cjs BASE OUT` kör den verkliga startmenyn och produktions-
lyssnarna. Alla17kontroller passerar: alla flyttade sektioner, öppning och inert
bakgrund, Tab i båda riktningarna, sparat chattval, instruktioner, återställnings-
bekräftelse, barnrutor för reset/integritet med Escape och rätt återfokus, stängning
utan spelstart, riktig touchredigerare och återgång, smal liggande vy844×390,
sista knappen nåbar via rullning, alltid synlig stängknapp, native touchöppning/
stängning och noll webbläsarfel. Råresultat: `result.json`.

`start-menu.png` visar den kortare startmenyn med Inställningar. `settings.png`
visar de flyttade sektionerna i egen modal. `landscape-settings.png` visar rullat
innehåll där rubrik/stängknapp ligger kvar. Chromium med hasTouch och test=lazy;
ingen fysisk telefon eller prestandamätning hävdas. Inga produktionsdata ändras.

Publik bedömning: `kvarteret-lunden` vid
`0d16b35f709b21b9a4df513c70718367bbfc172f` har redan separat native `#help-dialog`
med tangentbord/mus/touch och touchanpassning. Chatten, spelstatistiken och personlig
hemåterställning finns inte där och ska inte importeras. Ingen tillämplig
kodöverföring behövs för denna omorganisation av originalets spelmeny.
