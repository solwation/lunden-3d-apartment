"""#2292: build the content-only player's local presence exchange.

Build build_network_peers.py first, then this script with a fresh measurements.json,
then build_player.py to attach both components. --check verifies without saving.
Lock Network/BPC_LundenNetwork, BP_LundenNetworkListener, ST_LundenGame and ST_LundenPeers before building.
The Shipping game uses the stock string-table library. The launcher owns the socket.
With -LundenPlayersBridge=<encoded directory>, the local pawn offers game-N.csv at the
wire fixture's sampling rate (5 Hz) and reads peers.csv. Each actual write consumes a new
number. While the last offer exists, ordinary updates wait; away gets its own file. A
replacement pawn after map travel skips occupied numbers. With no argument, there is
no file I/O. Pausing stops the game timer, which the launcher detects as a quiet client.
Only the chosen display name and appearance leave the save. The pose uses the real capsule
feet or the exported seat/bed body anchor. Older exports use capsule feet for rest, too.
"""
import hashlib
import json
from pathlib import Path
import sys

import unreal as u

sys.path.insert(0, str(Path(__file__).parent))
import player_parts as pp
import network_events

DIR = "/Game/Lunden/Network"
COMPONENT = DIR + "/BPC_LundenNetwork"
PEERS = DIR + "/BPC_LundenNetworkPeers"
GAME_TABLE = DIR + "/ST_LundenGame"
PEER_TABLE = DIR + "/ST_LundenPeers"
REST = "/Game/Lunden/Player/BPC_LundenRest"
SAVE = "/Game/Lunden/Save/BFL_LundenSave.BFL_LundenSave_C"
SLOT = "/Game/Lunden/Save/SG_LundenSave.SG_LundenSave_C"
TAG = "Lunden.SpecHash"
ME = pp.class_path(COMPONENT) + ":"
S = "KismetStringLibrary:"
T = "KismetStringTableLibrary:"
K = "KismetSystemLibrary:"
ASSETS = u.EditorAssetLibrary
FUNCTIONS = ("SafeAppearance", "LookScale", "RefreshProfile", "ConfigureBridge", "WritePacket", "ReadPeers",
             "SetPresenceAway", "FormatFrame", "LocalFrame", "SyncPresence") + network_events.FUNCTIONS


def join(g, fields, sep=""):
    result = fields[0]
    for field in fields[1:]:
        if sep:
            result = g.pure(S + "Concat_StrStr", A=result, B=sep)
        result = g.pure(S + "Concat_StrStr", A=result, B=field)
    return result


def replace(g, string, pairs):
    for before, after in pairs:
        string = g.pure(S + "Replace", SourceString=string, From=before, To=after, SearchCase="CaseSensitive")
    return string


def empty(g, string):
    return g.pure(S + "IsEmpty", InString=string)


def component(g, actor, path):
    ref = g.pure("Actor:GetComponentByClass", target=actor, ComponentClass=pp.class_path(path))
    return pp.cast_component(g, ref, path)


