"""#2320. Wind through each opening sash, alongside the player's weather-driven outdoor bed."""

DOOR = "/Game/Lunden/Blueprints/PilotDoors/BP_LundenSwingDoor"
SOUND = "/Game/Lunden/Audio/MS_LundenWindowWind"
ATTENUATION = "/Game/Lunden/Audio/ATT_LundenWindowWind"
FUNCTIONS = ("PushWindowVoice", "SyncWindowVoice", "UpdateWindows")


def sash_centres(measurements):
    # addWindowFrame places sfx.wind(at) halfway from the top pivot to the closed sash's bottom.
    # Both points already exist in the #2285 export. Fixed panes have no sash or interaction ID.
    return [(s["id"], [(a + b) / 2 for a, b in zip(s["pivot"]["unreal"], s["checkClosed"]["unreal"])])
            for w in measurements["windows"] for s in w.get("sashes", [])]


def build_assets(P, effects, MetaSound, load_or_create, save):
    import unreal as u

    W = P["wind"]["sound"]["window"]
    ms = MetaSound("MS_LundenWindowWind", False)
    gain = ms.ease(ms.input("Gain", W["gain"][0]), 0.8)
    hz = ms.ease(ms.input("LpHz", W["hz"][0]), 0.8)
    # Actual LFO in src/audio.js sfx.wind: sine, 0.13 Hz, +/-260 Hz and +/-0.07 gain.
    wave = ms.out(ms.node("LFO", "Audio", Frequency=0.13, Shape=0, Sync=ms.on_play,
                          **{"Min Value": -1.0, "Max Value": 1.0}), "Out")
    hz = ms.f("Add", hz, ms.f("Multiply", wave, 260.0))
    gain = ms.f("Add", gain, ms.f("Multiply", wave, 0.07))
    noise = ms.biquad(ms.noise(), 0, hz, ms.q_to_bandwidth(10 ** (0.8 / 20)))
    attack = ms.node("AD Envelope", "Float", "AD Envelope", Trigger=ms.on_play,
                     **{"Attack Time": 0.0, "Decay Time": 1.2, "Decay Curve": 1.0})
    envelope = ms.f("Subtract", 1.0, ms.out(attack, "Out Envelope"))
    ms.finish(ms.gain(noise, ms.f("Multiply", gain, envelope)))
    ms.save(SOUND, effects)
    # UE's INVERSE is clamp(0.02 * falloff / (distance - radius), 0, 1). In centimetres these
    # settings give Web Audio's 120/(120+1.2*(distance-120)), including full level inside 1.2 m.
    # Unreal can cull the source outside its 50.2 m sphere.
    att = load_or_create(ATTENUATION, u.SoundAttenuation, u.SoundAttenuationFactory())
    settings = att.get_editor_property("attenuation")
    settings.set_editor_property("distance_algorithm", u.AttenuationDistanceModel.INVERSE)
    settings.set_editor_property("attenuation_shape_extents", u.Vector(20, 0, 0))
    settings.set_editor_property("falloff_distance", 5000.0)
    settings.set_editor_property("enable_occlusion", False)
    att.set_editor_property("attenuation", settings)
    save(att)


def variables(bp, pp, sound_type):
    import unreal as u

    ref = u.BlueprintEditorLibrary.get_object_reference_type
    fields = {
        "WindowSound": sound_type, "WindowAttenuation": ref(u.SoundAttenuation.static_class()),
        "WindowIds": pp.array(pp.STRING), "WindowCentres": pp.array(pp.VEC),
        "WindowVoices": pp.array(ref(u.AudioComponent.static_class())), "OpenWindowIndices": pp.array(pp.INT),
        "WindowGain": pp.REAL, "WindowLpHz": pp.REAL,
    }
    pp.variables(bp, fields)
    for name in fields:
        u.BlueprintEditorLibrary.set_blueprint_variable_instance_editable(bp, name, True)


