# #2367: the dark sliver on the thigh and the grey patch at the foot

**Cause.** `RTG_LundenMannequinToWeb` (built by `build_avatar_looks.py`) had UE's default retarget ops, including
**Root Motion**. The web rig's root bone is `hips` itself: there is no separate root above it. The op therefore put
`hips` on the ground under the pelvis, after Pelvis Motion and the FK chains had already placed the legs and torso.

In a playing world the figure's `hips` bone was at z = 0 cm, while the thighs were at 95 cm. Everything weighted to
`hips` followed it to the ground:

- **The grey patch** was the briefs piece (`SKM_LundenLookPiece_035`, rigid on `hips`), sunk into the floor between
  the feet. It showed in the trousers' colour.
- **The dark sliver** was the trousers' waist (`_053`). Its vertices blend thigh and `hips` (up to 0.43 on `hips`),
  and that blend stretched them down along the inner thigh.

The GLBs, normals and skin weights were never the cause (checked on Linux in this issue).

**Diagnosis** (PIE, look `310231011188`). With every piece's leader pose cleared (bind pose, `diag-bind-pose.png`),
there is no sliver and no patch. With the trousers alone there is a sliver and no patch. Without the trousers there is
a patch and no sliver. The figure's bones were read with `get_socket_location`.

**Fix.** `build_retargeter` removes the Root Motion op after `add_default_ops`, and fails if it is still there.
After the rebuild, `hips` sits at 94.7 cm.

| Picture | Shows |
|---|---|
| `look-188cm.png` | `310231011188`: web, Unreal before (#2291's picture), Unreal after |
| `look-200cm.png` | `444321113200`, the same three |
| `look-everything-walk.png` | every extension tag, walking at 1.6 m/s (shorts: no trousers, no patch); the figure still follows the Mannequin |
| `diag-bind-pose.png` | before the fix, leader pose cleared: the pieces in their bind pose, without the sliver or the patch |

The after panels are the new `tests/capture_avatar_looks.py` pictures, cropped to the framing of #2291's pairs. The
lighting differs between the two Unreal runs.

**Checks** (UE 5.8.4, Windows checkout at main 870ef27d):
- `build_avatar_looks.py` rebuilt the 107 look assets (spec eb3d377fd537).
- `test_avatar_looks` passed, including the PIE part (menu, saved look, head scale, mirror).
- `test_avatar_rig` (#2290) passed.
- `capture_avatar_looks.py` gave `LUNDEN_AVATAR_LOOKS_CAPTURE_OK`.
