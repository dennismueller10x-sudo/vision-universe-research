# Supertrader 7.0 – Minervini: Klassifikation der 154 nicht abgedeckten Fundstellen (Entscheidung E7-2)

Stand 25.10.2026. Artefakt: `scripts/supertrader/source-faithful/evidence/MINERVINI-SF7-FINDINGS-CLASSIFICATION.json`. Disposition und Prüfung: `completion/build-minervini-source-inventory.mjs` (`E72_DISPOSITION`, Block `findings154`). Test: `tests/sf-sf7-minervini.test.mjs`.

Das Repository enthält keinen Buchtext. Jede Fundstelle wird über ihre ID, die PDF-Seite, eine deutsche Paraphrase und den SHA-256 der Originalstelle referenziert (`MINERVINI-SF7-FINDINGS.json`).

## 1. Ergebnis

| Klasse | Anzahl | Bedeutung |
|---|---:|---|
| CONFIRMS | 36 | bestätigt eine bestehende Vertragsregel; Status unverändert |
| REFINES | 14 | präzisiert eine bestehende Regel, z. B. eine Schwelle, ein Fenster oder eine Variante |
| NEW_IMPLEMENTABLE | 17 | neue, mechanisch umsetzbare Regel oder Diagnose |
| QUALITATIVE | 54 | beschreibt eine Ermessensentscheidung des Traders; nicht mechanisierbar |
| NOT_RELEVANT | 33 | Anekdote, Psychologie, Marktgeschichte oder außerhalb des Vertragsumfangs |
| **Summe** | **154** | |

18 Fundstellen tragen einen Übersetzungs- oder OCR-Zweifel (`translationDoubt`):
- 13 davon sind NOT_RELEVANT;
- 4 sind CONFIRMS;
- 1 ist NEW_IMPLEMENTABLE, nämlich F7-B03-216-086 (Klimax-Diagnose). Sie liegt ohnehin bei der Owner-Entscheidung.

Keine Fundstelle mit Zweifel hat eine Vertragsregel verändert.

## 2. Disposition der 31 Fundstellen NEW_IMPLEMENTABLE und REFINES

| Disposition | Anzahl | Fundstellen |
|---|---:|---|
| IMPLEMENTED | 8 | F7-B03-041-011, -047-015, -048-017, -160-064, -168-067, -217-088, F7-B12-250-264, -311-297 |
| IMPLEMENTED (nur Diagnose) | 1 | F7-B03-047-016: Close unter MA20 wird gezählt; der Halbverkauf selbst ist eine Ausstiegsregel |
| DEFERRED | 16 | Basiszählung (4), PIT-KGV und EPS-Beschleunigung (3, EPS-Datenqualität), Chase-Grenze (4, k unquantifiziert), Order- und Stop-Varianten (3), Pullback (1), Top-Volumen (1) |
| OWNER | 2 | F7-B03-212-085, -216-086: Klimax-Verkauf, Entscheidung E7-7 |
| NOT_IN_SCOPE | 4 | Cup/Cheat- und IPO-Familie (ausgeschlossene Vertragsvarianten) |

Implementiert sind ausschließlich **Diagnosen und Belege**. Sie stecken in `postBreakoutEvidence` (`research/minervini-sf7.mjs`, Version `sf7-minervini-1.3.0`) mit der neuen Modellannahme `MA-MIN7-POST-BREAKOUT-WINDOW` (10 Sitzungen). Umgesetzt sind:
- `healthy3of4` / `healthy6of8`, `longestUpRun`
- `lowerLowsOnVolume` (3 tiefere Tiefs bei Volumen über dem 50-Tage-Mittel) und `lowerLowsCleared`
- `closeBelowMa20InWindow`
- `weeklyDeclineSignalBeforeExit`
- `baseDepthAbove50` / `baseDepthAbove60`
- `rsLineHighBeforePrice`

Keine dieser Diagnosen ändert einen Einstieg, einen Ausstieg, eine Positionsgröße oder einen Fill.

Maßgeblicher Lauf ist [40172178386](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40172178386) auf `895a5cd` (Code `sf7-minervini-1.3.0`, Hash `7441237b…`, gepinnt vor dem Lauf), Datensatz `EXACT`. Ergebnisse:
- SEPA-REF hat 954 Trades, Power-Play-REF 1.007 Trades, beide **ledger-identisch** mit 4.0. Die Ledger-Hashes `1ca52391…` und `877ceb33…` sind gegenüber dem 1.2.0-Lauf unverändert.
- Die Varianten haben unverändert 824 / 982 / 890 Trades.

