import numpy as np, wave
from scipy.signal import lfilter
sr=44100;N=20*sr;t=np.arange(N)/sr;rng=np.random.default_rng(21)
def lp(x,fc):
    a=np.exp(-2*np.pi*fc/sr);return lfilter([1-a],[1,-a],x)
def hp(x,fc): return x-lp(x,fc)
mix=np.zeros(N)
def add(x,at,g=1.0,dest=None):
    d=mix if dest is None else dest
    i=int(at*sr);j=min(i+len(x),N)
    if i<N and j>i: d[i:j]+=g*x[:j-i]
def env(pts): return np.interp(t,[p[0] for p in pts],[p[1] for p in pts])
duck=env([(0,1),(7.2,1),(7.5,.55),(10.3,.55),(10.6,1),(11.0,1),(11.2,.55),(12.6,.55),(12.9,1),(20,1)])
tone=lp(rng.standard_normal(N),150);tone/=np.abs(tone).max()
mix+=0.06*tone*env([(0,1),(16.95,1),(17.0,0),(20,0)])
drone=(np.sin(2*np.pi*55*t)+0.5*np.sin(2*np.pi*55.35*t)+0.3*np.sin(2*np.pi*82.4*t))*(1+0.12*np.sin(2*np.pi*0.15*t))
mix+=0.5*duck*drone*env([(0,0),(1.5,0.05),(3,0.07),(7,0.09),(13,0.12),(16.9,0.18),(17.0,0),(20,0)])
def pad(freqs,t0,t1,g,det=0.003):
    s=sum(np.sin(2*np.pi*f*t)+np.sin(2*np.pi*f*(1+det)*t) for f in freqs)/(2*len(freqs))
    e=np.interp(t,[t0,t0+1.0,t1-0.5,t1],[0,1,1,0]);return s*e*g
mix+=duck*(pad([110,164.8,220,261.6],3.5,7.3,0.08)+pad([87.3,130.8,174.6,220],7,10.3,0.09)+pad([130.8,196,261.6,329.6],10,13.3,0.10)+pad([98,146.8,196,246.9],13,15.2,0.15)+pad([110,164.8,220,277.2],15,17.0,0.17))
step_s=60/96/2;notes=[220,261.6,329.6,392,329.6,261.6];k=0;tt=9.0
while tt<17.0:
    f=notes[k%6]*(2 if tt>13 else 1);n=int(0.22*sr);x=np.arange(n)/sr
    s=np.sin(2*np.pi*f*x)*np.exp(-x/0.09)+0.3*np.sin(4*np.pi*f*x)*np.exp(-x/0.05)
    add(s,tt,np.interp(tt,[9,11,13,16.9],[0.0,0.02,0.06,0.09])*(0.6 if 10.3<tt<12.6 else 1));tt+=step_s;k+=1
# Schritte mit Hall (Echo-Kette) – grosse Halle
steps=np.zeros(N)
def step(at,br,g):
    n=int(0.12*sr);x=rng.standard_normal(n)*np.exp(-np.arange(n)/sr/0.024);x=lp(x,br)+0.8*np.sin(2*np.pi*68*np.arange(n)/sr)*np.exp(-np.arange(n)/sr/0.03);x/=np.abs(x).max()
    add(x,at,g,steps)
for a in np.arange(3.5,6.0,0.45):step(a,2000,0.30)
for a in np.arange(3.65,6.1,0.45):step(a,900,0.22)
rev=steps.copy()
for dl,gn,fc in ((0.19,0.45,3000),(0.41,0.30,2200),(0.68,0.20,1600),(1.0,0.12,1200)):
    d=np.roll(lp(steps,fc),int(dl*sr))*gn;rev+=d
mix+=rev*0.9
def creak(at,f0,f1,g):
    d=0.34;n=int(d*sr);x=np.arange(n)/sr;ph=2*np.pi*np.cumsum(np.linspace(f0,f1,n))/sr
    add(np.sin(ph)*(0.6+0.4*np.sin(2*np.pi*21*x))*np.sin(np.pi*x/d)**2,at,g)
creak(6.2,900,1250,0.06);creak(6.55,1100,780,0.05)
def whoosh(at,dur=0.35,g=0.2):
    n=int(dur*sr);x=rng.standard_normal(n);y=np.zeros(n)
    for kk,seg in enumerate(np.array_split(np.arange(n),24)):
        a=np.exp(-2*np.pi*(400+3800*kk/24)/sr);y[seg]=lfilter([1-a],[1,-a],x[seg])
    y=hp(y,250)*np.sin(np.pi*np.arange(n)/n)**1.5;add(y/np.abs(y).max(),at,g)
def thump(at,g=0.35,f=60,d=0.25):
    n=int(d*sr);x=np.arange(n)/sr;add(np.sin(2*np.pi*(f+30*np.exp(-x/0.04))*x)*np.exp(-x/0.09),at,g)
whoosh(7.0,1.2,0.10)                      # Orbit-Start
for a in (13.0,14.0,15.0,16.0):whoosh(a-0.2,0.3,0.2);thump(a)
n=int(4*sr);x=rng.standard_normal(n);ris=np.zeros(n)
for kk,seg in enumerate(np.array_split(np.arange(n),60)):
    a=np.exp(-2*np.pi*(250+6000*(kk/60)**2)/sr);ris[seg]=lfilter([1-a],[1,-a],x[seg])
add(hp(ris,200)*np.linspace(0,1,n)**2.2/1.0,13.0,0.0) # (Riser unten normalisiert)
r2=hp(ris,200)*np.linspace(0,1,n)**2.2;add(r2/np.abs(r2).max(),13.0,0.17)
n=int(1.8*sr);x=np.arange(n)/sr
add((np.sin(2*np.pi*(42+80*np.exp(-x/0.05))*x)*np.exp(-x/0.55)+0.4*lp(rng.standard_normal(n),1500)*np.exp(-x/0.12))/1.3,17.3,0.55)
for a in (17.6,18.2):
    n=int(0.04*sr);c=hp(rng.standard_normal(n),1800)*np.exp(-np.arange(n)/sr/0.01);add(c/np.abs(c).max(),a,0.25)
n=int(1.6*sr);x=np.arange(n)/sr;ch=sum(np.sin(2*np.pi*f*x)*a for f,a in ((220,1),(329.6,.6),(440,.5),(554.4,.3),(110,.8)))*np.exp(-x/0.8)*np.minimum(x/0.03,1);add(ch/np.abs(ch).max(),18.5,0.16)
mix=np.tanh(mix*1.2);mix*=0.7/np.abs(mix).max()
pcm=(np.stack([mix,np.roll(mix,int(0.0006*sr))],1)*32767).astype(np.int16)
w=wave.open('bed_v4.wav','wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes(pcm.tobytes());w.close();print('ok')
