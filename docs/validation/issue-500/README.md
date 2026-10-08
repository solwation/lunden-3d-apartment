# #500 – music refresh, technical validation

All twelve prior sources and all six channels were inventoried from MUSIC, previous sources/CREDITS and every MusicFile/MusicLoop caller. The original Composer fallback synthesized six genres; PC/laptop scheduled blips and Kaffeturbo scheduled square waves after stream failures. Those music fallback paths are removed; positional sound effects stay intact.

The replacement set contains twelve distinct full-length recordings: seven Josh Woodward instrumental mixes, three Kevin MacLeod recordings and two Scott Buckley full mixes. Artist pages verify CC BY 4.0; source download URLs/hashes/mix/processing are recorded in music/sources.json. Studio/instrument metadata guided selection. Retired sources are preserved in previous-sources-416.json.

Playwright Chromium 1208/SwiftShader, local devserve/Three.js 0.170.0:

- musictest: every Opus/MP3 decodes and advances with nonzero PCM; lazy requests, alternative formats, master mute and media/panner cleanup pass.
- musicintegrationtest: real browser activation; car track rotation, PC game/film, laptop and Kaffeturbo playback/release pass. Simulated failure of every recording preserves visual/game operation, shows Sonos/car load status and creates zero generated music oscillators.
- sonostest: actual speaker touch/panel actions, all six channels and rotation, correct title/artist, volume, pause, floor muffling, F and failed-file status pass.
- turbotest: original coffee, timer, HUD/speed/FOV and wall-stop behavior passes.
- musicreloadtest: real page reload keeps channel index, new genre, volume, playing state and correct new title/artist.
- media-audit.json: all 24 files are complete stereo versions, with twelve new distinct original hashes. Total encoded size 84.62 MB; only the requested alternative streams, and construction requests none.

**Not completed: hearing-based audition of the complete old/new selection and the final mixes through every player.** This session cannot consume audio input. Nonzero PCM and artist/instrument metadata are not a listening judgement. The issue remains open for this acceptance criterion; each recording can be auditioned on music/index.html, which preloads no audio.
