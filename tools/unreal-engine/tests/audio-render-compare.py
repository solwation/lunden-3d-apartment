"""#2287: compare the silently rendered Unreal footsteps (tests/test_audio_render.py) with the web's synthesis.

    python3 tools/unreal-engine/tests/audio-render-compare.py <dir with step_*.wav, wind_*.wav, bed_*.wav> [<out dir>]

#2320: with render-params.json from the same render, the rain (rain_out, rain_in: src/audio.js sfx.rain) and the open
window's wind (window: sfx.wind, panned to the front inside its 1.2 m reference distance) are also computed on the web
side with the parameters Unreal used, and their RMS over the same 1.3 s must agree within +-2 dB as well.

The web side is src/footsteps.js synthFootstep computed here sample by sample at 48 kHz with the numbers of
tools/unreal-engine/audio-params.json (export-audio.mjs): the sine body with its exponential glide, white noise through a
Web Audio low-pass biquad (Q in dB, as the spec defines it), the linear attack and exponential release, the crackle
curve and the partial; variation 1 (the web draws 1 +- FOOTSTEPS.variation per step, Unreal does too, so one Unreal
take may sit up to 12 % off in pitch and level). Plain Python, no numpy. For each profile it reports the level (RMS over
the sound, dBFS), the length down to -40 dB under the peak and the spectral centroid, and writes
audio-render.json and a spectrogram sheet audio-render.png (rows = profiles in name order, left = web, right = Unreal; 0-4 kHz upwards, 0.3 s across,
60 dB under each sound's own peak, so it compares shapes; the levels are in the JSON).
"""
import cmath
import json
import math
from pathlib import Path
import random
import struct
import sys
import wave
import zlib

HERE = Path(__file__).resolve().parent
A = json.loads((HERE.parent / "audio-params.json").read_text(encoding="utf-8"))
F = A["footsteps"]
RATE = 48000
RANGE_DB = 60.0  # spectrogram range under each sound's own peak


def read_wav(path):
    with wave.open(str(path), "rb") as w:
        n, ch, width, rate = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    if width != 2:
        raise SystemExit(f"{path}: {width * 8}-bit, expected 16")
    data = struct.unpack("<%dh" % (n * ch), raw)
    return [data[i * ch] / 32768.0 for i in range(n)], rate, ch  # the first channel (the mono source is centred)


def biquad_lowpass(x, hz, q_db, rate):
    """Web Audio BiquadFilterNode 'lowpass' (spec: alpha = sin(w0) / (2 * 10^(Q/20)))."""
    w0 = 2 * math.pi * hz / rate
    alpha = math.sin(w0) / (2 * 10 ** (q_db / 20))
    c = math.cos(w0)
    b0, b1, b2 = (1 - c) / 2, 1 - c, (1 - c) / 2
    a0, a1, a2 = 1 + alpha, -2 * c, 1 - alpha
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    y, x1, x2, y1, y2 = [], 0.0, 0.0, 0.0, 0.0
    for v in x:
        out = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, v, y1, out
        y.append(out)
    return y


def web_step(profile, rng):
    """src/footsteps.js synthFootstep, variation 1, times the local step gain and the unmuted web master."""
    p = F["profiles"][profile]
    dur, att, tail = p["duration"], F["attack"], F["sourceTail"]
    n = int((dur + tail) * RATE)

    def env(peak, t):
        if t < att:
            return peak * t / att
        if t < dur:
            return peak * (F["releaseFloor"] / peak) ** ((t - att) / (dur - att))
        return F["releaseFloor"] * max(0.0, 1 - (t - dur) / tail)

    noise = biquad_lowpass([rng.uniform(-1, 1) for _ in range(n)], p["cutoff"], F["noiseQ"], RATE)
    curve = None
    if p.get("grain"):
        curve = [1 if i % 2 else F["grainFloor"] + rng.random() * (1 - F["grainFloor"]) for i in range(p["grain"] * 2)]
    out, phase, qphase = [], 0.0, 0.0
    for i in range(n):
        t = i / RATE
        hz = p["hz"] * (p["endHz"] / p["hz"]) ** min(1.0, t / dur)
        phase += 2 * math.pi * hz / RATE
        s = math.sin(phase) * env(p["body"], t)
        g = env(p["noise"], t)
        if curve and t < dur:
            k = t / dur * (len(curve) - 1)
            j = min(int(k), len(curve) - 2)
            g *= curve[j] + (curve[j + 1] - curve[j]) * (k - j)
        s += noise[i] * g
        q = p.get("partial")
        if q and t < q["duration"]:
            qhz = q["hz"] + (q["endHz"] - q["hz"]) * t / q["duration"]
            qphase += 2 * math.pi * qhz / RATE
            a = q["gain"] * (t / att if t < att else max(0.0, (q["duration"] - t) / (q["duration"] - att)))
            s += math.sin(qphase) * a
        out.append(s * F["gain"] * A["masterGain"])
    return out


