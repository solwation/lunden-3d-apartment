"""Build #2292's remote figures and snapshot receiver. Run before build_network.py.
run-python.ps1 tools/unreal-engine/python/build_network_peers.py [--check | --force]
Only /Game/Lunden/Network/BP_LundenPeer and BPC_LundenNetworkPeers are written.
"""
import hashlib
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parent))
import player_parts as pp

ASSETS, BP = u.EditorAssetLibrary, u.BlueprintEditorLibrary
ROOT = "/Game/Lunden/Network"
PEER = ROOT + "/BP_LundenPeer"
RECEIVER = ROOT + "/BPC_LundenNetworkPeers"
RIG = "/Game/Lunden/Avatar/Rig/BP_LundenAvatar"
LOOK = "/Game/Lunden/Avatar/Looks/BPC_LundenLook"
S, A, MAP = "KismetStringLibrary:", "KismetArrayLibrary:", "BlueprintMapLibrary:"
INTERVAL = 0.2  # the web publishes five positions per second
TAG_Z_CM = 198.0  # src/config.js GHOST.tagY (metres)
PLAIN_LOOK = "012340100"  # #2291's plain look when a player sends no appearance
STRINGS = pp.array(pp.STRING)
TAG = "Lunden.NetworkPeerBuild"


def ref(path):
    return u.load_class(None, pp.class_path(path))


def string_eq(g, left, right):
    return g.pure(S + "EqualEqual_StrStr", A=left, B=right)


def split(g, text, delimiter):
    return g.pure(S + "ParseIntoArray", SourceString=text, Delimiter=delimiter, CullEmptyStrings=False)


def local_value(g, name, kind, source):
    if not g.g.add_local_variable(name, kind, ""):
        raise RuntimeError("Could not add local " + name)
    setter = g.at(g.g.add_set_local_variable_node(name))
    g.step(setter)
    pp.feed(setter, name, source)
    return pp.out(g.at(g.g.add_get_local_variable_node(name)), name)


def new_figure():
    if ASSETS.does_asset_exist(PEER):
        return pp.fresh_component(PEER, ("ApplyState", "MoveTo", "Advance", "ShowName", "Dress", "Motion"))
    factory = u.BlueprintFactory()
    factory.set_editor_property("parent_class", u.Actor)
    bp = u.AssetToolsHelpers.get_asset_tools().create_asset("BP_LundenPeer", ROOT, u.Blueprint, factory)
    if not bp:
        raise RuntimeError("Could not create " + PEER)
    return bp


def visual_components(bp, rig):
    sub = u.get_engine_subsystem(u.SubobjectDataSubsystem)
    lib = u.SubobjectDataBlueprintFunctionLibrary
    handles = sub.k2_gather_subobject_data_for_blueprint(bp)
    existing = {str(lib.get_variable_name(sub.k2_find_subobject_data_from_handle(h))): h for h in handles}
    root = existing.get("DefaultSceneRoot", handles[0])

    def component(name, cls):
        handle = existing.get(name)
        if handle is None:
            handle, reason = sub.add_new_subobject(u.AddNewSubobjectParams(parent_handle=root, new_class=cls, blueprint_context=bp))
            if not lib.is_handle_valid(handle) or not sub.rename_subobject(handle, u.Text(name)):
                raise RuntimeError(f"Could not add {name} to {PEER}: {reason}")
        return lib.get_object(sub.k2_find_subobject_data_from_handle(handle))

    child = component("Figure", u.ChildActorComponent)
    child.set_editor_property("child_actor_class", rig)
    proxy = component("FallbackFigure", u.StaticMeshComponent)
    proxy.set_editor_property("static_mesh", None if rig else ASSETS.load_asset("/Engine/BasicShapes/Cylinder"))
    proxy.set_editor_property("relative_scale3d", u.Vector(.4, .4, 1.75))
    proxy.set_editor_property("relative_location", u.Vector(0, 0, 87.5))
    proxy.set_collision_enabled(u.CollisionEnabled.NO_COLLISION)
    tag = component("NameTag", u.TextRenderComponent)
    tag.set_editor_property("relative_location", u.Vector(0, 0, TAG_Z_CM))
    tag.set_editor_property("horizontal_alignment", u.HorizTextAligment.EHTA_CENTER)
    tag.set_editor_property("world_size", 16.0)
    tag.set_editor_property("text", u.Text(""))


def child_actor(g, rig):
    actor = g.get("ChildActor", "/Script/Engine.ChildActorComponent", g.get("Figure"))
    return g.cast(actor, ["CastToActor", "Cast To Actor"], u.Actor.static_class(), rig)


