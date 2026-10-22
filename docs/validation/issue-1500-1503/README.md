# Visit, TV volume, gifts and billiards (#1500–#1503)

Scoped checks only; no unrelated apartment/performance or device sweep.

- `node --test tools/tvvolumetest.mjs tools/playroomsoundtest.mjs`: six passing checks
  for distance/head direction, mute, message coalescing, sound events and slow pocket drops.
- `tools/santagiftstest.cjs BASE`: real-browser component passes all existing gift
  checks plus a three-package pile at 2.2 rad, fitted support, saved/reloaded heights,
  rejected sides/undersides and settling/returning a removed lower parcel.
- `tools/santavisittest.cjs BASE OUT`: actual apartment and real YouTube player pass
  blocked chooser/power/channel/seek/select commands, other-TV independence, real
  end→loop playback, volume 100 front / 35 rear / 19 far,10 completed sips, saved blush,
  continued TV during sleep, ordinary three-package placement and release at 21.
  No page errors. See [results](result.json) and inspected [before](before.png),
  [after](after.png), [pile](pile.png). Identical aligned wrappers appear as a column;
  the three support IDs and non-overlapping mesh bounds establish the individual packages.
- `tools/playroomsoundtest.cjs BASE OUT`: actual World/Web Audio route passes cue,
  collision, stationary pocket drop and mute/exit. Measured RMS .01133 for stroke/
  collisions and .03298 for pocket; mute/off/exit 0. [Results](billiard-audio.json).

The visit fixture waits for the iframe to acknowledge asynchronous volume commands
and enables touch before ordinary placement. Earlier fixture attempts did neither;
those setup failures were corrected without widening the test scope. The final two
small source follow-ups reset the volume-message timestamp on a new player and
retry the same clip after vendor failure; existing successful paths are unchanged.

YouTube audio uses the user's approved distance/head-direction scalar volume,
not stereo panning. Characters, gifts, media and billiards are original-only
personal gameplay; no public downstream transfer applies.