def profile(bp):
    g, p = pp.function(bp, "SafeAppearance", [("Code", pp.STRING)], [("Appearance", pp.STRING)])
    code = p["Code"]
    length = g.pure(S + "Len", S=code)
    ok = g.op("BooleanAND", A=g.op("GreaterEqual_IntInt", A=length, B=7), B=g.op("LessEqual_IntInt", A=length, B=100))
    bad = g.branch(ok)
    g.fork(bad, 350).ret(Appearance="")
    chars = g.pure(S + "GetCharacterArrayFromString", SourceString=code)
    char, index, done = g.loop(chars)
    valid = g.pure(S + "Contains", SearchIn="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", Substring=char, bUseCase=True)
    digit = g.pure(S + "Contains", SearchIn="0123456789", Substring=char)
    g.branch(g.op("Not_PreBool", A=g.op("BooleanAND", A=valid, B=g.op("BooleanOR", A=digit, B=g.op("GreaterEqual_IntInt", A=index, B=7)))))
    g.ret(Appearance="")
    g.fork(done, 600).ret(Appearance=code)

    g, p = pp.function(bp, "LookScale", [("Code", pp.STRING)], [("Scale", pp.REAL)])
    code = p["Code"]
    height = g.pure(S + "GetSubstring", SourceString=code, StartIndex=9, Length=3)
    index = g.op("Subtract_IntInt", A=g.pure(S + "Conv_StringToInt", InString=height), B=g.get("FirstHeight"))
    heights = g.get("HeightScales")
    has_height = g.op("BooleanAND", A=g.pure(S + "IsNumeric", SourceString=height),
                      B=g.pure("KismetArrayLibrary:Array_IsValidIndex", TargetArray=heights, IndexToTest=index))
    seeded = g.branch(has_height)
    g.ret(Scale=g.item(heights, index))
    g = g.fork(seeded, 450)
    tag = g.pure(S + "FindSubstring", SearchIn=code, Substring="s", bUseCase=True, bSearchFromEnd=True)
    n = g.pure(S + "GetSubstring", SourceString=code, StartIndex=g.op("Add_IntInt", A=tag, B=1), Length=1)
    i = g.pure(S + "Conv_StringToInt", InString=n)
    scales = g.get("SeedScales")
    valid = g.op("BooleanAND", A=g.op("GreaterEqual_IntInt", A=tag, B=7), B=g.pure(S + "IsNumeric", SourceString=n))
    invalid = g.branch(g.op("BooleanAND", A=valid, B=g.pure("KismetArrayLibrary:Array_IsValidIndex", TargetArray=scales, IndexToTest=i)))
    g.ret(Scale=g.item(scales, i))
    g.fork(invalid, 700).ret(Scale=1.0)

    g, _ = pp.function(bp, "RefreshProfile")
    g.branch(g.op("Not_PreBool", A=empty(g, g.get("SessionPath"))))
    save = g.pure(SAVE + ":LoadSave", result="Save")
    g.branch(g.pure(K + "IsValid", Object=save))
    name = g.get("PlayerName", SLOT, save)
    name = replace(g, name, [("\r", " "), ("\n", " "), ("\t", " ")])
    name = g.pure(S + "Left", SourceString=name, Count=20)
    g.set("DisplayName", replace(g, name, [("%", "%25"), ("\\", "%5C"), ("'", "%27"), ('"', "%22")]))
    g.set("Appearance", g.pure(ME + "SafeAppearance", result="Appearance", Code=g.get("LookCode", SLOT, save)))
    g.set("BodyScale", g.pure(ME + "LookScale", result="Scale", Code=g.get("Appearance")))


