"""#2290: the avatars' skeleton and movements, /Game/Lunden/Avatar/Rig/ and /Game/Lunden/Avatar/Animation/.

Human figures (other players, #2292; the mirror, #2291) use Epic's Mannequin skeleton from the engine's own Third Person
template content, never a Fab/marketplace pack. Retargeting runs through an IK Rig for the web's own 15-bone rig
(models/avatar-rigged.glb) and one for the Mannequin, joined by an IK Retargeter. The web figure is procedural
(src/avatar.js, avatarmotion.js, avatarjump.js); Unreal plays the Mannequin's own idle, walk, jog and jump clips, the
web's sitting pose retargeted onto the Mannequin, and the web's crouch as the same procedural rule the web uses (hips
down by AVATAR_CROUCH.hipDrop, torso leaned by crouchLean, feet held on the ground by two-bone IK).

Assets (one owner, #2290):
  Avatar/Rig/Mannequin/      SK_Mannequin, SKM_Manny_Simple, PA_Mannequin (moved from the engine template; the mesh
                             wears M_LundenAvatarNeutral until #2291's looks replace it)
  Avatar/Rig/Web/            SKM_LundenWebAvatar, SK_LundenWebAvatar, PA_LundenWebAvatar, MI_LundenWebAvatar,
                             AS_Web_sit (imported from models/avatar-rigged.glb: the retarget source)
  Avatar/Rig/                IK_LundenWeb, IK_LundenMannequin, RTG_LundenWebToMannequin, M_LundenAvatarNeutral,
                             BP_LundenAvatar
  Avatar/Animation/Mannequin/ MM_Idle, MF_Unarmed_Walk_Fwd, MF_Unarmed_Jog_Fwd, MM_Jump (engine template clips)
  Avatar/Animation/          AS_LundenSit (retargeted), ABP_LundenAvatar

BP_LundenAvatar (Actor) is what other areas spawn. Its interface:
  SetMotion(Speed cm/s, Crouch 0..1, Airborne, Pose)   #2292 feeds it from the network state (`c`, `pose`, ground
                         speed, in the air); the mirror (#2291) from the local player. Pose is the web's code: 0 none,
                         1 sit, 2 lie, 3 long sit. Location = the feet, yaw = the way the figure faces.
  LookCode, HeightScale, WidthScale   set by #2291's look component (HeightScale/WidthScale scale the hit zones)
  Body                   the SkeletalMeshComponent (Mannequin) the look component dresses
  HitZones/HeadPivot/HeadLower|HeadMiddle|HeadTop, HitZones/BodyPivot/BodyZone
                         the logical hit zones of the shared head contract (PVP_HEAD_BOXES, COMBAT.body), independent of
                         the rendered skeleton; tags hit:head:0..2 and hit:body
  avatar-extensions.json components other issues add (#2291's look component: row name "Look")

Values come from tools/unreal-engine/avatar-contract.json (written from src/config.js by avatar-contract.mjs).

Run (Windows checkout; lock every .uasset under Avatar/Rig and Avatar/Animation first):
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/build_avatar_rig.py [--force | --check]
A run whose inputs are unchanged (metadata Lunden.SpecHash on BP_LundenAvatar) saves nothing; --check fails when an
asset is missing or was built from other inputs. Writes Saved/avatar-rig-build.json and logs LUNDEN_AVATAR_RIG_OK.
"""
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys

import unreal as u

RIG = "/Game/Lunden/Avatar/Rig"
ANIM = "/Game/Lunden/Avatar/Animation"
STAGE = "/Game/Characters/Mannequins"  # the template's own package path; copied here only while moving
BP_PATH = RIG + "/BP_LundenAvatar"
ABP_PATH = ANIM + "/ABP_LundenAvatar"
SPEC_TAG = "Lunden.SpecHash"
EXT_TAG = "Lunden.AvatarExtensions"

PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
REPO = PROJECT.parents[1]
CONTENT = PROJECT / "Content"
CONTRACT_FILE = REPO / "tools/unreal-engine/avatar-contract.json"
EXTENSIONS_FILE = REPO / "tools/unreal-engine/avatar-extensions.json"
GLB = REPO / "models/avatar-rigged.glb"
TEMPLATE = Path(u.Paths.convert_relative_path_to_full(u.Paths.engine_dir())).parent / \
    "Templates/TemplateResources/High/Characters/Content/Mannequins"

# Template file (under TEMPLATE) -> asset path in the project. Everything else in the template is discarded.
MANNEQUIN = {
    "Meshes/SK_Mannequin": RIG + "/Mannequin/SK_Mannequin",
    "Meshes/SKM_Manny_Simple": RIG + "/Mannequin/SKM_Manny_Simple",
    "Rigs/PA_Mannequin": RIG + "/Mannequin/PA_Mannequin",
    "Anims/Unarmed/MM_Idle": ANIM + "/Mannequin/MM_Idle",
    "Anims/Unarmed/Walk/MF_Unarmed_Walk_Fwd": ANIM + "/Mannequin/MF_Unarmed_Walk_Fwd",
    "Anims/Unarmed/Jog/MF_Unarmed_Jog_Fwd": ANIM + "/Mannequin/MF_Unarmed_Jog_Fwd",
    "Anims/Unarmed/Jump/MM_Jump": ANIM + "/Mannequin/MM_Jump",
}
SKELETON = MANNEQUIN["Meshes/SK_Mannequin"]
MESH = MANNEQUIN["Meshes/SKM_Manny_Simple"]
IDLE = MANNEQUIN["Anims/Unarmed/MM_Idle"]
WALK = MANNEQUIN["Anims/Unarmed/Walk/MF_Unarmed_Walk_Fwd"]
JOG = MANNEQUIN["Anims/Unarmed/Jog/MF_Unarmed_Jog_Fwd"]
JUMP = MANNEQUIN["Anims/Unarmed/Jump/MM_Jump"]
NEUTRAL = RIG + "/M_LundenAvatarNeutral"
WEB = RIG + "/Web"
WEB_MESH = WEB + "/SKM_LundenWebAvatar"
WEB_SIT = WEB + "/AS_Web_sit"
IK_WEB = RIG + "/IK_LundenWeb"
IK_MANNY = RIG + "/IK_LundenMannequin"
RTG = RIG + "/RTG_LundenWebToMannequin"
SIT = ANIM + "/AS_LundenSit"

# The web rig's retarget chains (models/avatar-rigged.glb), named like the Mannequin template's auto chains.
WEB_CHAINS = [("Spine", "torso", "torso"), ("Head", "head", "head"),
              ("LeftArm", "shoulderL", "handL"), ("RightArm", "shoulderR", "handR"),
              ("LeftLeg", "thighL", "footL"), ("RightLeg", "thighR", "footR")]
# Knee pole targets for the crouch IK, Mannequin component space (cm, +X = the figure's left, +Y = forward). *guess*:
# ahead of and above the knees, so the knees bend forward over the toes as the web's crouch does (AVATAR_CROUCH.knees).
KNEE_POLES = {"foot_l": (15.0, 80.0, 50.0), "foot_r": (-15.0, 80.0, 50.0)}

ASSETS = u.EditorAssetLibrary
BP = u.BlueprintEditorLibrary
GRAPH = u.BlueprintGraphEditor
TOOLS = u.AssetToolsHelpers.get_asset_tools()
REG = u.AssetRegistryHelpers.get_asset_registry()
REAL = BP.get_basic_type_by_name("real")
INT = BP.get_basic_type_by_name("int")
BOOL = BP.get_basic_type_by_name("bool")
STRING = BP.get_basic_type_by_name("string")
VECTOR = BP.get_struct_type(u.Vector.static_struct())
ROTATOR = BP.get_struct_type(u.Rotator.static_struct())
SOURCE, TARGET = u.RetargetSourceOrTarget.SOURCE, u.RetargetSourceOrTarget.TARGET
report = {"engine": u.SystemLibrary.get_engine_version()}


