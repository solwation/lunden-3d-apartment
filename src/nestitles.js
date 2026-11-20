// #2237: the NES title manifest, the one list the computers' NES adapter (src/nes.js, ComputerHub's ARCADE.nes) reads. Order =
// the panel's order; the first is the default. Every entry is a title whose licence was verified for redistribution (#2231/#2238)
// and whose ROM is published same-origin (data/ is copied by tools/stamp.sh). Contract per entry, checked by src/nes.test.mjs:
//   id        stable lowercase key [a-z0-9-] (the panel's data-nes-title; a later top list keys on it)
//   title     display name (Swedish UI; drawn on the monitor and the panel)
//   rom       site-root-relative path of the unmodified iNES file under data/nes/ (mapper must be one jsnes supports; NROM so far)
//   sha256    hex SHA-256 of that file; the adapter refuses a ROM whose digest differs (when WebCrypto is available)
//   bytes     its size in bytes
//   license   SPDX id of the title's licence ('MIT', 'GPL-3.0-or-later', 'LicenseRef-Public-Domain', …)
//   notice    site-root-relative path of the licence / notice text shown from the panel's "Om NES och licenser"
//   source    where the corresponding source lives (repo path or upstream URL), for GPL titles the shipped source archive
//   credit    short author / copyright line shown with the notice
//   about     one Swedish sentence on what you do in the game
//   controls  Swedish hint naming the NES buttons the title uses (the keyboard / touch mapping itself is fixed in src/nes.js)
export const NES_TITLES = [
  { id:'lightcatch', title:'Fånga ljuset', rom:'data/nes/lightcatch/lightcatch.nes',
    sha256:'5fda8dc68af7b39acfb6bbe59e7dfce2b790c5be2a171fc0bc0f1e7316024306', bytes:24592,
    license:'MIT', notice:'data/nes/lightcatch/LICENSE', source:'tools/retro2231/make_rom.py', credit:'solwation 2026, gjort för Lunden',
    about:'Styr den röda pricken till det gula ljuset. Ett litet eget NES-spel; ljudet är av.',
    controls:'Bara styrkorset används.' },
];
export const nesTitle = id => NES_TITLES.find(t => t.id === id) ?? NES_TITLES[0];
