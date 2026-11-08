# Konzept: VU Weekly (Magazin) und VU Aktienreport

Stand 07.11.2026. Muster mit echten Daten und echten Nachrichten der Woche vom 02. bis 06.11.2026, nicht veröffentlicht.
Das alte `magazin/` und `reports/xpeng/` (ChatGPT-HTML) passen nicht zum Design. Der Owner hat sie am 07.11. zum Verwerfen
freigegeben; sie werden in einem eigenen PR entfernt, sobald das neue Format in der App steht.

| Datei | Zweck |
|---|---|
| `magazin.html` | VU Weekly, Ausgabe KW 45, 5 Seiten A4: Cover, Die Woche, Titelgeschichte, Was die Daten sagen, Markt-Radar |
| `report-amd.html` | Aktienreport Nr. 01 AMD, 5 Seiten A4: Cover, Unternehmen, Zahlen, Chart & Technik, Bewertung & Einordnung |
| `print.css`, `charts.js` | Druck-Design (Weiß, Schwarz, Neongrün `#c8f531`, Inter) und die Chart-Bausteine aus dem Redesign 2027 |
| `build-data.mjs` | zieht jede Zahl aus den Repo-Artefakten nach `data.js` (mit Quellpfad) |
| `render.mjs` | rendert PDF und PNG mit Chromium und meldet JS-Fehler und Text, der über den Seitenrand läuft |
| `pdf/` | die gerenderten PDFs |

```bash
node docs/publishing/konzept-2026-11/build-data.mjs     # Daten neu ziehen
node docs/publishing/konzept-2026-11/render.mjs --out /tmp/vu-print --scale 2
```

## Zwei Arten von Inhalt

1. **Eigene Daten** (keine Handeingabe): Kurse, Wochenbilanz aller S&P-500-Mitglieder, KI-Kette, Sektoren, Marktregime,
   AMD-Fundamentaldaten aus der SEC, Gesundheits-Check, Technik-Engine, Ränge. Die Seite setzt die Werte über `data-k` ein;
   fehlt ein Wert, bricht das Rendern ab.
2. **Redaktion** (recherchiert, mit Quelle auf der Seite): Wahlergebnis, Indexstände, Zitate, Arbeitsmarkt, AMD-Quartal laut
   Pressemitteilung (SEC 8-K). Zitate sind übersetzt und als solche markiert.

## Regeln

- Wortwahl nach `docs/legal/WORTWAHL.md`: „Stärken/Schwächen laut Kennzahlen“, „Größte Anstiege/Rückgänge“, kein Kursziel,
  keine Handlungsaufforderung. Pflicht-Hinweis `editorial` aus `assets/legal-notices.json` auf jeder letzten Seite.
- Bilder: im Muster Themenbilder aus `assets/themen/`. Im Betrieb ein eigenes Higgsfield-Motiv je Cover
  (Job unter `brand-media/publishing/image-jobs/`), nie Fotos echter Personen oder fremde Logos, KI-Bilder gekennzeichnet.
- Charts nur aus Daten, nie aus einem Bildgenerator.

## Offen

- Presseprivileg Art. 21 MAR für das Magazin: Anwaltsfrage (`docs/legal/EINORDNUNG.md` §2.2).
- Takt und Ort in der App (`/magazin/`, `/reports/`), Zugang Free/Pro: Owner-Entscheidung mit dem Preis.
- Produktionsstraße als Workflow: Datenzug → Entwurf → Faktencheck (jede Zahl gegen Artefakt oder Quelle) → Bild →
  Rendern → Karte im Approval Center.
