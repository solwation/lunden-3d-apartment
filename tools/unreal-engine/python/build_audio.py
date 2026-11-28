"""#2287: footsteps, wind and the outdoor ambient bed as procedural MetaSounds, built from the web's own parameters.

    run-python.ps1 tools/unreal-engine/python/build_audio.py [--force | --check]

Assets (one owner, #2287), all in /Game/Lunden/Audio/:
  SC_LundenMaster        SoundClass, the project's root: the menu's Huvudvolym (ui-extensions.json audio.master)
  SC_LundenEffects       child of SC_LundenMaster: Ljudeffekter (audio.effects); steps, doors, animals; sends to the room
  SC_LundenAmbience      child of SC_LundenEffects: the wind and the outdoor bed, dry (the web plays them past the reverb)
  SC_LundenMusic         child of SC_LundenMaster: Musik (audio.music), for the music and radios that come later
  MS_LundenStep_<p>      one-shot MetaSound per footstep profile p of src/config.js FOOTSTEPS.profiles (wood = parquet,
                         hard = tile/paving/stone, grass, gravel, and the variants stair, wet, snow, snowCold, leaves):
                         src/footsteps.js synthFootstep (a gliding sine body plus low-passed noise, crackle, partial)
  MS_LundenWindowWind    one localized wind loop per opening sash, with ATT_LundenWindowWind
  MS_LundenWind          looping MetaSound: src/audio.js sfx.windBed (one noise, low-pass body + band-pass rustle/whistle)
  MS_LundenAmbience      looping MetaSound: river babble, city hum and the rain hiss/roof/metal/leaves/water of sfx.rain
                         (hail: the same rain, louder and brighter, #2402)
  MS_LundenThunder       one-shot MetaSound: src/audio.js sfx.thunder, played by the web's strike clock (#2402,
                         weather_audio.py)
  RE_LundenSoft/Bright/Concrete/Courtyard   ReverbEffects for src/config.js ROOM_REVERB's zones (simple form)
  BPC_LundenAudio        ActorComponent on BP_LundenPlayer (player-extensions.json row Audio): the stride clock and
                         pickStep, the wind and bed parameters a few times a second (windsound.js, ambientbed.js), the
                         room zone (roomreverb.js reverbZone), and the thunder's strike clock (weather.js, #2402)

The web parameters come from tools/unreal-engine/audio-params.json, which tools/unreal-engine/export-audio.mjs reads from the
web's modules, and from the #2245 export (unreal/Lunden/Import/measurements.json vegetation.trees: the tree feet of
src/surroundings.js treeFeet). Every path carries the web's unmuted master gain (audio-params.json masterGain);
the engine's own mixing laws are set to Web Audio's in Config/DefaultEngine.ini (#2320). The formulas of windsound.js / ambientbed.js are kept below as text and compiled into
Blueprint math nodes (as build_lighting.py does), so the graph is a literal transcription; tests/test_audio.py compares
it with the web's own answers stored in audio-params.json.

A run whose inputs (audio-params.json, the tree feet, this script) match the hash on BPC_LundenAudio saves nothing.
--force rebuilds anyway; --check verifies without saving. Ends with LUNDEN_AUDIO_OK.
Take `git lfs lock` on every Audio/*.uasset before a run that may save.
"""
import ast
import hashlib
import json
import math
from pathlib import Path
import sys
import unreal as u

sys.path.insert(0, str(Path(__file__).parent))
import window_audio
import weather_audio  # noqa: E402  #2402: thunder and the strike clock
import player_parts as pp  # noqa: E402  graph helpers shared with the player (#2300)

REPO = Path(__file__).resolve().parents[3]
PARAMS_FILE = REPO / "tools/unreal-engine/audio-params.json"
MEASUREMENTS = REPO / "unreal/Lunden/Import/measurements.json"
DIR = "/Game/Lunden/Audio"
COMPONENT = DIR + "/BPC_LundenAudio"
STEP_SURFACE = "/Game/Lunden/Player/BPC_LundenStepSurface"
PLAYER = "/Game/Lunden/Player/BP_LundenPlayer"
SKY = "/Game/Lunden/Lighting/BP_LundenSky"
SPEC_TAG = "Lunden.SpecHash"
STAMP = REPO / "unreal/Lunden/Content/Lunden/Audio/build-stamp.json"  # the inputs' hash, readable without loading assets
CLASSES = {  # name: (parent, 2D reverb send) -- the web sends every effect to the room (audio.js out()), not the beds
    "SC_LundenMaster": (None, 0.0),
    "SC_LundenEffects": ("SC_LundenMaster", 1.0),
    "SC_LundenAmbience": ("SC_LundenEffects", 0.0),
    "SC_LundenMusic": ("SC_LundenMaster", 0.0),
}
ZONES = ("soft", "bright", "concrete", "courtyard")
REVERB_TAG = "LundenRoom"
SAMPLE_RATE = 48000.0  # the MetaSound default on Windows; only used to turn the web's biquad Q into a bandwidth
ASSETS = u.EditorAssetLibrary
BP = u.BlueprintEditorLibrary
BS = u.get_engine_subsystem(u.MetaSoundBuilderSubsystem)
MSE = u.get_editor_subsystem(u.MetaSoundEditorSubsystem)
TOOLS = u.AssetToolsHelpers.get_asset_tools()
OK = u.MetaSoundBuilderResult.SUCCEEDED
LOWPASS, HIGHPASS, BANDPASS = 0, 1, 2  # Audio::EBiquadFilter
WHITE = 1  # ENoiseType
TRIANGLE = 2  # ELfoWaveshapeType


def step_names(P):
    return sorted(P["footsteps"]["profiles"])


def asset_paths(P):
    return ([f"{DIR}/{n}" for n in CLASSES] + [f"{DIR}/MS_LundenStep_{p}" for p in step_names(P)]
            + [DIR + "/MS_LundenWind", DIR + "/MS_LundenAmbience", window_audio.SOUND, window_audio.ATTENUATION,
               weather_audio.SOUND]
            + [f"{DIR}/RE_Lunden{z.capitalize()}" for z in ZONES] + [COMPONENT])


def save(asset):
    if not ASSETS.save_loaded_asset(asset, False):
        raise RuntimeError("Could not save " + asset.get_path_name())


def create(path, kind, factory):
    folder, name = path.rsplit("/", 1)
    asset = TOOLS.create_asset(name, folder, kind, factory)
    if not asset:
        raise RuntimeError("Could not create " + path)
    return asset


def load_or_create(path, kind, factory):
    return ASSETS.load_asset(path) if ASSETS.does_asset_exist(path) else create(path, kind, factory)


# Web filter Q -> Unreal biquad bandwidth --------------------------------------------------------------------------------
# Unreal's biquad (SignalProcessing Filter.cpp) uses the RBJ bandwidth form alpha = sin(w0) sinh(ln2/2 BW w0/sin w0); the
# web's BiquadFilterNode uses alpha = sin(w0) / (2 Q), with Q in dB for low-pass (Web Audio spec: Q_lin = 10^(Q/20)).
# For a fixed cut-off the two are made equal exactly; a cut-off that moves at run time uses Unreal's own Q-to-bandwidth
# node (the same formula without the small w0/sin w0 correction).

def bandwidth(q_linear, hz):
    w0 = 2 * math.pi * hz / SAMPLE_RATE
    return 2 / math.log(2) * math.asinh(1 / (2 * q_linear)) * math.sin(w0) / w0


def lowpass_q(q_db):
    return 10 ** (q_db / 20)


# MetaSound builder ---------------------------------------------------------------------------------------------------------

