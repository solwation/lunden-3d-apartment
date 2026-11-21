"""#2291: the avatars' looks, /Game/Lunden/Avatar/Looks/, built headless from this script.

The web keeps a figure's appearance in a look code (src/config.js encodeAvatarLook / decodeAvatarLook): 7, 9 or 12
digits and a tagged extension. tools/unreal-engine/avatar-looks.mjs writes avatar-looks.json from src/config.js: the
digit ranges, the tags in the encoder's order, a field table (digit or tag, multiplier, radix, value when absent) and
the palettes, checked against the web's own decoder for thousands of looks.

Assets (one owner, #2291):
  Looks/BPC_LundenLook   ActorComponent; BP_LundenAvatar carries it as the row "Look" of avatar-extensions.json.
                           ParseLook(Code) -> Valid    keeps the digits and one value per known tag (Digits, Tags),
                                                       as decodeAvatarLook accepts them (an invalid code: Valid false)
                           EncodeLook() -> Code        the digits (a 7-digit code gains "00", as the web writes 9) and
                                                       the tags in the encoder's order, without the wire tags d and s
                           LookField(Name) -> Value    one field of the table (skinDigit, hair, height, glasses ...)
                         The code round-trips exactly because the tags are kept as numbers, not re-derived.
                           ApplyLook(Code) -> Applied  dresses BP_LundenAvatar: Figure (the core piece, ABP_LundenLook)
                                                       on Body, the pieces the look's rules pick (a pooled component
                                                       each, leader pose Figure), the region colours, the web's scale
                                                       (FigureScale, HeadScale); sets LookCode/HeightScale/WidthScale on
                                                       the avatar and updates its hit zones. Body stays animating, hidden.
  Looks/Pieces/          SKM_LundenLookPiece_NNN, the web's own figure cut into pieces (avatar-parts.json), from
                         GLBs written by `node tools/unreal-engine/avatar-parts.mjs --out unreal/Lunden/Saved/avatar-parts`
  Looks/SK_LundenLook    their skeleton (the web rig's 15 bones; not Rig/Web's, which stays editor-only)
  Looks/M_LundenLook     UV0 = (colour region, shade), UV1/UV2 = a fixed colour; one vector parameter per region
  Looks/IK_LundenLook, RTG_LundenMannequinToWeb, ABP_LundenLook
                         the figure follows Body (the Mannequin) by retargeting at run time; the head bone scales

Run (Windows checkout; lock every .uasset under Avatar/Looks first; the GLBs in Saved/avatar-parts must match
avatar-parts.json):
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/unreal-engine/run-python.ps1 tools/unreal-engine/python/build_avatar_looks.py [--force | --check]
A run whose inputs are unchanged (metadata Lunden.SpecHash on BPC_LundenLook) saves nothing; --check fails when an
asset is missing or was built from other inputs. Logs LUNDEN_AVATAR_LOOKS_OK.
"""
import hashlib
import json
from pathlib import Path
import sys

import unreal as u

LOOKS = "/Game/Lunden/Avatar/Looks"
COMPONENT = LOOKS + "/BPC_LundenLook"
COMPONENT_CLASS = COMPONENT + ".BPC_LundenLook_C"
PIECES = LOOKS + "/Pieces"
MATERIAL = LOOKS + "/M_LundenLook"
RTG = LOOKS + "/RTG_LundenMannequinToWeb"
ABP = LOOKS + "/ABP_LundenLook"
ABP_CLASS = ABP + ".ABP_LundenLook_C"
AVATAR_CLASS = "/Game/Lunden/Avatar/Rig/BP_LundenAvatar.BP_LundenAvatar_C"
LOOK_SKELETON = LOOKS + "/SK_LundenLook"  # the web rig's bones (models/avatar-rigged.glb), the looks' own copy
IK_LOOK = LOOKS + "/IK_LundenLook"
MANNY_MESH = "/Game/Lunden/Avatar/Rig/Mannequin/SKM_Manny_Simple"
IK_WEB = "/Game/Lunden/Avatar/Rig/IK_LundenWeb"
IK_MANNY = "/Game/Lunden/Avatar/Rig/IK_LundenMannequin"
GLB_TAG = "Lunden.GlbHash"
SPEC_TAG = "Lunden.SpecHash"
PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
REPO = PROJECT.parents[1]
DATA_FILE = REPO / "tools/unreal-engine/avatar-looks.json"
PARTS_FILE = REPO / "tools/unreal-engine/avatar-parts.json"
GLB_DIR = PROJECT / "Saved/avatar-parts"  # node tools/unreal-engine/avatar-parts.mjs --out <this folder>
MACROS = "/Engine/EditorBlueprintResources/StandardMacros.StandardMacros:"
M = "KismetMathLibrary:"
S = "KismetStringLibrary:"
A = "KismetArrayLibrary:"
MAP = "BlueprintMapLibrary:"

ASSETS = u.EditorAssetLibrary
REG = u.AssetRegistryHelpers.get_asset_registry()
BP = u.BlueprintEditorLibrary
GRAPH = u.BlueprintGraphEditor
TOOLS = u.AssetToolsHelpers.get_asset_tools()
INT = BP.get_basic_type_by_name("int")
BOOL = BP.get_basic_type_by_name("bool")
STRING = BP.get_basic_type_by_name("string")
STRINGS = BP.get_array_type(STRING)
INTS = BP.get_array_type(INT)
TAGMAP = BP.get_map_type(STRING, INT)
REAL = BP.get_basic_type_by_name("real")
BOOLS = BP.get_array_type(BOOL)
REALS = BP.get_array_type(REAL)
VECTOR = BP.get_struct_type(u.Vector.static_struct())
COLOURS = BP.get_array_type(BP.get_struct_type(u.LinearColor.static_struct()))
COLOUR = BP.get_struct_type(u.LinearColor.static_struct())
report = {"engine": u.SystemLibrary.get_engine_version()}


def log(text):
    u.log("LUNDEN_AVATAR_LOOKS " + text)


def pins(node, find):
    return [str(p.get_pin_name()) for p in find(node)]


def out(node, name="ReturnValue"):
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


class Fn:
    """A function graph with an exec cursor: `then(node)` appends a node to the running exec chain."""

    def __init__(self, bp, name, inputs=(), outputs=(), pure=False):
        self.g = GRAPH.create_and_edit_function_graph(bp, name)
        if not self.g:
            raise RuntimeError("Could not create the function " + name)
        self.params = {}
        for pname, ptype in inputs:
            self.params[pname] = self.g.add_graph_input_parameter(pname, ptype)
        self.result = None
        for pname, ptype in outputs:
            self.result = self.g.add_graph_output_parameter(pname, ptype)
        if pure:
            self.g.set_is_pure_function(True)
        self.cur = self.g.find_graph_entry_pin()
        self.x, self.y = 300, 0

    def place(self, node):
        if not node:
            raise RuntimeError(f"node creation failed at {self.x},{self.y}")
        BP.set_node_pos(node, u.IntPoint(self.x, self.y))
        self.x += 220
        return node

    def wire(self, node, ins):
        for pin, src in ins.items():
            if src is None:
                continue
            pin = "self" if pin == "self_" else pin  # the target pin (a keyword argument cannot be called self)
            if hasattr(src, "try_create_connection"):
                link(src, inp(node, pin))
            else:
                text = ("true" if src else "false") if isinstance(src, bool) else str(src)
                if not inp(node, pin).set_pin_value(text):
                    raise RuntimeError(f"Could not set {node.get_name()}.{pin} to {text}")
        return node

    def call(self, path, **ins):
        full = path if path.startswith("/") else "/Script/Engine." + path
        return self.wire(self.place(self.g.add_call_function_node(full)), ins)

    def get(self, name):
        return out(self.place(self.g.add_get_member_variable_node(name, "")), name)

    def local(self, name, ptype, default=""):
        if not self.g.add_local_variable(name, ptype, default):
            raise RuntimeError("Could not add the local variable " + name)

    def lget(self, name):
        return out(self.place(self.g.add_get_local_variable_node(name)), name)

    def then(self, node):
        link(self.cur, BP.find_execute_pin(node))
        self.cur = BP.find_then_pin(node)
        return node

    def set(self, name, src, local=False):
        node = self.place(self.g.add_set_local_variable_node(name) if local else self.g.add_set_member_variable_node(name, ""))
        self.wire(node, {name: src})
        return self.then(node)

    def exec_call(self, path, **ins):
        return self.then(self.call(path, **ins))

    def branch(self, condition):
        node = self.place(self.g.add_branch_node())
        self.wire(node, {"Condition": condition})
        link(self.cur, BP.find_execute_pin(node))
        return out(node, "then"), out(node, "else")

    def macro(self, name, **ins):
        node = self.place(self.g.add_macro_node(MACROS + name))
        self.wire(node, ins)
        exec_in = [p for p in BP.list_input_pins(node) if str(p.get_pin_name()) in ("Exec", "execute")]
        link(self.cur, exec_in[0])
        return node

    def finish(self, fresh=False, **outs):
        """Wire the exec chain into a return node: the function's own, or with `fresh` another one (a return node's
        literal outputs are shared by every path into it)."""
        ret = self.result if self.result and not fresh else self.place(self.g.add_return_node())
        self.wire(ret, outs)
        link(self.cur, BP.find_execute_pin(ret))
        return ret

    # pure helpers returning output pins
    def f(self, path, pin="ReturnValue", **ins):
        return out(self.call(path, **ins), pin)

    def any(self, *conds):
        acc = conds[0]
        for c in conds[1:]:
            acc = self.f(M + "BooleanOR", A=acc, B=c)
        return acc

    def all(self, *conds):
        acc = conds[0]
        for c in conds[1:]:
            acc = self.f(M + "BooleanAND", A=acc, B=c)
        return acc

    def plain_digits(self, text):
        """IsNumeric without a sign, point or space (FCString::IsNumeric accepts those)."""
        bad = [self.f(S + "Contains", SearchIn=text, Substring=ch) for ch in ("+", "-", ".", " ")]
        return self.all(self.f(S + "IsNumeric", SourceString=text), self.f(M + "Not_PreBool", A=self.any(*bad)))


def blueprint(path, parent):
    if ASSETS.does_asset_exist(path):
        return ASSETS.load_asset(path)
    factory = u.BlueprintFactory()
    factory.set_editor_property("parent_class", parent)
    folder, name = path.rsplit("/", 1)
    bp = TOOLS.create_asset(name, folder, u.Blueprint, factory)
    if not bp:
        raise RuntimeError("Could not create " + path)
    return bp


def variables(bp, wanted):
    have = {str(n) for n in BP.list_member_variable_names(bp)}
    for name, kind in wanted.items():
        if name in have:
            if BP.get_member_variable_type(bp, name).export_text() != kind.export_text():
                BP.change_member_variable_type(bp, name, kind)
        elif not BP.add_member_variable(bp, name, kind):
            raise RuntimeError("Could not add the variable " + name)


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
    broken = [f"{name}: {n.get_name()}" for name in graphs
              for n in GRAPH.get_graph_editor_by_name(bp, name).list_nodes_with_errors()]
    if broken:
        raise RuntimeError(f"{bp.get_name()} failed to compile: " + "; ".join(broken))