def exchange(bp):
    g, p = pp.function(bp, "ConfigureBridge", [("CommandLine", pp.STRING)])
    g.set("SessionPath", "")
    g.set("LastPeersPacket", "")
    g.set("Away", False)
    g.set("HasPublished", False)
    parse = g.node_of(K + "ParseParamValue", InString=p["CommandLine"], InParam="-LundenPlayersBridge=")
    g.branch(pp.out(parse, "ReturnValue"))
    path = replace(g, pp.out(parse, "OutValue"), [("%29", ")"), ("%2C", ","), ("%20", " "), ("%25", "%")])
    g.branch(g.pure("BlueprintPathsLibrary:DirectoryExists", InPath=path))
    g.run(ME + "SelectEventSession", Path=path)
    g.set("SessionPath", path)
    g.run(ME + "RefreshProfile")

    g, p = pp.function(bp, "WritePacket", [("Packet", pp.STRING)], [("Written", pp.BOOL)])
    disabled = g.branch(g.op("Not_PreBool", A=empty(g, g.get("SessionPath"))))
    g.fork(disabled, 300).ret(Written=False)
    table = g.pure(T + "GetTableId", StringTable=g.get("GameTable"))
    # Stock FStringTable::ImportStringsFromCSVString unescapes each parsed CSV field before inserting it.
    escaped = replace(g, p["Packet"], [("\\", "\\\\"), ("\n", "\\n"), ("\r", "\\r"), ("\t", "\\t"),
                                         ("'", "\\'"), ('"', '\\"'), ('"', '""')])
    csv = join(g, ['Key,SourceString\n"Packet","', escaped, '"\n'])
    bad = g.branch(g.pure(T + "ImportTableFromCSVString", TableId=table, CSVString=csv))
    g.fork(bad, 550).ret(Written=False)
    # A new map may restart at one in the same directory. Skip outstanding files; limit work per tick.
    _, exhausted = g.count(1, 16)
    number = g.pure(S + "Conv_IntToString", InInt=g.get("NextSequence"))
    g.set("AttemptFile", join(g, [g.get("SessionPath"), "/game-", number, ".csv"]))
    g.set("NextSequence", g.op("Add_IntInt", A=g.get("NextSequence"), B=1))
    g.branch(g.op("Not_PreBool", A=g.pure("BlueprintPathsLibrary:FileExists", InPath=g.get("AttemptFile"))))
    failed = g.branch(g.pure(T + "ExportTableToCSVFile", TableId=table, Filename=g.get("AttemptFile")))
    g.fork(failed, 800).ret(Written=False)
    g.set("LastGameFile", g.get("AttemptFile"))
    g.ret(Written=True)
    g.fork(exhausted, 1000).ret(Written=False)

    g, _ = pp.function(bp, "ReadPeers")
    g.branch(g.op("Not_PreBool", A=empty(g, g.get("SessionPath"))))
    filename = join(g, [g.get("SessionPath"), "/peers.csv"])
    g.branch(g.pure("BlueprintPathsLibrary:FileExists", InPath=filename))
    table = g.pure(T + "GetTableId", StringTable=g.get("PeerTable"))
    g.branch(g.pure(T + "ImportTableFromCSVFile", TableId=table, Filename=filename))
    g.run(ME + "ReceiveEvents", Batch=g.pure(T + "GetTableEntrySourceString", TableId=table, Key="Events"))
    packet = g.pure(T + "GetTableEntrySourceString", TableId=table, Key="Packet")
    g.branch(g.pure(S + "StartsWith", SourceString=packet, InPrefix="1\t"))
    g.branch(g.pure(S + "NotEqual_StrStr", A=packet, B=g.get("LastPeersPacket")))
    peers = component(g, g.pure("ActorComponent:GetOwner"), PEERS)
    g.run(pp.class_path(PEERS) + ":ApplyPeers", target=peers, Packet=packet)
    g.set("LastPeersPacket", packet)

    g, p = pp.function(bp, "SetPresenceAway", [("InAway", pp.BOOL)])
    g.branch(g.op("NotEqual_BoolBool", A=g.get("Away"), B=p["InAway"]))
    g.set("Away", p["InAway"])
    g.branch(p["InAway"])
    g.run(ME + "WritePacket", Packet="away")
    peers = component(g, g.pure("ActorComponent:GetOwner"), PEERS)
    g.run(pp.class_path(PEERS) + ":ApplyPeers", target=peers, Packet="1\t")
    g.set("LastPeersPacket", "")


