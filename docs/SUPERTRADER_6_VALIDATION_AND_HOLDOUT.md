# Supertrader 6.0 – Validierung, Holdout 2008–2015, Modellvarianten und Minervini-EPS-Evidenz

Stand: 24. Oktober 2026. Alle Ergebnisse sind `DIAGNOSTIC_NOT_CERTIFIED`; alle Strategien bleiben `LIVE_NOT_APPROVED`. Die Kennzahlen liegen versiegelt beim Eigentümer.

Code:
- `scripts/supertrader/source-faithful/research/run-sf6-validation.mjs` (Protokoll `SF6-VALIDATION-PROTOCOL` 1.1.0)
- `sf6-references.mjs`
- `sf6-model-variants.mjs` (1.1.0)
- `minervini-fundamentals-sf6.mjs`

Läufe:
- DEV [40001421221](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40001421221)
- Holdout-Erfassung [39998409317](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39998409317)
- Holdout [40007428374](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40007428374)

## 1. Holdout 2008–2015: ein historisch bereits genutzter, survivorship-belasteter Testzeitraum

Snapshot `sts1-85959e4bab0681baa6ed221bee94821e` (Generation 2, Fenster `HOLDOUT`), mit eigenem Zeiger `SNAPSHOT-POINTER-HOLDOUT.json`. Der DEV-Zeiger bleibt unberührt.

**Dieser Zeitraum ist kein unberührter Holdout.**
- **Bereits genutzt:** Das Fenster wurde in Runde 14 (`PREREGISTRATION-R14.json`, Audit R14) einmal geöffnet, damals für andere Strategie-Implementierungen. Die buchgetreuen Lifecycles wurden zwar vor diesem Lauf festgeschrieben. Ihre Entwickler kannten aber die R14-Ergebnisse dieses Zeitraums.
- **Survivorship-belastet:**
  - Die Tickerliste ist für alte Delistings lückenhaft. Nur 813 von 6.427 Listings sind am Stichtag inaktiv, 678 von 5.221 Segmenten enden mit einem Delisting.
  - Ergebnisse sind damit **nach oben verzerrt**.
- **Kein Kriterium:** Er erfüllt kein Zertifizierungskriterium (CC-8, Kriterien 1.2.0). In der Matrix erreicht er höchstens „belegt mit deklarierten Grenzen“ in der Dimension Out-of-Sample.
- **Unberührter Holdout:** Der einzige vorgesehene ist das prospektive Paper-Protokoll ab 1.1.2027 (Eigentümerentscheidung E2; Readiness-PR).

Was der Lauf zeigt, ohne Performanceaussage:
- Alle 11 Referenzen und alle 3 Modellvarianten sind im zweiten Zeitraum lauffähig und abgestimmt.
- Die Tradezahlen der Referenzen:

| Referenz | Turtle S1 | Turtle S2 | SEPA | Power Play | Darvas | Kullamägi | Pocket Pivot | BGU | Weinstein I | Weinstein T | Holy Grail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Trades | 716 | 530 | 522 | 425 | 11.869 | 5.722 | 1.415 | 2.116 | 995 | 1.296 | 3.253 |

## 2. Modellvarianten: Forschungsvarianten, keine Originalregeln (E3)

Eigentümerentscheidung E3 vom 24.10.2026:
- Die Varianten bleiben explizite Forschungsvarianten und sind keine Originalregeln.
- Die Messklassen der Strategien werden nicht aufgewertet.
- Die Referenzen bleiben bei 8/9 Phasen; die Vertragsstatus ändern sich nicht.

| Variante | Strategie | Was sie tut | deklarierte Nebenwirkung |
|---|---|---|---|
| `MA6-PP-STOP-SIGNAL-DAY-LOW` | Pocket Pivot (C11) | Stop am Tief des Signaltags; eine VU-Analogie zur BGU-Gap-Tagestief-Präferenz, nicht die Praxis der Autoren | DEV: 32.413 Einstiege abgelehnt, weil die Eröffnung am oder unter dem Stop lag (wirkt als Einstiegsfilter); 4.534 statt 1.872 Trades |
| `MA6-HG-TRAIL-SWING-LOWS` | Holy Grail (C13) | Trailing über Swing-Tiefs; ersetzt den Neuhoch-Ausstieg (Phasen Positionsführung und Ausstieg) | DEV: 884 Stop-Anhebungen, 2.217 statt 4.025 Trades |
| `DA6-DAR-ATH-VERIFIED-LISTING` | Darvas (C03) | Abdeckungsvariante: Allzeithoch nur bei vollständiger Historie der Tiingo-Listing-ID | Verzerrt zu jungen Listings; kein Nachweis des wirtschaftlichen Listing-Datums |

