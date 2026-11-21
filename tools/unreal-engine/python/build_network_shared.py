"""Build #2293's room component and its two event listeners under Network/Shared.
Run after build_network.py and build_interaction.py, then register with build_player.py.
--check only inspects saved assets. The room is optional in a standalone game.
"""
import hashlib
import json
from pathlib import Path
import sys
import unreal as u

sys.path.insert(0, str(Path(__file__).resolve().parent))
import player_parts as pp
import build_network as net
from build_network_peers import ref, local_value, string_eq, split, S, A, MAP, STRINGS
from shared_door_ids import door_ids
import shared_chat_widget as chat
import shared_room_life as life

ROOT = "/Game/Lunden/Network/Shared"
SHARED = ROOT + "/BPC_LundenSharedRoom"
CHANGES = ROOT + "/BP_LundenSharedDoorListener"
WELCOME = ROOT + "/BP_LundenSharedWelcomeListener"
DOOR = "/Game/Lunden/Blueprints/PilotDoors/BP_LundenSwingDoor"
INTERACTION = "/Game/Lunden/Interaction/BP_LundenInteractionListener"
TAG = "Lunden.SharedBuild"
ME = pp.class_path(SHARED) + ":"
NET = pp.class_path(net.COMPONENT)
ACTOR = pp.BP.get_object_reference_type(u.Actor.static_class())
I64 = pp.BP.get_basic_type_by_name("int64")
FUNCTIONS = ("SendShared", "SendChat", "SendTyping", "LocalDoor", "ApplyDoorState", "ReadRoomHeader",
             "ReadRoomEvent", "ReceiveShared", "RefreshShared", "StartListeners", "MountChat", "SendLanding", "RoomIdentity")


def valid(g, obj):
    return g.pure(net.K + "IsValid", Object=obj)


def network(g):
    return net.component(g, g.pure("ActorComponent:GetOwner"), net.COMPONENT)


def decoded(g, data):
    return net.replace(g, data, [("%22", '"'), ("%27", "'"), ("%5C", "\\"), ("%25", "%")])


def outgoing(bp):
    g, p = pp.function(bp, "SendShared", [("Command", pp.STRING)], [("Sent", pp.BOOL)])
    offline = g.branch(g.get("Joined"))
    g.fork(offline, 450).ret(Sent=False)
    transport = network(g)
    away = g.branch(g.op("Not_PreBool", A=g.get("Away", NET, transport)))
    g.fork(away, 700).ret(Sent=False)
    g.ret(Sent=g.pure(NET + ":WritePacket", transport, result="Written", Packet=p["Command"]))

    g, p = pp.function(bp, "SendChat", [("Line", pp.STRING)], [("Sent", pp.BOOL)])
    line = net.replace(g, p["Line"], [("\r", " "), ("\n", " "), ("\t", " "), ("%", "%25"),
                                        ("\\", "%5C"), ("'", "%27"), ('"', "%22")])
    g.ret(Sent=g.pure(ME + "SendShared", result="Sent", Command=net.join(g, ["shared\tm\t", line])))
    g, p = pp.function(bp, "SendTyping", [("Typing", pp.BOOL)])
    g.run(ME + "SendShared", Command=g.op("SelectString", A="shared\tk\t1", B="shared\tk\t0", bPickA=p["Typing"]))

    g, p = pp.function(bp, "LocalDoor", [("Id", pp.STRING), ("IsOpen", pp.BOOL)])
    g.branch(g.op("Not_PreBool", A=g.get("ApplyingDoors")))
    wire = g.node_of(MAP + "Map_Find", TargetMap=g.get("DoorIds"), Key=p["Id"])
    g.branch(pp.out(wire, "ReturnValue"))
    flag = g.op("SelectString", A="1", B="0", bPickA=p["IsOpen"])
    g.run(ME + "SendShared", Command=net.join(g, ["shared", "dr", pp.out(wire, "Value"), flag], "\t"))


def doors(bp):
    g, _ = pp.function(bp, "ApplyDoorState")
    g.branch(g.get("Joined"))
    g.set("ApplyingDoors", True)
    actors = g.pure("GameplayStatics:GetAllActorsOfClass", result="OutActors", ActorClass=pp.class_path(DOOR))
    actor, _, done = g.loop(actors)
    g.fork(done, 650).set("ApplyingDoors", False)
    target = g.cast(actor, ["CastToActor"], u.Actor.static_class(), ref(DOOR))
    path = pp.class_path(DOOR)
    wire = g.node_of(MAP + "Map_Find", TargetMap=g.get("DoorIds"), Key=g.get("Id", path, target))
    g.branch(pp.out(wire, "ReturnValue"))
    desired = g.pure(A + "Array_Contains", TargetArray=g.get("OpenDoors"), ItemToFind=pp.out(wire, "Value"))
    g.branch(g.op("NotEqual_BoolBool", A=desired, B=g.get("TargetOpen", path, target)))
    closed = g.branch(desired)
    g.run(path + ":OpenDoor", target)
    g.fork(closed, 400).run(path + ":CloseDoor", target)


