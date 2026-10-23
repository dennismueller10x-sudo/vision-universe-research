#!/usr/bin/env python3 -I
"""Kuerzt lange Wortluecken (>0.26 s auf 0.13 s), danach atempo. Aufruf: tighten.py tts_response.json vo_raw.wav out.wav words_out.json tempo [nachlauf]
nachlauf: behaltene Zeit nach dem Wortende in s (Standard 0.065). Enden die HeyGen-Wortzeiten zu frueh, schneidet 0.065 End-Silben ab ('Rendite' -> 'Rendit'); dann 0.2 nehmen."""
import sys,json,subprocess,numpy as np,wave
d=json.load(open(sys.argv[1]))['data']; W=[w for w in d['word_timestamps'] if not w['word'].startswith('<')]
sr=48000; tempo=float(sys.argv[5]); tail=float(sys.argv[6]) if len(sys.argv)>6 else 0.065
raw=subprocess.run(["ffmpeg","-v","error","-i",sys.argv[2],"-ac","1","-ar",str(sr),"-f","f32le","-"],capture_output=True).stdout
x=np.frombuffer(raw,dtype=np.float32)
keep=[];newW=[];pos=0.0;cursor=0.0  # cursor: Position im Original
out=[];t_new=0.0
prev_end=0.0
segs=[]  # (orig_start, orig_end)
for i,w in enumerate(W):
    s,e=w['start'],w['end']
    if i==0: gap_start=0.0
    gap=s-prev_end
    if i>0 and gap>0.26:
        segs.append((cursor,min(prev_end+tail,s-0.065))); cursor=s-0.065
    prev_end=e
segs.append((cursor,len(x)/sr))
# Neubau
pieces=[];shift=[]  # fuer Zeitabbildung
acc=0.0
for a,b in segs:
    pieces.append(x[int(a*sr):int(b*sr)]); shift.append((a,b,acc)); acc+=(b-a)
y=np.concatenate(pieces)
def mp(t):
    for a,b,o in shift:
        if a-1e-6<=t<=b+1e-6: return o+(t-a)
    # in entferntem Bereich: auf naechste Kante
    best=min(shift,key=lambda s:min(abs(t-s[0]),abs(t-s[1])))
    return best[2]+(0 if abs(t-best[0])<abs(t-best[1]) else best[1]-best[0])
nw=[{"word":w['word'],"start":round(mp(w['start'])/tempo,3),"end":round(mp(w['end'])/tempo,3)} for w in W]
tmp="_t.wav"; wv=wave.open(tmp,"w"); wv.setnchannels(1); wv.setsampwidth(2); wv.setframerate(sr); wv.writeframes((np.clip(y,-1,1)*32767).astype(np.int16).tobytes()); wv.close()
subprocess.run(["ffmpeg","-v","error","-y","-i",tmp,"-af",f"atempo={tempo}",sys.argv[3]],check=True)
json.dump(nw,open(sys.argv[4],"w"),ensure_ascii=False,indent=1)
print("alt",round(len(x)/sr,2),"neu",round(len(y)/sr/tempo,2))