def biquad(x, kind, hz, q, rate):
    """Web Audio BiquadFilterNode lowpass/highpass (Q in dB) or bandpass (Q linear); `hz` a number or one per sample."""
    out, x1, x2, y1, y2 = [], 0.0, 0.0, 0.0, 0.0
    fixed = not isinstance(hz, list)
    for i, v in enumerate(x):
        if fixed and i or (not fixed and i % 128):  # a moving frequency is updated per 128-sample render quantum
            pass
        else:
            w0 = 2 * math.pi * (hz if fixed else hz[i]) / rate
            c, sn = math.cos(w0), math.sin(w0)
            if kind == "bandpass":
                alpha = sn / (2 * q)
                b0, b1, b2 = alpha, 0.0, -alpha
            else:
                alpha = sn / (2 * 10 ** (q / 20))
                b0, b1, b2 = ((1 - c) / 2, 1 - c, (1 - c) / 2) if kind == "lowpass" else ((1 + c) / 2, -(1 + c), (1 + c) / 2)
            a0 = 1 + alpha
            b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, -2 * c / a0, (1 - alpha) / a0
        y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, v, y1, y
        out.append(y)
    return out


def web_noise(rng, n, rate):
    """initAudio's shared buffer: 2 s of Math.random() * 2 - 1, looped."""
    buf = [rng.random() * 2 - 1 for _ in range(2 * rate)]
    return [buf[i % len(buf)] for i in range(n)]


def web_rain(p, rng, seconds):
    """src/audio.js sfx.rain at steady parameters (Unreal's RainGain already includes the web master)."""
    S = A["rain"]["surface"]
    noise = web_noise(rng, int(seconds * RATE), RATE)
    hiss = biquad(biquad(noise, "highpass", 400.0, 1.0, RATE), "lowpass", p["BaseHz"], 1.0, RATE)
    bus = [v * p["Base"] for v in hiss]
    for key in ("roof", "metal", "leaf", "water"):
        g = p[key.capitalize()]
        if g:
            hz, q, _ = S[key]
            bus = [a + g * b for a, b in zip(bus, biquad(noise, "bandpass", hz, q, RATE))]
    return [v * p["RainGain"] for v in biquad(bus, "lowpass", p["RainCutoff"], 1.0, RATE)]


def web_window(p, rng, seconds):
    """src/audio.js sfx.wind from its start: low-pass (Q 0.8 dB) noise, gain ramped in over 1.2 s, the 0.13 Hz LFO
    (+-260 Hz, +-0.07), then out(pos, 0.6): the equal-power panner's 0.707 per channel for a source straight ahead
    within refDistance, and the master. One channel."""
    W = A["wind"]["sound"]["window"]
    n = int(seconds * RATE)
    lfo = [math.sin(2 * math.pi * 0.13 * i / RATE) for i in range(n)]
    low = biquad(web_noise(rng, n, RATE), "lowpass", [p["LpHz"] + 260 * v for v in lfo], 0.8, RATE)
    ramp = [min(1.0, i / (1.2 * RATE)) * p["Gain"] for i in range(n)]
    return [y * (r + W["gust"] * v) * 0.6 * math.cos(math.pi / 4) * A["masterGain"] for y, r, v in zip(low, ramp, lfo)]


