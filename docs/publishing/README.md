# Publishing: Vision Universe Aktienmagazin und Aktienreports

| Was | Wo |
|---|---|
| Produktionshandbuch (Aufbau, wöchentlicher Ablauf, Design und Bildsprache, Regeln, Fahrplan) | [HANDBUCH.md](HANDBUCH.md) |
| System (Build, Prüftor, Vorlagen, Design) | [system/](system/) |
| Ausgabe Nr. 01 vom 09.11.2026 (28 Seiten) | [ausgaben/2026-11-09-nr01/](ausgaben/2026-11-09-nr01/README.md), PDF in `pdf/`, Vorschau `vorschau/index.html` |
| Unabhängiger Prüfbericht (Codex) | [ausgaben/2026-11-09-nr01/PRUEFBERICHT_CODEX.md](ausgaben/2026-11-09-nr01/PRUEFBERICHT_CODEX.md) |
| Erstes Konzept (5 Seiten Magazin, 5 Seiten Aktienreport AMD) | [konzept-2026-11/](konzept-2026-11/README.md) |
| Bildaufträge (Higgsfield) | `brand-media/publishing/` |

```bash
node docs/publishing/system/build.mjs docs/publishing/ausgaben/2026-11-09-nr01 --scale 2 --vorschau --out /tmp/heft
```
