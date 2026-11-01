# #1780: fler ekorrar på fler ställen

Nio ekorrar i stället för tre: de tre gamla vandrar fortfarande längs hela Höje å, de sex nya har var sitt hemområde
(`SQUIRRELS.areas`). Bilderna kommer från `tools/squirrelstest.cjs` avsnitt 7 (mitt på dagen i juli, kameran 4,5 m bort):
varje hemområdesekorre sitter upp på marken ett par meter från ett av sina träd.

- `ekorre-innergarden.png`: Gårdsekorren på innergårdens lekplats (30–45 m från startplatsen).
- `ekorre-grona-garden.png`: Tofsen på gräsmattan mellan Hus A och Hus B.
- `ekorre-klocktornsparken.png`: Klockan i dungen på Klockhusets parksida.
- `ekorre-sankt-lars-42.png`: Rödpälsen bland de gamla träden öster om Sankt Lars väg 42.
- `ekorre-an-vaster.png`: Svartsvansen vid ån väster om broarna.
- `ekorre-an-oster.png`: Ljusbuken vid ån öster om broarna.

Kontroller (alla gröna):
- `node --test tools/squirrelbraintest.mjs`: 30/30. Den verkliga platsen (terräng, parkträd, broar, de egna dungarna och
  riktiga vägar): alla ekorrar startar i sina områden och är kvar efter två timmar; fyra simulerade timmar med alla nio:
  0 markpunkter i vattnet, 0 utanför dungen eller på väg, inget bankbyte utanför broarna (markpunkter i alla sju områden).
- `node --test cloudflare/*.test.mjs src/*.test.mjs`: 354/354 (bredaste ögonblicksbilden ryms under 480 tecken).
- `tools/squirrelstest.cjs`: 27 PASS, ekorrar i alla områden, 9 synliga ekorrar = 9 extra draw calls.
- `tools/squirrelsynctest.cjs`: ALL PASSED. `tools/squirrelratetest.cjs`: ALL PASSED, ledarens trafik 4,24 → 4,21 meddelanden/s
  (sq.s 1,06 → 1,06, sq.n 0,20 → 0,25), aldrig över rummets gräns.
- Telefonens perfcount (`lowmem&w=844&h=390&quality=0`, juli): start 341 → 343 draw calls (≤ 370), ALL PASS.