# BPC_LundenLook: the code --------------------------------------------------------------------------------------------

VARS = {
    "Letters": STRINGS, "DigitMax": INTS, "HeightMin": INT, "HeightMax": INT, "ExtMax": INT, "ExtMaxTags": INT,
    "KnownTags": STRINGS, "EncodeTags": STRINGS,
    "FieldNames": STRINGS, "FieldDigit": INTS, "FieldTag": STRINGS, "FieldMult": INTS, "FieldRadix": INTS, "FieldNone": INTS,
    "LookCode": STRING, "LookValid": BOOL, "Digits": STRING, "Tags": TAGMAP,
}
FUNCTIONS = ("ParseLook", "EncodeLook", "LookField", "LookValues", "EnsureFigure", "ChoosePieces", "ColourLook", "ScaleLook",
             "ApplyLook")


def figure_vars():
    mesh = BP.get_object_reference_type(u.SkeletalMesh)
    comp = BP.get_object_reference_type(u.SkeletalMeshComponent)
    out = {
        "Figure": comp, "PieceComps": BP.get_array_type(comp), "Mat": BP.get_object_reference_type(u.MaterialInstanceDynamic),
        "PieceMeshes": BP.get_array_type(mesh), "CoreMesh": mesh, "BoxPiece": INTS, "BoxAllowed": BOOLS, "SlotCount": INT,
        "AxisFields": STRINGS, "AxisMax": INTS, "AxisOffset": INTS, "BeardCutAxis": INT,
        "SkinColours": COLOURS, "TopColours": COLOURS, "PantsColours": COLOURS, "ShoeColours": COLOURS, "HairColours": COLOURS,
        "EyeColours": COLOURS, "BrowColours": COLOURS, "LipstickColours": COLOURS, "LipTint": COLOUR, "SkinBase": INT,
        "LipSkinMix": REAL, "LipDark": REAL, "LipstickMix": REAL,
        "SeededTall": REALS, "HeightPivot": REAL, "HeightTop": REAL, "HeightAdult": REAL, "HeadPow": REAL,
        "FigureScale": VECTOR, "HeadScale": REAL, "CaptureOnly": BOOL,
    }
    out.update({"Colour" + n: COLOUR for n in REGION_PARAMS})
    return out


def figure_defaults(looks, parts):
    """The rules and palettes as the component's defaults (avatar-parts.json, avatar-looks.json)."""
    axes = [(a, parts["ranges"][a]) for a in parts["axes"]] + list(parts["shown"].items())
    offsets, total = [], 0
    for _, values in axes:
        if values != list(range(len(values))):
            raise RuntimeError(f"choice values are not 0..n-1: {axes}")
        offsets.append(total)
        total += len(values)
    names = [p["name"] for p in parts["pieces"]]
    box_piece, allowed = [], []
    for i, piece in enumerate(parts["pieces"]):
        for box in piece["any"]:
            box_piece.append(i)
            for (axis, values) in axes:
                allowed += [v in box.get(axis, values) for v in values]
    pal = looks["palettes"]
    lin = lambda hexes: [srgb_linear(h) for h in hexes]  # noqa: E731
    h = parts["heightRule"]
    return {
        "PieceMeshes": [ASSETS.load_asset(PIECES + "/" + n) for n in names], "CoreMesh": ASSETS.load_asset(PIECES + "/" + parts["core"]),
        "BoxPiece": box_piece, "BoxAllowed": allowed, "SlotCount": total,
        "AxisFields": [a for a, _ in axes], "AxisMax": [len(v) - 1 for _, v in axes], "AxisOffset": offsets,
        "BeardCutAxis": [a for a, _ in axes].index("beardCut"),
        "SkinColours": lin([c["colour"] for c in pal["skin"]]), "TopColours": lin(pal["top"]), "PantsColours": lin(pal["pants"]),
        "ShoeColours": lin(pal["shoes"]), "HairColours": lin(pal["hair"]), "EyeColours": lin(pal["eyes"]),
        "BrowColours": lin(parts["brows"]), "LipstickColours": lin(parts["lips"]["lipstick"]), "LipTint": srgb_linear(parts["lips"]["tint"]),
        "SkinBase": next(d["max"] for d in looks["digits"] if d["name"] == "skinDigit") + 1,
        "LipSkinMix": parts["lips"]["skinMix"], "LipDark": parts["lips"]["dark"], "LipstickMix": parts["lips"]["lipstickMix"],
        "SeededTall": h["seededTall"], "HeightPivot": h["pivot"], "HeightTop": h["top"], "HeightAdult": float(h["adult"]),
        "HeadPow": h["headPow"], "FigureScale": u.Vector(1, 1, 1), "HeadScale": 1.0,
    }


def data_defaults(data):
    fields = data["fields"]
    return {
        "Letters": [chr(c) for c in range(ord("a"), ord("z") + 1)],
        "DigitMax": [d["max"] for d in data["digits"]],
        "HeightMin": data["height"]["min"], "HeightMax": data["height"]["max"],
        "ExtMax": data["extMax"], "ExtMaxTags": data["extMaxTags"],
        "KnownTags": [t["tag"] for t in data["tags"]], "EncodeTags": [t["tag"] for t in data["tags"] if t["encode"]],
        "FieldNames": [f["name"] for f in fields],
        "FieldDigit": [f["at"] if isinstance(f["at"], int) else (len(data["digits"]) if f["at"] == "height" else -1) for f in fields],
        "FieldTag": [f["at"] if isinstance(f["at"], str) and f["at"] != "height" else "" for f in fields],
        "FieldMult": [f["mult"] for f in fields],
        # radix 0 (the rest of the value) reads as a modulus no tag value reaches
        "FieldRadix": [f["radix"] or 1 << 30 for f in fields],
        "FieldNone": [f["none"] for f in fields],
    }


def parse_look(bp, ndigits):
    fn = Fn(bp, "ParseLook", [("Code", STRING)], [("Valid", BOOL)])
    code = fn.params["Code"]
    fn.local("Work", STRING)
    fn.local("Ok", BOOL, "true")
    fn.local("ExtOk", BOOL, "true")
    fn.local("Found", TAGMAP)
    # Put a comma before every lower-case letter, then split: the digits, then one "letter + digits" per tag.
    fn.set("Work", code, local=True)
    loop = fn.macro("ForEachLoop", Array=fn.get("Letters"))
    fn.cur = out(loop, "LoopBody")
    letter = out(loop, "Array Element")
    fn.set("Work", fn.f(S + "Replace", SourceString=fn.lget("Work"), From=letter,
                        To=fn.f(S + "Concat_StrStr", A=",", B=letter), SearchCase="CaseSensitive"), local=True)
    fn.cur = out(loop, "Completed")
    split = fn.call(S + "ParseIntoArray", SourceString=fn.lget("Work"), Delimiter=",", CullEmptyStrings=False)
    parts = out(split, "ReturnValue")
    digits = fn.f(A + "Array_Get", pin="Item", TargetArray=parts, Index=0)
    count = fn.f(S + "Len", S=digits)
    shape = fn.all(fn.any(*[fn.f(M + "EqualEqual_IntInt", A=count, B=n) for n in (7, 9, 12)]), fn.plain_digits(digits),
                   fn.f(M + "Not_PreBool", A=fn.f(S + "Contains", SearchIn=code, Substring=",")))
    fn.set("Ok", shape, local=True)
    # Every digit within its range (avatarCodeValid), the height within AVATAR_HEIGHT.
    last = fn.f(M + "Subtract_IntInt", A=fn.f(M + "Min", A=count, B=ndigits), B=1)
    each = fn.macro("ForLoop", FirstIndex=0, LastIndex=last)
    fn.cur = out(each, "LoopBody")
    i = out(each, "Index")
    digit = fn.f(S + "Conv_StringToInt", InString=fn.f(S + "GetSubstring", SourceString=digits, StartIndex=i, Length=1))
    limit = fn.f(A + "Array_Get", pin="Item", TargetArray=fn.get("DigitMax"), Index=i)
    fn.set("Ok", fn.all(fn.lget("Ok"), fn.f(M + "LessEqual_IntInt", A=digit, B=limit)), local=True)
    fn.cur = out(each, "Completed")
    height = fn.f(S + "Conv_StringToInt", InString=fn.f(S + "RightChop", SourceString=digits, Count=ndigits))
    in_range = fn.all(fn.f(M + "GreaterEqual_IntInt", A=height, B=fn.get("HeightMin")),
                      fn.f(M + "LessEqual_IntInt", A=height, B=fn.get("HeightMax")))
    twelve = fn.f(M + "EqualEqual_IntInt", A=count, B=12)
    fn.set("Ok", fn.all(fn.lget("Ok"), fn.any(fn.f(M + "Not_PreBool", A=twelve), in_range)), local=True)
    good, bad = fn.branch(fn.lget("Ok"))
    # Invalid: no look (the web falls back to the player's seed look).
    fn.cur = bad
    fn.set("LookValid", False)
    fn.set("Digits", "")
    fn.exec_call(MAP + "Map_Clear", TargetMap=fn.get("Tags"))
    fn.set("LookCode", "")
    fn.finish(Valid=fn.get("LookValid"))  # one shared result node: return the variable, not a literal
    # The extension: at most ExtMax characters and ExtMaxTags tags, each a letter and 1-3 digits, or none of it counts.
    fn.cur = good
    ext = fn.f(S + "RightChop", SourceString=code, Count=count)
    tags = fn.f(M + "Subtract_IntInt", A=fn.f(A + "Array_Length", TargetArray=parts), B=1)
    fn.set("ExtOk", fn.all(fn.f(M + "LessEqual_IntInt", A=fn.f(S + "Len", S=ext), B=fn.get("ExtMax")),
                           fn.f(M + "LessEqual_IntInt", A=tags, B=fn.get("ExtMaxTags"))), local=True)
    fn.exec_call(MAP + "Map_Clear", TargetMap=fn.lget("Found"))
    tokens = fn.macro("ForEachLoop", Array=parts)
    fn.cur = out(tokens, "LoopBody")
    token, index = out(tokens, "Array Element"), out(tokens, "Array Index")
    rest = fn.f(S + "RightChop", SourceString=token, Count=1)
    size = fn.f(S + "Len", S=rest)
    token_ok = fn.all(fn.f(M + "GreaterEqual_IntInt", A=size, B=1), fn.f(M + "LessEqual_IntInt", A=size, B=3),
                      fn.plain_digits(rest))
    is_tag, _ = fn.branch(fn.f(M + "Greater_IntInt", A=index, B=0))
    fn.cur = is_tag
    fn.set("ExtOk", fn.all(fn.lget("ExtOk"), token_ok), local=True)
    tag = fn.f(S + "Left", SourceString=token, Count=1)
    known, _ = fn.branch(fn.all(token_ok, fn.f(A + "Array_Contains", TargetArray=fn.get("KnownTags"), ItemToFind=tag)))
    fn.cur = known
    fn.exec_call(MAP + "Map_Add", TargetMap=fn.lget("Found"), Key=tag,
                 Value=fn.f(S + "Conv_StringToInt", InString=rest))  # a repeated tag: the last one counts, as on the web
    fn.cur = out(tokens, "Completed")
    fn.set("Digits", digits)
    fn.set("LookValid", True)
    keep, drop = fn.branch(fn.lget("ExtOk"))
    fn.cur = keep
    fn.set("Tags", fn.lget("Found"))
    after = fn.cur
    fn.cur = drop
    fn.exec_call(MAP + "Map_Clear", TargetMap=fn.get("Tags"))
    # both paths continue to the encoding
    encode = fn.call("/Game/Lunden/Avatar/Looks/BPC_LundenLook.BPC_LundenLook_C:EncodeLook")
    link(after, BP.find_execute_pin(encode))
    link(fn.cur, BP.find_execute_pin(encode))
    fn.cur = BP.find_then_pin(encode)
    fn.set("LookCode", out(encode, "Code"))
    fn.finish(Valid=fn.get("LookValid"))