def player(bp):
    shape = [("Feet", pp.VEC), ("BodyYaw", pp.REAL), ("Pitch", pp.REAL), ("Crouched", pp.BOOL),
             ("Pose", pp.INT), ("HeadYaw", pp.REAL)]
    g, p = pp.function(bp, "FormatFrame", shape, [("Packet", pp.STRING)])
    xyz = g.node_of("KismetMathLibrary:BreakVector", InVec=p["Feet"])
    fields = ["1", g.get("DisplayName"), g.get("Appearance")]
    for number in [pp.out(xyz, axis) for axis in ("X", "Y", "Z")] + [p["BodyYaw"], p["Pitch"]]:
        fields.append(g.pure(S + "Conv_DoubleToString", InDouble=number))
    fields += [g.op("SelectString", A="1", B="0", bPickA=p["Crouched"]), g.pure(S + "Conv_IntToString", InInt=p["Pose"]),
               g.pure(S + "Conv_DoubleToString", InDouble=p["HeadYaw"])]
    g.ret(Packet=join(g, fields, "\n"))

    g, _ = pp.function(bp, "LocalFrame", outputs=[("Packet", pp.STRING)])
    pawn = pp.owner_character(g)
    primary = g.op("EqualEqual_ObjectObject", A=pawn, B=g.pure("GameplayStatics:GetPlayerCharacter", PlayerIndex=0))
    remote = g.branch(g.op("BooleanAND", A=primary, B=g.pure("Pawn:IsLocallyControlled", target=pawn)))
    g.fork(remote, 500).ret(Packet="")
    rot = g.node_of("KismetMathLibrary:BreakRotator", InRot=g.pure("Pawn:GetControlRotation", target=pawn))
    yaw = g.op("NormalizeAxis", Angle=pp.out(rot, "Yaw"))
    pitch = g.op("NormalizeAxis", Angle=pp.out(rot, "Pitch"))
    half = g.pure("CapsuleComponent:GetScaledCapsuleHalfHeight", target=g.get("CapsuleComponent", "/Script/Engine.Character", pawn))
    feet = g.op("Subtract_VectorVector", A=g.pure("Actor:K2_GetActorLocation", target=pawn),
                B=g.op("MakeVector", X=0, Y=0, Z=half))
    rest = component(g, pawn, REST)
    spot = g.get("Spot", pp.class_path(REST), rest)
    headings = g.get("SpotYaw", pp.class_path(REST), rest)
    standing = g.branch(g.pure("KismetArrayLibrary:Array_IsValidIndex", TargetArray=headings, IndexToTest=spot))
    walk = g.fork(standing, 600)
    walk.ret(Packet=walk.pure(ME + "FormatFrame", result="Packet", Feet=feet, BodyYaw=yaw, Pitch=pitch,
                              Crouched=walk.get("bIsCrouched", "/Script/Engine.Character", pawn), Pose=0, HeadYaw=0))
    seat_yaw = g.item(headings, spot)
    lie = g.item(g.get("SpotLie", pp.class_path(REST), rest), spot)
    pose = g.op("SelectInt", A=2, B=1, bPickA=lie)
    delta = g.op("NormalizeAxis", Angle=g.op("Subtract_DoubleDouble", A=yaw, B=seat_yaw))
    head = g.op("SelectFloat", A=0, B=delta, bPickA=lie)
    bases = g.get("RootBases")
    legacy = g.branch(g.pure("KismetArrayLibrary:Array_IsValidIndex", TargetArray=bases, IndexToTest=spot))
    actual = g.op("Add_VectorVector", A=g.item(bases, spot),
                  B=g.op("Multiply_VectorFloat", A=g.item(g.get("RootOffsets"), spot), B=g.get("BodyScale")))
    for chain, anchor in ((g, actual), (g.fork(legacy, 900), feet)):
        chain.ret(Packet=chain.pure(ME + "FormatFrame", result="Packet", Feet=anchor, BodyYaw=seat_yaw, Pitch=pitch,
                                    Crouched=False, Pose=pose, HeadYaw=head))

    g, _ = pp.function(bp, "SyncPresence")
    g.branch(g.op("Not_PreBool", A=empty(g, g.get("SessionPath"))))
    g.branch(g.op("Not_PreBool", A=g.get("Away")))
    g.run(ME + "ReadPeers")
    # Keep one ordinary frame on disk if the launcher is slow or gone. On consumption take a fresh sample.
    last = g.get("LastGameFile")
    ours = g.pure(S + "StartsWith", SourceString=last, InPrefix=join(g, [g.get("SessionPath"), "/game-"]))
    g.branch(g.op("Not_PreBool", A=g.op("BooleanAND", A=ours, B=g.pure("BlueprintPathsLibrary:FileExists", InPath=last))))
    packet = g.pure(ME + "LocalFrame", result="Packet")
    g.branch(g.op("Not_PreBool", A=empty(g, packet)))
    written = g.pure(ME + "WritePacket", result="Written", Packet=packet)
    g.set("HasPublished", g.op("BooleanOR", A=g.get("HasPublished"), B=written))


