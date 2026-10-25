#!/usr/bin/env python3 -I
"""Nur Effekte (Einschlaege, Riser, Ticks), selbst synthetisiert. Aufruf: synth_sfx.py timing.json out.wav"""
import sys,json,wave,numpy as np
T=json.load(open(sys.argv[1])); TM=T["TM"]; SC=TM["sc"]; EV=TM["ev"]; TOTAL=T["TOTAL"]; sr=48000
n=int((TOTAL+1.0)*sr); rng=np.random.default_rng(7); fx=np.zeros(n)
def add(x,at,g=1.0):
    i=int(max(0,at)*sr); j=min(n,i+len(x))
    if i<n: fx[i:j]+=g*x[:j-i]
def impact(d=1.3):
    m=int(d*sr); tt=np.arange(m)/sr; b=np.sin(2*np.pi*(34+70*np.exp(-tt*9))*tt)*np.exp(-tt*2.8)
    x=rng.standard_normal(m); x=x-np.convolve(x,np.ones(6)/6,"same"); return b+x*np.exp(-tt*10)*.3
def riser(d):
    m=int(d*sr); tt=np.arange(m)/m; x=rng.standard_normal(m); y=np.zeros(m); a=0.0
    for i in range(m): c=.006+.5*tt[i]**3; a+=c*(x[i]-a); y[i]=a
    tone=np.sin(2*np.pi*np.cumsum(110*2**(tt*2.0))/sr)*.25
    return (y/np.max(np.abs(y))*.6+tone)*tt**2
def tick(f=1400):
    m=int(.03*sr); tt=np.arange(m)/sr; return np.sin(2*np.pi*f*tt)*np.exp(-tt*140)
def reverb(x,d=1.5):
    m=int(d*sr); ir=rng.standard_normal(m)*np.exp(-np.arange(m)/sr*3.4); ir[:int(.012*sr)]=0; L=len(x)+m
    y=np.fft.irfft(np.fft.rfft(x,L)*np.fft.rfft(ir,L),L); return y/np.max(np.abs(y))*np.max(np.abs(x))
I=np.zeros(n)
def hit(at,g=1.0):
    x=impact(); i=int(max(0,at)*sr); I[i:i+len(x)]+=g*x[:max(0,min(len(x),n-i))]
hit(0.0,1.0)                   # Hook
for e in SC[1:5]: hit(e,.75)   # Szenenwechsel
hit(EV["dbl"],.9)
hit(EV["app"],.9); hit(EV["eps"]+1.2,.8); hit(EV["pt"],.9)
hit(1.4,.9)
hit(SC[6]-.05,1.0)             # Endkarte
R=reverb(I[:n]); fx[:len(R)]+=R[:n]*.8; fx+=I*.5
for e in [SC[1],SC[3]]: add(riser(.9),e-.9,.35)
add(riser(.7),1.4-.7,.45)
add(riser(.7),SC[6]-.7,.45)
for a in [EV[k] for k in ("pv","hi","vol","turn","thermo","hire","gs","daily")]: add(tick(),a,.55)
fx*=.9/max(1e-6,np.max(np.abs(fx)))
w=wave.open(sys.argv[2],"w"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(fx,-1,1)*32767).astype(np.int16).tobytes()); w.close(); print("sfx",sys.argv[2])
