# Gardinernas genomlysning i L1007

Webbens ordinarie kameror visar det gröna bladtrycket i vardagsrummet vid kl. 14 och 22 och det mörklila, flerfärgade trycket på övre plan kl. 22. Bilderna är beskärningar av 1440 × 810 pixlar från samma klara junidag. Kvällsprovet tänder rumslamporna. Det sparade kameraunderlaget innehåller även rummets ljusläge och den linjära emissionsfärgen för vart och ett av de sex tygerna. [Kameror och materialprov](web-capture.json)

| Kamera | Vänster, överkant, bredd, höjd i originalpixlar | Webbens ungefärliga linjära luminans i #2322:s mätfält |
|---|---:|---:|
| [Vardagsrum kl. 14](web-living-room-day.png) | 576, 146, 187, 453 | 0,445 |
| [Vardagsrum kl. 22](web-living-room-evening.png) | 576, 146, 187, 453 | 0,098 |
| [Övre plan kl. 22](web-upper-floor-evening.png) | 403, 146, 245, 421 | 0,013 |

Mätfälten är de smala rutorna i `tools/unreal-engine/tests/furnishing-crops.json`. Bildutsnitten är större så att tyg, veck och fönster går att känna igen.

De tolv materialplatserna i L1007:s GLB använder var och en samma sRGB-tryck och UV för basfärg och emission. De sex materialens basbilder och UV-transformer var byte-identiska med den tidigare lokala exporten från 9311c48b inom samma Chromium-version. Den nya mätningen knyter lamporna till rummen genom webbens taklampor och smålampornas verkliga rumsplacering. Sovrum 1–4 har 4, 4, 4 respektive 2 ljuskällor, köket 4 och vardagsrummet 6.

I de tre nya webbkamerorna stämde alla 18 avlästa materialfärger med exportens dags- och lampvärden. Det största avståndet i linjär RGB var 3,18 × 10⁻¹⁷. Ytterligare 432 prov täcker dagsljus, molnighet, strömgränsen och lampornas tillstånd för alla sex tygerna. Webbens visuellt uppskattade tygparametrar används direkt (*guess*).

Med en L1007-export går kontrollerna att upprepa från projektroten.

```sh
node tools/unreal-engine/tests/curtain-light.mjs unreal/Lunden/Import --blueprint --web-capture docs/verification/2322/web-capture.json
```

För Windows-provet behövs en ny fullständig import av samma export. Kör därefter `tools/unreal-engine/tests/test_curtain_light.py` med projektets `run-python.ps1`. Provet läser de faktiska materialinstanserna på alla tolv paneler och växlar varje lampa för sig, inklusive säsongsgömd lampa och strömavbrott. Renderade Windows-bilder och den slutliga jämförelsen mot målet 0,8–1,25 gånger webbens luminans återstår.
