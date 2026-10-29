# Supertrader 8.0 – erste Veröffentlichung der Research-Kandidaten

Stand 29.10.2026. Einmalige, kontrollierte Veröffentlichung eines geprüften Kandidatenstands auf
`research.visionuniverse.de/supertrader/`. Es wird kein Zeitplan aktiviert. Alle 13 Methoden bleiben
`LIVE_NOT_APPROVED`, `VALIDATED_TRADE_SIGNAL` bleibt gesperrt, es gibt keine Orders.

## Weg

Es gibt keine zweite Pipeline. Der Stand entsteht mit dem Workflow aus #973
(`.github/workflows/supertrader-sf8-candidates.yml`, nur `workflow_dispatch`).

| Schritt | Wer | Was |
|---|---|---|
| 1 | Merge | Gate-A-PR: Registry-Schutz erlaubt `ACTIVATING`, Workflow committet nur den freigegebenen Fingerabdruck (`expected_sha256`) |
| 2 | Merge | Core-PR: `supertrader-sf8-candidates` von `PREPARED_DISABLED` auf `ACTIVATING`; Zustandstest DQ-SF8 unterscheidet „keine Daten“ und „veröffentlicht“ |
| 3 | Owner | Repository-Variable `SF8_CANDIDATES_ENABLED=true` |
| 4 | Lauf A | Dispatch auf `main` mit `commit=false`: Eingangsprüfung, Tests, DQ-SF8-1..8, Budget, Fingerabdruck im Log und in der Zusammenfassung |
| 5 | Owner | Freigabe genau dieses Fingerabdrucks (Vorlage unten) |
| 6 | Lauf B | Dispatch mit `commit=true` und `expected_sha256=<Fingerabdruck aus Lauf A>`. Bei Abweichung gibt es keinen Commit. |
| 7 | Owner | Variable zurück auf `false`. Ohne die Variable startet kein weiterer Lauf. |
| 8 | Deploy | `pages-release.yml` per `workflow_dispatch`. Ein Bot-Commit löst keinen Push-Deploy aus; sonst deployt der nächste gelistete Datenlauf. |

Die Eingangsprüfung verlangt die letzte abgeschlossene Sitzung vor dem Laufdatum (UTC). Ein Stand ist deshalb nur
an seinem Lauftag freigebbar. Lauf A und Lauf B gehören auf denselben UTC-Tag. Die Ausgabe enthält keinen
Zeitstempel und ist bei gleichen Eingaben bytegleich: 531 von 531 Dateien in zwei Läufen gleich.

## Geprüfter Stand (lokal, `main` 713e25ae, Lauftag 29.10.2026)

| Punkt | Ergebnis |
|---|---|
| Marktstand | Tagesschluss **28.10.2026** (XNYS), nächste Sitzung 29.10.2026; Eingangsprüfung `CURRENT` |
| Erzeugung | 29.10.2026, 5.099 Titel, 49 s, 0 Netzabrufe |
| Kandidaten | **3.225** in 1.831 Aktien: 2.091 Chart-Kandidat, 1.078 bestätigtes Setup, 56 modellierter Ablauf, 0 `VALIDATED_TRADE_SIGNAL` |
| Öffentliche Dateien | 518 (summary, index, 13 Strategiedateien, 503 Aktien-Scherben), 12,0 MB, größte Datei unter 2 MB; `records/` nur im CI-Artefakt |
| Fingerabdruck | `9eab22822289a7b2f15b62481481b9cb686cd8317748e2a4fa3a3d02a282372d` |
| DQ-SF8-1..8 | alle PASS: Stand 28.10., Identität 3.225/3.225, Stufensperren 9.740, keine Order-/Stopmarke unter MODELED 6.338, Quarantäne 9.740, Verträge 516, Budget 518, Preisabgleich V4 3.225/3.225 |
| Produkttests | `sf-*` 602/0; Supertrader gesamt 942/0 mit veröffentlichten Daten und `ACTIVATING` |
| Core | 299/299 mit Daten und `ACTIVATING` (nach Anpassung des Zustandstests); `state-gate` grün; `system-health` SF8 OK (3.225 Datensätze, 28.10.) |
| Browser | Auslieferungsartefakt mit Daten: Supertrader-QA 64/0; Funktionsprüfung 52/52 (Filter, Sortierung, Suche, Tabs, Chart, Link zur Aktie; Desktop und iPhone, hell und dunkel) |
| Referenz-Ledger | unverändert: der Lauf schreibt nur in sein Ausgabeverzeichnis, das Repository bleibt sauber |