## 3. Turtle-Korrelationsgruppen (E4)

Die SIC-basierten Gruppen aus Supertrader 3.0 bleiben Research-Proxys. Es gibt keine Zertifizierung auf ihrer Grundlage. Die Turtle-Referenzen dieses PRs laufen ohne Korrelationslimits (`NOT_EVALUATED_NO_PIT_GROUPS`, unverändert).

## 4. Minervini-EPS-Evidenz: Was die Korrektur verändert und was sichtbar bleibt

Nach der Korrektur ist die Evidenz entweder belegt korrigiert oder offen markiert, nie still verändert.
- **Was korrigiert wird:** Nur Quartale, bei denen zwischen den beiden Einreichungsdaten ein in den Kursdaten deklarierter Split liegt. Belegt ist er durch den Tiingo-`splitFactor`, der als Verhältnis `splitAdj` beider Daten eingeht; beide Daten liegen vor der Entscheidung. Dann wird der Vorjahres-EPS durch den Faktor geteilt.
- **Was nicht korrigiert wird:**
  - Für jedes Quartal ohne bestimmbaren Faktor steht das Wachstum auf `null`, mit `UNDETERMINABLE_SPLIT_FACTOR` bzw. `UNDETERMINABLE_DERIVED_Q4`. Ein abgeleitetes Q4 (Geschäftsjahr minus Q1–Q3) kann gemischte Einheiten enthalten.
  - Der unbereinigte 4.0-Wert wird nicht still weiterverwendet.
  - Die 4.0-Felder bleiben unverändert erhalten, `changedVsV1` zeigt jede Abweichung.
- **Wirkung:** Die Evidenz ist kein Gate, es ändert sich kein Trade.

| | DEV | Holdout |
|---|---|---|
| SEPA-REF-Einstiege | 954 | 522 |
| davon mit PIT-Fundamentals | 762 | 278 |
| mit mindestens einem korrigierten Quartal (belegter Split) | 29 | 7 |
| mit mindestens einem **ungeklärten** Quartal (bleibt sichtbar) | 405 | 46 |
| letztes YoY-Wachstum geändert (korrigiert oder auf `null` gesetzt) | 75 | 12 |
| Beschleunigung geändert | 129 | 15 |

Die 405 ungeklärten Fälle sind kein Fehler der Korrektur. Sie sind offen gelegte Unsicherheit, überwiegend abgeleitete Q4-Werte. Beheben ließe sich das nur mit einer Neuextraktion von sec-pit, die die Vergleichswerte derselben Einreichung enthält. Das wäre ein eigener Quant-PR.

## 5. Reproduzierbarkeit, Trade-Stabilität und Robustheit (E6)

Drei verschiedene Aussagen, die nicht verwechselt werden dürfen:

| Begriff | Bedeutung | Stand |
|---|---|---|
| **numerische Reproduzierbarkeit** | gleiche Eingaben und gleicher Code ergeben bitgleiche Ledger und Trades | **belegt**: Die REF-Stufe aller 11 Referenzen ist ledger-hash-identisch mit den maßgeblichen Läufen aus 2.0–5.0; bei 9 sind auch die Trade-Hashes identisch (Turtle veröffentlicht nur den Ledger-Hash) |
| **Trade-Stabilität** | kleine Eingabeänderungen lassen die einzelnen Trades unverändert | **gering**: Unter der Quarantäne bleiben bei Kullamägi 31 %, Turtle S1 16 %, Pocket Pivot 10 % und Holy Grail 9 % der Trades gleich; bei SEPA 94 %, Darvas 92 %. Auch Kostenstufen verschieben die Tradezahl stark (Darvas 19.556 → 7.343 bei 50 bps) |
| **Robustheit** | eine Aussage über eine Strategie hält über Zeiträume, Kosten und Datenvarianten | **nicht belegt**: Die Kennzahlen sind versiegelt und nicht bewertet; der Holdout ist bereits genutzt und verzerrt; ein unberührter Zeitraum fehlt |

Bewertet wird künftig nur auf Ebene von Kennzahlen und Verteilungen (E6). Die geringe Trade-Stabilität der kapazitätsgebundenen Modellstudien ist dabei ein eigener, sichtbarer Befund.