def encode_look(bp):
    fn = Fn(bp, "EncodeLook", [], [("Code", STRING)])
    fn.local("Text", STRING)
    seven = fn.f(M + "EqualEqual_IntInt", A=fn.f(S + "Len", S=fn.get("Digits")), B=7)
    fn.set("Text", fn.f(S + "Concat_StrStr", A=fn.get("Digits"), B=fn.f(M + "SelectString", A="00", B="", bPickA=seven)),
           local=True)
    loop = fn.macro("ForEachLoop", Array=fn.get("EncodeTags"))
    fn.cur = out(loop, "LoopBody")
    tag = out(loop, "Array Element")
    find = fn.call(MAP + "Map_Find", TargetMap=fn.get("Tags"), Key=tag)
    has, _ = fn.branch(out(find, "ReturnValue"))
    fn.cur = has
    piece = fn.f(S + "Concat_StrStr", A=tag, B=fn.f(S + "Conv_IntToString", InInt=out(find, "Value")))
    fn.set("Text", fn.f(S + "Concat_StrStr", A=fn.lget("Text"), B=piece), local=True)
    fn.cur = out(loop, "Completed")
    fn.finish(Code=fn.f(M + "SelectString", A=fn.lget("Text"), B="", bPickA=fn.get("LookValid")))


def look_field(bp, ndigits):
    fn = Fn(bp, "LookField", [("Name", STRING)], [("Value", INT)], pure=True)
    i = fn.f(A + "Array_Find", TargetArray=fn.get("FieldNames"), ItemToFind=fn.params["Name"])
    at = lambda arr: fn.f(A + "Array_Get", pin="Item", TargetArray=fn.get(arr), Index=i)  # noqa: E731
    digit, tag, mult, radix, none = at("FieldDigit"), at("FieldTag"), at("FieldMult"), at("FieldRadix"), at("FieldNone")
    digits = fn.get("Digits")
    count = fn.f(S + "Len", S=digits)
    one = fn.f(S + "Conv_StringToInt", InString=fn.f(S + "GetSubstring", SourceString=digits, StartIndex=digit, Length=1))
    from_digit = fn.f(M + "SelectInt", A=one, B=none, bPickA=fn.f(M + "Less_IntInt", A=digit, B=count))
    tall = fn.f(S + "Conv_StringToInt", InString=fn.f(S + "RightChop", SourceString=digits, Count=ndigits))
    from_height = fn.f(M + "SelectInt", A=tall, B=none, bPickA=fn.f(M + "EqualEqual_IntInt", A=count, B=ndigits + 3))
    find = fn.call(MAP + "Map_Find", TargetMap=fn.get("Tags"), Key=tag)
    packed = fn.f(M + "Percent_IntInt", A=fn.f(M + "Divide_IntInt", A=out(find, "Value"), B=mult), B=radix)
    from_tag = fn.f(M + "SelectInt", A=packed, B=none, bPickA=out(find, "ReturnValue"))
    is_height = fn.f(M + "EqualEqual_IntInt", A=digit, B=ndigits)
    is_digit = fn.f(M + "GreaterEqual_IntInt", A=digit, B=0)
    value = fn.f(M + "SelectInt", A=fn.f(M + "SelectInt", A=from_height, B=from_digit, bPickA=is_height), B=from_tag,
                 bPickA=is_digit)
    known = fn.f(M + "GreaterEqual_IntInt", A=i, B=0)
    ret = fn.result
    fn.wire(ret, {"Value": fn.f(M + "SelectInt", A=value, B=-1, bPickA=known)})
    link(fn.cur, BP.find_execute_pin(ret))


def build_component(data, parts):
    bp = blueprint(COMPONENT, u.ActorComponent)
    remove_functions(bp, FUNCTIONS)
    variables(bp, {**VARS, **figure_vars()})
    BP.compile_blueprint(bp)
    ndigits = len(data["digits"])
    encode_look(bp)
    look_field(bp, ndigits)
    BP.compile_blueprint(bp)
    parse_look(bp, ndigits)
    avatar_cls = u.load_class(None, AVATAR_CLASS)
    # each compiled before the next, which calls it
    for step in (look_values, ensure_figure, choose_pieces, colour_look, lambda b: scale_look(b, avatar_cls)):
        step(bp)
        BP.compile_blueprint(bp)
    apply_look(bp, avatar_cls)
    compiled(bp, list(FUNCTIONS))
    default = u.get_default_object(bp.generated_class())
    for name, v in {**data_defaults(data), **figure_defaults(data, parts)}.items():
        default.set_editor_property(name, v)
    return bp


# The figure: the web's own pieces (avatar-parts.json) --------------------------------------------------------------

MATS = u.MaterialEditingLibrary
REGION_PARAMS = ("Skin", "Top", "Pants", "Hair", "Shoes", "Lips", "Iris", "Beard", "Brow", "Leather")
# UV0 = (region, shade), UV1 = (red, green), UV2 = (blue, -) of a fixed colour; regions as src/avatar.js REGION
SHADER = """int r = (int)round(UV.x);
float3 c = r == 0 ? Skin : r == 1 ? Top : r == 2 ? Pants : r == 3 ? Hair : r == 5 ? Shoes : r == 6 ? Lips
  : r == 7 ? Iris : r == 8 ? Beard : r == 9 ? Brow : r == 10 ? Leather : float3(Fixed.xy, FixedB.x);
return r == 4 ? float3(Fixed.xy, FixedB.x) : c * UV.y;"""


def srgb_linear(hex_colour):
    """#rrggbb (sRGB) as linear RGB, as three.js's Color(hex) does with colour management."""
    out = []
    for i in (1, 3, 5):
        c = int(hex_colour[i:i + 2], 16) / 255
        out.append(c / 12.92 if c < 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return u.LinearColor(out[0], out[1], out[2], 1.0)


def build_material():
    if ASSETS.does_asset_exist(MATERIAL):
        ASSETS.delete_asset(MATERIAL)
    folder, name = MATERIAL.rsplit("/", 1)
    mat = TOOLS.create_asset(name, folder, u.Material, u.MaterialFactoryNew())
    mat.set_editor_property("used_with_skeletal_mesh", True)
    custom = MATS.create_material_expression(mat, u.MaterialExpressionCustom, -400, 0)
    custom.set_editor_property("code", SHADER)
    custom.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT3)
    names = ["UV", "Fixed", "FixedB"] + list(REGION_PARAMS)
    inputs = []
    for n in names:
        ci = u.CustomInput()
        ci.set_editor_property("input_name", n)
        inputs.append(ci)
    custom.set_editor_property("inputs", inputs)
    for i, n in enumerate(names):
        if n in ("UV", "Fixed", "FixedB"):
            tc = MATS.create_material_expression(mat, u.MaterialExpressionTextureCoordinate, -800, i * 80)
            tc.set_editor_property("coordinate_index", ("UV", "Fixed", "FixedB").index(n))
            MATS.connect_material_expressions(tc, "", custom, n)
        else:
            par = MATS.create_material_expression(mat, u.MaterialExpressionVectorParameter, -800, i * 80)
            par.set_editor_property("parameter_name", n)
            par.set_editor_property("default_value", u.LinearColor(0.5, 0.5, 0.5, 1))
            MATS.connect_material_expressions(par, "", custom, n)
    MATS.connect_material_property(custom, "", u.MaterialProperty.MP_BASE_COLOR)
    rough = MATS.create_material_expression(mat, u.MaterialExpressionConstant, -400, 300)
    rough.set_editor_property("r", 0.8)  # *assumption*: the web's MeshStandardMaterial roughness for the figure
    MATS.connect_material_property(rough, "", u.MaterialProperty.MP_ROUGHNESS)
    MATS.recompile_material(mat)
    return mat


def import_glb(src, skeleton):
    """One piece GLB as a SkeletalMesh in Pieces/ (onto `skeleton`, or making a new one); returns the import's paths."""
    pipe = u.InterchangeGenericAssetsPipeline()
    if skeleton:
        pipe.get_editor_property("common_skeletal_meshes_and_animations_properties").set_editor_property("skeleton", skeleton)
    meshes = pipe.get_editor_property("mesh_pipeline")
    meshes.set_editor_property("create_physics_asset", False)
    # no welding: parts meet at shared points (a trouser leg's inner seam and the other leg's) that follow other bones
    meshes.set_editor_property("threshold_position", 0.0)
    pipe.get_editor_property("animation_pipeline").set_editor_property("import_animations", False)
    pipe.get_editor_property("material_pipeline").set_editor_property("import_materials", False)
    common = pipe.get_editor_property("common_meshes_properties")
    common.set_editor_property("force_all_mesh_as_type", u.InterchangeForceMeshType.IFMT_SKELETAL_MESH)
    common.set_editor_property("recompute_normals", False)
    common.set_editor_property("use_full_precision_u_vs", True)
    stack = u.InterchangePipelineStackOverride()
    stack.add_pipeline(pipe)
    task = u.AssetImportTask()
    task.filename = str(src)
    task.destination_path = PIECES
    task.automated = True
    task.save = False
    task.replace_existing = True
    task.options = stack
    TOOLS.import_asset_tasks([task])
    return [str(p) for p in task.imported_object_paths]