class MetaSound:
    """A MetaSound source built headless with the MetaSoundBuilderSubsystem. Values are output handles or Python floats;
    float constants are folded, so only what varies at run time becomes nodes."""

    def __init__(self, name, one_shot):
        self.name = name
        self.b, self.on_play, self.on_finished, self.outs, res = BS.create_source_builder(
            name, u.MetaSoundOutputAudioFormat.MONO, one_shot)
        if res != OK:
            raise RuntimeError("Could not start the MetaSound builder for " + name)

    def node(self, name, variant="", namespace="UE", major=1, **inputs):
        handle, res = self.b.add_node_by_class_name(u.MetasoundFrontendClassName(namespace, name, variant), major)
        if res != OK:
            raise RuntimeError(f"{self.name}: no MetaSound node {namespace}.{name}.{variant} v{major}")
        for pin, value in inputs.items():
            self.feed(handle, pin, value)
        return handle

    def out(self, handle, pin):
        h, res = self.b.find_node_output_by_name(handle, pin)
        if res != OK:
            raise RuntimeError(f"{self.name}: node has no output {pin}")
        return h

    def feed(self, handle, pin, value):
        target, res = self.b.find_node_input_by_name(handle, pin)
        if res != OK:
            raise RuntimeError(f"{self.name}: node has no input {pin}")
        if isinstance(value, u.MetaSoundBuilderNodeOutputHandle):
            if self.b.connect_nodes(value, target) != OK:
                raise RuntimeError(f"{self.name}: could not connect to {pin}")
            return
        if isinstance(value, bool):
            literal, _ = BS.create_bool_meta_sound_literal(value)
        elif isinstance(value, int):
            literal, _ = BS.create_int_meta_sound_literal(value)
        else:
            literal, _ = BS.create_float_meta_sound_literal(float(value))
        if self.b.set_node_input_default(target, literal) != OK:
            raise RuntimeError(f"{self.name}: could not set {pin} to {value}")

    def input(self, name, default):
        literal, _ = BS.create_float_meta_sound_literal(float(default))
        handle, res = self.b.add_graph_input_node(name, "Float", literal, False)
        if res != OK:
            raise RuntimeError(f"{self.name}: could not add the input {name}")
        return handle  # the input node's output

    # float maths (block rate); Python floats fold
    def f(self, op, a, b):
        if not isinstance(a, u.MetaSoundBuilderNodeOutputHandle) and not isinstance(b, u.MetaSoundBuilderNodeOutputHandle):
            return {"Add": a + b, "Subtract": a - b, "Multiply": a * b, "Divide": a / b, "Power": a ** b}[op]
        return self.out(self.node(op, "Float", PrimaryOperand=a, AdditionalOperands=b), "Out")

    def min(self, a, b):
        return self.out(self.node("Min", "Float", "Min", A=a, B=b), "Value")

    def clamp(self, x, lo, hi):
        return self.out(self.node("Clamp", "Float", "Clamp", In=x, Min=lo, Max=hi), "Value")

    def gain(self, audio, g):
        return self.out(self.node("Multiply", "Audio by Float", PrimaryOperand=audio, AdditionalOperands=g), "Out")

    def mix(self, *audio):
        total = audio[0]
        for a in audio[1:]:
            total = self.out(self.node("Add", "Audio", PrimaryOperand=total, AdditionalOperands=a), "Out")
        return total

    def noise(self):
        return self.out(self.node("Noise", "Audio", Type=WHITE, Seed=-1), "Audio")

    def biquad(self, audio, kind, hz, bw):
        return self.out(self.node("Biquad Filter", "Audio", major=2, In=audio, Type=kind, **{"Cutoff Frequency": hz,
                                                                                            "Bandwidth": bw}), "Out")

    def q_to_bandwidth(self, q):
        return self.out(self.node("Convert Filter Q To Bandwidth", Q=q), "Bandwidth")

    def ease(self, value, seconds):
        return self.out(self.node("InterpTo", "Audio", Target=value, **{"Interp Time": seconds}), "Value")

    def finish(self, audio, length=None):
        if self.b.connect_nodes(audio, self.outs[0]) != OK:
            raise RuntimeError(self.name + ": could not connect the output")
        if length is not None:
            done = self.node("Trigger Delay", In=self.on_play, **{"Delay Time": length})
            if self.b.connect_nodes(self.out(done, "Out"), self.on_finished) != OK:
                raise RuntimeError(self.name + ": could not connect On Finished")

    def save(self, path, sound_class):
        folder, name = path.rsplit("/", 1)
        # BuildToAsset only creates (the builder's own overwrite refuses a serialized asset, and a package deleted in this
        # session cannot be created again): an old MetaSound that nothing has loaded is removed on disk and the registry
        # rescanned first, so the name is free.
        if ASSETS.does_asset_exist(path):
            replace_unloaded(path)
        _, res = MSE.build_to_asset(self.b, "Lunden #2287 build_audio.py", name, folder, None)
        if res != OK:
            raise RuntimeError("Could not build " + path)
        asset = ASSETS.load_asset(path)
        asset.set_editor_property("sound_class_object", sound_class)
        save(asset)
        return asset


def package_file(path):
    return Path(u.Paths.convert_relative_path_to_full(u.Paths.project_content_dir())) / (path[len("/Game/"):] + ".uasset")


def replace_unloaded(path):
    if u.find_object(None, path + "." + path.rsplit("/", 1)[1]):
        raise RuntimeError(f"{path} is loaded in this session and cannot be rebuilt in place; run again")
    file = package_file(path)
    if file.exists():
        file.chmod(0o666)
        file.unlink()
    u.AssetRegistryHelpers.get_asset_registry().scan_files_synchronous([str(file)], True)
    if ASSETS.does_asset_exist(path):
        raise RuntimeError("The registry still lists the removed " + path)


def footstep(P, profile):
    """src/footsteps.js synthFootstep for one profile: variation = 1 + (rand*2-1) F.variation on the body's start pitch,
    both peaks and the partial; the body glides exponentially hz*v -> endHz over `duration`; body and noise rise linearly
    to their peak over F.attack and fall exponentially to F.releaseFloor at `duration` (the web's linear 30 ms tail from
    -80 dB is left out); the noise is white through a low-pass at `cutoff` with Q = F.noiseQ (dB); `grain` crackle
    multiplies the noise by a triangle between a random trough (F.grainFloor..1) and 1, `grain` troughs over `duration`;
    `partial` is a sine gliding linearly hz*v -> endHz*v with a linear 0 -> gain -> 0 envelope over its duration."""
    F = P["footsteps"]
    p = F["profiles"][profile]
    ms = MetaSound("MS_LundenStep_" + profile, True)
    dur, att = p["duration"], F["attack"]
    var = ms.out(ms.node("RandomFloat", Next=ms.on_play, Seed=-1, Min=1 - F["variation"], Max=1 + F["variation"]), "Value")
    # s = t / duration (block rate), held at 1 afterwards: a linear 1 -> 0 decay envelope turned round
    ramp = ms.node("AD Envelope", "Float", "AD Envelope", Trigger=ms.on_play, **{
        "Attack Time": 0.0, "Decay Time": dur, "Attack Curve": 1.0, "Decay Curve": 1.0})
    s = ms.f("Subtract", 1.0, ms.out(ramp, "Out Envelope"))
    t = ms.f("Multiply", s, dur)

    def envelope(peak):
        level = ms.f("Multiply", var, peak)
        rise = ms.f("Divide", t, att)
        u_ = ms.clamp(ms.f("Divide", ms.f("Subtract", t, att), dur - att), 0.0, 1.0)
        fall = ms.f("Power", ms.f("Divide", F["releaseFloor"], level), u_)
        return ms.f("Multiply", level, ms.min(rise, fall))

    start = ms.f("Multiply", var, p["hz"])
    hz = ms.f("Multiply", start, ms.f("Power", ms.f("Divide", p["endHz"], start), s))
    body = ms.gain(ms.out(ms.node("Sine", "Audio", Frequency=hz), "Audio"), envelope(p["body"]))
    hiss = ms.biquad(ms.noise(), LOWPASS, p["cutoff"], bandwidth(lowpass_q(F["noiseQ"]), p["cutoff"]))
    hiss = ms.gain(hiss, envelope(p["noise"]))
    if p.get("grain"):
        trough = ms.out(ms.node("RandomFloat", Next=ms.on_play, Seed=-1, Min=F["grainFloor"], Max=1.0), "Value")
        rate = (2 * p["grain"] - 1) / (2 * dur)  # setValueCurveAtTime: 2*grain points evenly over `duration`
        tri = ms.out(ms.node("LFO", "Audio", Frequency=rate, Shape=TRIANGLE, Sync=ms.on_play, **{
            "Min Value": 0.0, "Max Value": 1.0, "Phase Offset": 270.0}), "Out")
        flicker = ms.f("Add", trough, ms.f("Multiply", ms.f("Subtract", 1.0, trough), tri))
        hiss = ms.gain(hiss, flicker)
    parts = [body, hiss]
    q = p.get("partial")
    if q:
        k = ms.clamp(ms.f("Divide", t, q["duration"]), 0.0, 1.0)
        f0 = ms.f("Multiply", var, q["hz"])
        qhz = ms.f("Add", f0, ms.f("Multiply", ms.f("Multiply", var, q["endHz"] - q["hz"]), k))
        tri = ms.node("AD Envelope", "Float", "AD Envelope", Trigger=ms.on_play, **{
            "Attack Time": att, "Decay Time": q["duration"] - att, "Attack Curve": 1.0, "Decay Curve": 1.0})
        parts.append(ms.gain(ms.out(ms.node("Sine", "Audio", Frequency=qhz), "Audio"),
                             ms.f("Multiply", ms.out(tri, "Out Envelope"), q["gain"])))
    ms.finish(ms.mix(*parts), dur + F["sourceTail"])
    return ms


