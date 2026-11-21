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

Run (Windows checkout; lock every .uasset under Avatar/Looks first):
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
SPEC_TAG = "Lunden.SpecHash"
PROJECT = Path(u.Paths.convert_relative_path_to_full(u.Paths.project_dir()))
REPO = PROJECT.parents[1]
DATA_FILE = REPO / "tools/unreal-engine/avatar-looks.json"
MACROS = "/Engine/EditorBlueprintResources/StandardMacros.StandardMacros:"
M = "KismetMathLibrary:"
S = "KismetStringLibrary:"
A = "KismetArrayLibrary:"
MAP = "BlueprintMapLibrary:"

ASSETS = u.EditorAssetLibrary
BP = u.BlueprintEditorLibrary
GRAPH = u.BlueprintGraphEditor
TOOLS = u.AssetToolsHelpers.get_asset_tools()
INT = BP.get_basic_type_by_name("int")
BOOL = BP.get_basic_type_by_name("bool")
STRING = BP.get_basic_type_by_name("string")
STRINGS = BP.get_array_type(STRING)
INTS = BP.get_array_type(INT)
TAGMAP = BP.get_map_type(STRING, INT)
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

    def finish(self, **outs):
        ret = self.result if self.result else self.place(self.g.add_return_node())
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
FUNCTIONS = ("ParseLook", "EncodeLook", "LookField")


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


def build_component(data):
    bp = blueprint(COMPONENT, u.ActorComponent)
    remove_functions(bp, FUNCTIONS)
    variables(bp, VARS)
    BP.compile_blueprint(bp)
    ndigits = len(data["digits"])
    encode_look(bp)
    look_field(bp, ndigits)
    BP.compile_blueprint(bp)
    parse_look(bp, ndigits)
    compiled(bp, list(FUNCTIONS))
    default = u.get_default_object(bp.generated_class())
    for name, v in data_defaults(data).items():
        default.set_editor_property(name, v)
    return bp


def spec_hash(data_text):
    h = hashlib.sha256()
    # line endings normalised, so a CRLF (autocrlf) checkout hashes the script like LF (#2309)
    for part in (Path(__file__).read_bytes().replace(b"\r\n", b"\n"), data_text.encode(),
                 u.SystemLibrary.get_engine_version().encode()):
        h.update(hashlib.sha256(part).digest())
    return h.hexdigest()


def main(argv):
    force, check = "--force" in argv, "--check" in argv
    data_text = DATA_FILE.read_text(encoding="utf-8")
    data = json.loads(data_text)
    spec = spec_hash(data_text)
    assets = [COMPONENT]
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
    bp = build_component(data)
    ASSETS.set_metadata_tag(bp, SPEC_TAG, spec)
    for path in assets:
        if not ASSETS.save_asset(path, only_if_is_dirty=False):
            raise RuntimeError("Could not save " + path)
    report["spec"] = spec
    (PROJECT / "Saved/avatar-looks-build.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    log(f"built {len(assets)} assets (spec {spec[:12]})")
    u.log("LUNDEN_AVATAR_LOOKS_OK")


main(sys.argv[1:])
