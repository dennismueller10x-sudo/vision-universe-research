# KI-Depots EDGE2-KI-A-PAPER und EDGE2-KI-B-PAPER – Wochenauftrag (geplanter Auftrag im Claude-Abo)

Forschung, nicht zertifiziert, nicht öffentlich. Läuft als geplanter Auftrag (neue Claude-Code-Sitzung je Lauf, im Abo des Owners), **nicht über die API**; `workers/vu-ask` bleibt den Nutzerfragen vorbehalten.

- **Depot A** (Hauptdepot): dieselbe Regel wie der blinde Backtest, [BLIND_PROTOKOLL.json](../../../../research/edge2/ki/BLIND_PROTOKOLL.json) mit [Ergänzung 1](../../../../research/edge2/ki/BLIND_ERGAENZUNG_1.json), Prompt [PROMPT_v2.md](../../../../research/edge2/ki/PROMPT_v2.md), anonymes Paket, 4–20 Titel mit Gewichten. Ledger `ledger-A.jsonl`.
- **Depot B** (nur vorwärts, ohne Backtest): dasselbe Paket plus Ticker, Analysten-Konsens und Schlagzeilen, ab der zweiten Entscheidung Prompt [PROMPT_B_v3.md](../../../../research/edge2/ki/PROMPT_B_v3.md) ([Ergänzung 2](../../../../research/edge2/ki/KI_ERGAENZUNG_2.json): 25 Kandidaten, eigene Nachrichtenrecherche, höchstens 3 Websuchen je Titel, Datum und URL im Ledger; die erste Entscheidung lief mit B v1). Ledger `ledger-B.jsonl`. Entscheidung der Steuerung vom 06.11.2026: B läuft getrennt protokolliert neben A, damit sich nach 3–12 Monaten zeigt, ob die Zusatzdaten etwas bringen.
- Prompts ändern sich nur mit neuer Datei `PROMPT_v<n>.md` bzw. `PROMPT_B_v<n>.md`, mit Begründung und neuer Ergänzung.
- Start: erste Entscheidung am 06.11.2026 (Daten bis 05.11.), danach eine Entscheidung je Kalendermonat in der ersten Dienstagssitzung des Monats. Jede Woche eine Kursmarke.
- News-Abdeckung für B ist dünn (Feed mit wenigen Einträgen; bei der ersten Entscheidung 0 von 50 Kandidaten mit Schlagzeile, 27 mit Analysten). Ab der zweiten Entscheidung steht die Abdeckung je Eintrag im Ledger (`coverage`).
- Ausführung: dauerhafte Sitzung „KI-Depot Wochenlauf“ (session_01DVwZC6yrLFdoNht7hPxsEe), geweckt durch den geplanten Auftrag dienstags 07:17 UTC; sie wird nicht archiviert.
- Abo-Grenze: je Lauf höchstens zwei Entscheidungen (A und B) und je eine Wiederholung bei ungültiger Antwort.

Zeitplan: dienstags 07:17 UTC (vor der US-Eröffnung). Eingepreist wird zum Schluss des nächsten Handelstags nach dem Entscheidungsdatum.

## Ablauf je Lauf

1. `main` aktuell holen, Zweig `claude/edge2-ki-<YYYY-MM-DD>` anlegen.
2. `node scripts/research/edge2/ki-forward.cjs mark --depot A` und `… mark --depot B`.
3. `node scripts/research/edge2/ki-forward.cjs status --depot A` (und B). Nur wenn `decisionDue` true ist:
   1. `node --max-old-space-size=8000 scripts/research/edge2/ki-forward.cjs packet --out-dir <Scratchpad>/fwd` → `packet-A.json`, `packet-B.json`, `keys.json`. `keys.json` sofort in einen eigenen Ordner verschieben und keinem Subagenten zeigen.
   2. Je Depot einen Subagenten starten, der genau zwei Dateien liest: den Prompttext (Datei aus `ki-forward.cjs prompt --depot X`, ab der Trennlinie `---`) und sein Paket. Keine anderen Dateien, kein Repository. Websuche nur für Depot B (Nachrichten nach Prompt B v3), für A nie. Antwort nur JSON.
   3. Antwort nach `<Scratchpad>/answer-A.json` (bzw. B), dann `node scripts/research/edge2/ki-forward.cjs record --depot A --packet … --keys … --answer …`. Bei `valid: false` einmal neu fragen (`--attempt 2`). Bleibt die Antwort ungültig, bleibt der Eintrag stehen, und das Depot hält Cash.
4. Zur Kontrolle `node scripts/research/edge2/ki-export.cjs --out <Scratchpad>/ki-depots-v1.json` (nicht ins Repository). Committen nur `docs/research/edge2/ki/ledger-*.jsonl`; der öffentliche Export `quant/data/product/ki-depots-v1.json` gehört seinem Erzeuger `ki-depots-daily.yml`, der nach dem Merge der Ledger automatisch läuft. Pushen, PR nach `main` mit Titel „KI-Depots EDGE2-KI: Woche <Datum>“, Auto-Merge; grüne CI genügt (CLAUDE.md).
5. Kurze Meldung an die Steuerungssitzung (send_message), ohne Renditezahlen.

## Bewertung

Nach 3, 6 und 12 Monaten (Februar, Mai, November 2027): `ki-forward.cjs evaluate --depot A|B` gegen SPY; Ergebnis versiegelt an den Owner, nicht im Klartext committen.