def wind_bed(P):
    """src/audio.js sfx.windBed: ONE looping white noise through a low-pass (Gain, LpHz, LpQ in dB) and a band-pass
    (BandGain, BandHz, BandQ), the parameters eased over WIND_SOUND.ease s (the web's setTargetAtTime time constant)."""
    W = P["wind"]["sound"]
    ms = MetaSound("MS_LundenWind", False)
    ease = W["ease"]
    v = {name: ms.ease(ms.input(name, default), ease) for name, default in (
        ("Gain", 0.0), ("LpHz", 200.0), ("LpQ", 0.7), ("BandGain", 0.0), ("BandHz", 2000.0), ("BandQ", 1.0))}
    noise = ms.noise()
    body = ms.biquad(noise, LOWPASS, v["LpHz"], ms.q_to_bandwidth(ms.f("Power", 10.0, ms.f("Divide", v["LpQ"], 20.0))))
    band = ms.biquad(noise, BANDPASS, v["BandHz"], ms.q_to_bandwidth(v["BandQ"]))
    # The web connects the wind bed straight to its master (#2320).
    ms.finish(ms.gain(ms.mix(ms.gain(body, v["Gain"]), ms.gain(band, v["BandGain"])), P["masterGain"]))
    return ms


def ambient_bed(P):
    """src/audio.js sfx.ambientBed: Höje å's babble (band-pass RiverHz, RiverQ) and the far city hum (low-pass CityHz,
    Q 0.7 dB as the web's), two looping noises, eased over AMBIENT_BED.ease s."""
    A = P["ambient"]["bed"]
    ms = MetaSound("MS_LundenAmbience", False)
    ease = A["ease"]
    v = {name: ms.ease(ms.input(name, default), ease) for name, default in (
        ("RiverGain", 0.0), ("RiverHz", 900.0), ("RiverQ", 0.6), ("CityGain", 0.0), ("CityHz", 200.0))}
    river = ms.biquad(ms.noise(), BANDPASS, v["RiverHz"], ms.q_to_bandwidth(v["RiverQ"]))
    city = ms.biquad(ms.noise(), LOWPASS, v["CityHz"], ms.q_to_bandwidth(lowpass_q(0.7)))
    # River and city go straight to the web's master (#2320); RainGain already carries it (UpdateBeds).
    beds = ms.gain(ms.mix(ms.gain(river, v["RiverGain"]), ms.gain(city, v["CityGain"])), P["masterGain"])
    ms.finish(ms.mix(beds, rain_audio(ms, P)))
    return ms


def rain_audio(ms, P):
    # src/audio.js sfx.rain: all five layers share the same noise signal. Rain later passes
    # through one room cutoff and gain. The dry bed component already follows the listener.
    S = P["rain"]["surface"]
    rain = {name: ms.ease(ms.input(name, default), 0.3 if name in ("RainGain", "RainCutoff") else S["ease"])
            for name, default in (("RainGain", 0.0), ("RainCutoff", 6500.0), ("Base", 1.0), ("BaseHz", S["hardHz"]),
                                  ("Roof", 0.0), ("Metal", 0.0), ("Leaf", 0.0), ("Water", 0.0))}
    noise = ms.noise()
    # Web Audio's high/low-pass Biquad default Q is 1 dB. Band-pass Q is linear.
    q = ms.q_to_bandwidth(lowpass_q(1.0))
    high = ms.biquad(noise, HIGHPASS, 400.0, bandwidth(lowpass_q(1.0), 400.0))
    hiss = ms.biquad(high, LOWPASS, rain["BaseHz"], q)
    layers = [ms.gain(hiss, rain["Base"])]
    for key in ("roof", "metal", "leaf", "water"):
        hz, quality, _ = S[key]
        band = ms.biquad(noise, BANDPASS, hz, bandwidth(quality, hz))
        layers.append(ms.gain(band, rain[key.capitalize()]))
    rainfall = ms.biquad(ms.mix(*layers), LOWPASS, rain["RainCutoff"], q)
    return ms.gain(rainfall, rain["RainGain"])


# Sound classes and rooms ------------------------------------------------------------------------------------------------

def build_classes():
    made = {}
    for name, (parent, send) in CLASSES.items():
        sc = load_or_create(f"{DIR}/{name}", u.SoundClass, u.SoundClassFactory())
        props = sc.get_editor_property("properties")
        props.set_editor_property("default2d_reverb_send_amount", send)
        sc.set_editor_property("properties", props)
        made[name] = sc
    for name, (parent, _) in CLASSES.items():
        sc = made[name]
        sc.set_editor_property("parent_class", made[parent] if parent else None)
        sc.set_editor_property("child_classes", [made[c] for c, (p, _) in CLASSES.items() if p == name])
    for sc in made.values():
        save(sc)
    return made


def reverb_settings(profile):
    """ROOM_REVERB profile -> ReverbEffect (*guess*, a simple form of the web's convolver): decay = rt60, gain = the
    send's wet level, late delay = pre-delay, HF decay ratio = the tail's darkening damp[1] / damp[0], and the courtyard's
    first slap echo as the reflections delay and gain."""
    s = {"decay_time": profile["rt60"], "gain": profile["wet"], "late_delay": min(0.1, profile.get("pre", 0)),
         "decay_hf_ratio": max(0.1, min(2.0, profile["damp"][1] / profile["damp"][0]))}
    taps = profile.get("taps")
    if taps:
        s["reflections_delay"] = min(0.3, taps[0][0])
        s["reflections_gain"] = min(3.16, taps[0][1])
    return s


def build_reverbs(P):
    made = []
    for zone in ZONES:
        path = f"{DIR}/RE_Lunden{zone.capitalize()}"
        if ASSETS.does_asset_exist(path):
            re = ASSETS.load_asset(path)
        else:
            re = create(path, u.ReverbEffect, u.ReverbEffectFactory())
        for key, value in reverb_settings(P["reverb"]["profiles"][zone]).items():
            re.set_editor_property(key, float(value))
        save(re)
        made.append(re)
    return made


def build_metasounds(P, classes):
    sounds = {}
    for profile in step_names(P):
        sounds[profile] = footstep(P, profile).save(f"{DIR}/MS_LundenStep_{profile}", classes["SC_LundenEffects"])
    wind = wind_bed(P).save(DIR + "/MS_LundenWind", classes["SC_LundenAmbience"])
    bed = ambient_bed(P).save(DIR + "/MS_LundenAmbience", classes["SC_LundenAmbience"])
    window_audio.build_assets(P, classes["SC_LundenEffects"], MetaSound, load_or_create, save)
    # the web plays thunder through out(), so it is an effect with the room's send
    weather_audio.thunder(P, MetaSound, LOWPASS, HIGHPASS, bandwidth, lowpass_q).save(weather_audio.SOUND,
                                                                                    classes["SC_LundenEffects"])
    return sounds, wind, bed


# Blueprint expressions --------------------------------------------------------------------------------------------------

