# THE ROOM – Sound: synthetischer Bett-Mix (lizenzfrei, numpy) + HeyGen-Native-Ton (Schritte) + Off-Sprecher Wolf Spencer.
# Aufruf: python3 tools/the-room-sounddesign.py <audio_dir>   (liest wolf44.wav, claim44.wav, native44.wav; schreibt trailer_mix.wav)
import sys, numpy as np, wave
from scipy.signal import lfilter
from scipy.io import wavfile
D = sys.argv[1]
sr = 44100; N = 20 * sr; t = np.arange(N) / sr; rng = np.random.default_rng(31)
def lp(x, fc): a = np.exp(-2*np.pi*fc/sr); return lfilter([1-a], [1, -a], x)
def hp(x, fc): return x - lp(x, fc)
def rd(f): s, x = wavfile.read(f"{D}/{f}"); x = x.astype(np.float64); return x / (np.abs(x).max() if x.dtype != np.float64 else 1) if x.ndim == 1 else x[:, 0]
def load(f):
    s, x = wavfile.read(f"{D}/{f}"); x = x.astype(np.float64) / 32768.0
    return x[:, 0] if x.ndim > 1 else x
bed = np.zeros(N); vo = np.zeros(N); nat = np.zeros(N)
def add(x, at, g=1.0, dest=None):
    d = bed if dest is None else dest; i = int(at*sr); j = min(i+len(x), N)
    if i < N and j > i: d[i:j] += g * x[:j-i]
def env(pts): return np.interp(t, [p[0] for p in pts], [p[1] for p in pts])
# Off-Sprecher (Schnitt aus Hörprobe) + Claim
wolf = load('wolf44.wav'); claim = load('claim44.wav'); nv = load('native44.wav')
def seg(x, a, b, fi=0.02, fo=0.05):
    y = x[int(a*sr):int(b*sr)].copy(); n = len(y); y[:int(fi*sr)] *= np.linspace(0, 1, int(fi*sr)); y[-int(fo*sr):] *= np.linspace(1, 0, int(fo*sr)); return y
v1 = seg(wolf, 0.20, 2.95); v2 = seg(wolf, 3.05, 4.45)
VO1, VO2, CL = 8.0, 11.35, 17.15
add(v1, VO1, 1.0, vo); add(v2, VO2, 1.0, vo); add(claim[:int(2.64*sr)], CL, 0.95, vo)
vo = np.tanh(vo * 1.6) * 0.9
# Native HeyGen-Ton der Platte (Schritte, Stuhl) – Raumton ausgeduennt
nat_len = min(len(nv), int(13.1*sr)); add(hp(nv[:nat_len], 60), 0, 1.0, nat)
nat *= env([(0, 1), (7.6, 1), (8.2, .35), (13.0, .35), (13.1, 0), (20, 0)])
duck = env([(0, 1), (7.8, 1), (8.1, .55), (10.9, .55), (11.2, 1), (11.25, 1), (11.5, .55), (12.9, .55), (13.1, 1), (16.9, 1), (17.0, 0), (17.1, .6), (19.9, .6), (20, 0)])
tone = lp(rng.standard_normal(N), 150); tone /= np.abs(tone).max()
bed += 0.05 * tone * env([(0, 1), (16.95, 1), (17.0, 0), (20, 0)])
drone = (np.sin(2*np.pi*55*t) + 0.5*np.sin(2*np.pi*55.35*t) + 0.3*np.sin(2*np.pi*82.4*t)) * (1 + 0.12*np.sin(2*np.pi*0.15*t))
bed += 0.5 * duck * drone * env([(0, 0), (1.5, 0.06), (3, 0.08), (7, 0.10), (13, 0.13), (16.9, 0.19), (17.0, 0), (20, 0)])
def pad(fr, t0, t1, g, det=0.003):
    s = sum(np.sin(2*np.pi*f*t) + np.sin(2*np.pi*f*(1+det)*t) for f in fr) / (2*len(fr))
    return s * np.interp(t, [t0, t0+1.0, t1-0.5, t1], [0, 1, 1, 0]) * g
