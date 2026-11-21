"""#2292: run with run-tests.ps1 -Filter Editor.Python.Lunden.test_network_peers.
The PIE test uses an empty native game mode and the real remote-figure receiver, without a room connection.
WSL can independently check the builder's node references against the installed Engine using:
python3 tools/unreal-engine/tests/test_network_peers.py --engine '/mnt/c/Program Files/Epic Games/UE_5.8/Engine'
"""
import ast
import json
import math
from pathlib import Path
import re
import sys
import time


def reflected_nodes(engine):
    """Verify the Blueprint calls against the installed headers and generated Win64 UFUNCTION declarations."""
    source = Path(__file__).resolve().parents[1] / "python/build_network_peers.py"
    tree = ast.parse(source.read_text())
    prefix = {"S":"KismetStringLibrary", "MAP":"BlueprintMapLibrary", "A":"KismetArrayLibrary"}
    functions = set()
    for n in ast.walk(tree):
        if not isinstance(n, ast.Call) or not isinstance(n.func, ast.Attribute) or not n.args:
            continue
        method, first = n.func.attr, n.args[0]
        if method == "op" and isinstance(first,ast.Constant):
            functions.add(("KismetMathLibrary", first.value))
        elif method in ("call", "node_of", "run", "pure"):
            if isinstance(first, ast.Constant) and ":" in first.value:
                functions.add(tuple(first.value.split(":",1)))
            elif isinstance(first, ast.BinOp) and isinstance(first.left,ast.Name) and first.left.id in prefix:
                functions.add((prefix[first.left.id], first.right.value))
    generated = engine / "Intermediate/Build/Win64/UnrealEditor/Inc/Engine/UHT"
    for cls in sorted({c for c,_ in functions}):
        text = (generated / (cls + ".generated.h")).read_text()
        for _, fn in sorted((c,f) for c,f in functions if c == cls):
            if not re.search(r"\bexec"+fn+r"\b|Z_Construct_UFunction_\w+_"+fn+r"_Statics\b",text):
                raise AssertionError(f"Missing reflected {cls}::{fn}")
    engine_src = engine / "Source/Runtime/Engine"
    checks = {
        "Classes/Kismet/KismetStringLibrary.h": [
            "ParseIntoArray(const FString& SourceString, const FString& Delimiter", "const bool CullEmptyStrings",
            "Replace(const FString& SourceString, const FString& From, const FString& To"],
        "Classes/Kismet/KismetMathLibrary.h": ["RLerp(FRotator A, FRotator B, float Alpha, bool bShortestPath)"],
        "Classes/Kismet/BlueprintMapLibrary.h": ["Map_Keys(const TMap<int32, int32>& TargetMap, TArray<int32>& Keys)"],
        "Private/Components/TextRenderComponent.cpp": ["TangentZ(1.f, 0.f, 0.f)"],
    }
    for file, needles in checks.items():
        text = (engine_src/file).read_text()
        for token in needles:
            assert token in text, (file, token)
    print(f"UE Win64 reflection: {len(functions)} Blueprint calls plus parser, map, rotation and text-face contracts")