class Expr:
    """Compile `name = expression` lines into pure KismetMathLibrary nodes of a player_parts.Graph (as build_lighting.py
    Expr, but on pins). Values are Python floats/bools (folded: the web's constants become literals of the graph) or pins.
    Functions: min max clamp pow exp sin abs wrap(x, lo, hi) select(cond, a, b) smooth(a, b, x) (three.js smoothstep, as
    windsound.js / ambientbed.js `smooth`); comparisons, `and`, `or`, `not` give booleans."""

    BIN = {ast.Add: "Add_DoubleDouble", ast.Sub: "Subtract_DoubleDouble", ast.Mult: "Multiply_DoubleDouble",
           ast.Div: "Divide_DoubleDouble"}
    CMP = {ast.Gt: "Greater_DoubleDouble", ast.GtE: "GreaterEqual_DoubleDouble", ast.Lt: "Less_DoubleDouble",
           ast.LtE: "LessEqual_DoubleDouble"}
    PYBIN = {ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: lambda a, b: a * b,
             ast.Div: lambda a, b: a / b}
    PYCMP = {ast.Gt: lambda a, b: a > b, ast.GtE: lambda a, b: a >= b, ast.Lt: lambda a, b: a < b,
             ast.LtE: lambda a, b: a <= b}

    def __init__(self, g, env):
        self.g, self.env = g, dict(env)

    @staticmethod
    def const(v):
        return not isinstance(v, u.BlueprintGraphPin)

    def k(self, name, **pins):
        return self.g.op(name, **pins)

    def run(self, text):
        for line in [l.split("#", 1)[0].strip() for l in text.strip().splitlines()]:
            if line:
                name, expr = (s.strip() for s in line.split("=", 1))
                self.env[name] = self.ev(ast.parse(expr, mode="eval").body)
        return self.env

    def num(self, v):
        return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else v

    def ev(self, n):
        if isinstance(n, ast.Constant):
            return n.value if isinstance(n.value, bool) else float(n.value)
        if isinstance(n, ast.Name):
            if n.id not in self.env:
                raise RuntimeError("Expr: unknown name " + n.id)
            return self.num(self.env[n.id])
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub):
            v = self.ev(n.operand)
            return -v if self.const(v) else self.k("Multiply_DoubleDouble", A=v, B=-1.0)
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.Not):
            v = self.ev(n.operand)
            return (not v) if self.const(v) else self.k("Not_PreBool", A=v)
        if isinstance(n, ast.BinOp):
            a, b = self.ev(n.left), self.ev(n.right)
            if self.const(a) and self.const(b):
                return self.PYBIN[type(n.op)](a, b)
            return self.k(self.BIN[type(n.op)], A=a, B=b)
        if isinstance(n, ast.Compare):
            a, b = self.ev(n.left), self.ev(n.comparators[0])
            if self.const(a) and self.const(b):
                return self.PYCMP[type(n.ops[0])](a, b)
            return self.k(self.CMP[type(n.ops[0])], A=a, B=b)
        if isinstance(n, ast.BoolOp):
            vals = [self.ev(v) for v in n.values]
            op = "BooleanAND" if isinstance(n.op, ast.And) else "BooleanOR"
            out = vals[0]
            for v in vals[1:]:
                out = self.k(op, A=out, B=v)
            return out
        if isinstance(n, ast.Call):
            f, args = n.func.id, [self.ev(a) for a in n.args]
            folded = all(self.const(a) for a in args)
            if f in ("min", "max"):
                return (min if f == "min" else max)(*args) if folded else self.k("FMin" if f == "min" else "FMax", A=args[0], B=args[1])
            if f == "clamp":
                return min(max(args[0], args[1]), args[2]) if folded else self.k("FClamp", Value=args[0], Min=args[1], Max=args[2])
            if f == "pow":
                return args[0] ** args[1] if folded else self.k("MultiplyMultiply_FloatFloat", Base=args[0], Exp=args[1])
            if f == "exp":
                return math.exp(args[0]) if folded else self.k("Exp", A=args[0])
            if f == "sin":
                return math.sin(args[0]) if folded else self.k("Sin", A=args[0])
            if f == "abs":
                return abs(args[0]) if folded else self.k("Abs", A=args[0])
            if f == "wrap":
                return self.k("FWrap", Value=args[0], Min=args[1], Max=args[2])
            if f == "select":
                c, a, b = args
                if self.const(c):
                    return a if c else b
                return self.k("SelectFloat", A=a, B=b, bPickA=c)
            if f == "smooth":
                a, b, x = args
                inner = Expr(self.g, {"a": a, "b": b, "x": x})
                return inner.run("t = clamp((x - a) / (b - a), 0, 1)\nr = t * t * (3 - 2 * t)")["r"]
            raise RuntimeError("Expr: unknown function " + f)
        raise RuntimeError("Expr: unsupported syntax " + ast.dump(n))


# The web's formulas, transcribed (src/windsim.js windPower, src/windsound.js gustAt / windStrength / windSoundParams,
# src/ambientbed.js riverBabbleParams / trafficLevel / cityHumParams). Capitalised names are the function's inputs, the
# others the web's constants (audio-params.json) or earlier lines.
WIND_POWER = """
p = min(1, pow(max(0, Speed / full), gamma))
r = top - knee
Power = select(p <= knee, p, knee + r * (1 - exp(0 - (p - knee) / r)))
"""
WIND_STRENGTH = WIND_POWER + """
Strength = clamp(Power * (0.7 + 0.6 * Gust), 0, 1)
"""
GUST = """
w = 0.5 + 0.5 * sin(T * f1 * 6.2832) * sin(T * f2 * 6.2832 + 1.3)
Gust = clamp(0.5 + (w - 0.5) * 2 * depth * (0.4 + 0.6 * clamp(Power, 0, 1)), 0, 1)
"""
WIND_PARAMS = WIND_STRENGTH + """
s = Strength
gain0 = (bodyGain0 + (bodyGain1 - bodyGain0) * pow(s, bodyGamma)) * select(s > 0, 1, 0.5)
lpHz0 = bodyHz0 + (bodyHz1 - bodyHz0) * s
LpQ = bodyQ0 + (bodyQ1 - bodyQ0) * smooth(howl0, howl1, s)
rustle = Leaves * Near * smooth(0.05, 0.4, s)
whistle = (1 - Leaves) * smooth(from0, from1, s) * (0.5 + 0.5 * Near)
tot = rustle + whistle
k = select(tot > 0, whistle / max(tot, 0.000000001), 0)
band0 = (rustleGain * rustle + whistleGain * whistle) * (0.5 + s)
rHz = rustleHz0 + (rustleHz1 - rustleHz0) * s
wHz = whistleHz0 + (whistleHz1 - whistleHz0) * s
BandHz = rHz + (wHz - rHz) * k
BandQ = rustleQ + (whistleQ0 + (whistleQ1 - whistleQ0) * s - rustleQ) * k
Gain = select(Indoors, gain0 * indoorGain, gain0)
BandGain = select(Indoors, band0 * indoorBand, band0)
LpHz = select(Indoors, min(lpHz0, indoorHz), lpHz0)
"""
RIVER = """
near = 1 - smooth(full, range, Dist)
g0 = gain * near * near
hz0 = hz0_ + (hz1_ - hz0_) * near
RiverGain = select(Indoors, g0 * indoorRiver, g0)
RiverHz = select(Indoors, min(hz0, indoorHz), hz0)
RiverQ = q
"""


def traffic_text(rush):
    terms = " + ".join(f"exp(0 - ((h - {at!r}) / {w!r}) * ((h - {at!r}) / {w!r}))" for at, w in rush) or "0"
    return f"""
h = wrap(Hour, 0, 24)
day = smooth(dayFrom0, dayFrom1, h) * (1 - smooth(dayTo0, dayTo1, h))
rush = {terms}
Traffic = clamp(night + (dayLevel - night) * day + rushBoost * day * min(1, rush), 0, 1)
"""


CITY = """
c0 = cityGain * Traffic
f0 = cityHz0 + (cityHz1 - cityHz0) * Traffic
CityGain = select(Indoors, c0 * indoorCity, c0)
CityHz = select(Indoors, min(f0, indoorCityHz), f0)
"""


def wind_env(P):
    W, pw = P["wind"]["sound"], P["wind"]["power"]
    B, R = W["body"], W["band"]
    return {"full": pw["full"], "gamma": pw["gamma"], "knee": pw["knee"], "top": pw["top"],
            "f1": W["gust"]["f1"], "f2": W["gust"]["f2"], "depth": W["gust"]["depth"],
            "bodyGain0": B["gain"][0], "bodyGain1": B["gain"][1], "bodyGamma": B["gamma"], "bodyHz0": B["hz"][0],
            "bodyHz1": B["hz"][1], "bodyQ0": B["q"][0], "bodyQ1": B["q"][1], "howl0": B["howl"][0], "howl1": B["howl"][1],
            "rustleHz0": R["rustle"]["hz"][0], "rustleHz1": R["rustle"]["hz"][1], "rustleQ": R["rustle"]["q"],
            "rustleGain": R["rustle"]["gain"], "whistleHz0": R["whistle"]["hz"][0], "whistleHz1": R["whistle"]["hz"][1],
            "whistleQ0": R["whistle"]["q"][0], "whistleQ1": R["whistle"]["q"][1], "whistleGain": R["whistle"]["gain"],
            "from0": R["from"][0], "from1": R["from"][1],
            "indoorGain": W["indoor"]["gain"], "indoorHz": W["indoor"]["hz"], "indoorBand": W["indoor"]["band"]}


