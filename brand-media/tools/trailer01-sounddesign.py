import numpy as np, wave
from scipy.signal import lfilter
sr=44100;N=20*sr;t=np.arange(N)/sr;rng=np.random.default_rng(11)
def lp(x,fc):
    a=np.exp(-2*np.pi*fc/sr);return lfilter([1-a],[1,-a],x)
def hp(x,fc): return x-lp(x,fc)
mix=np.zeros(N)
def add(x,at,g=1.0):
    i=int(at*sr);j=min(i+len(x),N)
    if i<N and j>i: mix[i:j]+=g*x[:j-i]
def env(pts): return np.interp(t,[p[0] for p in pts],[p[1] for p in pts])
tone=lp(rng.standard_normal(N),160);tone/=np.abs(tone).max()
mix+=0.05*tone*env([(0,1),(16.95,1),(17.0,0),(20,0)])
drone=(np.sin(2*np.pi*55*t)+0.5*np.sin(2*np.pi*55.35*t)+0.3*np.sin(2*np.pi*82.4*t))*(1+0.12*np.sin(2*np.pi*0.15*t))
mix+=0.5*drone*env([(0,0),(1.8,0.05),(5,0.08),(8,0.07),(8.3,0.04),(12,0.05),(14,0.12),(16.9,0.17),(17.0,0),(20,0)])
def pad(freqs,t0,t1,g,det=0.003):
    s=sum(np.sin(2*np.pi*f*t)+np.sin(2*np.pi*f*(1+det)*t) for f in freqs)/(2*len(freqs))
    e=np.interp(t,[t0,t0+0.8,t1-0.4,t1],[0,1,1,0]);return s*e*g
mix+=pad([110,164.8,220,261.6],2,5.3,0.10)+pad([87.3,130.8,174.6,220],5,8.3,0.10)+pad([130.8,196,261.6,329.6],8,12.3,0.05)+pad([98,146.8,196,246.9],12,14.6,0.14)+pad([110,164.8,220,277.2],14.4,17.0,0.16)
step_s=60/104/2;notes=[220,261.6,329.6,392,329.6,261.6];k=0;tt=6.0
while tt<17.0:
    f=notes[k%6]*(2 if tt>12 else 1);n=int(0.22*sr);x=np.arange(n)/sr
    s=np.sin(2*np.pi*f*x)*np.exp(-x/0.09)+0.3*np.sin(4*np.pi*f*x)*np.exp(-x/0.05)
    add(s,tt,np.interp(tt,[6,8,8.3,12,13,16.9],[0.0,0.03,0.015,0.03,0.07,0.09]));tt+=step_s;k+=1
def step(at,br,g):
    n=int(0.12*sr);x=rng.standard_normal(n)*np.exp(-np.arange(n)/sr/0.024);x=lp(x,br)+0.8*np.sin(2*np.pi*68*np.arange(n)/sr)*np.exp(-np.arange(n)/sr/0.03);add(x/np.abs(x).max(),at,g)
for a in (2.3,2.75,3.2,3.65,4.1):step(a,2000,0.26)
for a in (2.45,2.9,3.35,3.8,4.25):step(a,900,0.20)
def creak(at,f0,f1,g):
    d=0.34;n=int(d*sr);x=np.arange(n)/sr;ph=2*np.pi*np.cumsum(np.linspace(f0,f1,n))/sr
    add(np.sin(ph)*(0.6+0.4*np.sin(2*np.pi*21*x))*np.sin(np.pi*x/d)**2,at,g)
creak(5.0,900,1250,0.07);creak(5.35,1100,780,0.06)
def whoosh(at,dur=0.35,g=0.2):
    n=int(dur*sr);x=rng.standard_normal(n);y=np.zeros(n);segs=np.array_split(np.arange(n),24)
    for kk,seg in enumerate(segs):
        a=np.exp(-2*np.pi*(400+3800*kk/24)/sr);y[seg]=lfilter([1-a],[1,-a],x[seg])
    y=hp(y,250)*np.sin(np.pi*np.arange(n)/n)**1.5;add(y/np.abs(y).max(),at,g)
def thump(at,g=0.35,f=60,d=0.25):
    n=int(d*sr);x=np.arange(n)/sr;add(np.sin(2*np.pi*(f+30*np.exp(-x/0.04))*x)*np.exp(-x/0.09),at,g)
whoosh(5.0,0.7,0.12)
for a in (12.0,13.25,14.5,15.75):whoosh(a-0.22);thump(a)
n=int(5*sr);x=rng.standard_normal(n);ris=np.zeros(n)
for kk,seg in enumerate(np.array_split(np.arange(n),60)):
    a=np.exp(-2*np.pi*(250+6000*(kk/60)**2)/sr);ris[seg]=lfilter([1-a],[1,-a],x[seg])
ris=hp(ris,200)*np.linspace(0,1,n)**2.2;add(ris/np.abs(ris).max(),12.0,0.17)
n=int(1.8*sr);x=np.arange(n)/sr
add((np.sin(2*np.pi*(42+80*np.exp(-x/0.05))*x)*np.exp(-x/0.55)+0.4*lp(rng.standard_normal(n),1500)*np.exp(-x/0.12))/1.3,17.4,0.55)
for a in (17.7,18.0):
    n=int(0.04*sr);c=hp(rng.standard_normal(n),1800)*np.exp(-np.arange(n)/sr/0.01);add(c/np.abs(c).max(),a,0.25)
n=int(1.6*sr);x=np.arange(n)/sr;ch=sum(np.sin(2*np.pi*f*x)*a for f,a in ((220,1),(329.6,.6),(440,.5),(554.4,.3),(110,.8)))*np.exp(-x/0.8)*np.minimum(x/0.03,1);add(ch/np.abs(ch).max(),18.4,0.16)
mix=np.tanh(mix*1.2);mix*=0.7/np.abs(mix).max()
pcm=(np.stack([mix,np.roll(mix,int(0.0006*sr))],1)*32767).astype(np.int16)
w=wave.open('vu-trailer01/assets/sounddesign_v3.wav','wb');w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes(pcm.tobytes());w.close();print('ok')