def import_pieces(parts, mat):
    """Every piece GLB on the looks' skeleton (made from the core piece, so nothing the game loads reaches the editor-only
    web rig in Rig/Web/); a piece whose GLB hash is unchanged is kept."""
    order = sorted(parts["pieces"], key=lambda p: p["name"] != parts["core"])
    if not ASSETS.does_asset_exist(LOOK_SKELETON) and ASSETS.does_directory_exist(PIECES):
        ASSETS.delete_directory(PIECES)  # pieces on another skeleton: import them all again
    made = []
    for piece in order:
        dst = PIECES + "/" + piece["name"]
        made.append(dst)
        if ASSETS.does_asset_exist(dst) and ASSETS.get_metadata_tag(ASSETS.load_asset(dst), GLB_TAG) == piece["sha256"] \
                and ASSETS.does_asset_exist(LOOK_SKELETON):
            continue
        src = GLB_DIR / (piece["name"] + ".glb")
        if not src.exists() or hashlib.sha256(src.read_bytes()).hexdigest() != piece["sha256"]:
            raise RuntimeError(f"{src} is missing or stale: run node tools/unreal-engine/avatar-parts.mjs --out {GLB_DIR}")
        if piece["name"] == parts["core"] and not ASSETS.does_asset_exist(LOOK_SKELETON):
            paths = import_glb(src, None)
            skels = [str(d.package_name) for d in REG.get_assets_by_path(PIECES, recursive=True)
                     if str(d.asset_class_path.asset_name) == "Skeleton"]
            if len(skels) != 1 or not ASSETS.rename_asset(skels[0], LOOK_SKELETON):
                raise RuntimeError(f"The core piece made no single skeleton: {skels} ({paths})")
        else:
            paths = import_glb(src, ASSETS.load_asset(LOOK_SKELETON))
        mesh = ASSETS.load_asset(dst)
        if not mesh or mesh.skeleton.get_path_name() != ASSETS.load_asset(LOOK_SKELETON).get_path_name():
            raise RuntimeError(f"{piece['name']} did not import onto {LOOK_SKELETON}: {paths}")
        slots = mesh.get_editor_property("materials")
        for slot in slots:
            slot.set_editor_property("material_interface", mat)
        mesh.set_editor_property("materials", slots)
        ASSETS.set_metadata_tag(mesh, GLB_TAG, piece["sha256"])
    wanted = set(made)
    for path in [str(d.package_name) for d in REG.get_assets_by_path(PIECES, recursive=True)]:
        if path not in wanted:
            ASSETS.delete_asset(path)
    return made


def build_ik_rig(core):
    """IK_LundenLook: #2290's IK_LundenWeb (its chains, read only) on the looks' skeleton."""
    if ASSETS.does_asset_exist(IK_LOOK):
        ASSETS.delete_asset(IK_LOOK)
    rig = ASSETS.duplicate_asset(IK_WEB, IK_LOOK)
    ctl = u.IKRigController.get_controller(rig)
    if not ctl.set_skeletal_mesh(core):
        raise RuntimeError("IK_LundenLook: could not use the core piece")
    return rig


def build_retargeter(core):
    """The Mannequin's motion (BP_LundenAvatar's Body) onto the web rig, at run time (#2290's rigs, read only)."""
    if ASSETS.does_asset_exist(RTG):
        rtg = ASSETS.load_asset(RTG)
    else:
        folder, name = RTG.rsplit("/", 1)
        rtg = TOOLS.create_asset(name, folder, u.IKRetargeter, u.IKRetargetFactory())
    ctl = u.IKRetargeterController.get_controller(rtg)
    src, dst = ASSETS.load_asset(IK_MANNY), ASSETS.load_asset(IK_LOOK)
    ctl.set_ik_rig(u.RetargetSourceOrTarget.SOURCE, src)
    ctl.set_ik_rig(u.RetargetSourceOrTarget.TARGET, dst)
    ctl.set_preview_mesh(u.RetargetSourceOrTarget.SOURCE, ASSETS.load_asset(MANNY_MESH))
    ctl.set_preview_mesh(u.RetargetSourceOrTarget.TARGET, core)
    ctl.remove_all_ops()
    ctl.add_default_ops()
    # #2367: no Root Motion op. The web rig's root bone is hips itself (no separate root bone above it), so the op put hips on
    # the ground under the pelvis after Pelvis Motion and the FK chains had placed it: the pieces rigid on hips (the
    # briefs, the fly) sank into the floor and the trousers' waist stretched down to them.
    root_motion = ctl.get_index_of_op_by_name("Root Motion")
    if root_motion < 0 or not ctl.remove_retarget_op(root_motion) or ctl.get_index_of_op_by_name("Root Motion") >= 0:
        raise RuntimeError(f"{RTG}: could not remove the default Root Motion op")
    ctl.assign_ik_rig_to_all_ops(u.RetargetSourceOrTarget.SOURCE, src)
    ctl.assign_ik_rig_to_all_ops(u.RetargetSourceOrTarget.TARGET, dst)
    ctl.auto_map_chains(u.AutoMapChainType.CLEAR, True)
    web_chains = [str(c.get_editor_property("chain_name")) for c in u.IKRigController.get_controller(dst).get_retarget_chains()]
    for chain_name in web_chains:
        ctl.set_source_chain(chain_name, chain_name)
    # The web rig's arms hang down, the Mannequin stands in an A pose: align the web rig to the Mannequin's pose.
    ctl.auto_align_all_bones(u.RetargetSourceOrTarget.TARGET, u.RetargetAutoAlignMethod.CHAIN_TO_CHAIN)
    report["retarget"] = web_chains
    return rtg


def anim_node(ed, name, x, y, **props):
    node = ed.create_node_from_name(name, u.Vector2D(x, y), [])
    if not node:
        raise RuntimeError("No anim node " + name)
    if props:
        data = node.get_editor_property("node")
        for key, v in props.items():
            data.set_editor_property(key, v)
        node.set_editor_property("node", data)
    return node


def build_anim(rtg, core):
    """ABP_LundenLook: the web rig follows its attached parent (Body) through RTG, the head scaled by HeadScale."""
    if ASSETS.does_asset_exist(ABP):
        ASSETS.delete_asset(ABP)
    factory = u.AnimBlueprintFactory()
    factory.set_editor_property("target_skeleton", ASSETS.load_asset(LOOK_SKELETON))
    factory.set_editor_property("parent_class", u.AnimInstance)
    factory.set_editor_property("preview_skeletal_mesh", core)
    folder, name = ABP.rsplit("/", 1)
    abp = TOOLS.create_asset(name, folder, u.AnimBlueprint, factory)
    variables(abp, {"HeadScale": VECTOR})
    BP.compile_blueprint(abp)
    u.get_default_object(abp.generated_class()).set_editor_property("HeadScale", u.Vector(1, 1, 1))
    ed = GRAPH.get_graph_editor_by_name(abp, "AnimGraph")
    root = [n for n in ed.list_all_nodes() if n.get_class().get_name() == "AnimGraphNode_Root"][0]
    names = [str(n) for n in ed.list_available_nodes([])]
    found = [n for n in names if n.replace(" ", "").lower().endswith("retargetposefrommesh")]
    if not found:
        raise RuntimeError("No Retarget Pose From Mesh node: " + str([n for n in names if "etarget" in n][:20]))
    follow = anim_node(ed, found[0], -900, 0, retarget_from=u.RetargetSourceMode.PARENT_SKELETAL_MESH_COMPONENT,
                       ik_retargeter_asset=rtg)
    to_cs = ed.create_node_from_name("Animation|ConvertSpaces|LocalToComponent", u.Vector2D(-600, 0), [])
    link(out(follow, "Pose"), inp(to_cs, "LocalPose"))
    ref = u.BoneReference()
    ref.set_editor_property("bone_name", "head")
    head = anim_node(ed, "Animation|SkeletalControls|Transform(Modify)Bone", -300, 0, bone_to_modify=ref,
                     scale_mode=u.BoneModificationMode.BMM_REPLACE, scale_space=u.BoneControlSpace.BCS_BONE_SPACE,
                     translation_mode=u.BoneModificationMode.BMM_IGNORE, rotation_mode=u.BoneModificationMode.BMM_IGNORE)
    link(out(to_cs, "ComponentPose"), inp(head, "ComponentPose"))
    getter = ed.add_get_member_variable_node("HeadScale", "")
    link(out(getter, "HeadScale"), inp(head, "Scale"))
    to_ls = ed.create_node_from_name("Animation|ConvertSpaces|ComponentToLocal", u.Vector2D(0, 0), [])
    link(out(head, "Pose"), inp(to_ls, "ComponentPose"))
    link(out(to_ls, "Pose"), inp(root, "Result"))
    BP.compile_blueprint(abp)
    broken = [n.get_name() for n in ed.list_nodes_with_errors()]
    if broken:
        raise RuntimeError("ABP_LundenLook failed to compile: " + str(broken))
    return abp


def cast(fn, obj, cls):
    """An impure cast of `obj` to `cls` (a class object) on the exec chain; returns its typed output pin."""
    node = fn.place(fn.g.create_node_from_name("Utilities|Casting|CastToActor", u.Vector2D(0, 0), []))
    if not fn.g.retarget_node_class(node, u.Actor.static_class(), cls):
        raise RuntimeError("Could not make a cast to " + cls.get_name())
    link(obj, inp(node, "Object"))
    fn.then(node)
    return [p for p in BP.list_output_pins(node) if str(p.get_pin_name()).startswith("As")][0]


def other_get(fn, obj, name, cls_path):
    node = fn.place(fn.g.add_get_member_variable_node(name, cls_path))
    link(obj, inp(node, "self"))
    return out(node, name)


def other_set(fn, obj, name, cls_path, src):
    node = fn.place(fn.g.add_set_member_variable_node(name, cls_path))
    link(obj, inp(node, "self"))
    fn.wire(node, {name: src})
    return fn.then(node)


def get_at(fn, array, index):
    return fn.f(A + "Array_Get", pin="Item", TargetArray=array, Index=index)


def mine(name):
    return COMPONENT_CLASS + ":" + name


def look_values(bp):
    """LookValues() -> Slots: per choice of the rules (avatar-parts.json axes + shown) the slot of its value, the value
    as the web's figure reads it (an unknown value is 0; the beard's cut needs a fitting facial hair, beardCutOf)."""
    fn = Fn(bp, "LookValues", [], [("Slots", INTS)])
    fn.local("Out", INTS)
    loop = fn.macro("ForEachLoop", Array=fn.get("AxisFields"))
    fn.cur = out(loop, "LoopBody")
    i = out(loop, "Array Index")
    v = fn.f(mine("LookField"), pin="Value", Name=out(loop, "Array Element"))
    ok = fn.all(fn.f(M + "GreaterEqual_IntInt", A=v, B=0), fn.f(M + "LessEqual_IntInt", A=v, B=get_at(fn, fn.get("AxisMax"), i)))
    value = fn.f(M + "SelectInt", A=v, B=0, bPickA=ok)
    fn.exec_call(A + "Array_Add", TargetArray=fn.lget("Out"), NewItem=fn.f(M + "Add_IntInt", A=value, B=get_at(fn, fn.get("AxisOffset"), i)))
    fn.cur = out(loop, "Completed")
    cut, facial = fn.f(mine("LookField"), pin="Value", Name="beardCut"), fn.f(mine("LookField"), pin="Value", Name="facial")
    eq = lambda a, b: fn.f(M + "EqualEqual_IntInt", A=a, B=b)  # noqa: E731
    one = fn.all(eq(cut, 1), eq(facial, 0))
    two = fn.all(eq(cut, 2), fn.any(eq(facial, 1), eq(facial, 3)))
    norm = fn.f(M + "SelectInt", A=1, B=fn.f(M + "SelectInt", A=2, B=0, bPickA=two), bPickA=one)
    axis = fn.get("BeardCutAxis")
    fn.exec_call(A + "Array_Set", TargetArray=fn.lget("Out"), Index=axis,
                 Item=fn.f(M + "Add_IntInt", A=norm, B=get_at(fn, fn.get("AxisOffset"), axis)), bSizeToFit=False)
    fn.finish(Slots=fn.lget("Out"))