def rain_env(P):
    s = P["rain"]["surface"]
    return {**{key: s[key] for key in ("others", "indoorRoof", "thin", "hardHz", "grassHz", "waterFull", "waterRange")},
            **{key + "Gain": s[key][2] for key in ("roof", "metal", "leaf", "water")}}


# src/rainsurface.js rainSurfaceMix. Keep nested maxima binary, as the Blueprint FMax node has two inputs.
RAIN_MIX = """
covered = Indoors or UnderRoof
openness = select(covered, others, 1)
Roof = select(Indoors, indoorRoof, select(UnderRoof, 1, 0)) * roofGain
Metal = MetalNear * metalGain * select(Indoors, 0.5, 1)
Leaf = Trees * Leaves * leafGain * openness
Water = (1 - smooth(waterFull, waterRange, RiverDist)) * waterGain * openness
busy = clamp(max(max(Roof, Metal), max(Leaf, Water)), 0, 1)
Base = 1 - thin * busy
BaseHz = hardHz + (grassHz - hardHz) * clamp(Grass, 0, 1) * select(covered, 0, 1)
"""


def bed_env(P):
    A = P["ambient"]["bed"]
    R, C, I = A["river"], A["city"], A["indoor"]
    return {"full": R["full"], "range": R["range"], "gain": R["gain"], "hz0_": R["hz"][0], "hz1_": R["hz"][1], "q": R["q"],
            "indoorRiver": I["river"], "indoorHz": I["hz"], "indoorCity": I["city"], "indoorCityHz": I["hzCity"],
            "night": C["night"], "dayLevel": C["day"], "dayFrom0": C["dayFrom"][0], "dayFrom1": C["dayFrom"][1],
            "dayTo0": C["dayTo"][0], "dayTo1": C["dayTo"][1], "rushBoost": C["rushBoost"],
            "cityHz0": C["hz"][0], "cityHz1": C["hz"][1], "cityGain": C["gain"]}


# BPC_LundenAudio ---------------------------------------------------------------------------------------------------------

FUNCTIONS = ("PickStep", "PlayStep", "UpdateSteps", "ReadSky", "WindPower", "WindStrength", "GustAt", "WindParams",
             "TreeNearness", "RiverDistance", "RiverParams", "TrafficLevel", "CityParams", "RainMix", "ZoneFor", "UpdateBeds", "PushWind", "PushBed")
REAL, INT, BOOL, NAME, VEC = pp.REAL, pp.INT, pp.BOOL, pp.NAME, pp.VEC
WIND_OUT = ["Gain", "LpHz", "LpQ", "BandGain", "BandHz", "BandQ"]
BED_OUT = ["RiverGain", "RiverHz", "RiverQ", "CityGain", "CityHz"]
RAIN_MIX_OUT = ["Base", "BaseHz", "Roof", "Metal", "Leaf", "Water"]
RAIN_OUT = ["RainGain", "RainCutoff", *RAIN_MIX_OUT]


def component_variables(bp, sound_type, reverb_type):
    wanted = {
        # footsteps
        "Profiles": pp.array(NAME), "StepSounds": pp.array(sound_type), "StepVolume": REAL, "LeafMonths": pp.array(INT),
        "StrideWalk": REAL, "StrideRun": REAL, "Teleport": REAL, "Stride": REAL, "Moved": REAL, "LastPos": VEC, "HaveLast": BOOL,
        "StepCount": INT, "LastProfile": NAME, "LastSurface": NAME, "LastStepSound": sound_type, "LastStepTime": REAL,
        "StepsOn": BOOL,
        # the weather the sky gives (BP_LundenSky) or a test sets; snow cover and temperature are not ported yet
        "WindSpeed": REAL, "Wet": REAL, "Rain": REAL, "Month": INT, "Hour": REAL, "SnowCover": REAL, "Temperature": REAL,
        "UseSky": BOOL,
        # the beds
        "Every": REAL, "UpdateT": REAL, "TreeFeet": pp.array(VEC), "NearCm": REAL, "LeavesByMonth": pp.array(REAL),
        "RiverPath": pp.array(VEC), "Best": REAL, "Indoors": BOOL, "Near": REAL, "GustNow": REAL, "RiverDist": REAL,
        "Traffic": REAL, "Updates": INT, **{"Wind" + n: REAL for n in WIND_OUT}, **{n: REAL for n in (*BED_OUT, *RAIN_OUT)},
        "WindAudio": BP.get_object_reference_type(u.AudioComponent.static_class()),
        "BedAudio": BP.get_object_reference_type(u.AudioComponent.static_class()),
        "WindSound": sound_type, "BedSound": sound_type,
        # the room
        "ReverbZone": NAME, "ReverbEffects": pp.array(reverb_type), "ReverbFade": REAL, "ZoneChanges": INT,
    }
    pp.variables(bp, wanted)
    for name in wanted:  # tests and later areas (snow cover, temperature) set them on the running component
        BP.set_blueprint_variable_instance_editable(bp, name, True)


