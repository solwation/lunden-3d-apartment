# NES titles (#2237)

`lightcatch.nes` — **Fånga ljuset**, an original NROM title made for Lunden in #2231 (24 592 bytes, SHA-256
`5fda8dc68af7b39acfb6bbe59e7dfce2b790c5be2a171fc0bc0f1e7316024306`). Licence: **MIT**, `LICENSE` next to this file.
Its complete source is the generator `tools/retro2231/make_rom.py` (explicit 6502 bytes and two 8×8 sprites; reproduces this
file byte for byte). The red sprite moves with the D-pad; touching the yellow one increments RAM $02. No audio, no Nintendo code,
BIOS or commercial ROM. Every further title needs its own verified licence and an entry in `NES.titles` (src/config.js).