def ensure_figure(bp):
    """EnsureFigure() -> Ok: the web figure (Figure, the core piece) on BP_LundenAvatar's Body, which it follows."""
    avatar_cls = u.load_class(None, AVATAR_CLASS)
    fn = Fn(bp, "EnsureFigure", [], [("Ok", BOOL)])
    owner = fn.f("ActorComponent:GetOwner")
    avatar = cast(fn, owner, avatar_cls)
    has, new = fn.branch(fn.f("/Script/Engine.KismetSystemLibrary:IsValid", Object=fn.get("Figure")))
    fn.cur = has
    fn.finish(Ok=True)
    fn.cur = new
    add = fn.exec_call("Actor:AddComponentByClass", self_=avatar, Class="/Script/Engine.SkeletalMeshComponent",
                       bManualAttachment=True,
                       RelativeTransform=fn.f(M + "MakeTransform", Scale="1,1,1"))
    comp = cast(fn, out(add, "ReturnValue"), u.SkeletalMeshComponent.static_class())
    fn.set("Figure", comp)
    body = other_get(fn, avatar, "Body", AVATAR_CLASS)
    fn.exec_call("SceneComponent:K2_AttachToComponent", self_=comp, Parent=body, SocketName="None",
                 LocationRule="SnapToTarget", RotationRule="SnapToTarget", ScaleRule="KeepRelative", bWeldSimulatedBodies=False)
    # The retargeter carries the Mannequin's global directions over, so the figure faces as Body does: no turn.
    fn.exec_call("SceneComponent:K2_SetRelativeRotation", self_=comp, NewRotation="0,0,0", bSweep=False, bTeleport=True)
    fn.exec_call("SkeletalMeshComponent:SetSkeletalMeshAsset", self_=comp, NewMesh=fn.get("CoreMesh"))
    fn.exec_call("SkeletalMeshComponent:SetAnimInstanceClass", self_=comp, NewClass=ABP_CLASS)
    fn.exec_call("PrimitiveComponent:SetVisibleInSceneCaptureOnly", self_=comp, bValue=fn.get("CaptureOnly"))  # the player's own figure
    # Body keeps animating out of sight: the figure reads its bones every frame.
    other_set(fn, body, "VisibilityBasedAnimTickOption", "/Script/Engine.SkinnedMeshComponent", "AlwaysTickPoseAndRefreshBones")
    fn.exec_call("SceneComponent:SetVisibility", self_=body, bNewVisibility=False, bPropagateToChildren=False)
    made = fn.exec_call("PrimitiveComponent:CreateDynamicMaterialInstance", self_=comp, ElementIndex=0,
                        SourceMaterial=MATERIAL + "." + MATERIAL.rsplit("/", 1)[1], OptionalName="None")
    fn.set("Mat", out(made))
    fn.finish(Ok=True)


def choose_pieces(bp):
    """ChoosePieces(): the pieces the look's rules pick (BoxAllowed: per alternative of a piece, one flag per slot).
    The piece components are a pool (a component may only destroy components of its own): each look reuses them in
    order, makes more when it needs more and leaves the rest without a mesh."""
    fn = Fn(bp, "ChoosePieces", [])
    fn.local("Shown", BOOLS)
    fn.local("Ok", BOOL, "true")
    fn.local("Slots", INTS)
    fn.local("Used", INT, "0")
    fn.local("Comp", BP.get_object_reference_type(u.SkeletalMeshComponent))
    fn.set("Slots", out(fn.exec_call(mine("LookValues")), "Slots"), local=True)
    fn.exec_call(A + "Array_Resize", TargetArray=fn.lget("Shown"), Size=fn.f(A + "Array_Length", TargetArray=fn.get("PieceMeshes")))
    boxes = fn.macro("ForEachLoop", Array=fn.get("BoxPiece"))
    fn.cur = out(boxes, "LoopBody")
    b = out(boxes, "Array Index")
    fn.set("Ok", True, local=True)
    axes = fn.macro("ForEachLoop", Array=fn.lget("Slots"))
    fn.cur = out(axes, "LoopBody")
    at = fn.f(M + "Add_IntInt", A=fn.f(M + "Multiply_IntInt", A=b, B=fn.get("SlotCount")), B=out(axes, "Array Element"))
    fn.set("Ok", fn.all(fn.lget("Ok"), get_at(fn, fn.get("BoxAllowed"), at)), local=True)
    fn.cur = out(axes, "Completed")
    yes, _ = fn.branch(fn.lget("Ok"))
    fn.cur = yes
    fn.exec_call(A + "Array_Set", TargetArray=fn.lget("Shown"), Index=out(boxes, "Array Element"), Item=True, bSizeToFit=False)
    fn.cur = out(boxes, "Completed")
    pieces = fn.macro("ForEachLoop", Array=fn.get("PieceMeshes"))
    fn.cur = out(pieces, "LoopBody")
    mesh = out(pieces, "Array Element")
    shown = get_at(fn, fn.lget("Shown"), out(pieces, "Array Index"))
    extra = fn.all(shown, fn.f(M + "Not_PreBool", A=fn.f("/Script/Engine.KismetMathLibrary:EqualEqual_ObjectObject", A=mesh, B=fn.get("CoreMesh"))))
    yes, _ = fn.branch(extra)
    fn.cur = yes
    pooled, fresh = fn.branch(fn.f(M + "Less_IntInt", A=fn.lget("Used"), B=fn.f(A + "Array_Length", TargetArray=fn.get("PieceComps"))))
    fn.cur = pooled
    fn.set("Comp", get_at(fn, fn.get("PieceComps"), fn.lget("Used")), local=True)
    pooled_end = fn.cur
    fn.cur = fresh
    owner = fn.f("ActorComponent:GetOwner")
    add = fn.exec_call("Actor:AddComponentByClass", self_=owner, Class="/Script/Engine.SkeletalMeshComponent",
                       bManualAttachment=True,
                       RelativeTransform=fn.f(M + "MakeTransform", Scale="1,1,1"))
    comp = cast(fn, out(add, "ReturnValue"), u.SkeletalMeshComponent.static_class())
    fn.set("Comp", comp, local=True)
    fn.exec_call("SceneComponent:K2_AttachToComponent", self_=comp, Parent=fn.get("Figure"), SocketName="None",
                 LocationRule="SnapToTarget", RotationRule="SnapToTarget", ScaleRule="SnapToTarget", bWeldSimulatedBodies=False)
    fn.exec_call("SkinnedMeshComponent:SetLeaderPoseComponent", self_=comp, NewLeaderBoneComponent=fn.get("Figure"),
                 bForceUpdate=True, bInFollowerShouldTickPose=False)
    fn.exec_call("PrimitiveComponent:SetVisibleInSceneCaptureOnly", self_=comp, bValue=fn.get("CaptureOnly"))
    fn.exec_call(A + "Array_Add", TargetArray=fn.get("PieceComps"), NewItem=comp)
    common = fn.exec_call("SkeletalMeshComponent:SetSkeletalMeshAsset", self_=fn.lget("Comp"), NewMesh=mesh)
    link(pooled_end, BP.find_execute_pin(common))
    fn.exec_call("PrimitiveComponent:SetMaterial", self_=fn.lget("Comp"), ElementIndex=0, Material=fn.get("Mat"))
    fn.set("Used", fn.f(M + "Add_IntInt", A=fn.lget("Used"), B=1), local=True)
    fn.cur = out(pieces, "Completed")
    spare = fn.macro("ForEachLoop", Array=fn.get("PieceComps"))
    fn.cur = out(spare, "LoopBody")
    unused, _ = fn.branch(fn.f(M + "GreaterEqual_IntInt", A=out(spare, "Array Index"), B=fn.lget("Used")))
    fn.cur = unused
    fn.exec_call("SkeletalMeshComponent:SetSkeletalMeshAsset", self_=out(spare, "Array Element"), NewMesh=None)
    fn.cur = out(spare, "Completed")
    fn.finish()


def colour_look(bp):
    """ColourLook(): the material's region colours from the look's palettes (as avatarModelGeometry's `pal`)."""
    fn = Fn(bp, "ColourLook", [])
    field = lambda n: fn.f(mine("LookField"), pin="Value", Name=n)  # noqa: E731
    skin_ext = field("skinExt")
    skin_i = fn.f(M + "SelectInt", A=fn.f(M + "Add_IntInt", A=fn.f(M + "Subtract_IntInt", A=fn.get("SkinBase"), B=1), B=skin_ext),
                  B=field("skinDigit"), bPickA=fn.f(M + "Greater_IntInt", A=skin_ext, B=0))
    u_top = field("uTop")
    top_i = fn.f(M + "SelectInt", A=u_top, B=field("topDigit"), bPickA=fn.f(M + "GreaterEqual_IntInt", A=u_top, B=0))
    skin = get_at(fn, fn.get("SkinColours"), skin_i)
    hair = get_at(fn, fn.get("HairColours"), field("hair"))
    shoes = get_at(fn, fn.get("ShoeColours"), field("shoes"))
    brows_i = field("brows")
    brow_known = fn.all(fn.f(M + "GreaterEqual_IntInt", A=brows_i, B=0),
                        fn.f(M + "Less_IntInt", A=brows_i, B=fn.f(A + "Array_Length", TargetArray=fn.get("BrowColours"))))
    brow = fn.f(M + "SelectColor", A=get_at(fn, fn.get("BrowColours"), fn.f(M + "Max", A=brows_i, B=0)), B=hair, bPickA=brow_known)
    lips = fn.f(M + "Multiply_LinearColorFloat", A=fn.f(M + "LinearColorLerp", A=skin, B=fn.get("LipTint"), Alpha=fn.get("LipSkinMix")),
                B=fn.get("LipDark"))
    stick = field("lipstick")
    has_stick = fn.all(fn.f(M + "Greater_IntInt", A=stick, B=0),
                       fn.f(M + "Less_IntInt", A=stick, B=fn.f(A + "Array_Length", TargetArray=fn.get("LipstickColours"))))
    lips = fn.f(M + "SelectColor", A=fn.f(M + "LinearColorLerp", A=lips, B=get_at(fn, fn.get("LipstickColours"), stick),
                                          Alpha=fn.get("LipstickMix")), B=lips, bPickA=has_stick)
    colours = {"Skin": skin, "Top": get_at(fn, fn.get("TopColours"), top_i), "Pants": get_at(fn, fn.get("PantsColours"), field("pants")),
               "Hair": hair, "Shoes": shoes, "Lips": lips, "Iris": get_at(fn, fn.get("EyeColours"), field("eyes")),
               "Beard": hair, "Brow": brow, "Leather": shoes}
    for name, colour in colours.items():
        fn.exec_call("MaterialInstanceDynamic:SetVectorParameterValue", self_=fn.get("Mat"), ParameterName=name, Value=colour)
        fn.set("Colour" + name, colour)
    fn.finish()