def log(text):
    u.log("LUNDEN_AVATAR_RIG " + text)


# Graph helpers (as build_save.py) ------------------------------------------------------------------------------------

def pins(node, find):
    return [str(p.get_pin_name()) for p in find(node)]


def out(node, name):
    pin = BP.find_output_pin(node, name)
    if not pin.is_valid():
        raise RuntimeError(f"{node.get_name()} has no output {name}: {pins(node, BP.list_output_pins)}")
    return pin


def inp(node, name):
    pin = BP.find_input_pin(node, name)
    if not pin.is_valid():
        raise RuntimeError(f"{node.get_name()} has no input {name}: {pins(node, BP.list_input_pins)}")
    return pin


def link(a, b):
    if not a.try_create_connection(b):
        raise RuntimeError(f"Could not connect {a.get_pin_name()} to {b.get_pin_name()}")


def value(node, name, text):
    if not inp(node, name).set_pin_value(str(text)):
        raise RuntimeError(f"Could not set {node.get_name()}.{name} to {text}")


def class_path(path):
    return f"{path}.{path.rsplit('/', 1)[1]}_C"


class Graph:
    def __init__(self, editor):
        self.g = editor
        self.x = 250

    def at(self, node, x=None, y=0):
        if not node:
            raise RuntimeError(f"Could not create a node at {x},{y}")
        if x is None:
            x, self.x = self.x, self.x + 280
        BP.set_node_pos(node, u.IntPoint(x, y))
        return node

    def call(self, path, x=None, y=0):
        full = path if path.startswith("/") else "/Script/Engine." + path
        return self.at(self.g.add_call_function_node(full), x, y)

    def get(self, name, owner="", x=None, y=200):
        return self.at(self.g.add_get_member_variable_node(name, owner), x, y)

    def set(self, name, owner="", x=None, y=0):
        return self.at(self.g.add_set_member_variable_node(name, owner), x, y)

    def named(self, name, x=None, y=0):
        return self.at(self.g.create_node_from_name(name, u.Vector2D(0, 0), []), x, y)


def function(bp, name, inputs):
    editor = GRAPH.create_and_edit_function_graph(bp, name)
    if not editor:
        raise RuntimeError("Could not create the function " + name)
    params = {}
    for pname, ptype in inputs:
        pin = editor.add_graph_input_parameter(pname, ptype)
        if not pin or not pin.is_valid():
            raise RuntimeError(f"Could not add the input {name}.{pname}")
        params[pname] = pin
    return Graph(editor), params


def exec_out(node):
    for name in ("then", "Then"):
        pin = BP.find_output_pin(node, name)
        if pin.is_valid():
            return pin
    raise RuntimeError(f"{node.get_name()} has no exec output: {pins(node, BP.list_output_pins)}")


def chain(start, nodes):
    """Wire exec: start pin -> each node's execute -> its then."""
    pin = start
    for node in nodes:
        link(pin, inp(node, "execute"))
        pin = exec_out(node)
    return pin


def variables(bp, wanted):
    have = {str(n) for n in BP.list_member_variable_names(bp)}
    for name, kind in wanted.items():
        if name in have:
            if BP.get_member_variable_type(bp, name).export_text() != kind.export_text():
                BP.change_member_variable_type(bp, name, kind)
        elif not BP.add_member_variable(bp, name, kind):
            raise RuntimeError("Could not add the variable " + name)
        BP.set_blueprint_variable_instance_editable(bp, name, True)


def remove_functions(bp, names):
    events = GRAPH.get_graph_editor_by_name(bp, "EventGraph")
    if events:
        events.remove_nodes([n for n in events.list_all_nodes()])
    for name in names:
        if BP.find_graph(bp, name):
            BP.remove_function_graph(bp, name)
    BP.compile_blueprint(bp)


def compiled(bp, graphs):
    BP.compile_blueprint(bp)
    broken = [f"{name}: {n.get_name()} {n.get_editor_property('error_msg') if hasattr(n, 'get_editor_property') else ''}"
              for name in graphs for n in GRAPH.get_graph_editor_by_name(bp, name).list_nodes_with_errors()]
    if broken:
        raise RuntimeError(f"{bp.get_name()} failed to compile: " + "; ".join(broken))


def save(*paths):
    for path in paths:
        if not ASSETS.save_asset(path, only_if_is_dirty=False):
            raise RuntimeError("Could not save " + path)


def assets_under(path):
    return [str(a.package_name) for a in REG.get_assets_by_path(path, recursive=True)]


# 1. Mannequin from the engine template ------------------------------------------------------------------------------

def neutral_material():
    if ASSETS.does_asset_exist(NEUTRAL):
        return ASSETS.load_asset(NEUTRAL)
    folder, name = NEUTRAL.rsplit("/", 1)
    mat = TOOLS.create_asset(name, folder, u.Material, u.MaterialFactoryNew())
    lib = u.MaterialEditingLibrary
    color = lib.create_material_expression(mat, u.MaterialExpressionConstant3Vector, -300, 0)
    color.set_editor_property("constant", u.LinearColor(0.42, 0.42, 0.42, 1))
    rough = lib.create_material_expression(mat, u.MaterialExpressionConstant, -300, 200)
    rough.set_editor_property("r", 0.7)
    lib.connect_material_property(color, "", u.MaterialProperty.MP_BASE_COLOR)
    lib.connect_material_property(rough, "", u.MaterialProperty.MP_ROUGHNESS)
    mat.set_editor_property("used_with_skeletal_mesh", True)
    lib.recompile_material(mat)
    return mat


def dress(mesh, material):
    """Every material slot of the Mannequin mesh wears `material` (the template's textured materials stay behind)."""
    mats = mesh.get_editor_property("materials")
    for i in range(len(mats)):
        slot = mats[i]
        slot.set_editor_property("material_interface", material)
        mats[i] = slot
    mesh.set_editor_property("materials", mats)
    mesh.set_editor_property("post_process_anim_blueprint", None)
    left = [m.get_editor_property("material_interface").get_path_name() for m in mesh.get_editor_property("materials")]
    if any(not p.startswith(material.get_path_name()) for p in left):
        raise RuntimeError(f"The Mannequin mesh still wears {left}")


