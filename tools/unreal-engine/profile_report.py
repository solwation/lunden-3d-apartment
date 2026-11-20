"""Summarize one full lap of the packaged L1007 profiling camera from an Unreal CSV."""
import csv
import json
import math
import statistics
import sys
from pathlib import Path

# UE can put several thousand initialization events in the first frame.
csv.field_size_limit(16 * 1024 * 1024)
ROUTE_MS = 15000
TIMINGS = ("FrameTime", "GameThreadTime", "RenderThreadTime", "GPUTime")


def read_capture(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.reader(stream)
        header = next(reader)
        indices = [header.index(name) for name in (*TIMINGS, "GPU/LumenScreenProbeGather", "GPU/LumenReflections")]
        frames = []
        for row in reader:
            if row and row[0].startswith("["):
                metadata = dict(zip(row[::2], row[1::2]))
                return frames, metadata
            if row and row[0] != header[0]:
                frames.append(tuple(float(row[i]) for i in indices))
    raise ValueError("Missing CSV metadata footer")


def summarize(path):
    frames, metadata = read_capture(path)
    # Startup includes the game's first load and PSO compilation. Start the warm-up
    # only after the game, render thread and GPU have all produced valid timings.
    first = next(i for i, frame in enumerate(frames) if min(frame[:4]) > 0)
    warmup = 0.0
    measured = 0.0
    sample = []
    for frame in frames[first:]:
        if warmup < ROUTE_MS:
            warmup += frame[0]
            continue
        sample.append(frame)
        measured += frame[0]
        if measured >= ROUTE_MS:
            break
    if measured < ROUTE_MS or len(sample) < 100:
        raise ValueError("Capture must contain a full warm-up lap and a full measured lap")
    if not all(all(math.isfinite(t) and t > 0 for t in frame[:4]) for frame in sample):
        raise ValueError("Missing or nonpositive frame timing")
    if not all(any(frame[i] > 0 for frame in sample) for i in (4, 5)):
        raise ValueError("Capture is missing active Lumen GI or reflections")
    timings = [frame[0] for frame in sample]
    slowest = sorted(timings, reverse=True)[:math.ceil(len(sample) * 0.01)]
    return {
        "engine": metadata["[engineversion]"], "configuration": metadata["[config]"],
        "gpu": metadata["[gpu]"], "cpu": metadata["[cpu]"], "rhi": metadata["[rhiname]"],
        "width": int(metadata["[systemresolution.resx]"]), "height": int(metadata["[systemresolution.resy]"]),
        "frames": len(sample), "seconds": round(sum(timings) / 1000, 3),
        "meanFps": round(1000 / statistics.mean(timings), 2),
        "onePercentLowFps": round(1000 / statistics.mean(slowest), 2),
        "p99FrameMs": round(sorted(timings)[math.ceil(len(timings) * 0.99)-1], 3),
        **{key: round(statistics.mean(frame[i] for frame in sample), 3)
           for i, key in enumerate(("meanFrameMs", "meanGameThreadMs", "meanRenderThreadMs", "meanGpuMs"))},
    }


if __name__ == "__main__":
    print(json.dumps(summarize(Path(sys.argv[1])), indent=2))
