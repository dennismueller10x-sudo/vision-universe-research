#!/usr/bin/env python3
"""Kleinere Fassungen der Themenwelt-Fotos fuer srcset (Tempo, kein Layout).

Die Originale in assets/themen/ haben 1672 px und wiegen im Mittel ~120 KB. Discover zeigt sie als Karten von
154-190 px Breite; der Browser waehlt per srcset/sizes (discover/ui/v3.js#themeImg) die kleinste Fassung, die die
Kachel bei der Pixeldichte des Geraets noch voll abdeckt. Das Original bleibt die groesste Stufe.

Aufruf (Pillow noetig, einmalig nach neuem Foto):  python3 scripts/discover/build-theme-variants.py [--out DIR]
"""
import argparse, os, sys
from PIL import Image

WIDTHS = (480, 720, 1080)
QUALITY = 80
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'themen')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=ROOT)
    a = ap.parse_args()
    files = sorted(f for f in os.listdir(ROOT) if f.endswith('.webp') and not f.startswith('00-'))  # 00 = Startbild, keine Themenwelt
    for w in WIDTHS:
        os.makedirs(os.path.join(a.out, str(w)), exist_ok=True)
    for f in files:
        im = Image.open(os.path.join(ROOT, f)).convert('RGB')
        for w in WIDTHS:
            if im.width <= w:
                sys.exit(f'{f}: Original {im.width} px ist nicht breiter als {w} px')
            h = round(im.height * w / im.width)
            im.resize((w, h), Image.LANCZOS).save(os.path.join(a.out, str(w), f), 'WEBP', quality=QUALITY, method=6)
    print(f'{len(files)} Fotos, Stufen {WIDTHS}')

if __name__ == '__main__':
    main()
