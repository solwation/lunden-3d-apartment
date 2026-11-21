# #2291 verification: avatar looks in Unreal

Web (left, `tools/unreal-engine/avatar-looks.html`) and Unreal (right, `tests/capture_avatar_looks.py`, PIE,
`BP_LundenAvatar` + `Look.ApplyLook(code)`) for the same look code, same camera (4.2 m in front, 0.95 m up, 40°
horizontal field of view). Lighting differs (the web page's hemisphere light, a sun and sky in Unreal).

| Picture | Code | Shows |
|---|---|---|
| `look-188cm.png` | `310231011188` | chosen height 188 cm, long hair, beard, T-shirt, trousers, trainers |
| `look-hat-glasses-earrings.png` | `310231011177g34q53` | knitted hat, aviators, earrings |
| `look-everything.png` | `012340100177c267u26k6e2o2w2l2j2n12b2r2t2y2h2a2g12q21f51x1i2z33v1p11m22` | every extension tag: cap, square glasses, headphones, necklace, ring, bracelet, watch, tank top, shorts, boots |
| `look-everything-walk.png` | the same | walking at the player's 1.6 m/s: the pieces follow the retargeted Mannequin |
| `look-200cm.png`, `look-100cm.png` | `444321113200`, `000000000100` | the height range (the child's head bone grows by 1.326 as the web's) |
| `mirror.png` | the "everything" look, saved as the player's | the web's hall mirror (the game at `?at=1.257,1.115,-90`) and `BP_LundenMirror` 0.8 m in front of the player, on a lit test set (this checkout has no imported world): the player's own figure, seen only by the mirror's capture |

Checks (`test-result.json`, `Editor.Python.Lunden.test_avatar_looks`, passed on UE 5.8.4):

- 16 web codes (7, 9 and 12 digits, every extension tag, a wire code) round-trip to the web's own re-encoding; all 55
  fields read as the web's; 16 malformed codes are refused or re-encoded exactly as the web does.
- For the same 16 codes on a `BP_LundenAvatar`: exactly the web's pieces, every colour region within 0.002 of the
  web figure's own linear colours, the web's scale, and the bind-pose height equal to the web's within 0.01 cm
  (179.81 / 190.98 / 203.17 cm ...; the 100 cm child is checked by scale only: its head bone grows).
- Play (PIE on `L_Lunden`, save slot isolated): the Utseende menu button opens the look menu; a typed code is applied to
  the player's figure and saved; an invalid code changes nothing; the child's head bone is 1.326; the figure stands at
  the player's feet and the mirror's capture is the player's camera reflected in the glass (within 1 cm); after a second
  PIE start the figure wears the saved look. `test_ui` (#2286, with the new button) and `test_avatar_rig` (#2290) pass.
- `avatar-looks.mjs --check` and `avatar-parts.mjs --check`: 4000 random looks, and the piece rules reproduce the
  web builder's parts for 735 looks. `build_avatar_looks.py --check`, `build_avatar_rig.py --check` and
  `test_avatar_rig` (#2290) pass with the `Look` row.

No picture of the look menu: a UMG widget does not reach a scene capture, and the world-space widget tried for it did
not show in play; the menu is checked by the play test through the real button.

Known differences (not ported or open, see `docs/development/unreal.md#avatars-looks-2291`): the top's pattern
(stripes), face sliders, body build and hair length; a dark sliver on the inner thigh and a grey patch at one foot in
Unreal (cause not found: not vertex welding, not skin weights).
