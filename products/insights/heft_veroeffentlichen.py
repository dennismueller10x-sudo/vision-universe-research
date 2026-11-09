"""Insights: legt eine fertige Ausgabe des Aktienmagazins zum Lesen online ab.

Kopiert das PDF und verkleinert die Seitenbilder der Vorschau (docs/publishing/ausgaben/<ordner>/vorschau/p/*.jpg)
nach insights/magazin/nr-<NN>/. Danach den Eintrag in products/insights/magazin.json anlegen und
node products/insights/build.mjs ausführen.

    python3 products/insights/heft_veroeffentlichen.py docs/publishing/ausgaben/2026-11-09-nr01 01
"""
import shutil
import sys
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[2]
src, nr = Path(sys.argv[1]).resolve(), sys.argv[2].zfill(2)
dst = root / 'insights' / 'magazin' / f'nr-{nr}'
(dst / 'seiten').mkdir(parents=True, exist_ok=True)
pdf = next((src / 'pdf').glob('*.pdf'))
shutil.copyfile(pdf, dst / f'vision-universe-aktienmagazin-{nr}.pdf')
for f in sorted((src / 'vorschau' / 'p').glob('s*.jpg')):
    im = Image.open(f).convert('RGB')
    im = im.resize((1100, round(1100 * im.size[1] / im.size[0])), Image.LANCZOS)
    im.save(dst / 'seiten' / f.name, quality=80, optimize=True, progressive=True)
im = Image.open(dst / 'seiten' / 's01.jpg')
im.resize((560, round(560 * im.size[1] / im.size[0])), Image.LANCZOS).save(dst / 'cover.jpg', quality=82, optimize=True)
print(f'{dst.relative_to(root)}: PDF, {len(list((dst / "seiten").glob("*.jpg")))} Seiten, Cover')