## Voraussetzungen: was für diese eine Veröffentlichung zwingend ist

| Voraussetzung | Einmalig | Dauerbetrieb | Stand |
|---|---|---|---|
| Eingangsprüfung (Tagesbalken = letzte Sitzung, Nebenquellen im Höchstalter) | ja | ja | erfüllt. Security Master 47,4 von 60 Tagen (Grenze am 10.11.), Namen 17,8 von 45 Tagen |
| DQ-SF8-1..8 und Preisabgleich V4 | ja | ja | erfüllt |
| Registry `ACTIVATING` | ja | ja, danach Feld entfernen (eigene Freigabe) | Core-PR (Draft) |
| Variable `SF8_CANDIDATES_ENABLED` | ja, nur für Lauf A und B | ja | Owner |
| S1–S5: Nachtläufe, SEC-Consumer, Nebenquellen-Takt | nein | ja | offen (#1099) |
| S6: Turnus Security Master | nein; das Alter prüft die Eingangsprüfung | ja | nicht erfüllt |
| S7: core `data-quality` ohne ERROR | siehe nächster Absatz | ja | DQ-PX-4 ERROR (4 Titel) |

**DQ-PX-4** (Tages- und Wochenreihe widersprechen sich: ENLV, NUWE, PARA, SCAG; Split in der Wochenreihe nicht
nachgezogen) ist ein bestehender Befund auf `main`. Von den vier Titeln ist nur NUWE Kandidat (C11, bestätigtes
Setup). C11 liest nur Tagesbalken, die Wochenreihe liest nur C03 für das Allzeithoch. Der NUWE-Schluss 5,66 $ ist
der veröffentlichte Schluss (DQ-SF8-8). DQ-TW-3 ist auf `main` grün.

## Nutzungsrechte

- Grundlage ist die Owner-Erklärung vom 13.09.2026 (`quant/config/development-preview.json`). Sie umfasst die öffentliche
  Anzeige von Tiingo-Marktdaten, roh und abgeleitet, für das Produktuniversum. Der Vertragstext liegt dem Repository
  nicht vor, und eine eigene Rechtsprüfung gab es nicht.
- Technisch geprüft:
  - alle 1.831 Kandidaten-Aktien liegen im erklärten Umfang (6.687 Titel);
  - für jede liegt bereits eine öffentliche Tagesschlussreihe vor (`quant/data/market/discover-series`);
  - die Dateien enthalten Tagesschluss, daraus abgeleitete Kennzahlen und Marken, keine Intraday- oder Realtime-Daten;
  - die Seite nennt „Tiingo, Inc.“ als Quelle.
- Die Passwortmaske ist rein clientseitig. Die Dateien sind direkt abrufbar, und das Repository ist öffentlich. Die
  Veröffentlichung ist deshalb eine öffentliche Auslieferung.
- **Nur der Owner kann bestätigen**, dass der Tiingo-Vertrag diese Auslieferung als herunterladbare JSON-Dateien erlaubt.
  Ohne diese Bestätigung wird nicht veröffentlicht.

## Was sichtbar wird

- Unterhalb von MODELED: nur Chartstruktur und beschreibende Kennzahlen. Sperrlisten und Allowlist gelten wie in DQ-SF8-4.
- **56 modellierte Abläufe** (C07 Power Play 5, C08 Momentum Breakout 18, C12 Episodic Pivot 33) tragen einen
  hypothetischen Plan:
  - Art (z. B. `BUY_STOP_LIMIT_NEXT_SESSION`), Einstiegsmarke, Stop, Limit, früheste Sitzung, Risikoanteil;
  - die Seite zeigt sie als „Modellierter Ablauf (hypothetisch) … Keine Order, keine Empfehlung“ und zeichnet
    Einstiegs- und Stopmarke in den Chart.

  Der Vertrag erlaubt das genau auf dieser Stufe. Öffentlich wirkt es trotzdem wie ein Orderhinweis. Soll das nicht
  öffentlich sein, braucht es eine fachliche Änderung im Erzeuger (eigener PR mit Vorher/Nachher). Sie ist nicht
  vorbereitet.
- Bekannte Methodengrenze: Übernahmekandidaten erscheinen bei Power Play und Momentum Breakout als „enge Basis“
  (Beispiel BMBL: +134 % am 12./13.10., seitdem 5,93–5,98 $). Das ist kein Datenfehler, und die Regeln bleiben
  unverändert.

## Nach der Veröffentlichung

- Ohne weiteren Lauf altert der Stand:
  - die Seite zeigt ab dem 30.10. „nicht aktuell, kein Hinweis für heute“;
  - `system-health` meldet die Datenart nach zwei Sitzungen STALE (nicht kritisch);
  - DQ-SF8-1 schlägt ab dann im Bericht fehl.

  Das ist der wahre Zustand und wird nicht grün gemacht. Kein Pflicht-Check wird rot: `--strict` läuft nur im
  geplanten `live`-Job, der `continue-on-error` hat.
- Der Zustandstest im Core prüft bei veröffentlichten Daten DQ-SF8-2..8. DQ-SF8-1 hängt vom Kalendertag ab und
  steht im Bericht.
- **Erneuern:** derselbe Ablauf mit neuer Freigabe (Lauf A, Freigabe, Lauf B).
- **Zurückziehen:** in einem eigenen PR
  - die Dateien unter `supertrader/data/sf-candidates/` entfernen;
  - den Zustand auf `PREPARED_DISABLED` setzen;
  - danach zeigt die Seite wieder „Research-Kandidaten folgen“.

## Freigabevorlage

```
Freigabe erste Veröffentlichung Supertrader-Research-Kandidaten

Lauf A:             <Run-ID>, main <SHA>, Lauftag <JJJJ-MM-TT> (UTC)
Fingerabdruck:      <sha256 aus Lauf A>
Marktstand:         Tagesschluss <JJJJ-MM-TT>, Eingangsprüfung CURRENT
Kandidaten:         <n> (Chart <a> / bestätigt <b> / modelliert <c> / VALIDATED 0), 518 öffentliche Dateien, <MB> MB

[ ] 1 Daten:        summary, index, 13 Strategiedateien, Aktien-Scherben; keine records/
[ ] 2 Datum:        Marktstand und Lauftag wie oben; Seite zeigt „Datenstand“ und ab der Folgesitzung „nicht aktuell“
[ ] 3 DQ:           DQ-SF8-1..8 PASS in Lauf A; DQ-PX-4 (NUWE, C11 nur Tagesbalken) zur Kenntnis genommen
[ ] 4 Rechte:       Ich bestätige, dass der Tiingo-Vertrag die öffentliche Auslieferung dieser Dateien
                    (Tagesschluss, abgeleitete Kennzahlen, Marken) erlaubt.
[ ] 5 Parameter:    keine Order-/Stopmarke unter MODELED (DQ-SF8-4); die modellierten Abläufe mit hypothetischem
                    Plan dürfen öffentlich erscheinen  [ ] ja  [ ] nein -> nicht veröffentlichen, fachlicher PR zuerst
[ ] 6 Kein Zeitplan: Workflow nur workflow_dispatch; Variable nach Lauf B zurück auf false

Freigegeben: ____________  Datum: __________
```
