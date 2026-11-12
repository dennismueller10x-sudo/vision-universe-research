"""Insights: legt einen fertigen Aktienreport (Heft-System, docs/publishing/reports/<ordner>) zum Lesen online ab.

Kopiert das PDF aus <ordner>/pdf/ und verkleinert die Seitenbilder der Vorschau (<ordner>/vorschau/p/*.jpg)
nach insights/reports/<id>/. Danach den Eintrag in products/insights/reports.json anlegen und
node products/insights/build.mjs ausführen.

    python3 products/insights/report_veroeffentlichen.py docs/publishing/reports/2026-11-take-two take-two-gta-6
"""
import shutil
import sys
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[2]
src, rid = Path(sys.argv[1]).resolve(), sys.argv[2]
dst = root / 'insights' / 'reports' / rid
(dst / 'seiten').mkdir(parents=True, exist_ok=True)
pdf = next((src / 'pdf').glob('*.pdf'))
shutil.copyfile(pdf, dst / pdf.name)
for f in sorted((src / 'vorschau' / 'p').glob('s*.jpg')):
    im = Image.open(f).convert('RGB')
    im = im.resize((1100, round(1100 * im.size[1] / im.size[0])), Image.LANCZOS)
    im.save(dst / 'seiten' / f.name, quality=80, optimize=True, progressive=True)
im = Image.open(dst / 'seiten' / 's01.jpg')
im.resize((560, round(560 * im.size[1] / im.size[0])), Image.LANCZOS).save(dst / 'cover.jpg', quality=82, optimize=True)
print(f'{dst.relative_to(root)}: {pdf.name} ({pdf.stat().st_size / 1e6:.1f} MB), {len(list((dst / "seiten").glob("*.jpg")))} Seiten, Cover')