def build_component(P, trees, sounds, wind, bed, reverbs, sashes):
    bp = pp.fresh_component(COMPONENT, FUNCTIONS + window_audio.FUNCTIONS + weather_audio.FUNCTIONS)
    sound_type = BP.get_object_reference_type(u.SoundBase.static_class())
    reverb_type = BP.get_object_reference_type(u.ReverbEffect.static_class())
    component_variables(bp, sound_type, reverb_type)
    window_audio.variables(bp, pp, sound_type)
    weather_audio.variables(bp, pp, sound_type)
    me = pp.class_path(COMPONENT)
    step_cls = pp.class_path(STEP_SURFACE)
    sky_cls = pp.class_path(SKY)
    player_cls = pp.class_path(PLAYER)
    F = P["footsteps"]

    def surface_info(g):
        owner = g.pure("ActorComponent:GetOwner")
        found = g.pure("Actor:GetComponentByClass", target=owner, ComponentClass=step_cls)
        step = pp.cast_component(g, found, STEP_SURFACE)
        return g.node_of(step_cls + ":FeetInfo", target=step)

    # PickStep(Surface, Where, Road, Stairs) -> Profile: src/footsteps.js pickStep with the weather in the variables
    g, p = pp.function(bp, "PickStep", [("Surface", NAME), ("Where", NAME), ("Road", BOOL), ("Stairs", BOOL)],
                       [("Profile", NAME)], pure=True)

    def is_(pin, name):
        return g.op("EqualEqual_NameName", A=pin, B=name)

    ground, exposed, core = is_(p["Where"], "ground"), is_(p["Where"], "exposed"), is_(p["Where"], "core")
    hard = is_(p["Surface"], "hard")
    soft = g.op("BooleanOR", A=is_(p["Surface"], "grass"), B=is_(p["Surface"], "gravel"))
    leaf_month = g.pure("KismetArrayLibrary:Array_Contains", TargetArray=g.get("LeafMonths"), ItemToFind=g.get("Month"))
    profile = p["Surface"]
    leaves = g.op("BooleanAND", A=g.op("BooleanAND", A=ground, B=soft), B=leaf_month)
    profile = g.op("SelectName", A="leaves", B=profile, bPickA=leaves)
    wet = g.op("BooleanAND", A=g.op("BooleanAND", A=g.op("BooleanOR", A=ground, B=exposed), B=hard),
               B=g.op("GreaterEqual_DoubleDouble", A=g.get("Wet"), B=F["wetMin"]))
    profile = g.op("SelectName", A="wet", B=profile, bPickA=wet)
    snow = g.op("BooleanAND", A=g.op("BooleanAND", A=ground, B=g.op("Not_PreBool", A=p["Road"])),
                B=g.op("GreaterEqual_DoubleDouble", A=g.get("SnowCover"), B=F["snowMin"]))
    cold = g.op("LessEqual_DoubleDouble", A=g.get("Temperature"), B=F["squeakTemp"])
    profile = g.op("SelectName", A=g.op("SelectName", A="snowCold", B="snow", bPickA=cold), B=profile, bPickA=snow)
    profile = g.op("SelectName", A="stair", B=profile, bPickA=g.op("BooleanAND", A=p["Stairs"], B=core))
    g.ret(Profile=profile)

    # ReadSky(): the weather from the world's BP_LundenSky (#2283), when there is one and UseSky is on
    g, _ = pp.function(bp, "ReadSky")
    g.branch(g.get("UseSky"))
    actor = g.pure("GameplayStatics:GetActorOfClass", ActorClass=sky_cls)
    g.branch(g.pure("KismetSystemLibrary:IsValid", Object=actor))
    cast = g.g.create_node_from_name("Utilities|Casting|CastToActor", u.Vector2D(0, 0), [])
    if not cast or not g.g.retarget_node_class(cast, u.Actor.static_class(), u.load_class(None, sky_cls)):
        raise RuntimeError("Could not make a cast to BP_LundenSky")
    g.step(cast)
    pp.link(actor, pp.inp(cast, "Object"))
    sky = pp.cast_out(cast)
    for name in ("WindSpeed", "Wet", "Rain", "Month", "Hour", "Hail", "Storm"):
        g.set(name, g.get(name, SKY + "." + SKY.rsplit("/", 1)[1] + "_C", target=sky))

    # PlayStep(): the profile under the feet and its MetaSound (src/main.js footsteps -> sfx.step)
    g, _ = pp.function(bp, "PlayStep")
    g.run(me + ":ReadSky")
    info = surface_info(g)
    profile = g.pure(me + ":PickStep", result="Profile", **{n: pp.out(info, n) for n in ("Surface", "Where", "Road", "Stairs")})
    g.set("LastProfile", profile)
    g.set("LastSurface", pp.out(info, "Surface"))
    g.set("StepCount", g.op("Add_IntInt", A=g.get("StepCount"), B=1))
    g.set("LastStepTime", g.pure("KismetSystemLibrary:GetGameTimeInSeconds"))
    index = g.pure("KismetArrayLibrary:Array_Find", TargetArray=g.get("Profiles"), ItemToFind=profile)
    sound = g.item(g.get("StepSounds"), index)
    g.set("LastStepSound", sound)
    g.run("GameplayStatics:PlaySound2D", Sound=sound, VolumeMultiplier=g.get("StepVolume"),
          OwningActor=g.pure("ActorComponent:GetOwner"))

    # UpdateSteps(): one step every StrideWalk (StrideRun while Running) of ground covered, none while falling, flying or
    # swimming, and no stride counted over a jump of more than Teleport between frames (src/main.js footsteps)
    g, _ = pp.function(bp, "UpdateSteps")
    owner = g.pure("ActorComponent:GetOwner")
    player = g.g.create_node_from_name("Utilities|Casting|CastToCharacter", u.Vector2D(0, 0), [])
    if not player or not g.g.retarget_node_class(player, u.Character.static_class(), u.load_class(None, player_cls)):
        raise RuntimeError("Could not make a cast to BP_LundenPlayer")
    g.step(player)
    pp.link(owner, pp.inp(player, "Object"))
    who = pp.cast_out(player)
    at = g.pure("Actor:K2_GetActorLocation", target=who)
    last, have = g.get("LastPos"), g.get("HaveLast")
    d = g.op("VSizeXY", A=g.op("Subtract_VectorVector", A=at, B=last))
    # stored before LastPos moves on: a pure node is evaluated again by every later node that reads it
    g.set("Moved", g.op("SelectFloat", A=d, B=0.0, bPickA=have))
    d = g.get("Moved")
    g.set("LastPos", at)
    g.set("HaveLast", True)
    movement = g.get("CharacterMovement", "/Script/Engine.Character", target=who)
    grounded = g.pure("NavMovementComponent:IsMovingOnGround", target=movement)
    ok = g.op("BooleanAND", A=g.op("BooleanAND", A=grounded, B=g.op("LessEqual_DoubleDouble", A=d, B=g.get("Teleport"))),
              B=g.get("StepsOn"))
    g.branch(ok)
    g.set("Stride", g.op("Add_DoubleDouble", A=g.get("Stride"), B=d))
    limit = g.op("SelectFloat", A=g.get("StrideRun"), B=g.get("StrideWalk"), bPickA=g.get("Running", player_cls, target=who))
    g.branch(g.op("GreaterEqual_DoubleDouble", A=g.get("Stride"), B=limit))
    g.set("Stride", 0.0)
    g.run(me + ":PlayStep")

    # The wind (pure functions the test calls with the web's cases)
    W = wind_env(P)
    g, p = pp.function(bp, "WindPower", [("Speed", REAL)], [("Power", REAL)], pure=True)
    g.ret(Power=Expr(g, {**W, **p}).run(WIND_POWER)["Power"])
    g, p = pp.function(bp, "WindStrength", [("Speed", REAL), ("Gust", REAL)], [("Strength", REAL)], pure=True)
    g.ret(Strength=Expr(g, {**W, **p}).run(WIND_STRENGTH)["Strength"])
    g, p = pp.function(bp, "GustAt", [("T", REAL), ("Power", REAL)], [("Gust", REAL)], pure=True)
    g.ret(Gust=Expr(g, {**W, **p}).run(GUST)["Gust"])
    g, p = pp.function(bp, "WindParams", [("Speed", REAL), ("Gust", REAL), ("Leaves", REAL), ("Near", REAL), ("Indoors", BOOL)],
                       [(n, REAL) for n in WIND_OUT], pure=True)
    env = Expr(g, {**W, **p}).run(WIND_PARAMS)
    g.ret(**{n: env[n] for n in WIND_OUT})

    # TreeNearness(Location) -> Near: 1 at a tree foot, 0 from NearCm on (windsound.js treeNearness)
    g, p = pp.function(bp, "TreeNearness", [("Location", VEC)], [("Near", REAL)])
    g.set("Best", g.get("NearCm"))
    foot, _, done = g.loop(g.get("TreeFeet"))
    dist = g.op("VSizeXY", A=g.op("Subtract_VectorVector", A=foot, B=p["Location"]))
    g.set("Best", g.op("FMin", A=g.get("Best"), B=dist))
    tail = g.fork(done, 600)
    tail.ret(Near=tail.op("Subtract_DoubleDouble", A=1.0, B=tail.op("Divide_DoubleDouble", A=tail.get("Best"), B=tail.get("NearCm"))))

    # RiverDistance(Location) -> Dist (m, plan): ambientbed.js distToPolyline to Höje å's centreline
    g, p = pp.function(bp, "RiverDistance", [("Location", VEC)], [("Dist", REAL)])
    g.set("Best", 1e12)
    split = g.call("KismetMathLibrary:BreakVector")
    pp.link(p["Location"], pp.inp(split, "InVec"))
    here = g.op("MakeVector", X=pp.out(split, "X"), Y=pp.out(split, "Y"), Z=0.0)
    count = g.op("Subtract_IntInt", A=g.pure("KismetArrayLibrary:Array_Length", TargetArray=g.get("RiverPath")), B=1)
    i, done = g.count(1, count)
    a = g.item(g.get("RiverPath"), g.op("Subtract_IntInt", A=i, B=1))
    b = g.item(g.get("RiverPath"), i)
    seg = g.op("GetPointDistanceToSegment", Point=here, SegmentStart=a, SegmentEnd=b)
    g.set("Best", g.op("FMin", A=g.get("Best"), B=seg))
    tail = g.fork(done, 600)
    tail.ret(Dist=tail.op("Divide_DoubleDouble", A=tail.get("Best"), B=100.0))

    # The outdoor bed (ambientbed.js)
    B = bed_env(P)
    g, p = pp.function(bp, "RiverParams", [("Dist", REAL), ("Indoors", BOOL)], [(n, REAL) for n in BED_OUT[:3]], pure=True)
    env = Expr(g, {**B, **p}).run(RIVER)
    g.ret(**{n: env[n] for n in BED_OUT[:3]})
    rush = [tuple(r) for r in P["ambient"]["bed"]["city"]["rush"]]
    g, p = pp.function(bp, "TrafficLevel", [("Hour", REAL)], [("Traffic", REAL)], pure=True)
    g.ret(Traffic=Expr(g, {**B, **p}).run(traffic_text(rush))["Traffic"])
    g, p = pp.function(bp, "CityParams", [("Hour", REAL), ("Indoors", BOOL)], [(n, REAL) for n in BED_OUT[3:]], pure=True)
    env = Expr(g, {**B, **p}).run(traffic_text(rush) + CITY)
    g.ret(**{n: env[n] for n in BED_OUT[3:]})

    g, p = pp.function(bp, "RainMix", [("Indoors", BOOL), ("UnderRoof", BOOL), ("Trees", REAL), ("Leaves", REAL),
                                      ("RiverDist", REAL), ("MetalNear", REAL), ("Grass", REAL)],
                       [(n, REAL) for n in RAIN_MIX_OUT], pure=True)
    env = Expr(g, {**rain_env(P), **p}).run(RAIN_MIX)
    g.ret(**{n: env[n] for n in RAIN_MIX_OUT})

    # ZoneFor(Where, Surface, Location) -> Zone: src/stepsurface.js indoorRoomClass from the same surface classes
    # (core -> concrete, indoor hard -> bright, indoor -> soft), else roomreverb.js's courtyard rectangle, else open
    court = P["reverb"]["courtyard"]
    g, p = pp.function(bp, "ZoneFor", [("Where", NAME), ("Surface", NAME), ("Location", VEC)], [("Zone", NAME)], pure=True)
    split = g.call("KismetMathLibrary:BreakVector")
    pp.link(p["Location"], pp.inp(split, "InVec"))
    x, y, z = (pp.out(split, c) for c in "XYZ")
    inside = Expr(g, {"X": x, "Y": y, "Z": z, **{k: float(v) for k, v in court["unreal"].items()}, "maxZ": float(court["maxYUnreal"])}
                  ).run("In = X >= x0 and X <= x1 and Y >= y0 and Y <= y1 and Z < maxZ")["In"]
    zone = g.op("SelectName", A="courtyard", B="open", bPickA=inside)
    indoor = g.op("EqualEqual_NameName", A=p["Where"], B="indoor")
    room = g.op("SelectName", A="bright", B="soft", bPickA=g.op("EqualEqual_NameName", A=p["Surface"], B="hard"))
    zone = g.op("SelectName", A=room, B=zone, bPickA=indoor)
    zone = g.op("SelectName", A="concrete", B=zone, bPickA=g.op("EqualEqual_NameName", A=p["Where"], B="core"))
    g.ret(Zone=zone)

    window_audio.graphs(bp, pp, me, P)
    weather_audio.graphs(bp, pp, me)

    # UpdateBeds(): every Every s (WIND_SOUND.every / AMBIENT_BED.every), as src/main.js
    g, _ = pp.function(bp, "UpdateBeds")
    g.run(me + ":ReadSky")
    info = surface_info(g)
    loc = g.pure("Actor:K2_GetActorLocation", target=g.pure("ActorComponent:GetOwner"))
    g.set("Indoors", g.op("Not_PreBool", A=pp.out(info, "Outdoor")))
    g.set("Updates", g.op("Add_IntInt", A=g.get("Updates"), B=1))
    t = g.pure("KismetSystemLibrary:GetGameTimeInSeconds")
    pw = g.pure(me + ":WindStrength", result="Strength", Speed=g.get("WindSpeed"), Gust=0.5)
    g.set("GustNow", g.pure(me + ":GustAt", result="Gust", T=t, Power=pw))
    g.run(me + ":UpdateWindows")
    near = g.node_of(me + ":TreeNearness", Location=loc)
    g.set("Near", pp.out(near, "Near"))
    leaves = g.item(g.get("LeavesByMonth"), g.get("Month"))
    wp = g.node_of(me + ":WindParams", Speed=g.get("WindSpeed"), Gust=g.get("GustNow"), Leaves=leaves, Near=g.get("Near"),
                   Indoors=g.get("Indoors"))
    for n in WIND_OUT:
        g.set("Wind" + n, pp.out(wp, n))
    river = g.node_of(me + ":RiverDistance", Location=loc)
    g.set("RiverDist", pp.out(river, "Dist"))
    rp = g.node_of(me + ":RiverParams", Dist=g.get("RiverDist"), Indoors=g.get("Indoors"))
    g.set("Traffic", g.pure(me + ":TrafficLevel", result="Traffic", Hour=g.get("Hour")))
    cp = g.node_of(me + ":CityParams", Hour=g.get("Hour"), Indoors=g.get("Indoors"))
    for n in BED_OUT[:3]:
        g.set(n, pp.out(rp, n))
    for n in BED_OUT[3:]:
        g.set(n, pp.out(cp, n))
    # Current R1 listener: shelter above the listener is measured in the composed level. Dynamic
    # cars/cabins (#2357) do not yet supply sheet-metal distance. Use the existing surface sensor.
    head = g.pure("PlayerCameraManager:GetCameraLocation", target=g.pure("GameplayStatics:GetPlayerCameraManager", PlayerIndex=0))
    end = g.op("Add_VectorVector", A=head, B=g.op("MakeVector", X=0.0, Y=0.0, Z=100000.0))
    roof = g.node_of("KismetSystemLibrary:LineTraceSingle", Start=head, End=end, TraceChannel="TraceTypeQuery1",
                     bTraceComplex=True, DrawDebugType="None", bIgnoreSelf=True)
    soft = g.op("EqualEqual_NameName", A=pp.out(info, "Surface"), B="grass")
    mix = g.node_of(me + ":RainMix", Indoors=g.get("Indoors"), UnderRoof=pp.out(roof, "ReturnValue"),
                    Trees=g.get("Near"), Leaves=leaves, RiverDist=g.get("RiverDist"), MetalNear=0.0,
                    Grass=g.op("SelectFloat", A=1.0, B=0.0, bPickA=soft))
    for name in RAIN_MIX_OUT:
        g.set(name, pp.out(mix, name))
    altitude = g.call("KismetMathLibrary:BreakVector")
    pp.link(head, pp.inp(altitude, "InVec"))
    # weather.js: the rain's level and muffling; hail rattles `hail.loud` times louder and brighter (#2402)
    H = P["hail"]
    env = Expr(g, {"Rain": g.get("Rain"), "inside": g.get("Indoors"), "hail": g.get("Hail"), "height": pp.out(altitude, "Z"),
                   "cloudTop": P["rain"]["cloudTop"] * 100, "cloudFade": P["rain"]["cloudFade"] * 100,
                   "outputGain": P["rain"]["sound"] * P["masterGain"], "loud": float(H["loud"]),
                   "hailHz": float(H["cutoff"]), "rainHz": float(H["rainCutoff"]), "insideGain": float(H["inside"]),
                   "insideHz": float(H["insideCutoff"])}).run(
        "above = smooth(cloudTop, cloudTop + cloudFade, height)\n"
        "gain = Rain * (1 - above) * outputGain * select(hail, loud, 1) * select(inside, insideGain, 1)\n"
        "cutoff = select(inside, insideHz, select(hail, hailHz, rainHz))")
    g.set("RainGain", env["gain"])
    g.set("RainCutoff", env["cutoff"])
    # the room: switch the reverb only when the zone changes
    zone = g.pure(me + ":ZoneFor", result="Zone", Where=pp.out(info, "Where"), Surface=pp.out(info, "Surface"), Location=loc)
    g.branch(g.op("NotEqual_NameName", A=zone, B=g.get("ReverbZone")))
    g.set("ReverbZone", zone)
    g.set("ZoneChanges", g.op("Add_IntInt", A=g.get("ZoneChanges"), B=1))
    open_ = g.branch(g.op("NotEqual_NameName", A=g.get("ReverbZone"), B="open"))
    effect = g.item(g.get("ReverbEffects"), zone_index(g, g.get("ReverbZone")))
    g.run("GameplayStatics:ActivateReverbEffect", ReverbEffect=effect, TagName=REVERB_TAG, Priority=0.0, Volume=1.0,
          FadeTime=g.get("ReverbFade"))
    g.fork(open_, 700).run("GameplayStatics:DeactivateReverbEffect", TagName=REVERB_TAG)

    # PushWind() / PushBed(): the parameters to the running loops (no loop under -nosound or without an audio device)
    for fn, audio, names in (("PushWind", "WindAudio", [("Wind" + n, n) for n in WIND_OUT]),
                             ("PushBed", "BedAudio", [(n, n) for n in (*BED_OUT, *RAIN_OUT)])):
        g, _ = pp.function(bp, fn)
        g.branch(g.pure("KismetSystemLibrary:IsValid", Object=g.get(audio)))
        for var, param in names:
            g.run("AudioComponent:SetFloatParameter", target=g.get(audio), InName=param, InFloat=g.get(var))

    ev = pp.events(bp)
    pp.event(ev, bp, "AddEvent|EventBeginPlay", "ReceiveBeginPlay", 0)
    ev.set("HaveLast", False)
    ev.set("Stride", 0.0)
    weather_audio.begin_play(ev)
    for var, snd in (("WindAudio", "WindSound"), ("BedAudio", "BedSound")):
        comp = ev.pure("GameplayStatics:SpawnSound2D", Sound=ev.get(snd), bAutoDestroy=False)
        ev.set(var, comp)
    ev.run(me + ":UpdateBeds")
    ev.run(me + ":PushWind")
    ev.run(me + ":PushBed")
    tick = pp.event(ev, bp, "AddEvent|EventTick", "ReceiveTick", 900)
    ev.run(me + ":UpdateSteps")
    weather_audio.tick(ev, me, pp.out(tick, "DeltaSeconds"))
    ev.set("UpdateT", ev.op("Add_DoubleDouble", A=ev.get("UpdateT"), B=pp.out(tick, "DeltaSeconds")))
    ev.branch(ev.op("GreaterEqual_DoubleDouble", A=ev.get("UpdateT"), B=ev.get("Every")))
    ev.set("UpdateT", 0.0)
    ev.run(me + ":UpdateBeds")
    ev.run(me + ":PushWind")
    ev.run(me + ":PushBed")
    window_audio.end_play(ev, bp, pp)
    pp.compiled(bp)
    defaults(bp, P, trees, sounds, wind, bed, reverbs)
    window_audio.defaults(u.get_default_object(bp.generated_class()), sashes, ASSETS.load_asset)
    weather_audio.defaults(u.get_default_object(bp.generated_class()), P, ASSETS.load_asset)
    return bp