def mannequin():
    """Copy the engine template's Mannequin folder to its own package path, move the assets Lunden uses into
    Avatar/Rig and Avatar/Animation (references fixed by the move) and delete the rest of the copy."""
    missing = [dst for dst in MANNEQUIN.values() if not ASSETS.does_asset_exist(dst)]
    if not missing:
        mesh = ASSETS.load_asset(MESH)
        if any(not m.get_editor_property("material_interface") or
               not m.get_editor_property("material_interface").get_path_name().startswith(NEUTRAL)
               for m in mesh.get_editor_property("materials")):
            dress(mesh, neutral_material())
            save(MESH)
        return False
    if not TEMPLATE.is_dir():
        raise RuntimeError(f"The engine's Third Person template content is missing: {TEMPLATE}")
    stage_dir = CONTENT / "Characters/Mannequins"
    if (CONTENT / "Characters").exists():
        raise RuntimeError(f"{CONTENT / 'Characters'} exists; it is this script's staging folder and must be empty")
    shutil.copytree(TEMPLATE, stage_dir)
    try:
        REG.scan_paths_synchronous(["/Game/Characters"], True)
        material = neutral_material()
        mesh = ASSETS.load_asset(STAGE + "/Meshes/SKM_Manny_Simple")
        dress(mesh, material)
        for src in MANNEQUIN:
            asset = ASSETS.load_asset(f"{STAGE}/{src}")
            if isinstance(asset, u.AnimSequence):
                asset.set_preview_skeletal_mesh(None)
                asset.clear_retarget_source_asset()  # the template's female clips name SKM_Quinn_Simple
        renames = []
        for src, dst in MANNEQUIN.items():
            folder, name = dst.rsplit("/", 1)
            renames.append(u.AssetRenameData(asset=ASSETS.load_asset(f"{STAGE}/{src}"), new_package_path=folder,
                                             new_name=name))
        if not TOOLS.rename_assets(renames):
            raise RuntimeError("Could not move the Mannequin assets")
        for dst in MANNEQUIN.values():
            save(dst)
        save(NEUTRAL)
    finally:
        ASSETS.delete_directory("/Game/Characters")
        shutil.rmtree(CONTENT / "Characters", ignore_errors=True)
    stray = []
    for dst in list(MANNEQUIN.values()) + [NEUTRAL]:
        for dep in REG.get_dependencies(dst, u.AssetRegistryDependencyOptions()) or []:
            dep = str(dep)
            if dep.startswith("/Game/") and not dep.startswith("/Game/Lunden/Avatar/"):
                stray.append(f"{dst} -> {dep}")
    if stray:
        raise RuntimeError("Moved Mannequin assets still reference the template copy: " + ", ".join(stray))
    log(f"Mannequin moved from {TEMPLATE} ({len(MANNEQUIN)} assets)")
    return True


# 2. The web rig (retarget source) -------------------------------------------------------------------------------------

def web_source(glb_hash):
    if ASSETS.does_asset_exist(WEB_MESH) and ASSETS.get_metadata_tag(ASSETS.load_asset(WEB_MESH), "Lunden.GlbHash") == glb_hash:
        return False
    for path in assets_under(WEB):
        ASSETS.delete_asset(path)
    tmp = WEB + "/_import"
    task = u.AssetImportTask()
    task.filename = str(GLB)
    task.destination_path = tmp
    task.automated = True
    task.save = False
    task.replace_existing = True
    TOOLS.import_asset_tasks([task])
    found = {}
    for data in REG.get_assets_by_path(tmp, recursive=True):
        found.setdefault(str(data.asset_class_path.asset_name), []).append(str(data.package_name))
    want = {"SkeletalMesh": WEB_MESH, "Skeleton": WEB + "/SK_LundenWebAvatar", "PhysicsAsset": WEB + "/PA_LundenWebAvatar",
            "MaterialInstanceConstant": WEB + "/MI_LundenWebAvatar"}
    renames = []
    for cls, dst in want.items():
        if len(found.get(cls, [])) != 1:
            raise RuntimeError(f"The GLB import made {found.get(cls)} for {cls}: {found}")
        folder, name = dst.rsplit("/", 1)
        renames.append(u.AssetRenameData(asset=ASSETS.load_asset(found[cls][0]), new_package_path=folder, new_name=name))
    sit = [p for p in found.get("AnimSequence", []) if p.endswith("sit")]
    if len(sit) != 1:
        raise RuntimeError(f"No single sit clip in the GLB import: {found.get('AnimSequence')}")
    renames.append(u.AssetRenameData(asset=ASSETS.load_asset(sit[0]), new_package_path=WEB, new_name="AS_Web_sit"))
    if not TOOLS.rename_assets(renames):
        raise RuntimeError("Could not move the imported web rig")
    ASSETS.delete_directory(tmp)
    mesh = ASSETS.load_asset(WEB_MESH)
    ASSETS.set_metadata_tag(mesh, "Lunden.GlbHash", glb_hash)
    for path in assets_under(WEB):
        save(path)
    log(f"web rig imported from {GLB.name} ({glb_hash[:12]})")
    return True


# 3. IK Rigs, retargeter and the retargeted sitting pose --------------------------------------------------------------

def ik_rig(path, mesh, chains=None, root=None):
    if ASSETS.does_asset_exist(path):
        rig = ASSETS.load_asset(path)
    else:
        folder, name = path.rsplit("/", 1)
        rig = TOOLS.create_asset(name, folder, u.IKRigDefinition, u.IKRigDefinitionFactory())
    ctl = u.IKRigController.get_controller(rig)
    if not ctl.set_skeletal_mesh(mesh):
        raise RuntimeError(f"{path}: cannot use {mesh.get_path_name()}")
    for c in list(ctl.get_retarget_chains()):
        ctl.remove_retarget_chain(c.get_editor_property("chain_name"))
    if chains is None:
        if not ctl.apply_auto_generated_retarget_definition():
            raise RuntimeError(f"{path}: the Mannequin template was not recognised")
    else:
        ctl.set_retarget_root(root)
        for name, start, end in chains:
            ctl.add_retarget_chain(name, start, end, "None")
    names = [str(c.get_editor_property("chain_name")) for c in ctl.get_retarget_chains()]
    log(f"{path}: root {ctl.get_retarget_root()}, chains {names}")
    return rig, names


def retarget():
    web_rig, web_chains = ik_rig(IK_WEB, ASSETS.load_asset(WEB_MESH), WEB_CHAINS, "hips")
    manny_rig, manny_chains = ik_rig(IK_MANNY, ASSETS.load_asset(MESH))
    if ASSETS.does_asset_exist(RTG):
        rtg = ASSETS.load_asset(RTG)
    else:
        folder, name = RTG.rsplit("/", 1)
        rtg = TOOLS.create_asset(name, folder, u.IKRetargeter, u.IKRetargetFactory())
    ctl = u.IKRetargeterController.get_controller(rtg)
    ctl.set_ik_rig(SOURCE, web_rig)
    ctl.set_ik_rig(TARGET, manny_rig)
    ctl.set_preview_mesh(SOURCE, ASSETS.load_asset(WEB_MESH))
    ctl.set_preview_mesh(TARGET, ASSETS.load_asset(MESH))
    ctl.remove_all_ops()
    ctl.add_default_ops()
    ctl.assign_ik_rig_to_all_ops(SOURCE, web_rig)
    ctl.assign_ik_rig_to_all_ops(TARGET, manny_rig)
    ctl.auto_map_chains(u.AutoMapChainType.CLEAR, True)
    mapped = {}
    for target in manny_chains:
        if target in web_chains:
            ctl.set_source_chain(target, target)
            mapped[target] = target
    # The web rig's arms hang straight down; the Mannequin stands in an A pose. Align the target's chains to the source.
    ctl.auto_align_all_bones(TARGET, u.RetargetAutoAlignMethod.CHAIN_TO_CHAIN)
    ops = [str(ctl.get_op_name(i)) for i in range(ctl.get_num_retarget_ops())]
    log(f"{RTG}: ops {ops}, chains {mapped}")
    report["retarget"] = {"ops": ops, "chains": mapped, "webChains": web_chains, "mannequinChains": manny_chains}
    save(IK_WEB, IK_MANNY, RTG)
    made = u.IKRetargetBatchOperation.duplicate_and_retarget(
        [ASSETS.find_asset_data(WEB_SIT)], ASSETS.load_asset(WEB_MESH),
        ASSETS.load_asset(MESH), rtg, "AS_Web_", "AS_Retarget_", "", "", ANIM + "/_retarget", False, False, True)
    paths = [str(a.package_name) for a in made]
    if len(paths) != 1:
        raise RuntimeError(f"Retargeting the sitting pose made {paths}")
    if ASSETS.does_asset_exist(SIT):  # a rebuild: every reference to the old pose moves to the new one
        if not ASSETS.consolidate_assets(ASSETS.load_asset(paths[0]), [ASSETS.load_asset(SIT)]):
            raise RuntimeError("Could not replace the old sitting pose")
    if not TOOLS.rename_assets([u.AssetRenameData(asset=ASSETS.load_asset(paths[0]), new_package_path=ANIM, new_name="AS_LundenSit")]):
        raise RuntimeError("Could not move the retargeted sitting pose")
    ASSETS.delete_directory(ANIM + "/_retarget")
    sit = ASSETS.load_asset(SIT)
    sit.set_preview_skeletal_mesh(ASSETS.load_asset(MESH))
    save(SIT)