def figure_graphs(bp, rig, look):
    pp.variables(bp, {
        "PeerId": pp.STRING, "DisplayName": pp.STRING, "ShownLabel": pp.STRING, "Appearance": pp.STRING, "Away": pp.BOOL,
        "Crouch": pp.BOOL, "Pose": pp.INT, "ViewPitch": pp.REAL, "HeadYaw": pp.REAL,
        "HasTarget": pp.BOOL, "StartFeet": pp.VEC, "TargetFeet": pp.VEC, "StartTurn": pp.ROT,
        "TargetTurn": pp.ROT, "Progress": pp.REAL, "SpeedCm": pp.REAL,
    })
    own = pp.class_path(PEER) + ":"
    g, p = pp.function(bp, "ShowName", [("Encoded", pp.STRING)])
    text = p["Encoded"]
    for key, char in (("%22", '"'), ("%27", "'"), ("%5C", "\\"), ("%25", "%")):
        text = g.pure(S + "Replace", SourceString=text, From=key, To=char, SearchCase="CaseSensitive")
    g.set("DisplayName", g.op("SelectString", A="Anonym", B=text, bPickA=string_eq(g,text,"")))
    name = g.get("DisplayName")
    away_name = g.pure(S + "Concat_StrStr", A=name, B=" (borta)")
    label = g.op("SelectString", A=away_name, B=name, bPickA=g.get("Away"))
    g.branch(g.op("Not_PreBool", A=string_eq(g, label, g.get("ShownLabel"))))
    g.set("ShownLabel", label)
    g.run("TextRenderComponent:K2_SetText", g.get("NameTag"), Value=g.pure("KismetTextLibrary:Conv_StringToText", InString=label))

    g, p = pp.function(bp, "Dress", [("Code", pp.STRING)])
    code = g.op("SelectString", A=PLAIN_LOOK, B=p["Code"], bPickA=string_eq(g,p["Code"],""))
    g.branch(g.op("Not_PreBool", A=string_eq(g, g.get("Appearance"), code)))
    if rig and look:
        avatar = child_actor(g, rig)
        clothing = g.get("Look", pp.class_path(RIG), avatar)
        dressed = g.run(pp.class_path(LOOK) + ":ApplyLook", clothing, Code=code)
        g.branch(pp.out(dressed, "Applied"))
        # src/ghosts.js positions the tag 1.8 m higher per unit of additional height scale.
        height = g.get("HeightScale", pp.class_path(RIG), avatar)
        extra = g.op("Multiply_DoubleDouble", A=g.op("Subtract_DoubleDouble", A=height, B=1), B=180)
        position = g.op("MakeVector", Z=g.op("Add_DoubleDouble", A=extra, B=TAG_Z_CM))
        g.run("SceneComponent:K2_SetRelativeLocation", g.get("NameTag"), NewLocation=position, bSweep=False, bTeleport=True)
    g.set("Appearance", code)

    g, _ = pp.function(bp, "Motion")
    if rig:
        avatar = child_actor(g, rig)
        g.run("Actor:SetActorEnableCollision", avatar, bNewActorEnableCollision=False)
        g.run(pp.class_path(RIG) + ":SetMotion", avatar, InSpeed=g.get("SpeedCm"),
              InCrouch=g.op("SelectFloat", A=1, B=0, bPickA=g.get("Crouch")), InAirborne=False, InPose=g.get("Pose"))

    g, p = pp.function(bp, "MoveTo", [("Feet", pp.VEC), ("Turn", pp.ROT)])
    # Same position on heartbeat/name/away updates must not restart an in-flight interpolation.
    same = g.op("BooleanAND", A=g.op("EqualEqual_VectorVector", A=g.get("TargetFeet"), B=p["Feet"], ErrorTolerance=.001),
                B=g.op("EqualEqual_RotatorRotator", A=g.get("TargetTurn"), B=p["Turn"], ErrorTolerance=.001))
    g.branch(g.op("Not_PreBool", A=g.op("BooleanAND", A=g.get("HasTarget"), B=same)))
    g.set("StartFeet", g.pure("Actor:K2_GetActorLocation"))
    g.set("StartTurn", g.pure("Actor:K2_GetActorRotation"))
    g.set("TargetFeet", p["Feet"])
    g.set("TargetTurn", p["Turn"])
    new = g.branch(g.get("HasTarget"))
    distance = g.op("VSizeXY", A=g.op("Subtract_VectorVector", A=p["Feet"], B=g.get("StartFeet")))
    g.set("SpeedCm", g.op("Divide_DoubleDouble", A=distance, B=INTERVAL))
    g.set("Progress", 0)
    first = g.fork(new, 500)
    first.set("HasTarget", True)
    first.set("Progress", 1)
    first.run("Actor:K2_SetActorLocationAndRotation", NewLocation=p["Feet"], NewRotation=p["Turn"], bSweep=False, bTeleport=True)

    g, p = pp.function(bp, "Advance", [("Seconds", pp.REAL)])
    g.branch(g.op("BooleanAND", A=g.get("HasTarget"), B=g.op("Less_DoubleDouble", A=g.get("Progress"), B=1)))
    elapsed = g.op("Add_DoubleDouble", A=g.get("Progress"), B=g.op("Divide_DoubleDouble", A=p["Seconds"], B=INTERVAL))
    g.set("Progress", g.op("FClamp", Value=elapsed, Min=0, Max=1))
    alpha = g.get("Progress")
    feet = g.op("VLerp", A=g.get("StartFeet"), B=g.get("TargetFeet"), Alpha=alpha)
    turn = g.op("RLerp", A=g.get("StartTurn"), B=g.get("TargetTurn"), Alpha=alpha, bShortestPath=True)
    g.run("Actor:K2_SetActorLocationAndRotation", NewLocation=feet, NewRotation=turn, bSweep=False, bTeleport=True)
    g.branch(g.op("GreaterEqual_DoubleDouble", A=alpha, B=1))
    g.set("SpeedCm", 0)
    g.run(own + "Motion")

    g, p = pp.function(bp, "ApplyState", [("Fields", STRINGS)])
    fields = p["Fields"]
    field = lambda i: g.item(fields, i)
    number = lambda i: g.pure(S + "Conv_StringToDouble", InString=field(i))
    g.set("PeerId", field(0))
    g.set("Away", string_eq(g, field(9), "1"))
    g.set("Crouch", string_eq(g, field(8), "1"))
    g.set("Pose", g.pure(S + "Conv_StringToInt", InString=field(10)))
    g.set("ViewPitch", number(7))
    g.set("HeadYaw", number(11))
    g.run(own + "ShowName", Encoded=field(1))
    feet = g.op("MakeVector", X=number(3), Y=number(4), Z=number(5))
    g.run(own + "MoveTo", Feet=feet, Turn=g.op("MakeRotator", Yaw=number(6)))
    g.run(own + "Dress", Code=field(2))
    g.run(own + "Motion")

    g = pp.events(bp)
    tick = pp.event(g, bp, "AddEvent|EventTick", "ReceiveTick", 0)
    g.run(own + "Advance", Seconds=pp.out(tick, "DeltaSeconds"))
    camera = g.pure("GameplayStatics:GetPlayerCameraManager", PlayerIndex=0)
    g.branch(g.pure("KismetSystemLibrary:IsValid", Object=camera))
    label = g.get("NameTag")
    facing = g.op("FindLookAtRotation", Start=g.pure("SceneComponent:K2_GetComponentLocation",label),
                  Target=g.pure("PlayerCameraManager:GetCameraLocation",camera))
    g.run("SceneComponent:K2_SetWorldRotation", label, NewRotation=facing, bSweep=False, bTeleport=True)
    pp.compiled(bp)


