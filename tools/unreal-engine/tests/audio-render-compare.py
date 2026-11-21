"""#2287: compare the silently rendered Unreal footsteps (tests/test_audio_render.py) with the web's synthesis.

    python3 tools/unreal-engine/tests/audio-render-compare.py <dir with step_*.wav, wind_*.wav, bed_*.wav> [<out dir>]

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
    """src/footsteps.js synthFootstep, variation 1, times FOOTSTEPS.gain (sfx.step's out(null, FOOTSTEPS.gain))."""
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
        out.append(s * F["gain"])
    return out


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
        report["steps"][profile] = {"unreal": mu, "web": mw, "channels": ch,
                                    "levelDiffDb": round(mu["rmsDb"] - mw["rmsDb"], 2),
                                    "centroidRatio": round(mu["centroidHz"] / mw["centroidHz"], 3)}
        print(f"{profile:9s} web {mw}  unreal {mu}")
        sw, su = spectrogram(web, RATE), spectrogram(ue, rate)
        tops = [max(max(c) for c in s) for s in (sw, su)]  # each side against its own peak: shapes, not levels

        def shade(v, top):
            return max(0, min(255, int(255 * (v - top + RANGE_DB) / RANGE_DB)))
        for b in range(len(sw[0]) - 1, -1, -1):
            sheet.append([shade(c[b], tops[0]) for c in sw] + [255, 255] + [shade(c[b], tops[1]) for c in su])
        sheet.append([255] * len(sheet[-1]))
    for name in ("wind_out", "wind_in", "bed_out", "bed_in"):
        f = src / f"{name}.wav"
        if f.exists():
            x, rate, _ = read_wav(f)
            x = x[int(0.2 * rate): int(1.5 * rate)]
            report["beds"][name] = metrics(x, rate)
            print(f"{name:9s} {report['beds'][name]}")
    png(out / "audio-render.png", [[v for v in r for _ in (0, 1)] for r in sheet])  # twice as wide
    (out / "audio-render.json").write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