def zone_index(g, zone):
    """The index of `zone` in ZONES (ReverbEffects' order) as nested selects."""
    index = 0
    for i, name in enumerate(ZONES):
        if i:
            index = g.op("SelectInt", A=i, B=index, bPickA=g.op("EqualEqual_NameName", A=zone, B=name))
    return index


def defaults(bp, P, trees, sounds, wind, bed, reverbs):
    BP.compile_blueprint(bp)
    d = u.get_default_object(bp.generated_class())
    F = P["footsteps"]
    names = step_names(P)
    d.set_editor_property("Profiles", [u.Name(n) for n in names])
    d.set_editor_property("StepSounds", [sounds[n] for n in names])
    d.set_editor_property("StepVolume", F["gain"] * P["masterGain"])  # sfx.step's out(null, FOOTSTEPS.gain) -> master
    d.set_editor_property("LeafMonths", [int(m) for m in F["leafMonths"]])
    d.set_editor_property("StrideWalk", 100.0 * F["strideWalk"])
    d.set_editor_property("StrideRun", 100.0 * F["strideRun"])
    d.set_editor_property("Teleport", 100.0 * F["teleport"])
    d.set_editor_property("StepsOn", True)
    d.set_editor_property("UseSky", True)
    d.set_editor_property("Temperature", 10.0)  # src/main.js stepProfile: weather.temp ?? 10 (no temperature in Unreal yet)
    d.set_editor_property("Month", 6)
    d.set_editor_property("Hour", 12.0)
    d.set_editor_property("Every", float(P["wind"]["sound"]["every"]))
    d.set_editor_property("NearCm", 100.0 * P["wind"]["sound"]["near"])
    d.set_editor_property("LeavesByMonth", [1.0] + [float(P["wind"]["leaves"][str(m)]) for m in range(1, 13)])
    d.set_editor_property("TreeFeet", [u.Vector(x, y, 0.0) for x, y in trees])
    d.set_editor_property("RiverPath", [u.Vector(x, y, 0.0) for x, y in P["ambient"]["river"]["unreal"]])
    d.set_editor_property("WindSound", wind)
    d.set_editor_property("BedSound", bed)
    d.set_editor_property("ReverbEffects", list(reverbs))
    d.set_editor_property("ReverbFade", float(P["reverb"]["fade"]))
    d.set_editor_property("ReverbZone", u.Name("open"))


