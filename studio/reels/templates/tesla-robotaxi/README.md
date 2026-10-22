# Vorlage „Tesla Robotaxi" (Unternehmensbilder, Zeichnungen, Kurve)

Entstanden am 22.10.2026 aus dem Tesla Q3-2026-Update (PDF vom Owner). Fassung v1, 44,9 s, Stimme Helmut, Musik Dropbox-Track ab 15,6 s, −14,3 LUFS.

- **Hook ab Bild 1:** „2 Mio. Meilen." ist bei t=0 voll da. Das Lenkrad zeichnet sich in 0,5 s und wird bei 1,6 s rot durchgestrichen („Ohne Fahrer").
- **Bewegte Zeichnungen:** Route mit Punkt (`getPointAtLength`), Globus mit Umlaufbahn und Zähler 1→80, Kurve aus Datenpunkten (`PTS`, nachgezeichnet nach der Grafik auf S. 8), 24-h-Uhr mit Bogen, Kran, Preisschild, Balken ×2,1, Papierflieger auf Spur (Teilen-Aufruf), Auto-Icon in der Endkarte.
- **Bilder aus der Präsentation** (`assets/bg13|14|15|22.jpg`, nicht im Repo): mit `pdfimages -j` in voller Auflösung extrahiert, dann `scale=-2:1920, crop=1080:1920:(iw*X-540):0, eq=brightness=-0.16..-0.2:saturation=0.85`. Vollflächig hinter Verläufen. Caption: „Bildquelle: Tesla, Q3 2026 Update".
- `sfx.py`: Effekt-Ereignisse für dieses Skript (Abwandlung von `tools/sfx_events.py`).
- Untertitel: kurze Reste („gefahren.", „Jahr.", „hält.") nach `build_script.py` von Hand mit der vorigen Gruppe zusammenführen.
