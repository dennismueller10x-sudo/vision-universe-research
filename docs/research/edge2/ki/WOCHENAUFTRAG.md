# KI-Depot EDGE2-KI-PAPER – Wochenauftrag (geplanter Auftrag im Claude-Abo)

Forschung, nicht zertifiziert, nicht öffentlich. Läuft als geplanter Auftrag (neue Claude-Code-Sitzung je Lauf, im Abo des Owners), **nicht über die API**; `workers/vu-ask` bleibt den Nutzerfragen vorbehalten.
Regel: [BLIND_PROTOKOLL.json](BLIND_PROTOKOLL.json) „forward“, Prompt [PROMPT_v1.md](PROMPT_v1.md). Der Prompt ändert sich nur mit neuer Datei `PROMPT_v<n>.md`, Begründung und neuem Protokolleintrag.

Zeitplan: dienstags 07:17 UTC (vor der US-Eröffnung). Eingepreist wird zum Schluss desselben Dienstags, also des nächsten Handelstags nach den Daten der Vorwoche.

## Ablauf je Lauf (wörtlich der Auftragstext)

1. `main` aktuell holen, Zweig `claude/edge2-ki-<YYYY-MM-DD>` anlegen.
2. `node scripts/research/edge2/ki-forward.cjs mark` (Wochenmarke: veröffentlichte Schlusskurse aller je gewählten Titel und SPY).
3. `node scripts/research/edge2/ki-forward.cjs status`. Nur wenn `decisionDue` true ist:
   1. `node --max-old-space-size=8000 scripts/research/edge2/ki-forward.cjs packet --out-dir <Scratchpad>` → `packet.json` und `keys.json`.
   2. Einen Subagenten starten, der **nur** den Text von `docs/research/edge2/ki/PROMPT_v1.md` (ab der Trennlinie) und den Inhalt von `packet.json` bekommt. Er darf keine Dateien lesen und keine Werkzeuge nutzen. `keys.json` nie zeigen.
   3. Antwort als JSON nach `<Scratchpad>/answer.json`. `node scripts/research/edge2/ki-forward.cjs record --packet … --keys … --answer …`. Bei `valid: false` einmal neu fragen (`--attempt 2`). Bleibt die Antwort ungültig, bleibt der Eintrag stehen und das Depot hält Cash.
4. Committen (`docs/research/edge2/ki/ledger.jsonl`), pushen, PR nach `main` mit Titel „KI-Depot EDGE2-KI-PAPER: Woche <Datum>“ und Auto-Merge; grüne CI genügt (CLAUDE.md).
5. Kurze Meldung an die Steuerungssitzung (send_message), ohne Renditezahlen.

## Bewertung

Nach 3, 6 und 12 Monaten (Februar, Mai, November 2027): `ki-forward.cjs evaluate` gegen SPY; Ergebnis versiegelt an den Owner, nicht committen im Klartext.
