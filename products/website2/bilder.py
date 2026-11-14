"""Verkleinerte WebP-Fassungen der Bilder der Website (Handarbeit unter website2/img/, einmal erzeugt und committet).

Die Seiten zeigen App-Ansichten rund 250 bis 290 Pixel breit, Heft- und Reportseiten 300 Pixel. Die Vorlagen sind dafür
viel zu groß (780 und 1100 Pixel breite JPEGs). Dieses Skript schreibt je Vorlage eine passende WebP-Datei; die Seiten
laden sie über <picture> und behalten das JPEG als Rückfall. Der Erzeuger (build.mjs) nimmt eine WebP-Fassung nur, wenn
sie vorhanden ist: Für ein neues Heft oder einen neuen Report funktioniert die Seite auch ohne erneuten Lauf.

    python3 products/website2/bilder.py            (braucht Pillow; läuft nicht in der CI)
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
IMG = ROOT / "website2" / "img"
# Heft und Report, die die Seiten fest zeigen (HEFT und REPORT in build.mjs).
HEFT = ("01", ROOT / "insights/magazin/nr-01", [2, 3, 5, 8, 12, 17, 20, 24])
REPORT = ("01", ROOT / "insights/reports/take-two-gta-6", [2, 4, 5, 6, 7, 8])


def webp(source, target, width, quality=80):
    image = Image.open(source).convert("RGB")
    if image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    image.save(target, "WEBP", quality=quality, method=6)
    return target.stat().st_size


def main():
    total = 0
    for source in sorted(IMG.glob("app-*.jpg")):
        if source.name == "app-poster.jpg":
            continue
        total += webp(source, source.with_name(source.stem + "-600.webp"), 600)
    for art, (nr, folder, seiten) in (("heft", HEFT), ("report", REPORT)):
        total += webp(folder / "cover.jpg", IMG / f"{art}-{nr}-cover.webp", 560, 82)
        for n in seiten:
            total += webp(folder / "seiten" / f"s{n:02d}.jpg", IMG / f"{art}-{nr}-s{n:02d}.webp", 600, 78)
    # Die drei kleinen Blätter in der Kennzeichen-Grafik von Insights (84 Pixel breit, doppelte Dichte).
    nr, folder, _ = HEFT
    for i, source in enumerate((folder / "seiten/s02.jpg", folder / "seiten/s05.jpg", folder / "cover.jpg"), 1):
        total += webp(source, IMG / f"heft-blatt-{i}.webp", 168, 76)
    print(f"{len(list(IMG.glob('*.webp')))} WebP-Dateien, neu geschrieben {total // 1024} KB")


if __name__ == "__main__":
    main()
