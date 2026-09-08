# VU REALTIME — INTEGRATIONSSTAND FÜR DAS GESCHÜTZTE PREVIEW

Welchen Stand ein Preview-Deployment integrieren muss — und was es dabei
**nicht** anfassen darf.

Stand: 2026-09-08
Zugehörig: `VU_REALTIME_MARKET_DATA_ARCHITECTURE.md`, `VU_REALTIME_MARKET_DATA_VALIDATION.md`

---

## Der Commit

```
39bfaea96b216c4e7f4683125eea088052d8c003
Merge pull request #51 — Realtime Market Data & Live Chart Engine mit Extended Hours
```

Das ist der Stand, den ein Preview-Branch integrieren muss. Er enthält die
vollständige Realtime- und Extended-Hours-Architektur.

| | |
|---|---|
| Vorheriger main | `39335ad` |
| Gemergter PR-Head | `5402440` |
| **Finaler main** | **`39bfaea`** |
| Enthaltene Commits | 8 |
| Geänderte Dateien | 31 (+8.823 / −2) |

Prüfen lässt sich das ohne Umweg:

```
git merge-base --is-ancestor 39bfaea <preview-branch> && echo enthalten
```

## Was dieser Commit mitbringt

| Bereich | Pfad |
|---|---|
| Realtime-Engines (13 Module) | `quant/engines/realtime/` |
| Sitzungs- und Schwellenkonfiguration | `quant/config/market-calendar.json`, `quant/config/realtime-thresholds.json` |
| Live-Chart und Datenstatus | `quant/ui/live-chart.js`, Ergänzungen in `quant/ui/quant.css` |
| Tiingo-Echtzeitpfade (serverseitig) | `providers/tiingo/realtime.js` |
| Laufzeitnachweis | `scripts/market/verify-tiingo-realtime.mjs` |
| Tests | `quant/tests/realtime-*.test.mjs` (124 Prüfungen) |

## Was das Preview NICHT ändern darf

Diese vier Werte sind der Grund, warum der Merge das Verhalten der
ausgelieferten Seiten nicht verändert hat. Ein Preview, das sie kippt,
kippt genau die Zusicherungen, die geprüft wurden:

| | Stand auf `39bfaea` | |
|---|---|---|
| `ENABLE_LIVE_MARKET_DATA` | **aus** | IEX-Nutzungsbedingungen ungeprüft |
| `ENABLE_PUBLIC_LIVE_MARKET_DATA` | **aus** | keine geprüfte Anzeigeerlaubnis |
| `licenseConfidence` | **LEGAL_REVIEW_REQUIRED** | unverändert seit Phase 4A |
| `REALTIME_READY` | **nicht gesetzt** | kein Laufzeitnachweis mit dem tatsächlichen Zugang |

**Ein geschütztes Preview hebt keine dieser Sperren auf.** Eine Anmeldung
regelt, *wer* eine Seite sieht. Sie beantwortet nicht, ob wir die Daten
anzeigen dürfen — das ist eine Lizenzfrage, und `display-policy.js` kennt
für sie eine eigene Zielgruppe (`internal` gegen `public`), die vom
Login-Zustand unabhängig ist.

Wer im Preview Live-Daten sehen will, braucht deshalb zweierlei: den
Laufzeitnachweis (technisch) **und** einen Eintrag in der Anzeigerichtlinie
mit Grundlage und Prüfdatum (rechtlich). Das Gate allein genügt nicht — ein
Test hält das fest.

## Was das Preview heute zeigen würde

Der Live-Chart ist **an keine ausgelieferte Seite angebunden**. Das ist
Absicht: die Anbindung ist eine Produktentscheidung mit Lizenzfolge und
gehört nicht in denselben Schritt wie die Architektur.

Ein Preview auf `39bfaea` verhält sich für Besucher deshalb exakt wie
`39335ad` davor. Was neu dazugekommen ist, liegt bereit und wartet auf zwei
Entscheidungen, die niemand nebenbei trifft.

## Reihenfolge für den Live-Betrieb

```
1. Laufzeitnachweis      tiingo-verify.yml → run_realtime
                         zweimal: regulär und in einer erweiterten Sitzung
                         (10:00–15:30 oder 22:00–02:00 deutscher Zeit)
2. Lizenzentscheidung    Eintrag in display-policy.js mit Grundlage und Datum
3. Gates                 ENABLE_LIVE_MARKET_DATA, dann ENABLE_PUBLIC_…
4. Anbindung             attachLiveChart auf einer konkreten Seite
5. Preview               geschützt, mit echtem Datenstatus
6. Öffentlich            erst danach, und als eigene Entscheidung
```

Die Schritte 1 und 2 sind unabhängig voneinander und beide zwingend.
Schritt 1 ohne Schritt 2 ergibt ein System, das könnte, aber nicht dürfte.

## Abgrenzung

Dieses Dokument beschreibt **keine** Deployment-Lösung. Es nennt den
Commit, den ein Preview integrieren muss, und die Sperren, die dabei
stehen bleiben.

Wie das Preview geschützt wird — Anmeldung, Zugriffssteuerung, Hosting —
gehört in den dafür vorgesehenen Workstream. Aus diesem hier kommt keine
konkurrierende Variante: zwei Deployment-Wege nebeneinander wären genau die
Sorte Doppelung, bei der irgendwann der ungeschützte gewinnt.