def scale_look(bp, avatar_cls):
    """ScaleLook(): the web's scale (src/avatar.js): a chosen height scales the figure whole (avatarProportions' body)
    and its head bone (head); without one the seeded `tall` (wire tag s) stretches its height, else 1."""
    fn = Fn(bp, "ScaleLook", [])
    field = lambda n: fn.f(mine("LookField"), pin="Value", Name=n)  # noqa: E731
    cm = field("height")
    has = fn.f(M + "GreaterEqual_IntInt", A=cm, B=0)
    cmf = fn.f(M + "Conv_IntToDouble", InInt=cm)
    child = fn.f(M + "Less_DoubleDouble", A=cmf, B=fn.get("HeightAdult"))
    head = fn.f(M + "SelectFloat", A=fn.f(M + "MultiplyMultiply_FloatFloat", Base=fn.f(M + "Divide_DoubleDouble", A=fn.get("HeightAdult"), B=cmf),
                                          Exp=fn.get("HeadPow")), B=1.0, bPickA=child)
    body = fn.f(M + "Divide_DoubleDouble", A=fn.f(M + "Divide_DoubleDouble", A=cmf, B=100.0),
                B=fn.f(M + "Add_DoubleDouble", A=fn.get("HeightPivot"), B=fn.f(M + "Multiply_DoubleDouble", A=fn.get("HeightTop"), B=head)))
    ti = field("tallIndex")
    tall_known = fn.all(fn.f(M + "GreaterEqual_IntInt", A=ti, B=0),
                        fn.f(M + "Less_IntInt", A=ti, B=fn.f(A + "Array_Length", TargetArray=fn.get("SeededTall"))))
    tall = fn.f(M + "SelectFloat", A=get_at(fn, fn.get("SeededTall"), fn.f(M + "Max", A=ti, B=0)), B=1.0, bPickA=tall_known)
    sx = fn.f(M + "SelectFloat", A=body, B=1.0, bPickA=has)
    sz = fn.f(M + "SelectFloat", A=body, B=tall, bPickA=has)
    fn.set("FigureScale", fn.f(M + "MakeVector", X=sx, Y=sx, Z=sz))
    fn.set("HeadScale", fn.f(M + "SelectFloat", A=head, B=1.0, bPickA=has))
    world = fn.f(M + "Multiply_VectorVector", A=fn.get("FigureScale"),
                 B=fn.f("Actor:GetActorScale3D", self_=fn.f("ActorComponent:GetOwner")))
    fn.exec_call("SceneComponent:SetWorldScale3D", self_=fn.get("Figure"), NewScale=world)
    anim = fn.f("SkeletalMeshComponent:GetAnimInstance", self_=fn.get("Figure"))
    valid, _ = fn.branch(fn.f("/Script/Engine.KismetSystemLibrary:IsValid", Object=anim))
    fn.cur = valid
    typed = cast(fn, anim, u.load_class(None, ABP_CLASS))
    hs = fn.get("HeadScale")
    other_set(fn, typed, "HeadScale", ABP_CLASS, fn.f(M + "MakeVector", X=hs, Y=hs, Z=hs))
    fn.finish()


def apply_look(bp, avatar_cls):
    """ApplyLook(Code) -> Applied: parse, dress and scale; BP_LundenAvatar keeps the code and its hit-zone scales."""
    fn = Fn(bp, "ApplyLook", [("Code", STRING)], [("Applied", BOOL)])
    fn.local("Before", STRING)
    fn.set("Before", fn.get("LookCode"), local=True)
    ok = fn.exec_call(mine("ParseLook"), Code=fn.params["Code"])
    good, bad = fn.branch(out(ok, "Valid"))
    fn.cur = bad  # an invalid code changes nothing: the look before it is parsed again
    fn.exec_call(mine("ParseLook"), Code=fn.lget("Before"))
    fn.finish(Applied=False)
    fn.cur = good
    fig = fn.exec_call(mine("EnsureFigure"))
    has, _ = fn.branch(out(fig, "Ok"))
    fn.cur = has
    fn.exec_call(mine("ChoosePieces"))
    fn.exec_call(mine("ColourLook"))
    fn.exec_call(mine("ScaleLook"))
    avatar = cast(fn, fn.f("ActorComponent:GetOwner"), avatar_cls)
    other_set(fn, avatar, "LookCode", AVATAR_CLASS, fn.get("LookCode"))
    scale = fn.get("FigureScale")
    other_set(fn, avatar, "HeightScale", AVATAR_CLASS, fn.f(M + "BreakVector", pin="Z", InVec=scale))
    other_set(fn, avatar, "WidthScale", AVATAR_CLASS, fn.f(M + "BreakVector", pin="X", InVec=scale))
    fn.exec_call(AVATAR_CLASS + ":UpdateHitZones", self_=avatar)
    fn.finish(fresh=True, Applied=True)


# The player's own figure, the mirror and the look menu ----------------------------------------------------------------

SAVE_LIB = "/Game/Lunden/Save/BFL_LundenSave.BFL_LundenSave_C"
MIRROR = LOOKS + "/BP_LundenMirror"
MIRROR_CLASS = MIRROR + ".BP_LundenMirror_C"
MIRROR_MATERIAL = LOOKS + "/M_LundenMirror"
MIRROR_LEVEL = LOOKS + "/Level_LundenMirror"
MENU = LOOKS + "/WBP_LundenLookMenu"
MENU_CLASS = MENU + ".WBP_LundenLookMenu_C"
PLAIN_LOOK = "012340100"  # *assumption*: a player without a saved code (the web seeds one from the name/id) wears the samples' plain look


def events_graph(bp, wired):
    """EventGraph: each (event override, function to call with the event's float `DeltaSeconds` if it has one)."""
    ed = GRAPH.get_graph_editor_by_name(bp, "EventGraph")
    ed.remove_nodes([n for n in ed.list_all_nodes()])
    y = 0
    for override, call, delta in wired:
        node = BP.add_event_override(bp, override, u.IntPoint(0, y))
        if not node:
            raise RuntimeError(f"{bp.get_name()}: no event {override}")
        c = ed.add_call_function_node(call)
        if not c:
            raise RuntimeError(f"{bp.get_name()}: cannot call {call}")
        BP.set_node_pos(c, u.IntPoint(400, y))
        link(BP.find_then_pin(node), BP.find_execute_pin(c))
        if delta:
            link(out(node, delta), inp(c, "Delta"))
        y += 300


def self_avatar(bp):
    """SelfAvatar() -> Avatar: the player's own BP_LundenAvatar (its Look has CaptureOnly), made when missing: seen only
    by scene captures (the mirror), no collision, wearing the saved look (BFL_LundenSave.GetLookCode) or the plain one."""
    avatar_cls = u.load_class(None, AVATAR_CLASS)
    ref = BP.get_object_reference_type(avatar_cls)
    fn = Fn(bp, "SelfAvatar", [], [("Avatar", ref)])
    fn.local("Found", ref)
    found = fn.exec_call("GameplayStatics:GetAllActorsOfClass", ActorClass=AVATAR_CLASS)
    loop = fn.macro("ForEachLoop", Array=out(found, "OutActors"))
    fn.cur = out(loop, "LoopBody")
    typed = cast(fn, out(loop, "Array Element"), avatar_cls)
    mine_, _ = fn.branch(other_get(fn, other_get(fn, typed, "Look", AVATAR_CLASS), "CaptureOnly", COMPONENT_CLASS))
    fn.cur = mine_
    fn.set("Found", typed, local=True)
    fn.cur = out(loop, "Completed")
    have, none = fn.branch(fn.f("/Script/Engine.KismetSystemLibrary:IsValid", Object=fn.lget("Found")))
    fn.cur = have
    fn.finish(Avatar=fn.lget("Found"))
    fn.cur = none
    names = [str(n) for n in fn.g.list_available_nodes([])]
    spawn_name = [n for n in names if n.replace(" ", "").lower().endswith("spawnactorfromclass")]
    if not spawn_name:
        raise RuntimeError("No Spawn Actor from Class node")
    spawn = fn.place(fn.g.create_node_from_name(spawn_name[0], u.Vector2D(0, 0), []))
    fn.wire(spawn, {"Class": AVATAR_CLASS, "SpawnTransform": fn.f(M + "MakeTransform", Scale="1,1,1")})
    fn.then(spawn)
    made = cast(fn, out(spawn, "ReturnValue"), avatar_cls)
    fn.set("Found", made, local=True)
    look = other_get(fn, made, "Look", AVATAR_CLASS)
    other_set(fn, look, "CaptureOnly", COMPONENT_CLASS, True)
    fn.exec_call("Actor:SetActorEnableCollision", self_=made, bNewActorEnableCollision=False)
    fn.exec_call("PrimitiveComponent:SetVisibleInSceneCaptureOnly", self_=other_get(fn, made, "Body", AVATAR_CLASS), bValue=True)
    saved = out(fn.exec_call(SAVE_LIB + ":GetLookCode"), "LookCode")
    code = fn.f(M + "SelectString", A=PLAIN_LOOK, B=saved, bPickA=fn.f(M + "EqualEqual_IntInt", A=fn.f(S + "Len", S=saved), B=0))
    applied = fn.exec_call(COMPONENT_CLASS + ":ApplyLook", self_=look, Code=code)
    good, bad = fn.branch(out(applied, "Applied"))
    fn.cur = bad
    fn.exec_call(COMPONENT_CLASS + ":ApplyLook", self_=look, Code=PLAIN_LOOK)
    fn.finish(fresh=True, Avatar=fn.lget("Found"))
    fn.cur = good
    fn.finish(fresh=True, Avatar=fn.lget("Found"))


def anim_pull_head():
    """ABP_LundenLook reads its Look's HeadScale every update (a look applied before the anim instance exists still
    reaches the head bone)."""
    abp = ASSETS.load_asset(ABP)
    avatar_cls = u.load_class(None, AVATAR_CLASS)
    fn = Fn(abp, "PullHead", [])
    comp = fn.f("AnimInstance:GetOwningComponent")
    typed = cast(fn, fn.f("ActorComponent:GetOwner", self_=comp), avatar_cls)
    hs = other_get(fn, other_get(fn, typed, "Look", AVATAR_CLASS), "HeadScale", COMPONENT_CLASS)
    fn.set("HeadScale", fn.f(M + "MakeVector", X=hs, Y=hs, Z=hs))
    fn.finish()
    BP.compile_blueprint(abp)
    events_graph(abp, [("BlueprintUpdateAnimation", ABP_CLASS + ":PullHead", None)])
    compiled(abp, ["PullHead", "EventGraph", "AnimGraph"])


