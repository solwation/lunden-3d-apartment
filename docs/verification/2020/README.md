# Beard mouth opening — #2020

Baseline `73f1e890`. `src/avatar.js` `beardShell` (no lip patch part), `src/config.js`
`AVATAR_BEARD` (`rows` 12, `mouth` [12, -24, -12.5]). Fixture avatars left to right: beard +
moustache, beard only, moustache only, beard + moustache talking (`uMouth` 1).

| Image | Shows |
|---|---|
| `before/beard-front.png` / `beard-front.png` | front view |
| `before/beard-quarter.png` / `beard-quarter.png` | quarter view |
| `before/beard-profile.png` / `beard-profile.png` | profile |

Triangles per avatar (`browser.json`): beard + moustache 12,560 to 12,644 (+0.7%, limit
13,257 = +10% over #2012's 12,052 baseline for that variant), beard only 12,568 to 12,660, moustache only
unchanged; one draw. Node: avatarheadtest 6/6, riggedavatartest 11/11, avatarcustomizertest 24/24,
avatarbodytest 12/12, avatarswaytest 5/5. One browser run, no page errors. Not covered: the
in-game avatar customizer UI itself (same geometry builder).
