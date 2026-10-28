"""Voice and effects for the reel. Writes only into the working folder given as --out.

  python3 -I audio.py voice --out WORK     # 14 HeyGen speech calls (about 0.10 USD), vo.wav + timing_vo.json
  python3 -I audio.py mix --out WORK       # effects from timing_vo.json, mix.wav at about -14 LUFS
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
SPEED = {"bulle": 1.08, "baer": 1.0}
GAP = 0.14
SR = 48000
TAIL = 2.2


def run(*cmd):
    subprocess.run(cmd, check=True)


def voice(out):
    lines = json.loads((HERE / "lines.json").read_text(encoding="utf-8"))
    words, segments, parts, t = [], [], [], 0.0
    run("ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"anullsrc=r={SR}:cl=mono", "-t", str(GAP), str(out / "gap.wav"))
    for i, line in enumerate(lines):
        body = json.dumps({"voice_id": VOICES[line["who"]], "text": line["text"], "language": "de", "speed": SPEED[line["who"]]})
        reply = out / f"tts_{i:02d}.json"
        run("curl", "-sS", "-X", "POST", "https://api.heygen.com/v3/voices/speech", "-H", "Content-Type: application/json",
            "-H", f"Idempotency-Key: kanal2-{HERE.name}-{i}-{int(time.time())}", "-d", body, "-o", str(reply))
        data = json.loads(reply.read_text())["data"]
        run("curl", "-sS", "-o", str(out / f"raw_{i:02d}.wav"), data["audio_url"])
        spoken = [w for w in data["word_timestamps"] if not w["word"].startswith("<")]
        a, b = max(0, spoken[0]["start"] - 0.04), min(data["duration"], spoken[-1]["end"] + 0.10)
        cut = out / f"cut_{i:02d}.wav"
        run("ffmpeg", "-v", "error", "-y", "-i", str(out / f"raw_{i:02d}.wav"), "-ss", f"{a:.3f}", "-to", f"{b:.3f}", "-ar", str(SR), "-ac", "1", str(cut))
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(cut)]))
        words += [{"w": w["word"], "s": round(t + w["start"] - a, 3), "e": round(t + w["end"] - a, 3), "line": i, "who": line["who"]} for w in spoken]
        segments.append({"line": i, "who": line["who"], "pose": line["pose"], "s": round(t, 3), "e": round(t + dur, 3), "text": line["text"]})
        parts.append(cut.name)
        t += dur + GAP
    (out / "concat.txt").write_text("".join(f"file '{p}'\nfile 'gap.wav'\n" for p in parts))
    run("ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(out / "concat.txt"), "-c", "pcm_s16le", str(out / "vo.wav"))
    (out / "timing_vo.json").write_text(json.dumps({"words": words, "segments": segments, "duration": round(t, 3)}, ensure_ascii=False, indent=1))


def mix(out):
    timing = json.loads((out / "timing_vo.json").read_text(encoding="utf-8"))
    start = [s["s"] for s in timing["segments"]]
    # Same moments as EV and STAMPS in composition.html.
    pops = [start[2], start[2] + .5, start[3] + .3, start[5] + .2, start[9] + 1.2,
            start[2] + 1.8, start[3] + 4.6, start[5] + 5.4, start[9] + 5.8, start[11] + .3, start[11] + 4.4]
    hits = [start[0] + .15, start[7] + 4.6, start[8], start[13] + 1.6]
    track = np.zeros(int(SR * (timing["duration"] + TAIL)))

    def add(at, sig):
        i = int(at * SR)
        n = min(len(sig), len(track) - i)
        track[i:i + n] += sig[:n]

    tp = np.arange(int(SR * .09)) / SR
    pop = np.sin(2 * np.pi * (900 - 4000 * tp) * tp) * np.exp(-tp * 45) * 0.22
    th = np.arange(int(SR * .35)) / SR
    noise = np.random.default_rng(1).standard_normal(len(th))
    hit = np.sin(2 * np.pi * 70 * th) * np.exp(-th * 9) * 0.6 + noise * np.exp(-th * 30) * 0.18
    for at in pops:
        add(at, pop)
    for at in hits:
        add(at, hit)
    with wave.open(str(out / "sfx.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(track, -1, 1) * 32767).astype(np.int16).tobytes())
    run("ffmpeg", "-v", "error", "-y", "-i", str(out / "vo.wav"), "-i", str(out / "sfx.wav"), "-filter_complex",
        f"[0]apad=pad_dur={TAIL}[v];[1]volume=0.6[s];[v][s]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample={SR}[a]",
        "-map", "[a]", "-ac", "2", str(out / "mix.wav"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("step", choices=("voice", "mix"))
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    target = Path(args.out)
    target.mkdir(parents=True, exist_ok=True)
    (voice if args.step == "voice" else mix)(target)
