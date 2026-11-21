"""#2292: overridable presence notifications for child Blueprints of BP_LundenNetworkListener.

The launcher allows only w/j/s/x and the public presence fields in Payload. A listener actor
receives OnWelcome, OnPeerJoined, OnPeerState or OnPeerLeft(PeerId, Payload). Packet supplies
the current peers, independently of this 64-event history and the presence of any listeners.
"""
import hashlib
import inspect
from pathlib import Path

import unreal as u

import player_parts as pp
from build_network_peers import local_value

LISTENER = "/Game/Lunden/Network/BP_LundenNetworkListener"
EVENTS = {"w": "OnWelcome", "j": "OnPeerJoined", "s": "OnPeerState", "x": "OnPeerLeft"}
FUNCTIONS = ("SelectEventSession", "ReceiveEvents")
INT64 = pp.BP.get_basic_type_by_name("int64")
S = "KismetStringLibrary:"
TAG = "Lunden.NetworkListenerSpec"


def graph_sources():
    return Path(__file__).read_bytes() + inspect.getsource(local_value).encode()


def listener(check):
    spec = hashlib.sha256(Path(__file__).read_bytes().replace(b"\r\n", b"\n")).hexdigest()
    assets, bp_lib = u.EditorAssetLibrary, pp.BP
    bp = assets.load_asset(LISTENER) if assets.does_asset_exist(LISTENER) else None
    if bp and assets.get_metadata_tag(bp, TAG) == spec:
        return bp
    if check:
        raise RuntimeError(LISTENER + " is not built from the current event contract")
    if not bp:
        bp = bp_lib.create_blueprint_asset_with_parent(LISTENER, u.Actor)
    if not bp:
        raise RuntimeError("Could not create " + LISTENER)
    pp.variables(bp, {"EventCount": pp.INT, "LastKind": pp.STRING, "LastPeerId": pp.STRING, "LastPayload": pp.STRING})
    bp_lib.compile_blueprint(bp)
    for kind, name in EVENTS.items():
        # Keep each function's entry, signature and overrides valid across a rebuild (#2312).
        graph = (pp.GRAPH.get_graph_editor_by_name(bp, name) if bp_lib.find_graph(bp, name)
                 else pp.GRAPH.create_and_edit_function_graph(bp, name))
        entry = next(n for n in graph.list_all_nodes() if n.get_class().get_name() == "K2Node_FunctionEntry")
        graph.remove_nodes([n for n in graph.list_all_nodes() if n != entry])
        existing = pp.pins(entry, bp_lib.list_output_pins)
        for field in ("PeerId", "Payload"):
            if field not in existing:
                pin = graph.add_graph_input_parameter(field, pp.STRING)
                if not pin or not pin.is_valid():
                    raise RuntimeError(f"Could not add {name}.{field}")
        g = pp.Graph(graph, graph.find_graph_entry_pin(), bp)
        g.set("LastKind", kind)
        g.set("LastPeerId", pp.out(entry, "PeerId"))
        g.set("LastPayload", pp.out(entry, "Payload"))
        g.set("EventCount", g.op("Add_IntInt", A=g.get("EventCount"), B=1))
    pp.compiled(bp)
    assets.set_metadata_tag(bp, TAG, spec)
    if not assets.save_loaded_asset(bp, only_if_is_dirty=False):
        raise RuntimeError("Could not save " + LISTENER)
    return bp


def build(bp, receiver):
    pp.variables(bp, {"LastEventSequence": INT64, "LastEventBatch": pp.STRING, "EventSessionPath": pp.STRING})
    g, p = pp.function(bp, "SelectEventSession", [("Path", pp.STRING)])
    g.branch(g.pure(S + "NotEqual_StrStr", A=g.get("EventSessionPath"), B=p["Path"]))
    g.set("EventSessionPath", p["Path"])
    g.set("LastEventSequence", 0)
    g.set("LastEventBatch", "")

    g, p = pp.function(bp, "ReceiveEvents", [("Batch", pp.STRING)])
    batch = p["Batch"]
    g.branch(g.pure(S + "NotEqual_StrStr", A=g.get("LastEventBatch"), B=batch))
    g.set("LastEventBatch", batch)
    rows = local_value(g, "EventRows", pp.array(pp.STRING),
                       g.pure(S + "ParseIntoArray", SourceString=batch, Delimiter="\n", CullEmptyStrings=True))
    length = g.pure("KismetArrayLibrary:Array_Length", TargetArray=rows)
    g.branch(g.op("BooleanAND", A=g.op("Greater_IntInt", A=length, B=0), B=g.op("LessEqual_IntInt", A=length, B=64)))
    # This impure query runs once per changed batch. Its result includes child listener classes.
    actors = g.pure("GameplayStatics:GetAllActorsOfClass", result="OutActors", ActorClass=receiver.generated_class().get_path_name())
    row, _, _ = g.loop(rows)
    fields = local_value(g, "EventFields", pp.array(pp.STRING),
                         g.pure(S + "ParseIntoArray", SourceString=row, Delimiter="\t", CullEmptyStrings=False))
    g.branch(g.op("EqualEqual_IntInt", A=g.pure("KismetArrayLibrary:Array_Length", TargetArray=fields), B=4))
    text, kind, peer, payload = (g.item(fields, i) for i in range(4))
    seq = g.pure(S + "Conv_StringToInt64", InString=text)
    canonical = g.pure(S + "EqualEqual_StrStr", A=text, B=g.pure(S + "Conv_Int64ToString", InInt=seq))
    g.branch(g.op("BooleanAND", A=canonical, B=g.op("Greater_Int64Int64", A=seq, B=g.get("LastEventSequence"))))
    known = g.pure(S + "Contains", SearchIn="wjsx", Substring=kind, bUseCase=True)
    g.branch(g.op("BooleanAND", A=known, B=g.op("EqualEqual_IntInt", A=g.pure(S + "Len", S=kind), B=1)))
    g.branch(g.op("Not_PreBool", A=g.pure(S + "IsEmpty", InString=peer)))
    g.branch(g.op("BooleanAND", A=g.pure(S + "StartsWith", SourceString=payload, InPrefix="{"),
                  B=g.pure(S + "EndsWith", SourceString=payload, InSuffix="}")))
    # Advance even with zero subscribers. A later listener gets future events and the latest Packet.
    g.set("LastEventSequence", seq)
    actor, _, _ = g.loop(actors)
    g.branch(g.pure("KismetSystemLibrary:IsValid", Object=actor))
    target = g.cast(actor, ["CastToActor"], u.Actor.static_class(), receiver.generated_class())
    for i, (tag, method) in enumerate(EVENTS.items()):
        other = g.branch(g.pure(S + "EqualEqual_StrStr", A=kind, B=tag))
        g.run(pp.class_path(LISTENER) + ":" + method, target=target, PeerId=peer, Payload=payload)
        g = g.fork(other, 600 + 300 * i)