def build_mirror_material():
    if ASSETS.does_asset_exist(MIRROR_MATERIAL):
        ASSETS.delete_asset(MIRROR_MATERIAL)
    folder, name = MIRROR_MATERIAL.rsplit("/", 1)
    mat = TOOLS.create_asset(name, folder, u.Material, u.MaterialFactoryNew())
    mat.set_editor_property("shading_model", u.MaterialShadingModel.MSM_UNLIT)
    screen = MATS.create_material_expression(mat, u.MaterialExpressionScreenPosition, -900, 0)
    flip = MATS.create_material_expression(mat, u.MaterialExpressionCustom, -650, 0)
    flip.set_editor_property("code", "return float2(1.0 - UV.x, UV.y);")  # the reflected camera's picture, mirrored
    flip.set_editor_property("output_type", u.CustomMaterialOutputType.CMOT_FLOAT2)
    ci = u.CustomInput()
    ci.set_editor_property("input_name", "UV")
    flip.set_editor_property("inputs", [ci])
    MATS.connect_material_expressions(screen, "ViewportUV", flip, "UV")
    tex = MATS.create_material_expression(mat, u.MaterialExpressionTextureSampleParameter2D, -400, 0)
    tex.set_editor_property("parameter_name", "Reflection")
    tex.set_editor_property("texture", ASSETS.load_asset("/Engine/EngineResources/DefaultTexture"))
    MATS.connect_material_expressions(flip, "", tex, "UVs")
    MATS.connect_material_property(tex, "RGB", u.MaterialProperty.MP_EMISSIVE_COLOR)
    MATS.recompile_material(mat)
    return mat


def build_mirror(looks):
    m = looks["mirror"]
    bp = blueprint(MIRROR, u.Actor)
    remove_functions(bp, ("SelfAvatar", "Setup", "Update"))
    avatar_cls = u.load_class(None, AVATAR_CLASS)
    variables(bp, {"Glass": BP.get_object_reference_type(u.StaticMeshComponent),
                   "Capture": BP.get_object_reference_type(u.SceneCaptureComponent2D),
                   "Avatar": BP.get_object_reference_type(avatar_cls), "GlassWidth": REAL, "GlassHeight": REAL,
                   "Reflected": VECTOR})
    BP.compile_blueprint(bp)
    self_avatar(bp)
    BP.compile_blueprint(bp)
    me = MIRROR_CLASS + ":"

    # Setup(): the glass (a plane facing the actor's +X), its render target and the capture with a clip plane at the glass
    fn = Fn(bp, "Setup", [])
    root = fn.f("Actor:K2_GetRootComponent")
    add = fn.exec_call("Actor:AddComponentByClass", Class="/Script/Engine.StaticMeshComponent", bManualAttachment=True,
                       RelativeTransform=fn.f(M + "MakeTransform", Scale="1,1,1"))
    glass = cast(fn, out(add, "ReturnValue"), u.StaticMeshComponent.static_class())
    fn.set("Glass", glass)
    fn.exec_call("SceneComponent:K2_AttachToComponent", self_=glass, Parent=root, SocketName="None", LocationRule="SnapToTarget",
                 RotationRule="SnapToTarget", ScaleRule="SnapToTarget", bWeldSimulatedBodies=False)
    fn.exec_call("StaticMeshComponent:SetStaticMesh", self_=glass, NewMesh="/Engine/BasicShapes/Plane.Plane")
    # the plane faces +Z: pitch -90 turns it to +X; its X (then up) is the glass height, Y the width (100 cm plane)
    fn.exec_call("SceneComponent:K2_SetRelativeRotation", self_=glass, NewRotation="-90,0,0", bSweep=False, bTeleport=True)
    fn.exec_call("SceneComponent:SetRelativeScale3D", self_=glass,
                 NewScale3D=fn.f(M + "MakeVector", X=fn.f(M + "Divide_DoubleDouble", A=fn.get("GlassHeight"), B=100.0),
                                 Y=fn.f(M + "Divide_DoubleDouble", A=fn.get("GlassWidth"), B=100.0), Z=1.0))
    fn.exec_call("PrimitiveComponent:SetCollisionEnabled", self_=glass, NewType="NoCollision")
    fn.exec_call("PrimitiveComponent:SetCastShadow", self_=glass, NewCastShadow=False)
    size = fn.f("/Script/UMG.WidgetLayoutLibrary:GetViewportSize")
    half = lambda c: fn.f(M + "Max", A=fn.f(M + "FTrunc", A=fn.f(M + "Multiply_DoubleDouble", A=fn.f(M + "BreakVector2D", pin=c, InVec=size), B=0.5)), B=64)  # noqa: E731
    rt = fn.exec_call("KismetRenderingLibrary:CreateRenderTarget2D", Width=half("X"), Height=half("Y"), Format="RTF_RGBA16f")
    made = fn.exec_call("PrimitiveComponent:CreateDynamicMaterialInstance", self_=glass, ElementIndex=0,
                        SourceMaterial=MIRROR_MATERIAL + ".M_LundenMirror", OptionalName="None")
    fn.exec_call("MaterialInstanceDynamic:SetTextureParameterValue", self_=out(made), ParameterName="Reflection",
                 Value=out(rt))
    add2 = fn.exec_call("Actor:AddComponentByClass", Class="/Script/Engine.SceneCaptureComponent2D", bManualAttachment=False,
                        RelativeTransform=fn.f(M + "MakeTransform", Scale="1,1,1"))
    cap = cast(fn, out(add2, "ReturnValue"), u.SceneCaptureComponent2D.static_class())
    fn.set("Capture", cap)
    sc = "/Script/Engine.SceneCaptureComponent2D"
    other_set(fn, cap, "TextureTarget", sc, out(rt))
    other_set(fn, cap, "bCaptureEveryFrame", "/Script/Engine.SceneCaptureComponent", False)
    other_set(fn, cap, "bCaptureOnMovement", "/Script/Engine.SceneCaptureComponent", False)
    other_set(fn, cap, "bEnableClipPlane", sc, True)
    other_set(fn, cap, "ClipPlaneBase", sc, fn.f("Actor:K2_GetActorLocation"))
    other_set(fn, cap, "ClipPlaneNormal", sc, fn.f("Actor:GetActorForwardVector"))
    fn.set("Avatar", out(fn.exec_call(me + "SelfAvatar"), "Avatar"))
    fn.finish()
    BP.compile_blueprint(bp)

    # Update(Delta): the figure stands where the player stands; the capture is the player's camera reflected in the glass
    fn = Fn(bp, "Update", [("Delta", REAL)])
    pawn = fn.f("GameplayStatics:GetPlayerPawn", PlayerIndex=0)
    ok, _ = fn.branch(fn.all(fn.f("/Script/Engine.KismetSystemLibrary:IsValid", Object=pawn),
                             fn.f("/Script/Engine.KismetSystemLibrary:IsValid", Object=fn.get("Avatar")),
                             fn.f("/Script/Engine.KismetSystemLibrary:IsValid", Object=fn.get("Capture"))))
    fn.cur = ok
    yaw = fn.f(M + "BreakRotator", pin="Yaw", InRot=fn.f("Pawn:GetControlRotation", self_=pawn))
    fn.exec_call("Actor:K2_SetActorLocationAndRotation", self_=fn.get("Avatar"), NewLocation=fn.f("Pawn:GetNavAgentLocation", self_=pawn),
                 NewRotation=fn.f(M + "MakeRotator", Roll=0.0, Pitch=0.0, Yaw=yaw), bSweep=False, bTeleport=True)
    vel = fn.f("Actor:GetVelocity", self_=pawn)
    fn.exec_call(AVATAR_CLASS + ":SetMotion", self_=fn.get("Avatar"), InSpeed=fn.f(M + "VSizeXY", A=vel), InCrouch=0.0,
                 InAirborne=False, InPose=0)
    cam = fn.f("GameplayStatics:GetPlayerCameraManager", PlayerIndex=0)
    loc = fn.f("PlayerCameraManager:GetCameraLocation", self_=cam)
    rot = fn.f("PlayerCameraManager:GetCameraRotation", self_=cam)
    n = fn.f("Actor:GetActorForwardVector")
    p0 = fn.f("Actor:K2_GetActorLocation")
    reflect = lambda v, point: fn.f(M + "Subtract_VectorVector", A=v, B=fn.f(M + "Multiply_VectorFloat", A=n, B=fn.f(  # noqa: E731
        M + "Multiply_DoubleDouble", A=fn.f(M + "Dot_VectorVector", A=fn.f(M + "Subtract_VectorVector", A=v, B=p0) if point else v, B=n), B=2.0)))
    where = reflect(loc, True)
    fn.set("Reflected", where)
    forward = reflect(fn.f(M + "GetForwardVector", InRot=rot), False)
    up = reflect(fn.f(M + "GetUpVector", InRot=rot), False)
    fn.exec_call("SceneComponent:K2_SetWorldLocationAndRotation", self_=fn.get("Capture"), NewLocation=where,
                 NewRotation=fn.f(M + "MakeRotFromXZ", X=forward, Z=up), bSweep=False, bTeleport=True)
    other_set(fn, fn.get("Capture"), "FOVAngle", "/Script/Engine.SceneCaptureComponent2D", fn.f("PlayerCameraManager:GetFOVAngle", self_=cam))
    seen, _ = fn.branch(fn.f("PrimitiveComponent:WasRecentlyRendered", self_=fn.get("Glass"), Tolerance=0.25))
    fn.cur = seen  # only while the glass is on screen: one extra scene render
    fn.exec_call("SceneCaptureComponent2D:CaptureScene", self_=fn.get("Capture"))
    fn.finish()
    BP.compile_blueprint(bp)
    events_graph(bp, [("ReceiveBeginPlay", me + "Setup", None), ("ReceiveTick", me + "Update", "DeltaSeconds")])
    compiled(bp, ["SelfAvatar", "Setup", "Update"])
    d = u.get_default_object(bp.generated_class())
    tick = d.get_editor_property("primary_actor_tick")
    tick.set_editor_property("tick_group", u.TickingGroup.TG_POST_UPDATE_WORK)  # after the camera has moved this frame
    d.set_editor_property("primary_actor_tick", tick)
    d.set_editor_property("GlassWidth", float(m["width"]))
    d.set_editor_property("GlassHeight", float(m["height"]))
    return bp


