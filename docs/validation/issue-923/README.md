# Eyebrow and mouth scope audit (#923, 2026-10-14)

No runtime, geometry, material, shader, bone, protocol or damage change. The two independent physical families need separate complete functional deliveries: [eyebrows #963](https://github.com/solwation/lunden-3d-apartment/issues/963), [mouth #964](https://github.com/solwation/lunden-3d-apartment/issues/964). They are unreserved and must be selected through a fresh complete priority queue; this audit does not automatically start either child. Parent #923 and its ancestors remain open.

Source `23343bf211d43b32ad4e28d74d075bcca54513f6`, `src/avatar.js`:

| Original part | Physical source parameters | Material region / head bone |
|---|---|---|
| Brows s=-1/+1 | Box(.032,.0075,.01), rotateZ(s*-.12), centre[s*.037,.1+.045,.103] | hair, shade.85 |
| Mouth | Box(.04,.007,.008), centre[0,.1-.058,.106] | fixed, shade1/color0x9a5a52 |

The merged actual Avatar has no brow/mouth contact attributes yet. Original boxes have36 nonindexed vertices each. The native survey reconstructs **those exact source operations** with actual Three BoxGeometry, then locates byte-equal position sequences in the original imported Avatar's geometry; no copied seed or alternative mesh/profile is substituted. A separate validation-only `avatar-audit.js` URL contains the unchanged original module plus one named export of its original private `parts()` for negative range interpretation. Actual Avatar stays imported from canonical `src/avatar.js`; no prototype monkeypatch or product export is added. Production geometryFor intentionally omits the private `region` attribute, which caused the first fixture attempt to fail; the separate original-parts export fixes classification without changing the actual mesh.

Finite survey:12 style×build combinations with recorded sampled tall/sleeves, bind and elapsed standing.4/2s, root headings0/.8/π. Actual whole-SkinnedMesh native first rays use original r2 origins and r3 directions, no renderer/World/Ghosts/Worker/WebGL.5832 rays:927 nearest brow s=-1 (audit label leftBrow),921 s=+1 (rightBrow),24 nearest mouth,3960 earlier other parts,0misses in that grid. These audit labels identify source s, not an anatomical-hand policy. Both actual eyebrow ranges and mouth range match all sampled original position bytes.

The200 attempted corner rays had **116 wrong first-family corners**; keep that boundary evidence. Do not treat all successful centre rays as safe quantized cells, all12 variants as all60 canonical height/build/style cases, or sampled standing poses as all animation/history support. One separately located complete8/8 native-corner cell per physical part:

| Part | Actual look/pose/heading | r3 contact | r2 origin | r3 direction |
|---|---|---|---|---|
| Brow s=-1 | browmouth-audit-0; style1/build0/tall1/sleeves0; bind/yaw0 | [.043,1.683,-.1] | [.04,1.68,-3.1] | [.001,.001,1] |
| Brow s=+1 | same | [-.027,1.683,-.1] | [-.03,1.68,-3.1] | [.001,.001,1] |
| Mouth | browmouth-audit-22; style3/build1/tall1.025/sleeves0; standing.4/yaw.8 | [-.086,1.602,-.069] | [-2.23,1.62,-2.16] | [.716,-.006,.698] |

Corner rays point independently from the recorded origin to hc±.0005 on every axis and query the **entire actual native mesh**; no private part ray is used to ignore nearer surfaces. This locates whole-cell candidates only. It does not prove pure Worker entry/ray tolerance, all r2/r3/max-coordinate cases, unknown authoritative animation phase or double damage. Mouth exposure is sparse in this grid and cannot be inferred from a generic face envelope or one bind box.

A separate12-ray nearest table on the two example looks observes hair/hat ahead of intended upper-skull contacts, actual eyes and noses, torso ahead of intended neck/torso rays, plus one miss. The labels are intended aiming locations, not assertions about what was actually hit. Full original-part metadata/first point is retained. These are read-only geometry negatives, not tests of hypothetical Worker rejection or forged network packets.

Raw artifacts `/tmp/lunden-browmouth923-surface/`: `result.json`, `negatives.json`, `survey.cjs`, `negatives.cjs`, `served-avatar.js`, `proof.json`, `freeze-second.json`, logs and `audit.png`. Corrected survey actual Node0/10,823.6ms; separate negative native Node0,12 rows/0GL/0pageerrors. Initial survey actual CLI1 at missing region is preserved in `survey-first.cjs`/`driver-first.log`; a later reporting-only CLI1 assumes every negative hit exists and encounters the intentionally recorded miss. It does not alter the native Node0/raw rows.1356 tracked source files plus explicit external survey=1357 match through completion. Separate negative helper and served-module hashes are explicit in proof.

The inspected native DOM PNG shows the three cell candidates; the existing QR overlaps initial negative rows and the long count line extends past the viewport. JSON remains the complete evidence. It is **not a rendered Avatar/World image or a gameplay marker**. No Worker/deploy was started; genuine local2HP/HP/score/death/marker/protocol/recovery and Wrangler deployment belong to each complete child before any live-contract claim. No phone/FPS/all-pose acceptance.

Publication rebase preserves incoming #950 `64e57b6` Nose authority/policy changes. Audited actual source remains frozen23343bf; whole current config/avatar/Worker hashes are different and are not called the same executed runtime. Original full `parts()` and `geometryFor()` function bytes, original avatarLook and physical skull/jaw/nose constants are independently unchanged, so the measured box construction/ranges are preserved. No new native or World run is justified for a documents-only audit publication.