def pie():
    import unreal as u
    root = "/Game/Lunden/Network/"
    peer_class = u.load_class(None, root + "BP_LundenPeer.BP_LundenPeer_C")
    component_class = u.load_class(None, root + "BPC_LundenNetworkPeers.BPC_LundenNetworkPeers_C")
    if not peer_class or not component_class:
        raise RuntimeError("Build build_network_peers.py before running this test")
    project = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
    wire = json.loads((project.parents[1] / "tools/unreal-engine/wire/players.json").read_text())
    samples = [case["unreal"] for case in wire["coordinates"]["cases"]]
    levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
    editor = u.get_editor_subsystem(u.UnrealEditorSubsystem)
    world = u.EditorLoadingAndSavingUtils.new_blank_map(False)
    # No player Blueprint, transport, live room or user save is involved in this test.
    world.get_world_settings().set_editor_property("default_game_mode", u.GameModeBase)
    levels.editor_request_begin_play()

    def row(key, name, code, feet, yaw, pitch=0, crouch=0, away=0, pose=0, head=0):
        return "\t".join(map(str,(key,name,code,*feet,yaw,pitch,crouch,away,pose,head)))

    def near_pos(peer, xyz):
        actual = peer.get_actor_location().to_tuple()
        assert math.dist(actual,xyz) < .01, (actual,xyz)

    def near_yaw(peer, yaw):
        actual = peer.get_actor_rotation().yaw
        assert abs((actual-yaw+180)%360-180) < .01, (actual,yaw)

    @u.AutomationScheduler.add_latent_command
    def check():
        try:
            deadline = time.monotonic() + 45
            while True:
                game = editor.get_game_world()
                owner = u.GameplayStatics.get_player_controller(game,0) if game else None
                if owner:
                    break
                if time.monotonic() >= deadline:
                    raise RuntimeError("No native PIE controller")
                yield
            receiver = u.new_object(component_class, outer=owner)

            def send(*rows, self_id="self"):
                receiver.call_method("ApplyPeers", ("\n".join(("1\t"+self_id,*rows)),))

            def peers():
                return {a.get_editor_property("PeerId"):a for a in u.GameplayStatics.get_all_actors_of_class(game,peer_class)}

            # The web client's shared coordinate fixtures are already converted by the launcher.
            for sample in samples:
                feet, yaw = sample["feetCm"], sample["yawDeg"]
                pitch, head = sample.get("pitchDeg",0), sample.get("headYawDeg",0)
                send(row("fixture","","",feet,yaw,pitch,head=head))
                actor = peers()["fixture"]
                near_pos(actor,feet)
                near_yaw(actor,yaw)
                assert abs(actor.get_editor_property("ViewPitch")-pitch) < .001
                assert abs(actor.get_editor_property("HeadYaw")-head) < .001
                send()

            first = row("a","Bo%22%27%5C%2522","495374113",(0,0,10),170)
            second = row("b","","",(0,50,10),0)
            echo = row("self","local","",(500,0,0),20)
            send(first,second,echo)
            both = peers()
            assert set(both) == {"a","b"} and both["b"].get_editor_property("DisplayName") == "Anonym"
            a = both["a"]
            a.set_actor_tick_enabled(False)
            assert a.get_editor_property("DisplayName") == "Bo\"'\\%22"
            avatar = a.get_component_by_class(u.ChildActorComponent).get_editor_property("child_actor")
            assert avatar and avatar.get_editor_property("LookCode") == "495374113"
            assert both["b"].get_editor_property("Appearance") == "012340100"

            moved = row("a","Ada","012340100",(100,40,30),-170,12,1,1,1,-25)
            send(moved,second)
            assert peers()["a"] == a
            near_pos(a,(0,0,10))
            a.call_method("Advance",(.1,))
            near_pos(a,(50,20,20))
            near_yaw(a,180)
            send(moved,second)  # an unchanged snapshot cannot reset the interpolation
            a.call_method("Advance",(.1,))
            near_pos(a,(100,40,30))
            near_yaw(a,-170)
            assert a.get_editor_property("Away") and a.get_editor_property("Crouch")
            assert a.get_editor_property("ViewPitch") == 12 and a.get_editor_property("HeadYaw") == -25
            assert avatar.get_editor_property("LookCode") == "012340100" and avatar.get_editor_property("Pose") == 1
            assert str(a.get_component_by_class(u.TextRenderComponent).get_editor_property("text")) == "Ada (borta)"

            # A newer target during interpolation starts at the displayed feet, not at the old endpoint.
            send(row("a","Ada","",(300,40,30),-90))
            assert set(peers()) == {"a"}
            a.call_method("Advance",(.05,))
            near_pos(a,(150,40,30))
            send(row("a","Ada","",(190,40,30),-90))
            a.call_method("Advance",(.1,))
            near_pos(a,(170,40,30))
            receiver.call_method("ApplyPeers",("2\tself",))
            assert peers()["a"] == a
            send(self_id="")  # transport's explicit offline snapshot
            assert not peers()
            send(first)
            assert peers()["a"] != a
            send()
            assert not peers()
            u.log(f"LUNDEN_NETWORK_PEERS_TEST_OK {len(samples)} wire cases, real avatar/look, name, away, replacement and 200 ms movement")
        finally:
            levels.editor_request_end_play()


if "--engine" in sys.argv:
    reflected_nodes(Path(sys.argv[sys.argv.index("--engine")+1]))
else:
    pie()