bed += duck * (pad([110, 164.8, 220, 261.6], 3.0, 7.8, .07) + pad([87.3, 130.8, 174.6, 220], 7.5, 11, .09) + pad([130.8, 196, 261.6, 329.6], 10.5, 13.3, .10) + pad([98, 146.8, 196, 246.9], 13.1, 15.2, .15) + pad([110, 164.8, 220, 277.2], 15, 17.0, .17))
# Pulsierendes Motiv ab Orbit
step_s = 60/96/2; notes = [220, 261.6, 329.6, 392, 329.6, 261.6]; k = 0; tt = 8.0
while tt < 17.0:
    f = notes[k % 6] * (2 if tt > 13.1 else 1); n = int(.22*sr); x = np.arange(n)/sr
    s = np.sin(2*np.pi*f*x)*np.exp(-x/.09) + .3*np.sin(4*np.pi*f*x)*np.exp(-x/.05)
    add(s, tt, np.interp(tt, [8, 11, 13.1, 16.9], [0, .02, .06, .09]) * (0.5 if 8.0 < tt < 12.9 else 1)); tt += step_s; k += 1
def whoosh(at, dur=.35, g=.2):
    n = int(dur*sr); x = rng.standard_normal(n); y = np.zeros(n)
    for kk, sg in enumerate(np.array_split(np.arange(n), 24)):
        a = np.exp(-2*np.pi*(400+3800*kk/24)/sr); y[sg] = lfilter([1-a], [1, -a], x[sg])
    y = hp(y, 250) * np.sin(np.pi*np.arange(n)/n)**1.5; add(y/np.abs(y).max(), at, g)
def thump(at, g=.35, f=60, d=.25):
    n = int(d*sr); x = np.arange(n)/sr; add(np.sin(2*np.pi*(f+30*np.exp(-x/.04))*x)*np.exp(-x/.09), at, g)
whoosh(7.2, 1.3, .10)                              # Orbit-Start
for a in (13.1, 14.05, 15.0, 15.95): whoosh(a-.2, .3, .2); thump(a)
n = int(4*sr); x = rng.standard_normal(n); ris = np.zeros(n)
for kk, sg in enumerate(np.array_split(np.arange(n), 60)):
    a = np.exp(-2*np.pi*(250+6000*(kk/60)**2)/sr); ris[sg] = lfilter([1-a], [1, -a], x[sg])
r2 = hp(ris, 200)*np.linspace(0, 1, n)**2.2; add(r2/np.abs(r2).max(), 13.0, .17)
# Hard cut auf Schwarz: Impact + Brand-Sting
n = int(1.8*sr); x = np.arange(n)/sr
add((np.sin(2*np.pi*(42+80*np.exp(-x/.05))*x)*np.exp(-x/.55) + .4*lp(rng.standard_normal(n), 1500)*np.exp(-x/.12))/1.3, 17.05, .55)
n = int(2.0*sr); x = np.arange(n)/sr
ch = sum(np.sin(2*np.pi*f*x)*a for f, a in ((220, 1), (329.6, .6), (440, .5), (554.4, .3), (110, .8))) * np.exp(-x/.9) * np.minimum(x/.03, 1)
add(ch/np.abs(ch).max(), 19.15, .17)
bed = np.tanh(bed*1.2); bed *= 0.62/np.abs(bed).max()
mix = bed + 0.9*nat + 1.0*vo
mix = np.tanh(mix*1.1); mix *= 0.89/np.abs(mix).max()
mix[-int(.15*sr):] *= np.linspace(1, 0, int(.15*sr))
st = np.stack([mix, np.roll(mix, int(0.0006*sr))], 1)
w = wave.open(f"{D}/trailer_mix.wav", 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((st*32767).astype(np.int16).tobytes()); w.close()
vs = np.stack([vo, vo], 1); w = wave.open(f"{D}/off_voice_only.wav", 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes((vs/np.abs(vs).max()*0.89*32767).astype(np.int16).tobytes()); w.close()
print('ok')
