# brand-media – Vision Universe Cinematic Brand Universe

Isolierter Bereich. Berührt keine Produktpfade (`quant`, `discover`, `supertrader`, `social`, Workflows, Skripte außerhalb `brand-media/`).

| Pfad | Inhalt |
|---|---|
| `originals/` | Vier Master-Originale, unverändert, mit `SHA256SUMS` |
| `registry/asset-registry.json` | 40 Charakter- + 10 Studio-Slots, Status je Asset |
| `registry/avatar-registry.json` | Zuordnung Master ↔ HeyGen (IDs bleiben `null`, bis real angelegt) |
| `docs/` | Character Bible, Studio, Generierungsplan, HeyGen-Status, QA, Trailer, Content-System |
| `tools/build-registry.mjs` | Erzeugt die Registries; `tools/validate.mjs` prüft sie |
| `library/`, `studio/`, `video/` | Ziel für geprüfte Ausgaben (Git LFS, siehe `.gitattributes`) |

Stand: nur die 4 Originale existieren als Dateien. Alle übrigen Einträge sind **PLANNED** – keine Platzhalter-Bilder.

**Vor dem Merge:** `pages-release.yml` veröffentlicht alle getrackten Dateien. `brand-media/` muss vorher per eigenem PR vom öffentlichen Paket ausgeschlossen werden (`scripts/vu2/build-release.mjs#permitted`), sonst werden unveröffentlichte Brand-Bilder öffentlich ausgeliefert.