Version 1.3.0 setzt ein unabhängiges Review der 1.2.0-Diagnosen um (1 HIGH, 3 MEDIUM, 6 LOW):
- **HIGH:** In 1.2.0 las die Diagnose bei geschlossenen Trades die Ausstiegssitzung mit. Ihr Schluss liegt aber nach dem Ausstieg.
- Die Basistiefe wird jetzt vom Basisstart gemessen, nicht mehr als tiefste Einzelkontraktion.
- Das RS-Linienhoch wird gegen das eigene Preishoch geprüft.
- Die Wochenlesart braucht Stage 2 am Setup und mindestens 4 Vorwochen (`MA-MIN7-WEEKLY-STEP`).
- Der größte Rückgang ohne Stage 2 am Setup gilt als „nicht bewertbar“.

Die 1.2.0-Zählungen (Lauf 40170379663) sind damit überholt. Die Änderung folgt Review-Defekten, nicht Ergebnissen; die Referenz ist unberührt.

Diagnosezählungen (nur Zählungen, die Kennzahlen bleiben versiegelt):

| Diagnose | SEPA (954) ja / nein / n. a. | Power Play (1.007) ja / nein / n. a. |
|---|---|---|
| `healthy3of4` | 391 / 398 / 165 | 298 / 263 / 446 |
| `healthy6of8` | 181 / 472 / 301 | 118 / 287 / 602 |
| `lowerLowsOnVolume` | 21 / 933 / 0 | 16 / 991 / 0 |
| `lowerLowsCleared` (nur bei Verletzung) | 10 / 11 / – | 8 / 8 / – |
| `closeBelowMa20InWindow` | 324 / 630 / 0 | 27 / 980 / 0 |
| `weeklyDeclineSignalBeforeExit` | 138 / 215 / 601 | 39 / 136 / 832 |
| `baseDepthAbove50` | 0 / 954 / 0 | 361 / 583 / 63 |
| `baseDepthAbove60` | 0 / 954 / 0 | 319 / 625 / 63 |
| `rsLineHighBeforePrice` | 63 / 891 / 0 | 203 / 741 / 63 |

Größter Tagesrückgang bei Power Play: In 558 von 1.007 Trades bestand am Setup keine Stage 2 (Trend Template nicht bestanden), daher nicht bewertbar. Signal 260, kein Signal 185, offen 4. SEPA ist unverändert, weil jedes SEPA-Setup das Trend Template besteht.

„n. a.“ hat je Feld eine eigene Ursache:
- **`healthy3of4` / `healthy6of8`:** Der Trade sah weniger als 4 bzw. 8 Sitzungsschlüsse vor dem Ausstieg.
- **Wochenlesart:** Stage 2 fehlte am Setup, oder es lagen weniger als 4 Vorwochen vor.
- **Basistiefe und RS-Linie bei Power Play (63):** Vor dem Setup lagen weniger als 252 Sitzungen.

Dass auch nach der korrigierten Messung keine SEPA-Basis tiefer als 50 % ist, wurde nicht gesondert untersucht. Die Diagnose ist kein Gate und wurde nicht zur Variantenwahl verwendet.

Zurückgestellt sind alle Punkte, die Trades verändern würden. Dazu gehören Chase-Grenze, Buy-Stop-Aufschlag, Stop-Fallback, Sizing-Progression und relativer Basis-Tiefenfilter. Sie brauchen eine Modellannahme, also einen vor dem Test festgelegten Parameter, und dürfen nicht nach Ergebnissen gewählt werden.

Die Basiszählung braucht zwei vorregistrierte Modellannahmen:
- die Identifikation einer Basis;
- den Reset nach einer Marktkorrektur.

Beides definieren die Bücher nicht. Dafür ist keine Owner-Entscheidung nötig, aber ein eigener Schritt.

## 3. Zwei Übersetzungen als Quellenbeleg

Die Trend-Template-Regeln TT-1 bis TT-5 und TT-7 stimmen in zwei unabhängigen Übersetzungen überein: B12 PDF 114 (indonesisch) und B03 PDF 143 (lizenzierte vietnamesische Übersetzung). Der SEPA-Vertrag `1.4.0` vermerkt das je Regel als `CROSS_TRANSLATION` mit `result: CONSISTENT`, `statusEffect: none (not SOURCE_EXACT)`.

Kein Regelstatus wurde angehoben. SOURCE_EXACT setzt den englischen Originalwortlaut voraus, und der liegt nicht vor.

## 4. Grenzen

- **Ein Leser pro Fundstelle:** Gegen das Original wurde nur stichprobenweise doppelt gelesen (rund 40 Zitate). Klassifikationen QUALITATIVE und NOT_RELEVANT wurden nicht zweitgeprüft.
- **OCR-Ziffern:** B03 ist ein Bild-PDF, der Text stammt aus Tesseract-OCR. Ziffern sind dort OCR-empfindlich (`BOOKS.B03.text`). Implementiert wurden aus B03 nur Diagnosen, keine handelsrelevanten Schwellen.
- **Ausstiegsregeln:** Eine verbindliche neue Minervini-Ausstiegsregel (Klimax, MA20-Halbverkauf) gibt es nur mit ausdrücklicher Zustimmung des Owners (E7-7).
