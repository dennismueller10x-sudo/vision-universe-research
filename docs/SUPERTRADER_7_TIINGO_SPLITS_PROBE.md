# Supertrader 7.0 – Probe des Tiingo-Splits-Endpunkts (Corporate Actions)

Stand: 25. Oktober 2026. Reine Probe, `DIAGNOSTIC_NOT_CERTIFIED`. Sie ändert nichts an Overlay, Quarantäne, CC-5 oder einem Status. Branch `claude/supertrader-7-tiingo-splits-probe`, ohne PR und ohne Merge.

**Ergebnis:** **Kein Zugang.**
- Alle drei Anfragen der Zugangsprobe antworteten mit **HTTP 403** und **leerem Antworttext**.
- Wie vorab festgelegt, endete der Lauf nach Stufe A; Stufe B (Abdeckung der 83 Sitzungen) lief nicht.
- Mit dem bestehenden Tiingo-Zugang lassen sich die 83 Sitzungen über diesen Endpunkt also **nicht** auflösen.

## Anlass (Eigentümeranfrage 25.10.2026)

Vor einem Anbieterkauf soll der bestehende Tiingo-Zugang ausgeschöpft werden.

Ausgangslage:
- Das Repository speichert je Tagesbalken nur `splitFactor`, `adjClose` und `divCash` (`validation/lib.mjs#toRawBar`).
- Der Corporate-Actions-Splits-Endpunkt wurde bisher nie abgefragt, und `permaTicker` kommt im Code nicht vor.
- Laut Tiingo-Dokumentation ist der Endpunkt „included for all customers with the End-of-Day endpoint entitlement“ und zugleich „available to Beta-enabled customers … as an early release product“.
- Lizenz: Die Freigabe vom 01.10.2026 deckt Abruf, private Ablage und interne Auswertung im bestehenden Abonnement. Es entstehen keine neuen Kosten.

## Vorregistrierung

Code: [`research/run-sf7-tiingo-splits-probe.mjs`](../scripts/supertrader/source-faithful/research/run-sf7-tiingo-splits-probe.mjs), Modus `sf7-tiingo-splits-probe`, mit Snapshot- und research-v1-Pflicht.
- Die Spezifikation `PROBE_SPEC` ist vor dem Lauf festgeschrieben: Hash `76b70088060119319c8196d36c22589fdd7f22e3182b5ecca07b6b55dc1c6eac`, Test SF7-TIINGO-SPEC.
- **Stufe A:** höchstens 4 Anfragen, feste öffentliche Beispiele, keine Projektdaten:
  1. `aapl` je Ticker ab 2020-01-01: erwartet 4:1 am 2020-08-31;
  2. `ge` je Ticker ab 2021-01-01: erwartet 1:8 um den 2021-08-02 (±3 Tage);
  3. Batch `exDate=2020-08-31`: erwartet `aapl` 4:1.
  - Das optionale Beispiel eines delisteten Emittenten wurde **ausgelassen**: Keiner ließ sich aus öffentlichem Wissen sicher benennen.
  - Zugang gilt als belegt, wenn 1 und 2 mit HTTP 200 eine Liste liefern.
- **Stufe B:**
  - höchstens 90 Anfragen, sequentiell, mindestens 1 s Abstand, 30 s Zeitlimit, keine Wiederholung, fail closed;
  - die 83 Sitzungen genau wie in `run-sf7-ca-edgar.mjs`: 1.3.0 unverändert, die EDGAR-Indexabfragen nur aus dem privaten Cache (0 Anfragen);
  - eine Anfrage je Ticker ab dem frühesten Sitzungsdatum − 60 Tage;
  - Klassen `SPLIT_EVENT_IN_WINDOW` (±2 Sitzungen, Snapshot-Kalender), `SPLIT_EVENT_ELSEWHERE`, `NO_SPLIT_RECORDS`, `TICKER_NOT_FOUND`;
  - dazu: Rasterabgleich (`snapFactor`), `splitStatus`, Reason-Gruppen, Vergleich mit dem EOD-`splitFactor` desselben Snapshots, `permaTicker` für die Sitzungen ohne CIK.