def graphs(bp, pp, me, P):
    import unreal as u

    sound = P["wind"]["sound"]["window"]
    g, p = pp.function(bp, "PushWindowVoice", [("Index", pp.INT)])
    voice = g.item(g.get("WindowVoices"), p["Index"])
    g.branch(g.pure("KismetSystemLibrary:IsValid", Object=voice))
    for var, param in (("WindowGain", "Gain"), ("WindowLpHz", "LpHz")):
        g.run("AudioComponent:SetFloatParameter", target=voice, InName=param, InFloat=g.get(var))

    # One entry per real opening sash. Null slots remain retryable (no audio device, beyond audible range).
    g, p = pp.function(bp, "SyncWindowVoice", [("Index", pp.INT)])
    index, voices = p["Index"], g.get("WindowVoices")
    voice = g.item(voices, index)
    closed = g.branch(g.pure("KismetArrayLibrary:Array_Contains", TargetArray=g.get("OpenWindowIndices"), ItemToFind=index))
    start = g.branch(g.pure("KismetSystemLibrary:IsValid", Object=voice))
    g.run(me + ":PushWindowVoice", Index=index)
    new = g.fork(start, 400)
    spawned = new.pure("GameplayStatics:SpawnSoundAtLocation", Sound=new.get("WindowSound"),
                       AttenuationSettings=new.get("WindowAttenuation"), Location=new.item(new.get("WindowCentres"), index),
                       VolumeMultiplier=0.6 * P["masterGain"], bAutoDestroy=True)
    new.run("KismetArrayLibrary:Array_Set", TargetArray=voices, Index=index, Item=spawned)
    new.run(me + ":PushWindowVoice", Index=index)
    stop = g.fork(closed, 800)
    stop.branch(stop.pure("KismetSystemLibrary:IsValid", Object=voice))
    stop.run("AudioComponent:FadeOut", target=voice, FadeOutDuration=0.4, FadeVolumeLevel=0.0)
    stop.run("KismetArrayLibrary:Array_Set", TargetArray=voices, Index=index)  # clear only this slot

    # Read the existing interactables' TargetOpen (including a loaded save and legacy interaction levels).
    # A streamed-out actor disappears from this snapshot and its own sound fades on the same update.
    g, _ = pp.function(bp, "UpdateWindows")
    power = g.pure(me + ":WindStrength", result="Strength", Speed=g.get("WindSpeed"), Gust=g.get("GustNow"))
    for var, (low, high) in (("WindowGain", sound["gain"]), ("WindowLpHz", sound["hz"])):
        g.set(var, g.op("Lerp", A=low, B=high, Alpha=power))
    count = g.pure("KismetArrayLibrary:Array_Length", TargetArray=g.get("WindowIds"))
    g.run("KismetArrayLibrary:Array_Resize", TargetArray=g.get("WindowVoices"), Size=count)
    opened = g.get("OpenWindowIndices")
    g.run("KismetArrayLibrary:Array_Clear", TargetArray=opened)
    cls = pp.class_path(DOOR)
    found = g.node_of("GameplayStatics:GetAllActorsOfClass", ActorClass=cls)
    actor, _, done = g.loop(pp.out(found, "OutActors"))
    actor = g.cast(actor, ["CastToActor"], u.Actor.static_class(), u.load_class(None, cls))
    g.branch(g.get("TargetOpen", cls, target=actor))
    index = g.pure("KismetArrayLibrary:Array_Find", TargetArray=g.get("WindowIds"), ItemToFind=g.get("Id", cls, target=actor))
    g.branch(g.op("GreaterEqual_IntInt", A=index, B=0))
    g.run("KismetArrayLibrary:Array_AddUnique", TargetArray=opened, NewItem=index)
    after = g.fork(done, 850)
    _, index, _ = after.loop(after.get("WindowIds"))
    after.run(me + ":SyncWindowVoice", Index=index)


def end_play(ev, bp, pp):
    pp.event(ev, bp, "AddEvent|EventEndPlay", "ReceiveEndPlay", 1650)
    voice, _, _ = ev.loop(ev.get("WindowVoices"))
    ev.branch(ev.pure("KismetSystemLibrary:IsValid", Object=voice))
    ev.run("AudioComponent:Stop", target=voice)


def defaults(cdo, rows, load):
    import unreal as u

    cdo.set_editor_property("WindowIds", [name for name, _ in rows])
    cdo.set_editor_property("WindowCentres", [u.Vector(*xyz) for _, xyz in rows])
    cdo.set_editor_property("WindowSound", load(SOUND))
    cdo.set_editor_property("WindowAttenuation", load(ATTENUATION))
