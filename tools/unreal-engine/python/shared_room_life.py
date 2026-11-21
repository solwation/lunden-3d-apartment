"""Bridge #2284's measured ground impact and blackout to the current room's life value."""
import unreal as u
import player_parts as pp
from build_network import join
from build_network_peers import local_value

FUNCTIONS = ("OfferRoomLanding", "UpdateRoomLife")
I64 = pp.BP.get_basic_type_by_name("int64")


def transport(bp, me):
    g, p = pp.function(bp, "SendLanding", [("DropCm", pp.REAL)], [("Sent", pp.BOOL)])
    # As in src/fall.js, a second landing waits for the first acknowledgement. After FALL.ackMs a new
    # physical landing may make a fresh request. The outstanding packet is never replayed.
    now = g.pure("GameplayStatics:GetRealTimeSeconds")
    waiting = g.op("BooleanAND", A=g.get("FallPending"), B=g.op("Less_DoubleDouble",
                   A=g.op("Subtract_DoubleDouble", A=now, B=g.get("FallAt")), B=10))
    fresh = g.branch(waiting)
    g.ret(Sent=True)
    g = g.fork(fresh, 300)
    g.set("FallNumber", g.op("Add_IntInt", A=g.get("FallNumber"), B=1))
    request = g.pure("KismetStringLibrary:Conv_IntToString", InInt=g.get("FallNumber"))
    # #2284 OnLanded measures a CharacterMovement free drop in centimetres. Its capsule was in Falling
    # mode for this interval. The measured drop is a lower bound on free gap and already exceeds FALL.hurt.
    metres = g.op("Divide_DoubleDouble", A=p["DropCm"], B=100)
    num = g.pure("KismetStringLibrary:Conv_DoubleToString", InDouble=metres)
    packet = join(g, ["shared", "fall", request, num, num], "\t")
    failed = g.branch(g.pure(me + "SendShared", result="Sent", Command=packet))
    g.fork(failed, 700).ret(Sent=False)
    g.set("FallPending", True)
    g.set("FallAt", now)
    g.ret(Sent=True)


def player_graphs(char, path):
    for name in FUNCTIONS:
        if pp.BP.find_graph(char, name):
            pp.BP.remove_function_graph(char, name)
    pp.variables(char, {"RoomLifeInitialized": pp.BOOL, "SeenImpact": I64, "SeenRecoveries": pp.INT, "SeenRoomId": pp.STRING})
    cls = pp.class_path(path)
    g, p = pp.function(char, "OfferRoomLanding", [("DropCm", pp.REAL), ("Qualifies", pp.BOOL)], [("Offered", pp.BOOL)])
    ignored = g.branch(p["Qualifies"])
    g.fork(ignored, 350).ret(Offered=False)
    room = pp.component_of(g, path)
    offline = g.branch(g.get("Joined", cls, room))
    g.fork(offline, 450).ret(Offered=False)
    file_error = g.branch(g.pure(cls + ":SendLanding", room, result="Sent", DropCm=p["DropCm"]))
    g.fork(file_error, 650).ret(Offered=False)
    g.set("LastFallDrop", p["DropCm"])
    g.set("LastFallDamage", 0)
    g.set("LastFallFatal", False)
    g.ret(Offered=True)

    g, _ = pp.function(char, "UpdateRoomLife")
    room = pp.component_of(g, path)
    online = g.get("Joined", cls, room)
    life = g.get("RoomLives", cls, room)
    maximum = g.get("RoomMaxLives", cls, room)
    valid = g.op("BooleanAND", A=g.op("Greater_IntInt", A=maximum, B=0),
                 B=g.op("BooleanAND", A=g.op("GreaterEqual_IntInt", A=life, B=0), B=g.op("LessEqual_IntInt", A=life, B=maximum)))
    offline = g.branch(g.op("BooleanAND", A=online, B=valid))
    g.fork(offline, 600).set("RoomLifeInitialized", False)
    event = g.get("LastLifeEvent", cls, room)
    count = g.get("Recoveries", cls, room)
    identity = g.get("RoomId", cls, room)
    first = g.branch(g.op("BooleanAND", A=g.get("RoomLifeInitialized"),
                           B=g.pure("KismetStringLibrary:EqualEqual_StrStr", A=identity, B=g.get("SeenRoomId"))))
    init = g.fork(first, 850)
    # A new pawn may see older rows from the same session. Restore its current life without replaying a past death.
    init.set("RoomLifeInitialized", True)
    init.set("SeenRoomId", identity)
    init.set("SeenImpact", event)
    init.set("SeenRecoveries", count)
    init.set("MaxLives", maximum)
    init.set("Lives", life)
    before = local_value(g, "LifeBeforeUpdate", pp.INT, g.get("Lives"))
    g.set("Lives", life)
    g.set("MaxLives", maximum)
    g.branch(g.op("Greater_Int64Int64", A=event, B=g.get("SeenImpact")))
    g.set("SeenImpact", event)
    g.set("LastFallDamage", g.op("Max", A=0, B=g.op("Subtract_IntInt", A=before, B=g.get("LifeBeforeRecovery", cls, room))))
    diff = local_value(g, "NewRecoveries", pp.INT, g.op("Subtract_IntInt", A=count, B=g.get("SeenRecoveries")))
    g.set("SeenRecoveries", count)
    fatal = g.op("Greater_IntInt", A=diff, B=0)
    g.set("LastFallFatal", fatal)
    g.branch(fatal)
    g.set("Deaths", g.op("Add_IntInt", A=g.get("Deaths"), B=diff))
    g.run(char.generated_class().get_path_name() + ":Die")
    # Both functions must be on the generated pawn class before character_graph places its self calls.
    pp.compiled(char)