# 4. Speeds: the clips' own ground speed ---------------------------------------------------------------------------

def root_speed(seq):
    """The clip's own root motion (cm/s along its travel), 0 for an in-place clip."""
    length = u.AnimationLibrary.get_sequence_length(seq)
    options = u.AnimPoseEvaluationOptions()
    a = u.AnimPoseExtensions.get_bone_pose(u.AnimPoseExtensions.get_anim_pose_at_time(seq, 0.0, options), "root",
                                           u.AnimPoseSpaces.WORLD).translation
    b = u.AnimPoseExtensions.get_bone_pose(u.AnimPoseExtensions.get_anim_pose_at_time(seq, length, options), "root",
                                           u.AnimPoseSpaces.WORLD).translation
    track = []
    for i in range(9):
        t = u.AnimPoseExtensions.get_bone_pose(u.AnimPoseExtensions.get_anim_pose_at_time(seq, length * i / 8, options),
                                               "root", u.AnimPoseSpaces.WORLD).translation
        track.append([round(t.x, 1), round(t.y, 1), round(t.z, 1)])
    report.setdefault("rootTracks", {})[seq.get_name()] = {"length": round(length, 4), "root": track}
    return (b - a).length() / length


def natural_speed(seq):
    """Ground speed (cm/s) at which the clip's planted feet stand still. A clip with root motion travels at its root's
    speed; the avatar plays it in place (force_root_lock), since #2292 moves the actor itself. An in-place clip's
    planted foot moves backwards at that speed (Mannequin component space: +Y forward, +Z up)."""
    length = u.AnimationLibrary.get_sequence_length(seq)
    options = u.AnimPoseEvaluationOptions()
    locked = seq.get_editor_property("force_root_lock")
    seq.set_editor_property("force_root_lock", False)
    try:
        travel = root_speed(seq)
    finally:
        seq.set_editor_property("force_root_lock", locked)
    if travel > 10:
        return travel
    steps = 120
    feet = {"foot_l": [], "foot_r": []}
    for i in range(steps + 1):
        pose = u.AnimPoseExtensions.get_anim_pose_at_time(seq, length * i / steps, options)
        for bone in feet:
            t = u.AnimPoseExtensions.get_bone_pose(pose, bone, u.AnimPoseSpaces.WORLD).translation
            feet[bone].append((t.y, t.z))
    speeds = []
    for track in feet.values():
        low = min(z for _, z in track)
        for (y0, z0), (y1, z1) in zip(track, track[1:]):
            if z0 < low + 2.0 and z1 < low + 2.0:  # planted: within 2 cm of the lowest height
                speeds.append(-(y1 - y0) / (length / steps))
    speeds.sort()
    if len(speeds) < 6:
        raise RuntimeError(f"{seq.get_name()}: no planted phase found")
    return speeds[len(speeds) // 2]


def foot_ik_offset(seq):
    """Largest distance between foot_* and ik_foot_* over the clip (the crouch IK holds the feet at ik_foot_*)."""
    length = u.AnimationLibrary.get_sequence_length(seq)
    worst = 0.0
    for i in range(21):
        pose = u.AnimPoseExtensions.get_anim_pose_at_time(seq, length * i / 20, u.AnimPoseEvaluationOptions())
        for side in ("l", "r"):
            a = u.AnimPoseExtensions.get_bone_pose(pose, "foot_" + side, u.AnimPoseSpaces.WORLD).translation
            b = u.AnimPoseExtensions.get_bone_pose(pose, "ik_foot_" + side, u.AnimPoseSpaces.WORLD).translation
            worst = max(worst, (a - b).length())
    return worst


def closure(start):
    """Every /Game package `start` needs, hard or soft."""
    opts = u.AssetRegistryDependencyOptions(include_soft_package_references=True, include_hard_package_references=True)
    seen, todo = set(), [start]
    while todo:
        path = todo.pop()
        if path in seen:
            continue
        seen.add(path)
        todo += [str(d) for d in REG.get_dependencies(path, opts) or [] if str(d).startswith("/Game/")]
    return sorted(seen)


def clips():
    """The template clips play in place (the actor carries the movement); the skeleton, mesh and clips keep no
    reference to the template's other assets (Quinn, the Control Rigs), which stay behind in the engine."""
    skeleton = ASSETS.load_asset(SKELETON)
    u.AnimationLibrary.set_skeleton_preview_mesh(skeleton, ASSETS.load_asset(MESH))
    u.AnimationLibrary.set_skeleton_additional_preview_meshes(skeleton, None)
    save(SKELETON)
    mesh = ASSETS.load_asset(MESH)
    # The template names its Control Rig here; set and clear it so the unresolvable soft path really goes.
    mesh.set_editor_property("default_animating_rig", skeleton)
    mesh.set_editor_property("default_animating_rig", None)
    save(MESH)
    for path in (IDLE, WALK, JOG, JUMP):
        seq = ASSETS.load_asset(path)
        seq.clear_retarget_source_asset()
        seq.set_preview_skeletal_mesh(ASSETS.load_asset(MESH))
        seq.set_editor_property("force_root_lock", True)
        save(path)


def gait_speeds(contract):
    """The clips' own ground speeds and the walk/run switch: ABP_LundenAvatar advances each clip by Speed / its own speed,
    so the planted feet keep the ground speed at any pace (no sliding), and switches from the walk to the jog clip in
    the middle of the web's walk-to-run blend (AVATAR_GAIT.run)."""
    walk_speed, jog_speed = natural_speed(ASSETS.load_asset(WALK)), natural_speed(ASSETS.load_asset(JOG))
    lo, hi = (v * 100 for v in contract["motion"]["gaitRun"])
    gait = {"WalkNatural": walk_speed, "JogNatural": jog_speed, "RunSwitch": (lo + hi) / 2,
            "WalkLength": u.AnimationLibrary.get_sequence_length(ASSETS.load_asset(WALK)),
            "JogLength": u.AnimationLibrary.get_sequence_length(ASSETS.load_asset(JOG))}
    report["speeds"] = {"walkClip": round(walk_speed, 2), "jogClip": round(jog_speed, 2), "webRunBlend": [lo, hi],
                        "runSwitch": gait["RunSwitch"],
                        "footIkOffset": {p.rsplit('/', 1)[1]: round(foot_ik_offset(ASSETS.load_asset(p)), 2)
                                         for p in (IDLE, WALK, JOG)}}
    log(f"clip ground speeds walk {walk_speed:.1f}, jog {jog_speed:.1f} cm/s; run clip above {gait['RunSwitch']} cm/s")
    return gait


# 5. BP_LundenAvatar ---------------------------------------------------------------------------------------------------

def mesh_height():
    bounds = ASSETS.load_asset(MESH).get_bounds()
    return bounds.origin.z + bounds.box_extent.z


def components(bp, tree):
    """SCS components {name: (class, parent name or None)} in order; returns their templates by name."""
    subsystem = u.get_engine_subsystem(u.SubobjectDataSubsystem)
    lib = u.SubobjectDataBlueprintFunctionLibrary
    handles = subsystem.k2_gather_subobject_data_for_blueprint(bp)
    by_name = {}
    for handle in handles:
        data = subsystem.k2_find_subobject_data_from_handle(handle)
        if data is not None:
            by_name[str(lib.get_variable_name(data))] = handle
    root = by_name.get("DefaultSceneRoot", handles[0])
    templates = {}
    for name, (cls, parent) in tree.items():
        handle = by_name.get(name)
        if handle is None:
            params = u.AddNewSubobjectParams(parent_handle=by_name[parent] if parent else root, new_class=cls,
                                             blueprint_context=bp)
            handle, reason = subsystem.add_new_subobject(params)
            if not lib.is_handle_valid(handle):
                raise RuntimeError(f"Could not add {name} to {bp.get_name()}: {reason}")
            if not subsystem.rename_subobject(handle, u.Text(name)):
                raise RuntimeError(f"Could not name the component {name}")
            by_name[name] = handle
        templates[name] = lib.get_object(subsystem.k2_find_subobject_data_from_handle(handle))
    return templates, by_name, root


def extensions(bp, rows, by_name, root):
    subsystem = u.get_engine_subsystem(u.SubobjectDataSubsystem)
    lib = u.SubobjectDataBlueprintFunctionLibrary
    previous = json.loads(ASSETS.get_metadata_tag(bp, EXT_TAG) or "[]")
    for name in previous:
        if name in by_name and name not in {r["name"] for r in rows}:
            subsystem.delete_subobject(root, by_name[name], bp)
            log(f"extension removed {name}")
    for row in rows:
        if row["name"] in by_name:
            continue
        cls = u.load_class(None, row["class"])
        if not cls:
            raise RuntimeError(f"avatar-extensions.json: cannot load {row['class']} ({row['owner']})")
        handle, reason = subsystem.add_new_subobject(u.AddNewSubobjectParams(parent_handle=root, new_class=cls, blueprint_context=bp))
        if not lib.is_handle_valid(handle) or not subsystem.rename_subobject(handle, u.Text(row["name"])):
            raise RuntimeError(f"Could not add the extension {row['name']}: {reason}")
        log(f"extension added {row['name']} ({row['class']}, {row['owner']})")
    ASSETS.set_metadata_tag(bp, EXT_TAG, json.dumps([r["name"] for r in rows]))


def load_rows():
    data = json.loads(EXTENSIONS_FILE.read_text(encoding="utf-8"))
    if data.get("formatVersion") != 1:
        raise RuntimeError(f"{EXTENSIONS_FILE}: formatVersion {data.get('formatVersion')} is not 1")
    names = set()
    for row in data["components"]:
        missing = {"name", "class", "owner", "what"} - row.keys()
        if missing or row["name"] in names or row["name"] in ("Body", "HitZones"):
            raise RuntimeError(f"{EXTENSIONS_FILE}: bad row {row} (missing {sorted(missing)} or a duplicate/reserved name)")
        names.add(row["name"])
    return data["components"]


BP_VARS = {
    "Speed": REAL, "Crouch": REAL, "Airborne": BOOL, "Pose": INT, "Sitting": BOOL, "Moving": BOOL,
    "MeshPelvisOffset": VECTOR, "MeshSpineLean": ROTATOR,
    "LookCode": STRING, "HeightScale": REAL, "WidthScale": REAL,
    # From avatar-contract.json (written by the builder, never by hand):
    "MoveThreshold": REAL, "HipY": REAL, "HipDrop": REAL, "HipForward": REAL, "CrouchLeanDeg": REAL,
    "SitHip": VECTOR, "SitLeanDeg": REAL, "LieHip": VECTOR, "LieLeanDeg": REAL,
    "MeshDropPerCrouch": VECTOR, "MeshLeanPerCrouch": REAL,
}
BP_FUNCTIONS = ("SetMotion", "UpdateHitZones")


def zone_values(contract, scale):
    head, cm = contract["head"], 100.0
    hip = head["hipY"]
    boxes = []
    for b in head["boxes"]:
        boxes.append({"location": u.Vector((b["back"] + b["front"]) / 2 * cm, 0, ((b["low"] + b["high"]) / 2 - hip) * cm),
                      "extent": u.Vector((b["front"] - b["back"]) / 2 * cm, b["halfWidth"] * cm, (b["high"] - b["low"]) / 2 * cm)})
    body = contract["body"]
    sit, lie = contract["poses"]["sit"], contract["poses"]["lie"]
    return {
        "boxes": boxes,
        "body": {"z": ((body["low"] + body["high"]) / 2 - hip) * cm, "radius": body["radius"] * cm,
                 "half": (body["high"] - body["low"]) / 2 * cm + body["radius"] * cm},
        "vars": {
            "HeightScale": 1.0, "WidthScale": 1.0, "Pose": 0,
            "MoveThreshold": contract["motion"]["legsWalkAbove"] * cm,
            "HipY": hip * cm, "HipDrop": head["hipDrop"] * cm, "HipForward": head["hipForward"] * cm,
            "CrouchLeanDeg": math.degrees(head["crouchLean"]),
            "SitHip": u.Vector(sit["hipZ"] * cm, 0, sit["hipY"] * cm), "SitLeanDeg": math.degrees(sit["lean"]),
            "LieHip": u.Vector(lie["hipZ"] * cm, 0, lie["hipY"] * cm), "LieLeanDeg": math.degrees(lie["lean"]),
            # The mesh is scaled by `scale` and turned so its +Y faces the actor's +X: the crouch moves the pelvis along
            # mesh +Y (forward) and -Z, in mesh units, and leans the spine about mesh X (roll > 0 leans forward; test_avatar_rig.py checks it).
            "MeshDropPerCrouch": u.Vector(0, head["hipForward"] * cm / scale, -head["hipDrop"] * cm / scale),
            "MeshLeanPerCrouch": -math.degrees(head["crouchLean"]),
        },
    }


def avatar_blueprint(contract, rows):
    if ASSETS.does_asset_exist(BP_PATH):
        bp = ASSETS.load_asset(BP_PATH)
    else:
        factory = u.BlueprintFactory()
        factory.set_editor_property("parent_class", u.Actor)
        bp = TOOLS.create_asset("BP_LundenAvatar", RIG, u.Blueprint, factory)
    remove_functions(bp, BP_FUNCTIONS)
    variables(bp, BP_VARS)
    tree = {
        "Body": (u.SkeletalMeshComponent, None),
        "HitZones": (u.SceneComponent, None),
        "HeadPivot": (u.SceneComponent, "HitZones"),
        "HeadLower": (u.BoxComponent, "HeadPivot"),
        "HeadMiddle": (u.BoxComponent, "HeadPivot"),
        "HeadTop": (u.BoxComponent, "HeadPivot"),
        "BodyPivot": (u.SceneComponent, "HitZones"),
        "BodyZone": (u.CapsuleComponent, "BodyPivot"),
    }
    templates, by_name, root = components(bp, tree)
    extensions(bp, rows, by_name, root)
    BP.compile_blueprint(bp)
    return bp, templates


def configure_components(bp, templates, contract, scale):
    zones = zone_values(contract, scale)
    hip = zones["vars"]["HipY"]
    body = templates["Body"]
    body.set_editor_property("skeletal_mesh_asset", ASSETS.load_asset(MESH))
    body.set_editor_property("relative_rotation", u.Rotator(0, 0, -90))
    body.set_editor_property("relative_scale3d", u.Vector(scale, scale, scale))
    body.set_editor_property("anim_class", u.load_class(None, class_path(ABP_PATH)))
    body.set_editor_property("animation_mode", u.AnimationMode.ANIMATION_BLUEPRINT)
    # Other players are few: keep their pose updated off screen too (tests and the mirror's capture need it).
    body.set_editor_property("visibility_based_anim_tick_option",
                             u.VisibilityBasedAnimTickOption.ALWAYS_TICK_POSE_AND_REFRESH_BONES)
    body.set_collision_profile_name("NoCollision")
    templates["HeadPivot"].set_editor_property("relative_location", u.Vector(0, 0, hip))
    templates["BodyPivot"].set_editor_property("relative_location", u.Vector(0, 0, hip))
    for i, name in enumerate(("HeadLower", "HeadMiddle", "HeadTop")):
        box = templates[name]
        box.set_editor_property("relative_location", zones["boxes"][i]["location"])
        box.set_editor_property("box_extent", zones["boxes"][i]["extent"])
        box.set_collision_profile_name("OverlapAllDynamic")
        box.set_editor_property("component_tags", ["hit:head", f"hit:head:{i}"])
        box.set_editor_property("hidden_in_game", True)
    cap = templates["BodyZone"]
    cap.set_editor_property("relative_location", u.Vector(0, 0, zones["body"]["z"]))
    cap.set_editor_property("capsule_radius", zones["body"]["radius"])
    cap.set_editor_property("capsule_half_height", zones["body"]["half"])
    cap.set_collision_profile_name("OverlapAllDynamic")
    cap.set_editor_property("component_tags", ["hit:body"])
    cap.set_editor_property("hidden_in_game", True)
    BP.compile_blueprint(bp)
    default = u.get_default_object(bp.generated_class())
    for name, v in zones["vars"].items():
        default.set_editor_property(name, v)
    return zones


def set_motion_graph(bp):
    g, p = function(bp, "SetMotion", [("InSpeed", REAL), ("InCrouch", REAL), ("InAirborne", BOOL), ("InPose", INT)])
    sets = []
    for var, param in (("Speed", "InSpeed"), ("Crouch", "InCrouch"), ("Airborne", "InAirborne"), ("Pose", "InPose")):
        s = g.set(var, "", y=0)
        link(p[param], inp(s, var))
        sets.append(s)
    sitting = g.set("Sitting", y=0)
    gt = g.call("KismetMathLibrary:Greater_IntInt", g.x - 280, 250)
    link(p["InPose"], inp(gt, "A"))
    value(gt, "B", 0)
    link(out(gt, "ReturnValue"), inp(sitting, "Sitting"))
    moving = g.set("Moving")
    faster = g.call("KismetMathLibrary:Greater_DoubleDouble", g.x - 280, 250)
    link(p["InSpeed"], inp(faster, "A"))
    link(out(g.get("MoveThreshold", x=g.x - 560, y=400), "MoveThreshold"), inp(faster, "B"))
    link(out(faster, "ReturnValue"), inp(moving, "Moving"))
    pelvis = g.set("MeshPelvisOffset")
    mul = g.call("KismetMathLibrary:Multiply_VectorFloat", g.x - 280, 250)
    link(out(g.get("MeshDropPerCrouch", x=g.x - 560, y=400), "MeshDropPerCrouch"), inp(mul, "A"))
    link(p["InCrouch"], inp(mul, "B"))
    link(out(mul, "ReturnValue"), inp(pelvis, "MeshPelvisOffset"))
    lean = g.set("MeshSpineLean")
    roll = g.call("KismetMathLibrary:Multiply_DoubleDouble", g.x - 560, 250)
    link(out(g.get("MeshLeanPerCrouch", x=g.x - 840, y=400), "MeshLeanPerCrouch"), inp(roll, "A"))
    link(p["InCrouch"], inp(roll, "B"))
    rot = g.call("KismetMathLibrary:MakeRotator", g.x - 280, 250)
    link(out(roll, "ReturnValue"), inp(rot, "Roll"))
    link(out(rot, "ReturnValue"), inp(lean, "MeshSpineLean"))
    update = g.call(class_path(BP_PATH).replace(".BP_LundenAvatar_C", ".BP_LundenAvatar_C:UpdateHitZones"))
    chain(g.g.find_graph_entry_pin(), sets + [sitting, moving, pelvis, lean, update])


def update_zones_graph(bp):
    g, _ = function(bp, "UpdateHitZones", [])
    M = "KismetMathLibrary:"

    def get(name, y=600):
        return out(g.get(name, x=g.x, y=y), name)

    def call(name, a=None, b=None, y=300, **pins_):
        node = g.call(M + name, y=y)
        for pin, src in (("A", a), ("B", b), *pins_.items()):
            if src is not None:
                link(src, inp(node, pin)) if not isinstance(src, (int, float)) else value(node, pin, src)
        return out(node, "ReturnValue")

    crouch, pose = get("Crouch"), get("Pose")
    stand_lean = call("Multiply_DoubleDouble", get("CrouchLeanDeg"), crouch)
    forward = call("Multiply_DoubleDouble", get("HipForward"), crouch)
    drop = call("Multiply_DoubleDouble", get("HipDrop"), crouch)
    height = call("Subtract_DoubleDouble", get("HipY"), drop)
    stand_hip = g.call(M + "MakeVector", y=300)
    link(forward, inp(stand_hip, "X"))
    link(height, inp(stand_hip, "Z"))
    stand_hip = out(stand_hip, "ReturnValue")
    body_hip = g.call(M + "MakeVector", y=500)
    link(get("HipY"), inp(body_hip, "Z"))
    body_hip = out(body_hip, "ReturnValue")
    lying = call("EqualEqual_IntInt", pose, 2)
    rest_hip = call("SelectVector", get("LieHip"), get("SitHip"), bPickA=lying)
    rest_lean = call("SelectFloat", get("LieLeanDeg"), get("SitLeanDeg"), bPickA=lying)
    sitting = get("Sitting")
    hip = call("SelectVector", rest_hip, stand_hip, bPickA=sitting)
    lean = call("SelectFloat", rest_lean, stand_lean, bPickA=sitting)
    bhip = call("SelectVector", rest_hip, body_hip, bPickA=sitting)
    blean = call("SelectFloat", rest_lean, 0.0, bPickA=sitting)
    nodes = []
    for comp, loc, pitch in (("HeadPivot", hip, lean), ("BodyPivot", bhip, blean)):
        rot = g.call(M + "MakeRotator", y=300)
        link(pitch, inp(rot, "Pitch"))
        setter = g.call("SceneComponent:K2_SetRelativeLocationAndRotation", y=0)
        link(get(comp, y=-200), inp(setter, "self"))
        link(loc, inp(setter, "NewLocation"))
        link(out(rot, "ReturnValue"), inp(setter, "NewRotation"))
        nodes.append(setter)
    scale = g.call(M + "MakeVector", y=300)
    link(get("WidthScale"), inp(scale, "X"))
    link(get("WidthScale"), inp(scale, "Y"))
    link(get("HeightScale"), inp(scale, "Z"))
    setter = g.call("SceneComponent:SetRelativeScale3D", y=0)
    link(get("HitZones", y=-200), inp(setter, "self"))
    link(out(scale, "ReturnValue"), inp(setter, "NewScale3D"))
    nodes.append(setter)
    chain(g.g.find_graph_entry_pin(), nodes)


# 6. ABP_LundenAvatar --------------------------------------------------------------------------------------------------

ABP_VARS = {"Speed": REAL, "Moving": BOOL, "Running": BOOL, "WalkTime": REAL, "JogTime": REAL,
            "WalkNatural": REAL, "JogNatural": REAL, "WalkLength": REAL, "JogLength": REAL, "RunSwitch": REAL, "Airborne": BOOL, "Sitting": BOOL, "PelvisOffset": VECTOR, "SpineLean": ROTATOR}


def anim_node(graph, name, x, y, **props):
    node = graph.named(name, x, y)
    if props:
        data = node.get_editor_property("node")
        for key, v in props.items():
            data.set_editor_property(key, v)
        node.set_editor_property("node", data)
    return node


def bone(name):
    ref = u.BoneReference()
    ref.set_editor_property("bone_name", name)
    return ref


def anim_blueprint():
    if ASSETS.does_asset_exist(ABP_PATH):
        abp = ASSETS.load_asset(ABP_PATH)
    else:
        factory = u.AnimBlueprintFactory()
        factory.set_editor_property("target_skeleton", ASSETS.load_asset(SKELETON))
        factory.set_editor_property("parent_class", u.AnimInstance)
        factory.set_editor_property("preview_skeletal_mesh", ASSETS.load_asset(MESH))
        folder, name = ABP_PATH.rsplit("/", 1)
        abp = TOOLS.create_asset(name, folder, u.AnimBlueprint, factory)
    variables(abp, ABP_VARS)
    BP.compile_blueprint(abp)
    return abp


def abp_event_graph(abp):
    ed = GRAPH.get_graph_editor_by_name(abp, "EventGraph")
    ed.remove_nodes([n for n in ed.list_all_nodes()])
    g = Graph(ed)
    names = [str(n) for n in ed.list_available_nodes([])]
    found = [n for n in names if n.replace(" ", "").endswith("EventBlueprintUpdateAnimation")]
    if not found:
        raise RuntimeError("No Event Blueprint Update Animation action: " + str([n for n in names if "Update" in n][:20]))
    event = g.named(found[0], 0, 0)
    owner = g.call("AnimInstance:GetOwningActor", 250, 200)
    cast = g.named("Utilities|Casting|CastToActor", 500, 0)  # retargeted to BP_LundenAvatar (as build_save.py does)
    if not ed.retarget_node_class(cast, u.Actor.static_class(), u.load_class(None, class_path(BP_PATH))):
        raise RuntimeError("Could not make a cast to BP_LundenAvatar")
    link(out(owner, "ReturnValue"), inp(cast, "Object"))
    typed = [p for p in BP.list_output_pins(cast) if str(p.get_pin_name()).startswith("As")][0]
    sets = []
    sources = {"Speed": "Speed", "Moving": "Moving", "Airborne": "Airborne", "Sitting": "Sitting",
               "PelvisOffset": "MeshPelvisOffset", "SpineLean": "MeshSpineLean"}
    for i, (mine, theirs) in enumerate(sources.items()):
        getter = g.get(theirs, class_path(BP_PATH), x=800 + i * 280, y=250)
        link(typed, inp(getter, "self"))
        s = g.set(mine, x=800 + i * 280, y=0)
        link(out(getter, theirs), inp(s, mine))
        sets.append(s)
    # WalkTime = (WalkTime + DeltaTimeX * Speed / WalkNatural) % WalkLength, the same for JogTime;
    # Running = Speed > RunSwitch
    x = 800 + len(sources) * 280
    dt = out(event, "DeltaTimeX")
    M = "KismetMathLibrary:"
    for name, natural, length in (("WalkTime", "WalkNatural", "WalkLength"), ("JogTime", "JogNatural", "JogLength")):
        div = g.call(M + "Divide_DoubleDouble", x, 300)
        link(out(g.get("Speed", x=x, y=500), "Speed"), inp(div, "A"))
        link(out(g.get(natural, x=x, y=600), natural), inp(div, "B"))
        step = g.call(M + "Multiply_DoubleDouble", x + 140, 300)
        link(out(div, "ReturnValue"), inp(step, "A"))
        link(dt, inp(step, "B"))
        add = g.call(M + "Add_DoubleDouble", x + 280, 300)
        link(out(g.get(name, x=x + 140, y=500), name), inp(add, "A"))
        link(out(step, "ReturnValue"), inp(add, "B"))
        wrap = g.call(M + "Percent_FloatFloat", x + 420, 300)
        link(out(add, "ReturnValue"), inp(wrap, "A"))
        link(out(g.get(length, x=x + 280, y=600), length), inp(wrap, "B"))
        s = g.set(name, x=x + 420, y=0)
        link(out(wrap, "ReturnValue"), inp(s, name))
        sets.append(s)
        x += 700
    gt = g.call("KismetMathLibrary:Greater_DoubleDouble", x, 250)
    link(out(g.get("Speed", x=x - 140, y=450), "Speed"), inp(gt, "A"))
    link(out(g.get("RunSwitch", x=x - 140, y=550), "RunSwitch"), inp(gt, "B"))
    s = g.set("Running", x=x, y=0)
    link(out(gt, "ReturnValue"), inp(s, "Running"))
    sets.append(s)
    link(exec_out(event), inp(cast, "execute"))
    chain(exec_out(cast), sets)


def abp_anim_graph(abp):
    ed = GRAPH.get_graph_editor_by_name(abp, "AnimGraph")
    for n in ed.list_all_nodes():
        if n.get_class().get_name() != "AnimGraphNode_Root":
            ed.remove_nodes([n])
    root = [n for n in ed.list_all_nodes() if n.get_class().get_name() == "AnimGraphNode_Root"][0]
    g = Graph(ed)

    def var(name, x, y):
        return out(g.get(name, x=x, y=y), name)

    idle = anim_node(g, "Animation|Sequences|SequencePlayer", -2400, 0, sequence=ASSETS.load_asset(IDLE), loop_animation=True)
    # The walk and jog clips run on explicit clocks (WalkTime, JogTime) that the event graph advances by
    # DeltaTime * Speed / the clip's own ground speed: the planted feet then keep the ground speed at any pace.
    walk = anim_node(g, "Animation|Sequences|SequenceEvaluator", -2700, 300, sequence=ASSETS.load_asset(WALK))
    jog = anim_node(g, "Animation|Sequences|SequenceEvaluator", -2700, 600, sequence=ASSETS.load_asset(JOG))
    link(var("WalkTime", -3000, 400), inp(walk, "ExplicitTime"))
    link(var("JogTime", -3000, 700), inp(jog, "ExplicitTime"))
    gait = anim_node(g, "Animation|Blends|BlendPosesbybool", -2400, 300)
    link(out(jog, "Pose"), inp(gait, "BlendPose_0"))
    link(out(walk, "Pose"), inp(gait, "BlendPose_1"))
    link(var("Running", -2700, 900), inp(gait, "bActiveValue"))
    value(gait, "BlendTime_0", 0.3)
    value(gait, "BlendTime_1", 0.3)
    moving = anim_node(g, "Animation|Blends|BlendPosesbybool", -2100, 100)
    link(out(gait, "Pose"), inp(moving, "BlendPose_0"))
    link(out(idle, "Pose"), inp(moving, "BlendPose_1"))
    link(var("Moving", -2400, 600), inp(moving, "bActiveValue"))
    value(moving, "BlendTime_0", 0.2)
    value(moving, "BlendTime_1", 0.25)
    to_cs = g.named("Animation|ConvertSpaces|LocalToComponent", -1800, 100)
    link(out(moving, "Pose"), inp(to_cs, "LocalPose"))
    pelvis = anim_node(g, "Animation|SkeletalControls|Transform(Modify)Bone", -1500, 100, bone_to_modify=bone("pelvis"),
                       translation_mode=u.BoneModificationMode.BMM_ADDITIVE,
                       translation_space=u.BoneControlSpace.BCS_COMPONENT_SPACE,
                       rotation_mode=u.BoneModificationMode.BMM_IGNORE, scale_mode=u.BoneModificationMode.BMM_IGNORE)
    link(out(to_cs, "ComponentPose"), inp(pelvis, "ComponentPose"))
    link(var("PelvisOffset", -1800, 400), inp(pelvis, "Translation"))
    spine = anim_node(g, "Animation|SkeletalControls|Transform(Modify)Bone", -1200, 100, bone_to_modify=bone("spine_01"),
                      rotation_mode=u.BoneModificationMode.BMM_ADDITIVE,
                      rotation_space=u.BoneControlSpace.BCS_COMPONENT_SPACE,
                      translation_mode=u.BoneModificationMode.BMM_IGNORE, scale_mode=u.BoneModificationMode.BMM_IGNORE)
    link(out(pelvis, "Pose"), inp(spine, "ComponentPose"))
    link(var("SpineLean", -1500, 400), inp(spine, "Rotation"))
    last = spine
    for i, (foot, pole) in enumerate(KNEE_POLES.items()):
        target = u.BoneSocketTarget()
        target.set_editor_property("bone_reference", bone("ik_" + foot))
        ik = anim_node(g, "Animation|SkeletalControls|TwoBoneIK", -900 + i * 300, 100, ik_bone=bone(foot),
                       effector_location_space=u.BoneControlSpace.BCS_BONE_SPACE, effector_target=target,
                       joint_target_location_space=u.BoneControlSpace.BCS_COMPONENT_SPACE, allow_stretching=False)
        link(out(last, "Pose"), inp(ik, "ComponentPose"))
        value(ik, "JointTargetLocation", "(X=%.1f,Y=%.1f,Z=%.1f)" % pole)
        last = ik
    to_ls = g.named("Animation|ConvertSpaces|ComponentToLocal", -300, 100)
    link(out(last, "Pose"), inp(to_ls, "ComponentPose"))
    jump = anim_node(g, "Animation|Sequences|SequencePlayer", -300, 400, sequence=ASSETS.load_asset(JUMP), loop_animation=False)
    air = anim_node(g, "Animation|Blends|BlendPosesbybool", 0, 100)
    link(out(jump, "Pose"), inp(air, "BlendPose_0"))
    link(out(to_ls, "Pose"), inp(air, "BlendPose_1"))
    link(var("Airborne", -300, 700), inp(air, "bActiveValue"))
    value(air, "BlendTime_0", 0.1)
    value(air, "BlendTime_1", 0.15)
    data = air.get_editor_property("node")
    data.set_editor_property("child_upate_mode", u.BlendListChildUpdateMode.RESET_CHILD_ON_ACTIVATE)  # the jump restarts
    air.set_editor_property("node", data)
    sit = anim_node(g, "Animation|Sequences|SequencePlayer", 0, 400, sequence=ASSETS.load_asset(SIT), loop_animation=True)
    seated = anim_node(g, "Animation|Blends|BlendPosesbybool", 300, 100)
    link(out(sit, "Pose"), inp(seated, "BlendPose_0"))
    link(out(air, "Pose"), inp(seated, "BlendPose_1"))
    link(var("Sitting", 0, 700), inp(seated, "bActiveValue"))
    value(seated, "BlendTime_0", 0.3)
    value(seated, "BlendTime_1", 0.3)
    link(out(seated, "Pose"), inp(root, "Result"))


# Main -----------------------------------------------------------------------------------------------------------------

def spec_hash(contract_text, rows_text, glb_hash):
    h = hashlib.sha256()
    # line endings normalised, so a CRLF (autocrlf) checkout hashes the script like LF (#2309)
    for part in (Path(__file__).read_bytes().replace(b"\r\n", b"\n"), contract_text.encode(), rows_text.encode(), glb_hash.encode(),
                 u.SystemLibrary.get_engine_version().encode()):
        h.update(hashlib.sha256(part).digest())
    return h.hexdigest()


def all_assets():
    return list(MANNEQUIN.values()) + [NEUTRAL, WEB_MESH, WEB_SIT, IK_WEB, IK_MANNY, RTG, SIT, ABP_PATH, BP_PATH]


def main(argv):
    force, check = "--force" in argv, "--check" in argv
    contract_text = CONTRACT_FILE.read_text(encoding="utf-8")
    rows_text = EXTENSIONS_FILE.read_text(encoding="utf-8")
    contract, rows = json.loads(contract_text), load_rows()
    glb_hash = hashlib.sha256(GLB.read_bytes()).hexdigest()
    spec = spec_hash(contract_text, rows_text, glb_hash)
    missing = [p for p in all_assets() if not ASSETS.does_asset_exist(p)]
    have = ASSETS.get_metadata_tag(ASSETS.load_asset(BP_PATH), SPEC_TAG) if not missing else None
    if check:
        if missing or have != spec:
            raise RuntimeError(f"avatar rig out of date: missing {missing}, spec {have} != {spec}")
        log(f"check ok ({len(all_assets())} assets, spec {spec[:12]})")
        u.log("LUNDEN_AVATAR_RIG_OK")
        return
    if not force and not missing and have == spec:
        log(f"unchanged, nothing saved (spec {spec[:12]})")
        u.log("LUNDEN_AVATAR_RIG_OK")
        return
    mannequin()
    web_source(glb_hash)
    retarget()
    clips()
    gait = gait_speeds(contract)
    scale = contract["motion"]["standardHeight"] * 100 / mesh_height()
    report["mesh"] = {"heightCm": round(mesh_height(), 2), "scale": round(scale, 5)}
    bp, templates = avatar_blueprint(contract, rows)
    abp = anim_blueprint()
    abp_event_graph(abp)
    abp_anim_graph(abp)
    compiled(abp, ["EventGraph", "AnimGraph"])
    abp_default = u.get_default_object(abp.generated_class())
    for name, v in gait.items():
        abp_default.set_editor_property(name, v)
    zones = configure_components(bp, templates, contract, scale)
    update_zones_graph(bp)
    BP.compile_blueprint(bp)
    set_motion_graph(bp)
    compiled(bp, list(BP_FUNCTIONS))
    ASSETS.set_metadata_tag(bp, SPEC_TAG, spec)
    save(ABP_PATH, BP_PATH)
    needs = closure(BP_PATH)
    # The skeleton's editor-only retarget source list still names the template's SKM_Quinn_Simple, which is not in
    # the project (no Python API edits that list); a path to a missing package is recorded, not followed.
    dangling = [p for p in needs if not ASSETS.does_asset_exist(p)]
    stray = [p for p in needs if p not in dangling and (not p.startswith("/Game/Lunden/Avatar/") or p.startswith(WEB))]
    if stray:  # the web rig is editor-only retarget input: nothing the game loads may reach it or the template
        raise RuntimeError(f"BP_LundenAvatar reaches {stray}")
    report["runtimeClosure"], report["danglingSoftPaths"] = [p for p in needs if p not in dangling], dangling
    report["zones"] = {"boxes": [{"location": [b["location"].x, b["location"].y, b["location"].z],
                                  "extent": [b["extent"].x, b["extent"].y, b["extent"].z]} for b in zones["boxes"]],
                       "body": zones["body"]}
    report["spec"] = spec
    report["assets"] = all_assets()
    (PROJECT / "Saved/avatar-rig-build.json").write_text(json.dumps(report, indent=1, default=str), encoding="utf-8")
    log(f"built {len(all_assets())} assets (spec {spec[:12]})")
    u.log("LUNDEN_AVATAR_RIG_OK")


main(sys.argv[1:])