def incoming(bp):
    g, p = pp.function(bp, "RoomIdentity", [("Id", pp.STRING)])
    g.branch(g.pure(S + "NotEqual_StrStr", A=p["Id"], B=g.get("RoomId")))
    g.set("RoomId", p["Id"])
    g.set("DoorRevision", "")
    g.set("ChatNotice", "")
    g.set("FallPending", False)
    g.run(A + "Array_Clear", TargetArray=g.get("ChatLines"))

    g, p = pp.function(bp, "ReadRoomHeader", [("Fields", STRINGS)])
    f = p["Fields"]
    g.branch(g.op("EqualEqual_IntInt", A=g.pure(A + "Array_Length", TargetArray=f), B=6))
    g.branch(string_eq(g, g.item(f, 0), "1"))
    own = g.item(f, 1)
    g.run(ME + "RoomIdentity", Id=own)
    g.set("Joined", g.op("Not_PreBool", A=net.empty(g, own)))
    offline = g.branch(g.get("Joined"))
    gone = g.fork(offline, 800)
    gone.set("TypingNames", "")
    gone.set("DoorRevision", "")
    g.set("RoomLives", g.pure(S + "Conv_StringToInt", InString=g.item(f, 2)))
    g.set("RoomMaxLives", g.pure(S + "Conv_StringToInt", InString=g.item(f, 3)))
    revision = g.item(f, 4)
    g.branch(g.pure(S + "NotEqual_StrStr", A=revision, B=g.get("DoorRevision")))
    g.set("DoorRevision", revision)
    g.set("OpenDoors", split(g, g.item(f, 5), ","))
    g.run(ME + "ApplyDoorState")

    g, p = pp.function(bp, "ReadRoomEvent", [("Fields", STRINGS)])
    fields = p["Fields"]
    count = g.pure(A + "Array_Length", TargetArray=fields)
    g.branch(g.op("GreaterEqual_IntInt", A=count, B=2))
    row = g.item(fields, 0)
    regular = g.branch(string_eq(g, row, "typing"))
    g.set("TypingNames", decoded(g, g.item(fields, 1)))
    g = g.fork(regular, 400)
    seq = g.pure(S + "Conv_StringToInt64", InString=row)
    g.branch(g.op("Greater_Int64Int64", A=seq, B=g.get("LastEvent")))
    g.set("LastEvent", seq)
    kind = g.item(fields, 1)
    other = g.branch(string_eq(g, kind, "m"))
    g.branch(g.op("EqualEqual_IntInt", A=count, B=5))
    name = decoded(g, g.item(fields, 3))
    who = g.op("SelectString", A="Anonym", B=name, bPickA=net.empty(g, name))
    g.run(A + "Array_Add", TargetArray=g.get("ChatLines"), NewItem=net.join(g, [who, ": ", decoded(g, g.item(fields, 4))]))
    g.branch(g.op("Greater_IntInt", A=g.pure(A + "Array_Length", TargetArray=g.get("ChatLines")), B=30))
    g.run(A + "Array_Remove", TargetArray=g.get("ChatLines"), IndexToRemove=0)
    g = g.fork(other, 800)
    flood = g.branch(string_eq(g, kind, "mx"))
    g.set("ChatNotice", "Vänta lite innan du skickar igen.")
    g.set("NoticeAt", g.pure("GameplayStatics:GetRealTimeSeconds"))
    g = g.fork(flood, 1050)
    impact = g.op("BooleanOR", A=string_eq(g, kind, "fall"), B=string_eq(g, kind, "hurt"))
    g.branch(g.op("BooleanAND", A=impact, B=g.op("EqualEqual_IntInt", A=count, B=5)))
    ack = g.op("BooleanAND", A=string_eq(g, kind, "fall"),
               B=g.op("EqualEqual_IntInt", A=g.pure(S + "Conv_StringToInt", InString=g.item(fields, 2)), B=g.get("FallNumber")))
    g.set("FallPending", g.op("BooleanAND", A=g.get("FallPending"), B=g.op("Not_PreBool", A=ack)))
    g.set("LastLifeEvent", seq)
    g.set("LifeBeforeRecovery", g.pure(S + "Conv_StringToInt", InString=g.item(fields, 3)))
    revived = string_eq(g, g.item(fields, 4), "1")
    g.set("WasRevived", revived)
    g.branch(revived)
    g.set("Recoveries", g.op("Add_IntInt", A=g.get("Recoveries"), B=1))

    g, p = pp.function(bp, "ReceiveShared", [("Packet", pp.STRING)])
    pkt = p["Packet"]
    g.branch(g.pure(S + "StartsWith", SourceString=pkt, InPrefix="1\t"))
    g.branch(g.pure(S + "NotEqual_StrStr", A=pkt, B=g.get("Previous")))
    g.set("Previous", pkt)
    g.set("TypingNames", "")
    lines = local_value(g, "Rows", STRINGS, split(g, pkt, "\n"))
    g.run(ME + "ReadRoomHeader", Fields=split(g, g.item(lines, 0), "\t"))
    g.branch(g.get("Joined"))
    row, idx, _ = g.loop(lines)
    g.branch(g.op("Greater_IntInt", A=idx, B=0))
    g.run(ME + "ReadRoomEvent", Fields=split(g, row, "\t"))

    g, _ = pp.function(bp, "RefreshShared")
    transport = network(g)
    enabled = g.branch(g.op("Not_PreBool", A=g.op("BooleanOR", A=net.empty(g, g.get("SessionPath", NET, transport)),
                                                    B=g.get("Away", NET, transport))))
    disabled = g.fork(enabled, 800)
    disabled.set("Joined", False)
    disabled.set("Previous", "")
    disabled.run(ME + "RoomIdentity", Id="")
    # #2292 imports the entire table before publishing presence events on its 5 Hz timer.
    # Reading the registered table consumes the very same snapshot, without a second disk read.
    g.run(ME + "ReceiveShared", Packet=g.pure(net.T + "GetTableEntrySourceString", TableId=g.get("PeerTableId", NET, transport), Key="Shared"))


