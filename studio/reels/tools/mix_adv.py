#!/usr/bin/env python3 -I
"""Mischt Stimme + Effekt-Ebene + lizenzierte Musikspur (Ducking unter der Stimme). Aufruf: mix_adv.py timing.json vo.wav sfx_only.wav music.wav out.wav [music_gain]"""
import sys,json,subprocess,wave,numpy as np
T=json.load(open(sys.argv[1])); D=T["TOTAL"]; sr=48000; n=int(D*sr)
def load(p,ch):
    raw=subprocess.run(["ffmpeg","-v","error","-i",p,"-ac",str(ch),"-ar",str(sr),"-f","f32le","-"],capture_output=True).stdout
    x=np.frombuffer(raw,dtype=np.float32).reshape(-1,ch); out=np.zeros((n,ch),dtype=np.float32); m=min(n,len(x)); out[:m]=x[:m]; return out
vo=load(sys.argv[2],1)[:,0]; sfx=load(sys.argv[3],1)[:,0]; mus=load(sys.argv[4],2)
end=T["TM"]["sc"][-1]; t=np.arange(n)/sr
mus*=np.clip((end+.6-t)/.6,0,1)[:,None]*np.minimum(1,t/.15)[:,None]       # kurz anblenden, am Ende ausblenden
win=int(.05*sr); env=np.sqrt(np.convolve(vo**2,np.ones(win)/win,"same")); act=np.clip((env-0.01)/0.02,0,1)
k=int(.15*sr); act=np.convolve(act,np.ones(k)/k,"same"); mus*=(1-.45*act)[:,None]
mg=float(sys.argv[6]) if len(sys.argv)>6 else 1.0
mus*=mg/ max(1e-6,np.sqrt(np.mean(mus**2)))*0.09           # Musik-RMS auf Zielwert
mix=np.stack([vo+sfx*0.9,vo+sfx*0.9],1)+mus
w=wave.open(sys.argv[5],"w"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(mix,-1,1)*32767).astype(np.int16).tobytes()); w.close()
