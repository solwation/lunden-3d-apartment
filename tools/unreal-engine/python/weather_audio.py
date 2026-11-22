"""#2402: thunder and hail, the web's weather sounds, for build_audio.py.

MS_LundenThunder is src/audio.js sfx.thunder as one one-shot MetaSound: after `Delay` s a highpass crack when `Near` > the
web's threshold, a long low-passed rumble and three later rolls, each a white noise burst with the web noise()'s linear
attack and exponential fall to its floor. The numbers are audio-params.json `thunder`, which export-audio.mjs measures
from the web's own sfx.thunder. `Inside` (0/1) muffles it as the web's `inside` does.

BPC_LundenAudio gets the web's strike clock (src/weather.js update/strike): while `Storm` and more than
`thunder.strike.minRain` of rain fall, `NextStrike` counts down; a strike draws the distance, the nearness and the delay
(distance / speed of sound) and plays MS_LundenThunder, and the next strike is drawn from WEATHER.flash.every.
Hail is the rain loop louder and brighter (build_audio.py UpdateBeds, audio-params.json `hail`).

`Storm` and `Hail` are component variables: BP_LundenSky (#2283) has no storm or hail yet, so ReadSky cannot read them
and a test or a later sky sets them.
"""

SOUND = "/Game/Lunden/Audio/MS_LundenThunder"
FUNCTIONS = ("Strike", "UpdateThunder")


