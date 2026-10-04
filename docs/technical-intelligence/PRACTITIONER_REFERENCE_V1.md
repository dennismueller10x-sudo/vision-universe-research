# PRACTITIONER_REFERENCE_V1 — Datensatzbericht

Stand: 04.10.2026. **Status: NICHT EINGEFROREN — 0 Fälle.** Dieser Bericht dokumentiert Methodik, Werkzeuge und den Grund, warum noch kein Fall extrahiert wurde. Er wird beim Freeze durch den echten Datensatzbericht ersetzt (§108).

> Eine Praktiker-Zählung ist **PRACTITIONER REFERENCE**, keine **OBJECTIVE GROUND TRUTH**.

## 1. Warum es noch keine Fälle gibt

Die Build-Umgebung dieser Mission kann keine einzige Primärquelle abrufen. Die Netzwerk-Policy der Umgebung lehnt die Verbindungen ab (HTTP 403 am Egress-Proxy), auch über das Abrufwerkzeug:

| Ziel | Ergebnis |
|---|---|
| youtube.com (HKCM, Phantom by HKCM, More Crypto Online, EWI-Kanal) | blockiert |
| x.com, nitter.net | blockiert |
| hkcm.de, aktiencheck.de, trading-treff.de (Kolumnen Philip Hopf) | blockiert |
| elliottwave.com, elliottwave-forecast.com, elliottwavetrader.net, neowave.com | blockiert |
| stock3.com, de.investing.com, finanzmarktwelt.de, onvista.de, fxstreet.com, tradingview.com | blockiert |
| web.archive.org / archive.org (Originalzustände, Zeitstempel) | blockiert |

Verfügbar ist nur eine Websuche, die Titel, Adresse und eine **maschinell erzeugte Kurzfassung** liefert. Diese Kurzfassungen sind keine Primärquelle: kein Chart, keine sichtbaren Wellenlabels, Zeitpunkt meist nur aus dem Titel, Zahlen paraphrasiert und nicht prüfbar. Nach Protokoll §7 (nur HUMAN_FROM_PRIMARY oder LLM_DRAFT_HUMAN_REVIEWED, keine Halluzination, auditierbare Fundstelle) ergeben sie höchstens Sicherheit LOW — **nicht benchmarkfähig**. Dieselbe Entscheidung wurde bereits in Mission II getroffen: Der damalige Satz aus Suchzusammenfassungen wurde geleert.

Es wurden **keine** Zugangsbeschränkungen umgangen (§106) und **keine** Fälle erfunden (§105).

## 2. Was fertig ist

| Baustein | Ort |
|---|---|
| Vorab registriertes Protokoll inkl. Nachtrag 1 (nach Red-Team, vor Daten) | `PRACTITIONER_PROTOCOL.md` |
| Schema `practitioner-reference-1.0.0` | `quant/data/technical-intelligence/practitioner-v1/schema/` |
| Quellenverzeichnis (12 Quellen, Qualitätsmatrix, vorläufige Stufen, Quellenfamilien, Stichprobenrahmen-Felder) | `practitioner-v1/source-registry.json` |
| Discovery-Queue (14 Fundstellen, nur Metadaten; keine Stichprobe) | `practitioner-v1/discovery-queue.json` |
| Instrumentabbildung (Cash-Index/ETF/Future/CFD, Proxy-Skalen, UNMAPPED z. B. DAX) | `practitioner-v1/instrument-map.json` |
| Werkzeuge: Validierung, Stichtag (Zeitzonen/Sommerzeit/Börsenschluss), Duplikate/Cross-Posts, Revisionsketten, Aufteilung, Freeze mit SHA-256, blinder Replay mit Leckschutz, Kennzahlen A–K/S, Mensch–Mensch, Ergebnisschicht getrennt | `scripts/technical/practitioner/` |
| Interne Vergleichs- und Erfassungsseite (Blindmodus, Formular, blinde Zweitextraktion mit Feldvergleich, Audit-Log) | `quant/research/elliott-practitioners/` |
| Tests (Zeitstempel, Stichtag nie nach Veröffentlichung, Datenleck, Duplikate, Reposts, Revisionen, Instrumentabbildung, Freeze-Sperren) | `quant/tests/practitioner-*.test.mjs` |

## 3. Freeze-Qualitätsgate (§107)

| Kriterium | Stand |
|---|---|
| ≥ 2 (besser 3) unabhängige Quellen | 0 |
| ≥ 100 nutzbare Fälle | 0 |
| ≥ 70 % HIGH | – |
| mehrere Instrumente, Jahre, Musterklassen | – |
| dokumentierte Ein-/Ausschlusskriterien | erfüllt (Protokoll) |

**Gate nicht erreicht.** Kein Freeze.

## 4. Bekannte Verzerrungen, die der künftige Datensatz haben wird

Publikationsverzerrung (Gewinner werden hervorgehoben; HKCM wirbt öffentlich mit einer Trefferquote), Löschverzerrung (gelöschte Inhalte unsichtbar), Bearbeitungen (Titel/Beschreibungen editierbar), Quellen-Schwerpunkte (HKCM/Phantom stark Krypto, EWF stark Intraday, Tiedje DAX-Future), Instrumentlücken (DAX ohne VU-Reihe; Einzelaktien täglich nur ein Jahr lokal), Extraktionssubjektivität (wird über Doppelextraktion gemessen).

## 5. Nächster Schritt

Extraktion durch Menschen mit Zugang zu den Quellen über `quant/research/elliott-practitioners/` (Formular → JSONL → `references.jsonl`), oder Freigabe der Domains in der Netzwerkeinstellung dieser Umgebung. Danach: Stichprobenrahmen je Quelle festlegen und committen, Pilot 20–30 Fälle, Doppelextraktion 25 %, Freeze, blinder Benchmark.
