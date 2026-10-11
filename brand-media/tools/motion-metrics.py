#!/usr/bin/env python3
"""Objektive Bewegungsmetrik fuer Avatar-Clips (Frame-Differenz je Bildregion).

Zweck: 'zu starre Koerperbewegung' messbar machen, damit Avatar IV und V vergleichbar sind.
Gemessen wird NUR Pixelbewegung (mittlere absolute Differenz aufeinanderfolgender Graustufen-Frames
bei 12 fps, 270x480). Das ist keine Aussage ueber Natuerlichkeit oder Identitaet.
Regionen sind auf die Masterkomposition (sitzende Halbtotale, Figur links) kalibriert.
Aufruf: python3 motion-metrics.py clip.mp4 [--json out.json]
"""
import json, subprocess, sys, tempfile, pathlib
import numpy as np
from PIL import Image

W, H = 270, 480
# Regionen als Bruchteile (x0,y0,x1,y1) des Bildes
REGIONS = {
    "kopf_gesicht": (0.30, 0.10, 0.62, 0.30),
    "schultern_oberkoerper": (0.08, 0.30, 0.70, 0.50),
    "haende_arme": (0.08, 0.40, 0.75, 0.50),
    "arm_gestik_rechts": (0.50, 0.15, 0.95, 0.40),
    "gesamt_ohne_kopf": (0.00, 0.30, 1.00, 0.75),
    "hintergrund_kontrolle": (0.70, 0.00, 1.00, 0.20),
}

def frames(path):
    d = pathlib.Path(tempfile.mkdtemp())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-vf", f"fps=12,scale={W}:{H},format=gray", str(d / "f_%04d.png")], check=True)
    return [np.asarray(Image.open(p), dtype=np.float32) for p in sorted(d.glob("f_*.png"))]

def measure(path):
    fs = frames(path)
    out = {"frames": len(fs), "fps": 12}
    for name, (x0, y0, x1, y1) in REGIONS.items():
        sl = (slice(int(y0 * H), int(y1 * H)), slice(int(x0 * W), int(x1 * W)))
        diffs = [float(np.mean(np.abs(fs[i + 1][sl] - fs[i][sl]))) for i in range(len(fs) - 1)]
        out[name] = {"mean_abs_diff": round(float(np.mean(diffs)), 3), "p95": round(float(np.percentile(diffs, 95)), 3)}
    base = out["hintergrund_kontrolle"]["mean_abs_diff"] or 1e-6
    for k in ("kopf_gesicht", "schultern_oberkoerper", "haende_arme", "arm_gestik_rechts", "gesamt_ohne_kopf"):
        out[k]["verhaeltnis_zu_hintergrund"] = round(out[k]["mean_abs_diff"] / base, 2)
    return out

if __name__ == "__main__":
    res = measure(sys.argv[1])
    print(json.dumps(res, indent=2, ensure_ascii=False))
    if "--json" in sys.argv:
        pathlib.Path(sys.argv[sys.argv.index("--json") + 1]).write_text(json.dumps(res, indent=2, ensure_ascii=False) + "\n")