def thunder(P, MetaSound, LOWPASS, HIGHPASS, bandwidth, lowpass_q):
    """sfx.thunder: everything starts `Delay` s after the play (the light's head start); `t` is the time since then,
    from a linear ramp that rises over the whole sound and is 0 before and after it, so every envelope is silent then."""
    import unreal as u

    T = P["thunder"]
    C, R, L = T["crack"], T["rumble"], T["rolls"]
    longest = max(sum(R["duration"]), L["start"][0] + L["start"][1] * sum(R["duration"]) + sum(L["duration"]))
    length = longest + T["tail"]
    ms = MetaSound("MS_LundenThunder", True)
    near = ms.input("Near", 1.0)
    inside = ms.input("Inside", 0.0)
    literal, _ = u.get_engine_subsystem(u.MetaSoundBuilderSubsystem).create_float_meta_sound_literal(0.0)
    delay, res = ms.b.add_graph_input_node("Delay", "Time", literal, False)
    if res != u.MetaSoundBuilderResult.SUCCEEDED:
        raise RuntimeError("MS_LundenThunder: could not add the Time input Delay")
    start = ms.out(ms.node("Trigger Delay", In=ms.on_play, **{"Delay Time": delay}), "Out")
    ramp = ms.node("AD Envelope", "Float", "AD Envelope", Trigger=start, **{
        "Attack Time": length, "Decay Time": 0.001, "Attack Curve": 1.0, "Decay Curve": 1.0})
    t = ms.f("Multiply", ms.out(ramp, "Out Envelope"), length)

    def envelope(offset, dur, attack, peak):
        """noise(): 0 -> peak linearly over `attack`, then exponentially to T.floor at `dur` (from `offset`)."""
        tl = ms.f("Subtract", t, offset)
        rise = ms.clamp(ms.f("Divide", tl, attack), 0.0, 1.0)
        k = ms.clamp(ms.f("Divide", ms.f("Subtract", tl, attack), ms.f("Subtract", dur, attack)), 0.0, 1.0)
        fall = ms.f("Power", ms.f("Divide", T["floor"], peak), k)
        return ms.f("Multiply", peak, ms.min(rise, fall))

    def rand(lo, hi):
        return ms.out(ms.node("RandomFloat", Next=ms.on_play, Seed=-1, Min=lo, Max=hi), "Value")

    far = ms.f("Subtract", 1.0, near)
    # the crack: only when near; its peak is gainPerNear x near, switched off at or under the threshold
    on = ms.clamp(ms.f("Multiply", ms.f("Subtract", near, C["above"]), 1e6), 0.0, 1.0)
    peak = ms.f("Multiply", C["gainPerNear"], ms.clamp(near, 1e-6, 1.0))
    crack = ms.biquad(ms.noise(), HIGHPASS, C["hz"], bandwidth(lowpass_q(C["q"]), C["hz"]))
    parts = [ms.gain(crack, ms.f("Multiply", on, envelope(0.0, C["duration"], C["attack"], peak)))]
    # the rumble: longer and duller the farther; indoors a fixed low cut-off
    dur = ms.f("Add", ms.f("Add", R["duration"][0], ms.f("Multiply", R["duration"][1], far)),
               rand(0.0, R["duration"][2]))
    hz = ms.f("Add", ms.f("Multiply", inside, R["insideHz"]),
              ms.f("Multiply", ms.f("Subtract", 1.0, inside), ms.f("Add", R["hz"][0], ms.f("Multiply", R["hz"][1], near))))
    body = ms.biquad(ms.noise(), LOWPASS, hz, ms.q_to_bandwidth(lowpass_q(R["q"])))
    gain = ms.f("Add", R["gain"][0], ms.f("Multiply", R["gain"][1], near))
    attack = ms.f("Add", R["attack"][0], ms.f("Multiply", R["attack"][1], far))
    parts.append(ms.gain(body, envelope(0.0, dur, attack, gain)))
    # the rolls: each starts somewhere in the first part of the rumble and lasts its own while
    for _ in range(L["count"]):
        offset = ms.f("Add", L["start"][0], ms.f("Multiply", ms.f("Multiply", rand(0.0, 1.0), dur), L["start"][1]))
        length_k = rand(L["duration"][0], L["duration"][0] + L["duration"][1])
        roll = ms.biquad(ms.noise(), LOWPASS, L["hz"], bandwidth(lowpass_q(L["q"]), L["hz"]))
        parts.append(ms.gain(roll, envelope(offset, length_k, L["attack"], L["gain"])))
    level = ms.f("Subtract", 1.0, ms.f("Multiply", inside, 1.0 - T["inside"]))
    if ms.b.connect_nodes(ms.gain(ms.mix(*parts), level), ms.outs[0]) != u.MetaSoundBuilderResult.SUCCEEDED:
        raise RuntimeError("MS_LundenThunder: could not connect the output")
    done = ms.node("Trigger Delay", In=start, **{"Delay Time": length})
    if ms.b.connect_nodes(ms.out(done, "Out"), ms.on_finished) != u.MetaSoundBuilderResult.SUCCEEDED:
        raise RuntimeError("MS_LundenThunder: could not connect On Finished")
    return ms


def variables(bp, pp, sound_type):
    import unreal as u

    fields = {
        # the weather the sky does not give yet (#2402): a test or a later BP_LundenSky sets them
        "Storm": pp.BOOL, "Hail": pp.BOOL,
        # the strike clock (weather.js) and the last thunder, for tests
        "ThunderSound": sound_type, "ThunderVolume": pp.REAL, "StormRain": pp.REAL, "SoundSpeed": pp.REAL,
        "StrikeEveryMin": pp.REAL, "StrikeEveryMax": pp.REAL, "StrikeDistMin": pp.REAL, "StrikeDistMax": pp.REAL,
        "NextStrike": pp.REAL, "StrikeDist": pp.REAL, "ThunderCount": pp.INT, "ThunderNear": pp.REAL,
        "ThunderDelay": pp.REAL, "ThunderInside": pp.BOOL,
        "LastThunder": u.BlueprintEditorLibrary.get_object_reference_type(u.AudioComponent.static_class()),
    }
    pp.variables(bp, fields)
    for name in fields:
        u.BlueprintEditorLibrary.set_blueprint_variable_instance_editable(bp, name, True)