def listener(path, parent, method):
    bp = pp.ASSETS.load_asset(path) if pp.ASSETS.does_asset_exist(path) else pp.BP.create_blueprint_asset_with_parent(path, ref(parent))
    graph = pp.BP.add_function_override(bp, method)
    if not graph:
        raise RuntimeError("Could not override " + method)
    editor = pp.GRAPH.get_graph_editor(graph)
    entry = next(n for n in editor.list_all_nodes() if n.get_class().get_name() == "K2Node_FunctionEntry")
    editor.remove_nodes([n for n in editor.list_all_nodes() if n != entry])
    g = pp.Graph(editor, pp.out(entry, "then"), bp)
    owner = g.pure("Actor:GetOwner")
    g.branch(valid(g, owner))
    target = net.component(g, owner, SHARED)
    if path == CHANGES:
        g.run(ME + "LocalDoor", target, Id=pp.out(entry, "Id"), IsOpen=pp.out(entry, "IsOpen"))
    else:
        g.set("DoorRevision", "", pp.class_path(SHARED), target)
        g.set("Previous", "", pp.class_path(SHARED), target)
        g.run(ME + "RefreshShared", target)
    pp.compiled(bp)
    return bp


def lifecycle(bp):
    g, _ = pp.function(bp, "StartListeners")
    pawn = pp.owner_character(g)
    g.branch(g.op("EqualEqual_ObjectObject", A=pawn, B=g.pure("GameplayStatics:GetPlayerCharacter", PlayerIndex=0)))
    for path, prop in ((CHANGES, "DoorListener"), (WELCOME, "RoomListener")):
        action = next(str(n) for n in g.g.list_available_nodes([]) if str(n).replace(" ", "").lower().endswith("spawnactorfromclass"))
        spawn = g.named(action)
        pp.feed(spawn, "Class", pp.class_path(path))
        pp.feed(spawn, "Owner", pawn)
        pp.feed(spawn, "SpawnTransform", g.op("MakeTransform", Scale="1,1,1"))
        pp.feed(spawn, "CollisionHandlingOverride", "AlwaysSpawn")
        g.step(spawn)
        g.set(prop, pp.out(spawn, "ReturnValue"))
    g.run(net.K + "K2_ClearTimer", FunctionName="StartListeners")
    g = pp.events(bp)
    pp.event(g, bp, "AddEvent|EventBeginPlay", "ReceiveBeginPlay", 0)
    # Possession can follow BeginPlay on a freshly spawned pawn.
    g.run(net.K + "K2_SetTimer", FunctionName="StartListeners", Time=0.2, bLooping=True)
    g.run(net.K + "K2_SetTimer", FunctionName="RefreshShared", Time=0.2, bLooping=True, bMaxOncePerFrame=True)
    # Streamed-in actors receive the current door snapshot even if it never changes again.
    g.run(net.K + "K2_SetTimer", FunctionName="ApplyDoorState", Time=2.0, bLooping=True, bMaxOncePerFrame=True)
    g.run(net.K + "K2_SetTimer", FunctionName="MountChat", Time=0.5, bLooping=True)
    pp.event(g, bp, "AddEvent|EventEndPlay", "ReceiveEndPlay", 650)
    # Every successfully spawned listener belongs to this pawn and is removed on map travel.
    for prop in ("RoomListener", "DoorListener"):
        actor = g.get(prop)
        g.branch(valid(g, actor))
        g.run("Actor:K2_DestroyActor", actor)
    widget = g.get("ChatWidget")
    g.branch(valid(g, widget))
    g.run("/Script/UMG.Widget:RemoveFromParent", widget)
    pp.compiled(bp)


