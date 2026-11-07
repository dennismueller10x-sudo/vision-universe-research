#!/usr/bin/env python3 -I
"""Sicherheitszonen-Prüfung für Reels (iPhone-Vollbild): zeichnet x=100/980 und die Caption-Zone ein und baut ein Kontaktblatt.
Aufruf: safezone_check.py video.mp4 out.jpg t1 t2 ...  — sichtbar bleibt nur x 100–980; unten ab y≈1560 liegt die Caption."""
import sys,subprocess,tempfile,os
from PIL import Image,ImageDraw
vid,out,ts=sys.argv[1],sys.argv[2],sys.argv[3:]
tiles=[]
with tempfile.TemporaryDirectory() as d:
    for t in ts:
        p=os.path.join(d,f'{t}.png'); subprocess.run(["ffmpeg","-v","error","-y","-ss",t,"-i",vid,"-frames:v","1",p],check=True)
        im=Image.open(p).convert('RGB'); dr=ImageDraw.Draw(im)
        for x in (100,980): dr.line([(x,0),(x,1919)],fill=(255,0,200),width=5)
        dr.line([(0,1560),(1079,1560)],fill=(0,160,255),width=4)
        tiles.append(im.resize((270,480)))
c=Image.new('RGB',(280*len(tiles),480),'white')
for i,im in enumerate(tiles): c.paste(im,(i*280,0))
c.save(out)
