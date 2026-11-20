# NES homebrew releases

These unmodified iNES files came from the developers’ release archives. All use mapper 0 (NROM) and run on one NES controller without a BIOS. The November 20, 2026 review examined the release manuals, credits, assembly sources and bundled assets. The candidate list records the selection evidence and exclusions. [Issue #2238](https://github.com/solwation/lunden-3d-apartment/issues/2238#issuecomment-7048631878)

| Release | ROM SHA-256 | Original release ZIP SHA-256 |
| --- | --- | --- |
| [Thwaite 0.03](thwaite/thwaite.nes) | `3543ebf804f80abb19acfde4630a909a7485e2d69487900fd93b5698c412adc5` | `a782f6f22bac791fd30eef16933ee59d61fb83b68e3247d87b1df603c894ecd9` |
| [LAN Master (2011)](lan-master/lan-master.nes) | `becfeafb80479c330333c9e9385417f68f3c88e85443dfb37b05ae9283f3ea45` | `79410cc133f1100d2fe5409fd49297a62afc748aeeb5faccb8fe69c68c16e6aa` |
| [Lawn Mower (2011)](lawn-mower/lawn-mower.nes) | `181ef3ff1769a85ae98736e02809e65e5d758b453ebb43ec4b9fe60c93ad224c` | `af7378b522a7d11efd0306aebf15c193a2de31f5a7b130919699d4f1e7219f70` |

## Thwaite 0.03

Copyright © 2011 Damian Yerrick. The game is free software under the GNU General Public License, version 3 or any later version. It is provided without warranty. The author credits himself with programming, graphics and music, with additional music by Ludwig van Beethoven. The game renders those melodies from its own sequences. The release credits identify the gameplay and setting inspirations.

The local source download contains every member of the developer's version 0.03 archive with its original contents and notices, except the identical playable ROM supplied separately. It includes the makefile, assembly, graphics, music sequences, build tools, upstream documentation and source-specific notices. [Complete license](thwaite/GPL-3.0.txt) · [Corresponding source](thwaite/source-0.03.zip) · [Developer’s original source and ROM release](https://www.pineight.com/nes/thwaite-0.03.zip)

## LAN Master and Lawn Mower

Shiru, 2011. The instruction manuals credit Shiru for the code, graphics and music and dedicate the games to the public domain, as-is. The author's source notice in each release’s `game.asm` states “The game and its source code are released into Public Domain”. Both include Shiru’s FamiTone audio driver under its own public-domain declaration. The assembly projects include the display patterns, game data and audio. Only the game ROM from each release is shipped.

| Title | Developer’s release and manual | Developer’s source | Source ZIP SHA-256 |
| --- | --- | --- | --- |
| LAN Master | [Original ZIP](https://shiru.untergrund.net/files/nes/lan_master.zip) | [Source ZIP](https://shiru.untergrund.net/files/src/lan_master_src.zip) | `d4058bd0f6d31fbd9ba71b2ec15e9646f00520de075c9c18f8520e8d18e0b3ee` |
| Lawn Mower | [Original ZIP](https://shiru.untergrund.net/files/nes/lawn_mower.zip) | [Source ZIP](https://shiru.untergrund.net/files/src/lawn_mower_src.zip) | `8986e2057ad0ef3ccc2ab8bb39c9c54819ff402980b3468efde89da15a5d9dd5` |