- Der Schlüssel geht nur im Header `Authorization: Token …` mit, nie in einer URL oder im Log. Fehlermeldungen werden ohne Token ausgegeben.

Tests: [`sf-sf7-tiingo-splits-probe.test.mjs`](../scripts/supertrader/tests/sf-sf7-tiingo-splits-probe.test.mjs), 5 Tests, synthetisch:
- Spezifikation und Hash;
- Zugangsprobe mit Ablehnung und harter Obergrenze;
- Klassen und EOD-Abgleich;
- Umfang und eine Anfrage je Ticker;
- fail closed ohne Snapshot, research-v1 oder Schlüssel.

## Lauf

| Lauf | Modus | Anfragen | Ergebnis |
|---|---|---|---|
| [40221353332](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40221353332) | `sf7-tiingo-splits-probe` | **3** (Stufe A), 0 (Stufe B) | Stopp nach Stufe A: kein Zugang |

**Stufe A im Einzelnen:**

| Anfrage | HTTP | Datensätze | Felder | erwarteter Split | `permaTicker` | Meldung |
|---|---|---|---|---|---|---|
| A1 `aapl` ab 2020-01-01 | **403** | 0 | – | nein | nein | leerer Antworttext |
| A2 `ge` ab 2021-01-01 | **403** | 0 | – | nein | nein | leerer Antworttext |
| A3 Batch `exDate=2020-08-31` | **403** | 0 | – | nein | nein | leerer Antworttext |

Die Tagesbalken-Abrufe des Projekts nutzen denselben Schlüssel mit demselben Header. Die Ablehnung betrifft deshalb wahrscheinlich die **Berechtigung für den Corporate-Actions-Endpunkt** (Beta / Early Release) und nicht den Schlüssel selbst. Tiingo liefert dazu keinen Meldungstext.

## Antworten auf die Fragen der Anfrage

- **Abdeckung der 83 Sitzungen:** nicht gemessen; Stufe B lief wegen fehlenden Zugangs nicht.
- **Unabhängige Quelle oder dieselben Daten wie der EOD-`splitFactor`?** Empirisch nicht prüfbar.
  - Der Probe-Code vergleicht je Ereignis, ob der EOD-`splitFactor` am Ex-Datum denselben Faktor trägt (dann dieselbe Tiingo-Quelle, also keine unabhängige Bestätigung).
  - Er zählt auch Ereignisse, die nur der Endpunkt oder nur die Tagesbalken kennen.
  - Ohne Zugang gibt es dazu keine Zahlen. Auch mit Zugang wäre der Endpunkt wahrscheinlich **keine** vom EOD-Feld unabhängige Quelle: Beide stammen von Tiingo. Er wäre aber womöglich ein faktortragender Beleg für Splits, die im EOD-Feld fehlen.
- **`permaTicker` für die 11 Sitzungen ohne CIK:** nicht prüfbar. Eine dauerhafte Tiingo-ID ersetzt außerdem keine CIK-Zuordnung zu SEC-Dokumenten.

## Schluss

- **Tiingo selbst kann die 83 Sitzungen derzeit nicht auflösen.** Der Corporate-Actions-Endpunkt ist für diesen Zugang gesperrt (HTTP 403).
- Klären ließe sich das nur mit Tiingo:
  - ob der Endpunkt im bestehenden Abonnement freigeschaltet werden kann, ohne neue Kosten;
  - ob er delistete Titel abdeckt und wie weit die Historie reicht.
- Bis dahin bleiben die Wege aus E7-1:
  - eine lizenzierte CA-Quelle (Sharadar / Massive), geprüft gegen die EDGAR-Labels;
  - oder die Annahme, dass die Quarantäne genügt.
- Es wurde nichts geändert: kein Overlay, keine Quarantäne, kein CC-5, kein Status.
