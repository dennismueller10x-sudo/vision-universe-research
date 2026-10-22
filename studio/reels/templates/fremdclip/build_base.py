#!/usr/bin/env python3 -I
"""Grundfilm für ein Reel mit Fremdclip: Clip-Abschnitte auf die Szenen der Stimme legen,
16:9-Fenster (1080x608 bei y=600) über unscharfer, abgedunkelter Füllung.
Aufruf: build_base.py quelle.mp4 timing.json base.mp4
Abschnitte unten anpassen: (start, ende) in Sekunden der Quelle je Szene s1..s4, danach Standbild bis zum Ende."""
import sys,json,subprocess
SRC,TJ,OUT=sys.argv[1:4]
SEGS=[(30.0,40.6),(40.6,48.4),(48.4,54.4),(50.6,53.4)]   # Unitree H2-X: Einbrecher, Auto anheben, Aufprall, Zeitlupe
FREEZE=54.3
T=json.load(open(TJ)); sc=T['TM']['sc']; tot=T['TOTAL']
f=[];parts=[]
for i,(s,e) in enumerate(SEGS):
    k=(sc[i+1]-sc[i])/(e-s); mi=",minterpolate=fps=50:mi_mode=mci" if k>1.5 else ""
    f.append(f"[0:v]trim={s}:{e},setpts=(PTS-STARTPTS)*{k:.5f}{mi},fps=30,scale=1920:1080,setsar=1[p{i}]"); parts.append(f"[p{i}]")
fz=tot-sc[len(SEGS)]
f.append(f"[0:v]trim={FREEZE}:{FREEZE+0.04},setpts=PTS-STARTPTS,fps=30,scale=1920:1080,setsar=1,tpad=stop_mode=clone:stop_duration={fz+0.2:.2f},trim=duration={fz:.3f}[pz]"); parts.append("[pz]")
f.append("".join(parts)+f"concat=n={len(parts)}:v=1:a=0,trim=duration={tot},split[c1][c2]")
f.append("[c1]scale=-2:1920,crop=1080:1920,boxblur=40:4,eq=brightness=-0.32:saturation=0.7[bg]")
f.append("[c2]scale=1080:608:flags=lanczos[win]")
f.append("[bg][win]overlay=0:600,format=yuv420p[v]")
subprocess.run(["ffmpeg","-v","error","-y","-i",SRC,"-filter_complex",";".join(f),"-map","[v]","-r","30","-c:v","libx264","-crf","14","-preset","fast",OUT],check=True)