def build(rest, hz, listener):
    bp = pp.fresh_component(COMPONENT, FUNCTIONS)
    table_type = pp.BP.get_object_reference_type(u.StringTable.static_class())
    pp.variables(bp, {"SessionPath": pp.STRING, "DisplayName": pp.STRING, "Appearance": pp.STRING, "LastPeersPacket": pp.STRING,
                      "Away": pp.BOOL, "HasPublished": pp.BOOL, "NextSequence": pp.INT, "AttemptFile": pp.STRING,
                      "LastGameFile": pp.STRING, "GameTable": table_type, "PeerTable": table_type, "FirstHeight": pp.INT,
                      "RootBases": pp.array(pp.VEC), "RootOffsets": pp.array(pp.VEC), "BodyScale": pp.REAL,
                      "HeightScales": pp.array(pp.REAL), "SeedScales": pp.array(pp.REAL)})
    network_events.build(bp, listener)
    profile(bp)
    exchange(bp)
    player(bp)
    g = pp.events(bp)
    pp.event(g, bp, "AddEvent|EventBeginPlay", "ReceiveBeginPlay", 0)
    g.run(ME + "ConfigureBridge", CommandLine=g.pure(K + "GetCommandLine"))
    g.branch(g.op("Not_PreBool", A=empty(g, g.get("SessionPath"))))
    g.run(K + "K2_SetTimer", FunctionName="RefreshProfile", Time=2.0, bLooping=True)
    g.run(K + "K2_SetTimer", FunctionName="SyncPresence", Time=1.0 / hz, bLooping=True, bMaxOncePerFrame=True)
    pp.event(g, bp, "AddEvent|EventEndPlay", "ReceiveEndPlay", 550)
    g.branch(g.get("HasPublished"))
    g.run(ME + "WritePacket", Packet="away")
    pp.compiled(bp)
    default = u.get_default_object(bp.generated_class())
    scales = rest.get("networkBodyScales", {})
    anchors = [s.get("networkRoot") for s in rest["spots"]]
    # Older exports still publish capsule feet, poses and heading until their rest anchors are re-exported.
    for prop, val in (("NextSequence", 1), ("FirstHeight", scales.get("minHeightCm", 0)), ("HeightScales", scales.get("byHeight", [])),
                      ("SeedScales", scales.get("seeded", [])), ("BodyScale", 1.0)):
        default.set_editor_property(prop, val)
    for prop, key in (("RootBases", "baseCm"), ("RootOffsets", "perBodyScaleCm")):
        default.set_editor_property(prop, [u.Vector(*a[key]) for a in anchors] if all(anchors) else [])
    for prop, path in (("GameTable", GAME_TABLE), ("PeerTable", PEER_TABLE)):
        table = ASSETS.load_asset(path) if ASSETS.does_asset_exist(path) else None
        if not table:
            folder, name = path.rsplit("/", 1)
            table = u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.StringTable, u.StringTableFactory())
            if not table or not ASSETS.save_loaded_asset(table, only_if_is_dirty=False):
                raise RuntimeError(f"Could not create/save {path}")
        default.set_editor_property(prop, table)  # hard references load and cook both tables with the component
    return bp


def main(argv):
    root = Path(__file__).resolve().parents[3]
    measurements = next((Path(a) for a in argv if not a.startswith("--")), root / "unreal/Lunden/Import/measurements.json")
    rest = json.loads(measurements.read_text(encoding="utf-8"))["spawn"]["rest"]
    fixture = json.loads((root / "tools/unreal-engine/wire/players.json").read_text(encoding="utf-8"))
    hz = fixture["limits"]["clientHz"]
    anchors = [s.get("networkRoot") for s in rest["spots"]]
    spec = hashlib.sha256(Path(__file__).read_bytes() + Path(pp.__file__).read_bytes() + network_events.graph_sources() +
                          json.dumps([hz, anchors, rest.get("networkBodyScales")], sort_keys=True).encode()).hexdigest()
    if not u.load_class(None, pp.class_path(PEERS)):
        raise RuntimeError("Build build_network_peers.py before build_network.py")
    listener = network_events.listener("--check" in argv)
    bp = ASSETS.load_asset(COMPONENT) if ASSETS.does_asset_exist(COMPONENT) else None
    current = bp and ASSETS.get_metadata_tag(bp, TAG) == spec
    if "--check" in argv or (current and "--force" not in argv):
        if not current:
            raise RuntimeError(COMPONENT + " is not built from the current network inputs")
        default = u.get_default_object(bp.generated_class())
        for prop, path in (("GameTable", GAME_TABLE), ("PeerTable", PEER_TABLE)):
            if not ASSETS.does_asset_exist(path) or default.get_editor_property(prop) != ASSETS.load_asset(path):
                raise RuntimeError(f"{COMPONENT}.{prop} must reference {path}")
    else:
        bp = build(rest, hz, listener)
        ASSETS.set_metadata_tag(bp, TAG, spec)
        if not ASSETS.save_loaded_asset(bp, only_if_is_dirty=False):
            raise RuntimeError("Could not save " + COMPONENT)
    u.log("LUNDEN_NETWORK_OK")


if __name__ == "__main__":
    main(sys.argv[1:])