def receiver_graphs(bp):
    peer_type = BP.get_object_reference_type(ref(PEER))
    pp.variables(bp, {"Peers": BP.get_map_type(pp.STRING, peer_type), "Seen": STRINGS, "SelfId": pp.STRING})
    own = pp.class_path(RECEIVER) + ":"
    g, p = pp.function(bp, "FindOrSpawnPeer", [("Id", pp.STRING)], [("Figure", peer_type)])
    found = g.node_of(MAP + "Map_Find", TargetMap=g.get("Peers"), Key=p["Id"])
    actor = pp.out(found, "Value")
    absent = g.branch(g.pure("KismetSystemLibrary:IsValid", Object=actor))
    g.ret(Figure=actor)
    new = g.fork(absent, 450)
    action = next((str(n) for n in new.g.list_available_nodes([])
                   if str(n).replace(" ", "").lower().endswith("spawnactorfromclass")), None)
    if not action:
        raise RuntimeError("Missing Spawn Actor from Class in the receiver graph")
    spawn = new.named(action)
    pp.feed(spawn, "Class", pp.class_path(PEER))
    pp.feed(spawn, "SpawnTransform", new.op("MakeTransform", Scale="1,1,1"))
    pp.feed(spawn, "CollisionHandlingOverride", "AlwaysSpawn")
    new.step(spawn)
    made = pp.out(spawn, "ReturnValue")
    new.branch(new.pure("KismetSystemLibrary:IsValid", Object=made))
    new.run(MAP + "Map_Add", TargetMap=new.get("Peers"), Key=p["Id"], Value=made)
    new.ret(Figure=made)

    g, p = pp.function(bp, "ReadPeer", [("Fields", STRINGS)])
    fields = p["Fields"]
    g.branch(g.op("EqualEqual_IntInt", A=g.pure(A + "Array_Length", TargetArray=fields), B=12))
    key = g.item(fields, 0)
    g.branch(g.op("Not_PreBool", A=g.op("BooleanOR", A=string_eq(g,key,""), B=string_eq(g,key,g.get("SelfId")))))
    fig = pp.out(g.run(own + "FindOrSpawnPeer", Id=key), "Figure")
    g.branch(g.pure("KismetSystemLibrary:IsValid", Object=fig))
    g.run(pp.class_path(PEER) + ":ApplyState", fig, Fields=fields)
    g.run(A + "Array_AddUnique", TargetArray=g.get("Seen"), NewItem=key)

    g, _ = pp.function(bp, "RemoveMissing")
    keys = g.node_of(MAP + "Map_Keys", TargetMap=g.get("Peers"))
    # Map_Keys is pure. Copy the keys before mutating the map during iteration.
    old_ids = local_value(g, "OldIds", STRINGS, pp.out(keys, "Keys"))
    key, _, _ = g.loop(old_ids)
    g.branch(g.op("Not_PreBool", A=g.pure(A + "Array_Contains", TargetArray=g.get("Seen"), ItemToFind=key)))
    found = g.node_of(MAP + "Map_Find", TargetMap=g.get("Peers"), Key=key)
    figure = pp.out(found,"Value")
    invalid = g.branch(g.pure("KismetSystemLibrary:IsValid", Object=figure))
    g.run("Actor:K2_DestroyActor", figure)
    g.run(MAP + "Map_Remove", TargetMap=g.get("Peers"), Key=key)
    missing = g.fork(invalid, 520)
    missing.run(MAP + "Map_Remove", TargetMap=missing.get("Peers"), Key=key)

    g, p = pp.function(bp, "ApplyPeers", [("Packet", pp.STRING)])
    lines = local_value(g, "Lines", STRINGS, split(g, p["Packet"], "\n"))
    g.branch(g.op("Greater_IntInt", A=g.pure(A + "Array_Length", TargetArray=lines), B=0))
    header = local_value(g, "Header", STRINGS, split(g, g.item(lines, 0), "\t"))
    g.branch(g.op("EqualEqual_IntInt", A=g.pure(A + "Array_Length", TargetArray=header), B=2))
    g.branch(string_eq(g, g.item(header,0), "1"))
    g.set("SelfId", g.item(header,1))
    g.run(A + "Array_Clear", TargetArray=g.get("Seen"))
    row, index, done = g.loop(lines)
    g.branch(g.op("Greater_IntInt", A=index, B=0))
    g.run(own + "ReadPeer", Fields=split(g,row,"\t"))
    g.fork(done,600).run(own + "RemoveMissing")

    g = pp.events(bp)
    pp.event(g, bp, "AddEvent|EventEndPlay", "ReceiveEndPlay", 0)
    g.run(A + "Array_Clear", TargetArray=g.get("Seen"))
    g.run(own + "RemoveMissing")
    pp.compiled(bp)