# Main ---------------------------------------------------------------------------------------------------------------------

def tree_feet(measurements):
    """The exported trees' feet (vegetation.trees, every kind: src/surroundings.js treeFeet and aoTrees as export-scene.js
    lists them), plan cm, without repeats. *Approximation:* the web's treeNearness reads treeFeet alone."""
    return sorted({(float(t["foot"]["unreal"][0]), float(t["foot"]["unreal"][1])) for t in measurements["vegetation"]["trees"]})


def spec_hash(P, trees, sashes):
    text = Path(__file__).read_bytes().replace(b"\r\n", b"\n")
    h = hashlib.sha256(text)
    h.update(json.dumps(P, sort_keys=True).encode())
    h.update(json.dumps(trees).encode())
    h.update(Path(window_audio.__file__).read_bytes().replace(b"\r\n", b"\n"))
    h.update(Path(weather_audio.__file__).read_bytes().replace(b"\r\n", b"\n"))
    h.update(json.dumps(sashes).encode())
    return h.hexdigest()


def check(P, want):
    missing = [p for p in asset_paths(P) if not ASSETS.does_asset_exist(p)]
    if missing:
        raise RuntimeError(f"build_audio --check: missing {missing}")
    stamp = json.loads(STAMP.read_text(encoding="utf-8")).get("spec") if STAMP.exists() else None
    have = ASSETS.get_metadata_tag(ASSETS.load_asset(COMPONENT), SPEC_TAG)
    if have != want or stamp != want:
        raise RuntimeError(f"build_audio --check: {COMPONENT} was built from other inputs ({have} != {want}); rebuild")
    classes = {n: ASSETS.load_asset(f"{DIR}/{n}") for n in CLASSES}
    for name, (parent, _) in CLASSES.items():
        got = classes[name].get_editor_property("parent_class")
        if (got.get_name() if got else None) != parent:
            raise RuntimeError(f"build_audio --check: {name} has the parent {got}, expected {parent}")
    for path in [f"{DIR}/MS_LundenStep_{p}" for p in step_names(P)] + [weather_audio.SOUND]:
        ms = ASSETS.load_asset(path)
        if ms.get_editor_property("sound_class_object") != classes["SC_LundenEffects"]:
            raise RuntimeError(f"build_audio --check: {path} is not in SC_LundenEffects")


def main(argv):
    flags = {a for a in argv if a.startswith("--")}
    P = json.loads(PARAMS_FILE.read_text(encoding="utf-8"))
    if P.get("kind") != "lunden-audio-params" or P.get("formatVersion") != 1:
        raise RuntimeError(f"{PARAMS_FILE}: not a version 1 audio-params.json (run export-audio.mjs)")
    measurements = json.loads(MEASUREMENTS.read_text(encoding="utf-8"))
    trees = tree_feet(measurements)
    sashes = window_audio.sash_centres(measurements)
    if not trees:
        raise RuntimeError("measurements.json vegetation.trees is empty: re-export (#2281)")
    want = spec_hash(P, trees, sashes)
    if "--check" in flags:
        check(P, want)
        u.log(f"LUNDEN_AUDIO_CHECK_OK {len(asset_paths(P))} assets, spec {want[:12]}")
        u.log("LUNDEN_AUDIO_OK")
        return
    stamp = json.loads(STAMP.read_text(encoding="utf-8")).get("spec") if STAMP.exists() else None
    present = all(ASSETS.does_asset_exist(p) for p in asset_paths(P))
    if "--force" not in flags and stamp == want and present:
        u.log("LUNDEN_AUDIO unchanged, nothing saved")
        u.log("LUNDEN_AUDIO_OK")
        return
    u.log(f"LUNDEN_AUDIO rebuilding (stamp {'matches' if stamp == want else 'differs'}, assets {'present' if present else 'missing'})")
    if not ASSETS.does_asset_exist(STEP_SURFACE) or not ASSETS.does_asset_exist(SKY):
        raise RuntimeError("build_audio needs #2300's BPC_LundenStepSurface and #2283's BP_LundenSky")
    classes = build_classes()
    reverbs = build_reverbs(P)
    sounds, wind, bed = build_metasounds(P, classes)
    if "--metasounds-only" in flags:
        u.log("LUNDEN_AUDIO_OK metasounds only")
        return
    bp = build_component(P, trees, sounds, wind, bed, reverbs, sashes)
    ASSETS.set_metadata_tag(bp, SPEC_TAG, want)
    save(bp)
    STAMP.write_text(json.dumps({"spec": want, "about": "build_audio.py input hash (#2287)"}, indent=1) + "\n", encoding="utf-8")
    u.log(f"LUNDEN_AUDIO built {len(asset_paths(P))} assets: {len(sounds)} step MetaSounds ({', '.join(sounds)}), "
          f"wind, ambience, thunder, {len(classes)} sound classes, {len(reverbs)} reverbs, BPC_LundenAudio with {len(trees)} trees")
    u.log("LUNDEN_AUDIO_OK")


main(sys.argv[1:])