def graphs(bp, pp, me):
    # Strike(): weather.js strike: the distance, the nearness, the delay after the light, the next strike's draw
    g, _ = pp.function(bp, "Strike")
    lo, hi = g.get("StrikeDistMin"), g.get("StrikeDistMax")
    g.set("StrikeDist", g.op("RandomFloatInRange", Min=lo, Max=hi))  # stored: a pure random draws again per reader
    dist = g.get("StrikeDist")
    g.set("ThunderNear", g.op("Subtract_DoubleDouble", A=1.0, B=g.op("Divide_DoubleDouble",
          A=g.op("Subtract_DoubleDouble", A=dist, B=lo), B=g.op("Subtract_DoubleDouble", A=hi, B=lo))))
    g.set("ThunderDelay", g.op("Divide_DoubleDouble", A=dist, B=g.get("SoundSpeed")))
    g.set("ThunderInside", g.get("Indoors"))
    g.set("NextStrike", g.op("RandomFloatInRange", Min=g.get("StrikeEveryMin"), Max=g.get("StrikeEveryMax")))
    g.set("ThunderCount", g.op("Add_IntInt", A=g.get("ThunderCount"), B=1))
    # created, given its parameters, then played (no sound under -nosound or without an audio device)
    g.set("LastThunder", g.pure("GameplayStatics:CreateSound2D", Sound=g.get("ThunderSound"),
                                VolumeMultiplier=g.get("ThunderVolume"), bAutoDestroy=True))
    voice = g.get("LastThunder")
    g.branch(g.pure("KismetSystemLibrary:IsValid", Object=voice))
    for param, value in (("Near", g.get("ThunderNear")), ("Delay", g.get("ThunderDelay")),
                         ("Inside", g.op("SelectFloat", A=1.0, B=0.0, bPickA=g.get("ThunderInside")))):
        g.run("AudioComponent:SetFloatParameter", target=g.get("LastThunder"), InName=param, InFloat=value)
    g.run("AudioComponent:Play", target=g.get("LastThunder"), StartTime=0.0)

    # UpdateThunder(Dt): weather.js update: `if (storm && rain > minRain) { next -= dt; if (next <= 0) strike() }`
    g, p = pp.function(bp, "UpdateThunder", [("Dt", pp.REAL)])
    g.branch(g.op("BooleanAND", A=g.get("Storm"), B=g.op("Greater_DoubleDouble", A=g.get("Rain"), B=g.get("StormRain"))))
    g.set("NextStrike", g.op("Subtract_DoubleDouble", A=g.get("NextStrike"), B=p["Dt"]))
    g.branch(g.op("LessEqual_DoubleDouble", A=g.get("NextStrike"), B=0.0))
    g.run(me + ":Strike")


def begin_play(ev):
    """weather.js constructor: the first strike comes WEATHER.flash.every after the storm starts counting."""
    ev.set("NextStrike", ev.op("RandomFloatInRange", Min=ev.get("StrikeEveryMin"), Max=ev.get("StrikeEveryMax")))


def tick(ev, me, dt):
    ev.run(me + ":UpdateThunder", Dt=dt)


def defaults(cdo, P, load):
    T = P["thunder"]["strike"]
    cdo.set_editor_property("ThunderSound", load(SOUND))
    cdo.set_editor_property("ThunderVolume", float(P["masterGain"]))  # out(null, ...) -> the web's master
    cdo.set_editor_property("StormRain", float(T["minRain"]))
    cdo.set_editor_property("SoundSpeed", 100.0 * T["soundSpeed"])  # cm/s: StrikeDist is in cm as every Unreal length
    cdo.set_editor_property("StrikeEveryMin", float(T["every"][0]))
    cdo.set_editor_property("StrikeEveryMax", float(T["every"][1]))
    cdo.set_editor_property("StrikeDistMin", 100.0 * T["dist"][0])
    cdo.set_editor_property("StrikeDistMax", 100.0 * T["dist"][1])
    cdo.set_editor_property("NextStrike", float(T["every"][1]))
