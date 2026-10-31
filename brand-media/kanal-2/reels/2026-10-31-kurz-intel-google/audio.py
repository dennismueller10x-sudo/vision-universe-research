"""Voice and effects for the reel. Writes only into the working folder given as --out.

  python3 -I audio.py voice --out WORK     # 4 HeyGen speech calls (about 0.05 USD), vo.wav + timing_vo.json with mouth envelope
  python3 -I audio.py mix --out WORK       # effects from events.json, mix.wav at about -14 LUFS
"""
import argparse
import json
import subprocess
import time
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
VOICES = {"bulle": "be8d7bf8ce774bda8b6dd04541fb8623",  # Florian - Dynamic & Punchy
          "baer": "118949676b0a46629d1ad52981c3ef84"}   # Deep Dieter
SPEED = {"bulle": 1.12, "baer": 1.1}
SR = 48000
TAIL = 0.6


def run(*cmd):
    subprocess.run(cmd, check=True)


def voice(out):
    lines = json.loads((HERE / "lines.json").read_text(encoding="utf-8"))
    words, segments, chunks, t = [], [], [], 0.0
    for i, line in enumerate(lines):
        body = json.dumps({"voice_id": VOICES[line["who"]], "text": line["text"], "language": "de", "speed": SPEED[line["who"]]})
        reply = out / f"tts_{i:02d}.json"
        run("curl", "-sS", "-X", "POST", "https://api.heygen.com/v3/voices/speech", "-H", "Content-Type: application/json",
            "-H", f"Idempotency-Key: kanal2-{HERE.name}-{i}-{int(time.time())}", "-d", body, "-o", str(reply))
        data = json.loads(reply.read_text())["data"]
        run("curl", "-sS", "-o", str(out / f"raw_{i:02d}.wav"), data["audio_url"])
        run("ffmpeg", "-v", "error", "-y", "-i", str(out / f"raw_{i:02d}.wav"), "-ar", str(SR), "-ac", "1", "-f", "s16le", str(out / f"raw_{i:02d}.pcm"))
        x = np.fromfile(out / f"raw_{i:02d}.pcm", dtype=np.int16).astype(np.float32) / 32768
        spoken = [w for w in data["word_timestamps"] if not w["word"].startswith("<")]
        a, b = max(0, spoken[0]["start"] - 0.03), min(len(x) / SR, spoken[-1]["end"] + 0.22)
        seg = x[int(a * SR):int(b * SR)].copy()
        fade = int(0.02 * SR)
        seg[:fade] *= np.linspace(0, 1, fade)
        seg[-fade:] *= np.linspace(1, 0, fade)
        if i:
            gap = (0.16 if lines[i - 1]["who"] != line["who"] else 0.1) + (0.0 if lines[i - 1]["scene"] != line["scene"] else 0)
            chunks.append(np.zeros(int(gap * SR), np.float32))
            t += gap
        words += [{"w": w["word"], "s": round(t + w["start"] - a, 3), "e": round(t + w["end"] - a, 3), "line": i, "who": line["who"]} for w in spoken]
        segments.append({**line, "line": i, "s": round(t, 3), "e": round(t + len(seg) / SR, 3)})
        chunks.append(seg)
        t += len(seg) / SR
    y = np.concatenate(chunks)
    with wave.open(str(out / "vo.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    hop = SR // 30  # mouth envelope per video frame
    amp = [float(np.sqrt(np.mean(y[k:k + hop] ** 2))) for k in range(0, len(y), hop)]
    top = np.percentile([v for v in amp if v > 0.003], 95)
    timing = {"words": words, "segments": segments, "duration": round(t, 3), "amp": [round(min(1, v / top), 3) for v in amp]}
    (out / "timing_vo.json").write_text(json.dumps(timing, ensure_ascii=False))


def mix(out):
    """Effects from events.json (exported by `node render.mjs events=events.json`), mixed under the voice."""
    timing = json.loads((out / "timing_vo.json").read_text(encoding="utf-8"))
    events = json.loads((HERE / "events.json").read_text(encoding="utf-8"))
    track = np.zeros(int(SR * (timing["duration"] + TAIL)))

    def add(at, sig):
        i = max(0, int(at * SR))
        n = min(len(sig), len(track) - i)
        if n > 0:
            track[i:i + n] += sig[:n]

    rng = np.random.default_rng(3)
    t = lambda d: np.arange(int(SR * d)) / SR
    tw = t(.28)
    whoosh = rng.standard_normal(len(tw)) * np.sin(np.pi * tw / .28) ** 2 * 0.16
    tp = t(.09)
    pop = np.sin(2 * np.pi * (700 + 5000 * tp) * tp) * np.exp(-tp * 40) * 0.22
    tk = t(.18)
    punch = np.sin(2 * np.pi * 95 * tk) * np.exp(-tk * 22) * 0.35
    th = t(.6)
    hit = np.sin(2 * np.pi * 55 * th) * np.exp(-th * 6) * 0.6 + rng.standard_normal(len(th)) * np.exp(-th * 18) * 0.22
    ts = t(.35)
    stamp = (np.sin(2 * np.pi * 140 * ts) * np.exp(-ts * 14) * 0.5 + rng.standard_normal(len(ts)) * np.exp(-ts * 40) * 0.3)
    tr = t(1.2)
    riser = np.sin(2 * np.pi * (300 * tr + 700 * tr ** 2)) * (tr / 1.2) ** 2 * 0.10
    sounds = {"pop": pop, "whoosh": whoosh, "punch": punch, "hit": hit, "stamp": stamp, "riser": riser}
    for e in events:
        add(e["t"], sounds[e["type"]])
    with wave.open(str(out / "sfx.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(track, -1, 1) * 32767).astype(np.int16).tobytes())
    run("ffmpeg", "-v", "error", "-y", "-i", str(out / "vo.wav"), "-i", str(out / "sfx.wav"), "-filter_complex",
        f"[0]apad=pad_dur={TAIL}[v];[1]volume=0.75[s];[v][s]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample={SR}[a]",
        "-map", "[a]", "-ac", "2", str(out / "mix.wav"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("step", choices=("voice", "mix"))
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    target = Path(args.out)
    target.mkdir(parents=True, exist_ok=True)
    (voice if args.step == "voice" else mix)(target)
