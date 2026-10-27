#!/usr/bin/env python3 -I
"""Effekte fuer ein Erklaervideo aus dem Zeitplan (rechtefrei, selbst synthetisiert): Einschlag am Anfang, an jedem
Szenenwechsel und auf der Endkarte, Riser davor, Ticks auf allen Ereignismarken. Aufruf: sfx.py timing.json out.wav"""
import sys, json, wave
import numpy as np
T = json.load(open(sys.argv[1])); SC = T["TM"]["sc"]; EV = T["TM"].get("ev", {}); TOTAL = T["TOTAL"]; sr = 48000
n = int((TOTAL + 1.0) * sr); rng = np.random.default_rng(11); fx = np.zeros(n)
def add(x, at, g=1.0):
    i = int(max(0, at) * sr); j = min(n, i + len(x))
    if i < n: fx[i:j] += g * x[:j - i]
def impact(d=1.4):
    m = int(d * sr); tt = np.arange(m) / sr
    b = np.sin(2 * np.pi * (32 + 75 * np.exp(-tt * 9)) * tt) * np.exp(-tt * 2.6)
    x = rng.standard_normal(m); x = x - np.convolve(x, np.ones(6) / 6, "same")
    return b + x * np.exp(-tt * 11) * .28
def riser(d):
    m = int(d * sr); tt = np.arange(m) / m; x = rng.standard_normal(m); y = np.zeros(m); a = 0.0
    for i in range(m):
        c = .006 + .5 * tt[i] ** 3; a += c * (x[i] - a); y[i] = a
    tone = np.sin(2 * np.pi * np.cumsum(110 * 2 ** (tt * 2.0)) / sr) * .25
    return (y / np.max(np.abs(y)) * .6 + tone) * tt ** 2
def tick(f=1500):
    m = int(.035 * sr); tt = np.arange(m) / sr; return np.sin(2 * np.pi * f * tt) * np.exp(-tt * 130)
def whoosh(d=.6):
    m = int(d * sr); tt = np.arange(m) / m; x = rng.standard_normal(m); y = np.convolve(x, np.ones(40) / 40, "same")
    return y / np.max(np.abs(y)) * np.sin(np.pi * tt) ** 2 * .5
def reverb(x, d=1.6):
    m = int(d * sr); ir = rng.standard_normal(m) * np.exp(-np.arange(m) / sr * 3.2); ir[:int(.012 * sr)] = 0; L = len(x) + m
    y = np.fft.irfft(np.fft.rfft(x, L) * np.fft.rfft(ir, L), L); return y / np.max(np.abs(y)) * np.max(np.abs(x))
I = np.zeros(n)
def hit(at, g=1.0):
    x = impact(); i = int(max(0, at) * sr); m = max(0, min(len(x), n - i)); I[i:i + m] += g * x[:m]
hit(0.0, 1.0)
for e in SC[1:6]: hit(e, .7); add(whoosh(), e - .35, .5)
hit(SC[6] + .05, 1.0)
R = reverb(I[:n]); fx[:len(R)] += R[:n] * .8; fx += I * .5
for e in (SC[1], SC[3]): add(riser(.9), e - .9, .3)
add(riser(.8), SC[6] - .75, .42)
for name, at in EV.items(): add(tick(1300 + (sum(map(ord, name)) % 5) * 120), at, .5)
fx *= .9 / max(1e-6, np.max(np.abs(fx)))
w = wave.open(sys.argv[2], "w"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
w.writeframes((np.clip(fx, -1, 1) * 32767).astype(np.int16).tobytes()); w.close(); print("sfx", sys.argv[2])
