#!/usr/bin/env python3
"""Kontaktbogen fuer die Identitaetspruefung: Masterbild + Frames eines Clips (alle 0,5 s), plus Gesichtsausschnitt.
Aufruf: python3 identity-contact-sheet.py master.png clip.mp4 out.png [--face x0,y0,x1,y1 (Bruchteile im Clip-Frame)]
Rein visuelle Hilfe fuer die manuelle Pruefung; keine automatische Freigabe."""
import subprocess, sys, tempfile, pathlib
from PIL import Image
master, clip, out = sys.argv[1:4]
face = (0.25, 0.08, 0.70, 0.32)
if '--face' in sys.argv: face = tuple(float(v) for v in sys.argv[sys.argv.index('--face') + 1].split(','))
d = pathlib.Path(tempfile.mkdtemp())
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', clip, '-vf', 'fps=2', str(d / 'f_%03d.png')], check=True)
frames = sorted(d.glob('f_*.png'))[:8]
m = Image.open(master).convert('RGB'); m.thumbnail((360, 540))
tiles = []
for f in frames:
    im = Image.open(f).convert('RGB'); w, h = im.size
    crop = im.crop((int(face[0]*w), int(face[1]*h), int(face[2]*w), int(face[3]*h))); crop.thumbnail((360, 270))
    full = im.copy(); full.thumbnail((200, 360)); tiles.append((full, crop))
W = 360 + 20 + max(1, len(tiles)) * 220
sheet = Image.new('RGB', (W, 700), 'black'); sheet.paste(m, (0, 0))
for i, (full, crop) in enumerate(tiles):
    sheet.paste(full, (380 + i*220, 0)); sheet.paste(crop, (380 + i*220, 380)) if crop.width <= 220 else sheet.paste(crop.resize((210, int(210*crop.height/crop.width))), (380 + i*220, 380))
sheet.save(out); print(out)