def fft(x):
    n = len(x)
    j = 0
    a = [complex(v) for v in x]
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j |= bit
        if i < j:
            a[i], a[j] = a[j], a[i]
    size = 2
    while size <= n:
        w = cmath.exp(-2j * math.pi / size)
        for start in range(0, n, size):
            wk = 1
            for k in range(size // 2):
                u_, v = a[start + k], a[start + k + size // 2] * wk
                a[start + k], a[start + k + size // 2] = u_ + v, u_ - v
                wk *= w
        size *= 2
    return a


def trim(x):
    """From the first sample over -60 dB of the peak to the last one."""
    peak = max(abs(v) for v in x) or 1e-12
    idx = [i for i, v in enumerate(x) if abs(v) > peak * 1e-3]
    return x[idx[0]:idx[-1] + 1] if idx else x


def metrics(x, rate):
    x = trim(x)
    peak = max(abs(v) for v in x) or 1e-12
    env = [abs(v) for v in x]
    last = max((i for i, v in enumerate(env) if v > peak * 0.01), default=0)
    head = x[:last + 1] or x
    rms = math.sqrt(sum(v * v for v in head) / len(head))
    n = 1 << max(10, (len(head) - 1).bit_length())
    spec = fft(head + [0.0] * (n - len(head)))
    mags = [abs(c) for c in spec[1:n // 2]]
    freqs = [(k + 1) * rate / n for k in range(len(mags))]
    total = sum(m * m for m in mags) or 1e-12
    centroid = sum(f * m * m for f, m in zip(freqs, mags)) / total
    lowfrac = sum(m * m for f, m in zip(freqs, mags) if f < 200) / total
    return {"rmsDb": round(20 * math.log10(rms + 1e-12), 2), "peakDb": round(20 * math.log10(peak), 2),
            "lengthMs": round(1000 * len(head) / rate, 1), "centroidHz": round(centroid, 1),
            "below200Hz": round(lowfrac, 3)}


def spectrogram(x, rate, frames=64, bins=96, top=4000.0, win=1024):
    x = trim(x)[: int(0.3 * rate)]
    x = x + [0.0] * (int(0.3 * rate) - len(x))
    hop = max(1, (len(x) - win) // (frames - 1))
    window = [0.5 - 0.5 * math.cos(2 * math.pi * i / (win - 1)) for i in range(win)]
    cols = []
    for f in range(frames):
        seg = x[f * hop: f * hop + win]
        seg = seg + [0.0] * (win - len(seg))
        spec = fft([a * b for a, b in zip(seg, window)])
        cols.append([20 * math.log10(abs(spec[min(win // 2 - 1, int(b * top / bins / (rate / win)))]) + 1e-9)
                     for b in range(bins)])
    return cols


def png(path, rows):
    h, w = len(rows), len(rows[0])
    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    Path(path).write_bytes(data)


def main(argv):
    src = Path(argv[0])
    out = Path(argv[1]) if len(argv) > 1 else src
    rng = random.Random(2287)
    report, sheet = {"steps": {}, "beds": {}}, []
    for profile in sorted(F["profiles"]):
        ue, rate, ch = read_wav(src / f"step_{profile}.wav")
        web = web_step(profile, rng)
        mu, mw = metrics(ue, rate), metrics(web, RATE)
        # #2320: the level is the power mean of every take on each side (one Unreal take varies with its random
        # variation and crackle trough; the web side draws as many crackle curves). Shape metrics are the first take's.
        takes = [ue] + [read_wav(f)[0] for f in sorted(src.glob(f"step_{profile}_[0-9].wav"))]
        webs = [web] + [web_step(profile, rng) for _ in takes[1:]]

        def level(xs, r):
            return 10 * math.log10(sum(10 ** (metrics(x, r)["rmsDb"] / 10) for x in xs) / len(xs))
        lu, lw = level(takes, rate), level(webs, RATE)
        report["steps"][profile] = {"unreal": mu, "web": mw, "channels": ch, "takes": len(takes),
                                    "levelUnrealDb": round(lu, 2), "levelWebDb": round(lw, 2),
                                    "levelDiffDb": round(lu - lw, 2),
                                    "centroidRatio": round(mu["centroidHz"] / mw["centroidHz"], 3)}
        print(f"{profile:9s} web {mw}  unreal {mu}  level over {len(takes)} takes {lu - lw:+.2f} dB")
        sw, su = spectrogram(web, RATE), spectrogram(ue, rate)
        tops = [max(max(c) for c in s) for s in (sw, su)]  # each side against its own peak: shapes, not levels

        def shade(v, top):
            return max(0, min(255, int(255 * (v - top + RANGE_DB) / RANGE_DB)))
        for b in range(len(sw[0]) - 1, -1, -1):
            sheet.append([shade(c[b], tops[0]) for c in sw] + [255, 255] + [shade(c[b], tops[1]) for c in su])
        sheet.append([255] * len(sheet[-1]))
    for name in ("wind_out", "wind_in", "bed_out", "bed_in", "rain_out", "rain_in", "window"):
        f = src / f"{name}.wav"
        if f.exists():
            x, rate, _ = read_wav(f)
            x = x[int(0.2 * rate): int(1.5 * rate)]
            report["beds"][name] = metrics(x, rate)
            print(f"{name:9s} {report['beds'][name]}")
    params = src / "render-params.json"
    if params.exists():
        R = json.loads(params.read_text(encoding="utf-8"))
        cases = [(f"rain_{w}", lambda w=w: web_rain(R["rain"][w], rng, 3.0)[int(1.5 * RATE):]) for w in R["rain"]]
        if R.get("window"):  # recorded from 1.5 s after the voice started
            cases.append(("window", lambda: web_window(R["window"], rng, 3.5)[int(1.5 * RATE):]))
        for name, synth in cases:
            if name not in report["beds"]:
                continue
            web = synth()[int(0.2 * RATE): int(1.5 * RATE)]
            row, mw = report["beds"][name], metrics(web, RATE)
            report["beds"][name] = {"unreal": row, "web": mw, "levelDiffDb": round(row["rmsDb"] - mw["rmsDb"], 2),
                                    "centroidRatio": round(row["centroidHz"] / mw["centroidHz"], 3)}
            print(f"{name:9s} web {mw}  diff {report['beds'][name]['levelDiffDb']:+.2f} dB")
    png(out / "audio-render.png", [[v for v in r for _ in (0, 1)] for r in sheet])  # twice as wide
    (out / "audio-render.json").write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    rows = list(report["steps"].items()) + [(n, r) for n, r in report["beds"].items() if "levelDiffDb" in r]
    failed = [f"{name} {row['levelDiffDb']:+.2f} dB" for name, row in rows if abs(row["levelDiffDb"]) > 2.0]
    if failed:
        raise SystemExit("RMS outside ±2 dB of the web output: " + ", ".join(failed))


if __name__ == "__main__":
    main(sys.argv[1:])