def main(argv):
    root = Path(__file__).resolve().parents[3]
    data = next((Path(a) for a in argv if not a.startswith("--")), root / "unreal/Lunden/Import/measurements.json")
    ids = door_ids(json.loads(data.read_text(encoding="utf-8")))
    ext = json.loads((root / "tools/unreal-engine/ui-extensions.json").read_text(encoding="utf-8"))
    row, = [r for r in ext.get("hudWidgets", []) if r["owner"] == "#2293"]
    spec = hashlib.sha256(Path(life.__file__).read_bytes().replace(b"\r\n", b"\n") + Path(chat.__file__).read_bytes().replace(b"\r\n", b"\n") + json.dumps(row, sort_keys=True).encode() + Path(__file__).read_bytes().replace(b"\r\n", b"\n") + json.dumps(ids, sort_keys=True).encode()).hexdigest()
    paths = (SHARED, CHANGES, WELCOME, chat.WIDGET)
    assets = pp.ASSETS
    ready = all(assets.does_asset_exist(p) and assets.get_metadata_tag(assets.load_asset(p), TAG) == spec for p in paths)
    if "--check" in argv or (ready and "--force" not in argv):
        if not ready:
            raise RuntimeError("Shared room assets need rebuilding")
    else:
        for path in (DOOR, INTERACTION, net.COMPONENT, net.network_events.LISTENER):
            if not ref(path):
                raise RuntimeError("Missing shared room dependency " + path)
        bp = pp.fresh_component(SHARED, FUNCTIONS)
        pp.variables(bp, {"DoorIds": pp.BP.get_map_type(pp.STRING, pp.STRING), "OpenDoors": STRINGS,
                          "Joined": pp.BOOL, "RoomId": pp.STRING, "FallPending": pp.BOOL, "FallAt": pp.REAL, "ApplyingDoors": pp.BOOL, "DoorRevision": pp.STRING,
                          "DoorListener": ACTOR, "RoomListener": ACTOR, "Previous": pp.STRING,
                          "ChatLines": STRINGS, "ChatNotice": pp.STRING, "NoticeAt": pp.REAL,
                          "ChatWidget": pp.BP.get_object_reference_type(u.UserWidget.static_class()), "TypingNames": pp.STRING,
                          "RoomLives": pp.INT, "RoomMaxLives": pp.INT, "LastEvent": I64,
                          "LastLifeEvent": I64, "Recoveries": pp.INT, "FallNumber": pp.INT, "LifeBeforeRecovery": pp.INT, "WasRevived": pp.BOOL})
        outgoing(bp)
        life.transport(bp, ME)
        doors(bp)
        incoming(bp)
        pp.compiled(bp)
        change = listener(CHANGES, INTERACTION, "OnInteractableChanged")
        welcome = listener(WELCOME, net.network_events.LISTENER, "OnWelcome")
        widget = chat.build(SHARED)
        chat.mount(bp, row)
        lifecycle(bp)
        u.get_default_object(bp.generated_class()).set_editor_property("DoorIds", ids)
        for asset in (bp, change, welcome, widget):
            assets.set_metadata_tag(asset, TAG, spec)
            if not assets.save_loaded_asset(asset, only_if_is_dirty=False):
                raise RuntimeError("Could not save " + asset.get_name())
    u.log(f"LUNDEN_NETWORK_SHARED_OK registered={len(ids)}")


if __name__ == "__main__":
    main(sys.argv[1:])