def main(argv):
    rig, look = ref(RIG), ref(LOOK)
    # A pre-#2290 checkout can still show named figures. Refresh that proxy once the avatar becomes available.
    digest = hashlib.sha256(Path(__file__).read_bytes() + Path(pp.__file__).read_bytes() +
                            bytes((bool(rig), bool(look)))).hexdigest()
    paths = (PEER, RECEIVER)
    current = all(ASSETS.does_asset_exist(path) and ASSETS.get_metadata_tag(ASSETS.load_asset(path), TAG) == digest
                  for path in paths)
    if "--check" in argv:
        if not current:
            raise RuntimeError("Remote player assets missing or stale. Run build_network_peers.py.")
    elif "--force" in argv or not current:
        figure = new_figure()
        visual_components(figure, rig)
        figure_graphs(figure, rig, look)
        defaults = u.get_default_object(figure.generated_class())
        actor_tick = defaults.get_editor_property("primary_actor_tick")
        actor_tick.set_editor_property("start_with_tick_enabled", True)
        defaults.set_editor_property("primary_actor_tick", actor_tick)
        receiver = pp.fresh_component(RECEIVER, ("ApplyPeers", "ReadPeer", "RemoveMissing", "FindOrSpawnPeer"))
        receiver_graphs(receiver)
        for asset in (figure, receiver):
            ASSETS.set_metadata_tag(asset, TAG, digest)
            if not ASSETS.save_loaded_asset(asset, only_if_is_dirty=False):
                raise RuntimeError("Could not save " + asset.get_path_name())
    u.log("LUNDEN_NETWORK_PEERS_OK")


if __name__ == "__main__":
    main(sys.argv[1:])
