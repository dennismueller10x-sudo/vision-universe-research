# KI-Depots EDGE2-KI-A-PAPER und EDGE2-KI-B-PAPER – Wochenauftrag (geplanter Auftrag im Claude-Abo)

Forschung, nicht zertifiziert, nicht öffentlich. Läuft als geplanter Auftrag (neue Claude-Code-Sitzung je Lauf, im Abo des Owners), **nicht über die API**; `workers/vu-ask` bleibt den Nutzerfragen vorbehalten.

- **Depot A** (Hauptdepot): dieselbe Regel wie der blinde Backtest, [BLIND_PROTOKOLL.json](BLIND_PROTOKOLL.json) mit [Ergänzung 1](BLIND_ERGAENZUNG_1.json), Prompt [PROMPT_v2.md](PROMPT_v2.md), anonymes Paket, 4–20 Titel mit Gewichten. Ledger `ledger-A.jsonl`.
- **Depot B** (nur vorwärts, ohne Backtest): dasselbe Paket plus Ticker, Analysten-Konsens und Schlagzeilen, Prompt [PROMPT_B_v1.md](PROMPT_B_v1.md). Ledger `ledger-B.jsonl`. Entscheidung der Steuerung vom 06.11.2026: B läuft getrennt protokolliert neben A, damit sich nach 3–12 Monaten zeigt, ob die Zusatzdaten etwas bringen.
- Prompts ändern sich nur mit neuer Datei `PROMPT_v<n>.md` bzw. `PROMPT_B_v<n>.md`, mit Begründung und neuer Ergänzung.
- Start: erste Entscheidung am 06.11.2026 (Daten bis 05.11.), danach eine Entscheidung je Kalendermonat in der ersten Dienstagssitzung des Monats. Jede Woche eine Kursmarke.
- Abo-Grenze: je Lauf höchstens zwei Entscheidungen (A und B) und je eine Wiederholung bei ungültiger Antwort.

Zeitplan: dienstags 07:17 UTC (vor der US-Eröffnung). Eingepreist wird zum Schluss des nächsten Handelstags nach dem Entscheidungsdatum.

## Ablauf je Lauf

1. `main` aktuell holen, Zweig `claude/edge2-ki-<YYYY-MM-DD>` anlegen.
2. `node scripts/research/edge2/ki-forward.cjs mark --depot A` und `… mark --depot B`.
3. `node scripts/research/edge2/ki-forward.cjs status --depot A` (und B). Nur wenn `decisionDue` true ist:
   1. `node --max-old-space-size=8000 scripts/research/edge2/ki-forward.cjs packet --out-dir <Scratchpad>/fwd` → `packet-A.json`, `packet-B.json`, `keys.json`. `keys.json` sofort in einen eigenen Ordner verschieben und keinem Subagenten zeigen.
   2. Je Depot einen Subagenten starten, der genau zwei Dateien liest: den Prompttext (ab der Trennlinie `---`) und sein Paket. Keine anderen Dateien, kein Repository, keine Websuche. Antwort nur JSON.
   3. Antwort nach `<Scratchpad>/answer-A.json` (bzw. B), dann `node scripts/research/edge2/ki-forward.cjs record --depot A --packet … --keys … --answer …`. Bei `valid: false` einmal neu fragen (`--attempt 2`). Bleibt die Antwort ungültig, bleibt der Eintrag stehen, und das Depot hält Cash.
4. Committen (`docs/research/edge2/ki/ledger-*.jsonl`), pushen, PR nach `main` mit Titel „KI-Depots EDGE2-KI: Woche <Datum>“, Auto-Merge; grüne CI genügt (CLAUDE.md).
5. Kurze Meldung an die Steuerungssitzung (send_message), ohne Renditezahlen.

## Bewertung

Nach 3, 6 und 12 Monaten (Februar, Mai, November 2027): `ki-forward.cjs evaluate --depot A|B` gegen SPY; Ergebnis versiegelt an den Owner, nicht im Klartext committen.