def build_mirror_level(looks):
    """Level_LundenMirror: one BP_LundenMirror at the web's glass, facing out of the wall (world-levels.json row)."""
    m = looks["mirror"]
    levels = u.get_editor_subsystem(u.LevelEditorSubsystem)
    actors = u.get_editor_subsystem(u.EditorActorSubsystem)
    if ASSETS.does_asset_exist(MIRROR_LEVEL):
        if not levels.load_level(MIRROR_LEVEL):
            raise RuntimeError("Could not open " + MIRROR_LEVEL)
        for old in actors.get_all_level_actors():
            if old.get_class().get_path_name() == MIRROR_CLASS:
                actors.destroy_actor(old)
    elif not levels.new_level(MIRROR_LEVEL):
        raise RuntimeError("Could not create " + MIRROR_LEVEL)
    actor = actors.spawn_actor_from_class(u.load_class(None, MIRROR_CLASS), u.Vector(*m["centre"]), u.Rotator(roll=0, pitch=0, yaw=m["yaw"]))
    actor.set_actor_label("HallMirror")
    if not levels.save_current_level():
        raise RuntimeError("Could not save " + MIRROR_LEVEL)


def menu_tree(wbp, add):
    add(u.CanvasPanel, "Root", "")
    back = add(u.Image, "Shade", "Root")
    slot = back.get_editor_property("slot")
    slot.set_anchors(u.Anchors(minimum=u.Vector2D(0, 0), maximum=u.Vector2D(1, 1)))
    slot.set_offsets(u.Margin(0, 0, 0, 0))
    back.set_editor_property("color_and_opacity", u.LinearColor(0, 0, 0, 0.55))
    box = add(u.VerticalBox, "Panel", "Root")
    slot = box.get_editor_property("slot")
    slot.set_anchors(u.Anchors(minimum=u.Vector2D(0.5, 0.5), maximum=u.Vector2D(0.5, 0.5)))
    slot.set_alignment(u.Vector2D(0.5, 0.5))
    slot.set_auto_size(True)
    title = add(u.TextBlock, "Title", "Panel")
    title.set_text(u.Text("Utseende – din utseendekod (fungerar också från webben)"))
    codebox = add(u.EditableTextBox, "CodeBox", "Panel")
    codebox.set_editor_property("minimum_desired_width", 520.0)
    for n, words in (("BtnPrev", "Föregående"), ("BtnNext", "Nästa"), ("BtnApply", "Använd koden"), ("BtnClose", "Klar")):
        b = add(u.Button, n, "Panel")
        t = add(u.TextBlock, n + "Label", n)
        t.set_text(u.Text(words))
        b.get_editor_property("slot").set_padding(u.Margin(0, 4, 0, 4))


def build_menu(parts):
    """WBP_LundenLookMenu (ui-extensions.json menuButtons row "Look"): the look code to type or paste (a web code works),
    the samples to step through, Använd (apply to the player's figure and save it) and Klar."""
    folder, name = MENU.rsplit("/", 1)
    fresh = not ASSETS.does_asset_exist(MENU)  # Python cannot clear a widget tree: an existing one is kept, its graphs rebuilt
    wbp = TOOLS.create_asset(name, folder, u.WidgetBlueprint, u.WidgetBlueprintFactory()) if fresh else ASSETS.load_asset(MENU)
    if not fresh:
        remove_functions(wbp, ("SelfAvatar", "Refresh", "Apply", "Next", "Prev", "Done"))
    W = u.EditorUtilityLibrary
    add = lambda cls, n, parent: W.add_source_widget(wbp, cls, n, parent)  # noqa: E731
    if fresh:
        menu_tree(wbp, add)
    variables(wbp, {"Presets": STRINGS, "Index": INT})
    BP.compile_blueprint(wbp)
    self_avatar(wbp)
    BP.compile_blueprint(wbp)
    me = MENU_CLASS + ":"
    text_of = lambda fn, s: fn.f("KismetTextLibrary:Conv_StringToText", InString=s)  # noqa: E731

    fn = Fn(wbp, "Refresh", [])  # the figure's current code in the box
    avatar = out(fn.exec_call(me + "SelfAvatar"), "Avatar")
    code = other_get(fn, other_get(fn, avatar, "Look", AVATAR_CLASS), "LookCode", COMPONENT_CLASS)
    fn.exec_call("/Script/UMG.EditableTextBox:SetText", self_=fn.get("CodeBox"), InText=text_of(fn, code))
    fn.finish()
    BP.compile_blueprint(wbp)

    fn = Fn(wbp, "Apply", [], [("Applied", BOOL)])  # a valid code dresses the figure and is saved as the web writes it
    typed = fn.f("KismetTextLibrary:Conv_TextToString", InText=fn.f("/Script/UMG.EditableTextBox:GetText", self_=fn.get("CodeBox")))
    clean = fn.f(S + "Trim", SourceString=fn.f(S + "TrimTrailing", SourceString=typed))
    avatar = out(fn.exec_call(me + "SelfAvatar"), "Avatar")
    look = other_get(fn, avatar, "Look", AVATAR_CLASS)
    applied = fn.exec_call(COMPONENT_CLASS + ":ApplyLook", self_=look, Code=clean)
    good, bad = fn.branch(out(applied, "Applied"))
    fn.cur = bad
    fn.exec_call(me + "Refresh")
    fn.finish(Applied=False)
    fn.cur = good
    fn.exec_call(SAVE_LIB + ":SetLookCode", LookCode=other_get(fn, look, "LookCode", COMPONENT_CLASS))
    fn.exec_call(me + "Refresh")
    fn.finish(fresh=True, Applied=True)
    BP.compile_blueprint(wbp)

    for step_name, delta in (("Next", 1), ("Prev", -1)):
        fn = Fn(wbp, step_name, [])
        count = fn.f(A + "Array_Length", TargetArray=fn.get("Presets"))
        nxt = fn.f(M + "Percent_IntInt", A=fn.f(M + "Add_IntInt", A=fn.f(M + "Add_IntInt", A=fn.get("Index"), B=delta), B=count), B=count)
        fn.set("Index", nxt)
        fn.exec_call("/Script/UMG.EditableTextBox:SetText", self_=fn.get("CodeBox"),
                     InText=text_of(fn, get_at(fn, fn.get("Presets"), fn.get("Index"))))
        fn.exec_call(me + "Apply")
        fn.finish()
        BP.compile_blueprint(wbp)

    fn = Fn(wbp, "Done", [])
    fn.exec_call("/Script/UMG.Widget:RemoveFromParent")
    fn.finish()

    # Construct: each button's click calls its function, then the box shows the current code
    ed = GRAPH.get_graph_editor_by_name(wbp, "EventGraph")
    construct = BP.add_event_override(wbp, "Construct", u.IntPoint(0, 0))
    if not construct:
        raise RuntimeError("WBP_LundenLookMenu: no Construct event")
    cur, x, y = BP.find_then_pin(construct), 300, 400
    BP.compile_blueprint(wbp)
    for button, call in (("BtnPrev", "Prev"), ("BtnNext", "Next"), ("BtnApply", "Apply"), ("BtnClose", "Done")):
        widget = out(ed.add_get_member_variable_node(button, ""), button)
        choices = [str(c) for c in ed.list_available_nodes([widget]) if str(c).endswith("|AssignOnClicked")]
        before = {nd.get_name() for nd in ed.list_all_nodes()}
        assign = ed.create_node_from_name(choices[0], u.Vector2D(x, 0), [widget]) if choices else None
        if not assign:
            raise RuntimeError("No AssignOnClicked for " + button)
        link(cur, BP.find_execute_pin(assign))
        cur = BP.find_then_pin(assign)
        widget.try_create_connection(inp(assign, "self"))
        handler = [nd for nd in ed.list_all_nodes() if nd.get_name() not in before and nd.get_class().get_name() == "K2Node_CustomEvent"]
        if len(handler) != 1:
            raise RuntimeError(f"AssignOnClicked for {button} made {len(handler)} events")
        BP.set_node_pos(handler[0], u.IntPoint(0, y))
        c = ed.add_call_function_node(me + call)
        BP.set_node_pos(c, u.IntPoint(300, y))
        link(BP.find_then_pin(handler[0]), BP.find_execute_pin(c))
        x, y = x + 300, y + 250
        BP.compile_blueprint(wbp)
    refresh = ed.add_call_function_node(me + "Refresh")
    link(cur, BP.find_execute_pin(refresh))
    compiled(wbp, ["SelfAvatar", "Refresh", "Apply", "Next", "Prev", "Done", "EventGraph"])
    u.get_default_object(wbp.generated_class()).set_editor_property("Presets", [smp["code"] for smp in parts["samples"]])
    return wbp


def spec_hash(data_text, parts_text):
    h = hashlib.sha256()
    # line endings normalised, so a CRLF (autocrlf) checkout hashes the script like LF (#2309)
    for part in (Path(__file__).read_bytes().replace(b"\r\n", b"\n"), data_text.encode(), parts_text.encode(),
                 u.SystemLibrary.get_engine_version().encode()):
        h.update(hashlib.sha256(part).digest())
    return h.hexdigest()


def main(argv):
    force, check = "--force" in argv, "--check" in argv
    data_text = DATA_FILE.read_text(encoding="utf-8")
    data = json.loads(data_text)
    parts_text = PARTS_FILE.read_text(encoding="utf-8").replace("\r\n", "\n")
    parts = json.loads(parts_text)
    spec = spec_hash(data_text, parts_text)
    assets = [COMPONENT, MATERIAL, LOOK_SKELETON, IK_LOOK, RTG, ABP, MIRROR_MATERIAL, MIRROR, MENU, MIRROR_LEVEL] + [PIECES + "/" + p["name"] for p in parts["pieces"]]
    missing = [p for p in assets if not ASSETS.does_asset_exist(p)]
    have = ASSETS.get_metadata_tag(ASSETS.load_asset(COMPONENT), SPEC_TAG) if not missing else None
    if check:
        if missing or have != spec:
            raise RuntimeError(f"avatar looks out of date: missing {missing}, spec {have} != {spec}")
        log(f"check ok ({len(assets)} assets, spec {spec[:12]})")
        u.log("LUNDEN_AVATAR_LOOKS_OK")
        return
    if not force and not missing and have == spec:
        log(f"unchanged, nothing saved (spec {spec[:12]})")
        u.log("LUNDEN_AVATAR_LOOKS_OK")
        return
    mat = build_material()
    import_pieces(parts, mat)
    core = ASSETS.load_asset(PIECES + "/" + parts["core"])
    build_ik_rig(core)
    rtg = build_retargeter(core)
    build_anim(rtg, core)
    bp = build_component(data, parts)
    anim_pull_head()
    build_mirror_material()
    build_mirror(data)
    build_menu(parts)
    ASSETS.set_metadata_tag(bp, SPEC_TAG, spec)
    for path in assets:
        if path == MIRROR_LEVEL:
            continue
        if not ASSETS.save_asset(path, only_if_is_dirty=False):
            raise RuntimeError("Could not save " + path)
    build_mirror_level(data)  # after BP_LundenMirror is saved: the level holds one instance
    report["spec"] = spec
    (PROJECT / "Saved/avatar-looks-build.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    log(f"built {len(assets)} assets (spec {spec[:12]})")
    u.log("LUNDEN_AVATAR_LOOKS_OK")


main(sys.argv[1:])
