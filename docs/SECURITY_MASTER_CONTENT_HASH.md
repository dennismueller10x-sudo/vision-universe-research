# Security Master: Inhalts-Fingerabdruck neben `masterHash` (Vorschlag, Entwurf)

Stand 28.10.2026. **Dieser PR ändert keinen Hash-Vertrag.** Er bringt ein nicht verdrahtetes Modul (`quant/engines/security-master-content-hash.js`) mit Golden Cases und schreibt die heutige `masterHash`-Semantik in Tests fest. Jede tatsächliche Änderung eines Hash-Vertrags braucht eine gesonderte Owner-Freigabe (Owner 28.10.2026).

## Stand (30.10.2026): Schritte 2 und 3 umgesetzt, Schritt 4 offen

- **Schritt 2:** `scripts/quant/materialize-real-backtest-read.cjs` schreibt in **neue** Snapshots zusätzlich `masterContentHash` und `masterContentAlgorithm` (`us-security-master-backtest-content-1`), berechnet aus denselben Bytes wie `masterHash` (sonst `INPUT_CHANGED_DURING_MATERIALIZATION`). Ist der Fingerabdruck nicht berechenbar, fehlen beide Felder. `calculationKey`, `masterHash`, `identityHash`, `resultHash`, Qualitätsklasse und Prüfliste bleiben unverändert. Das Modul ist keine Rechen-Abhängigkeit (`codes`). Alte Generationen bleiben unberührt. Weil das Skript selbst in `codes` steht, ändert diese Änderung wie jede Code-Änderung einmalig die Generation und alle `calculationKey`-Werte.
- **Schritt 3:** `server/quant-backtest-freshness.cjs` meldet `SECURITY_MASTER_UNCHANGED_CONTENT` statt `SECURITY_MASTER` nur, wenn der Bytes-Hash abweicht, der Snapshot `masterContentHash` mit genau diesem Algorithmus trägt und der neu berechnete Fingerabdruck des aktuellen Stamms gleich ist. Jeder Fehler, ein fehlendes Feld, ein anderer Algorithmus oder eine Abweichung ergibt `SECURITY_MASTER` wie bisher. Der Zustand bleibt `STALE_INPUT_SNAPSHOT`.
- **Schritt 4 (offen):** `server/quant-backtest-reader.cjs` hält `SECURITY_MASTER_UNCHANGED_CONTENT` weiter mit `BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED` zurück. Für Nutzer ändert sich also noch nichts. Ob der Zustand als aktuell ausgeliefert wird, braucht eine eigene Produktentscheidung.
- **Freigabe:** Schritte 2 und 3 ändern einen Hash- und Freshness-Vertrag additiv (neue Snapshot-Felder, neuer Abhängigkeitsname). Sie brauchen vor dem Merge eine Owner-Freigabe.
- Tests: `quant/tests/security-master-content-freshness.test.mjs` (MCF-0 bis MCF-8), MCH-5 erlaubt jetzt genau die zwei Verbraucher Materialisierung und Freshness.

## Heute

`masterHash` = SHA-256 der **ganzen** Datei `quant/data/market/security-master/us-security-master.json` (`quant/engines/weekly-real-adapter.cjs:63`). Er enthält auch `generatedAt`, Zeilen-Zeitstempel (`first_seen_at`, `last_seen_at`), Zähler und flüchtige Felder. Deshalb ändert ihn jede Übernahme, auch ohne fachliche Änderung. Geschützte Backtests melden dann `BACKTEST_IDENTITY_CHANGED_REBUILD_REQUIRED` und werden zurückgehalten.

Gemessen am committeten Stamm 1.1.0:

| Variante | `masterHash` (Bytes) | Inhalts-Fingerabdruck |
|---|---|---|
| committet (11.09.2026) | `26c82617…` | `cf5fbebf…` |
| nur `generatedAt` neu | neu | **gleich** |
| Zeitstempel je Zeile, Zähler, Zeilenfolge, `end_date`, Name neu | neu | **gleich** |
| ein Instrumenttyp, Eignung, Aktivstatus, `canonical_id`, Ticker, Startdatum | neu | neu |
| eine doppelte Zeile (mehrdeutige Listung) | neu | neu |
| nur `version` 1.1.0 → 1.3.0 | neu | neu |

## Antworten auf die Fragen des Owners

**1. Wer braucht den Hash der ganzen Datei?** Alles, was Herkunft oder bitgenaue Reproduzierbarkeit belegt. Daran ändert der Vorschlag nichts:
- `quant/engines/weekly-real-adapter.cjs` (`loader.masterHash`, `masterGeneratedAt`, `identityHash` je Titel);
- `scripts/quant/materialize-real-backtest-read.cjs`: Snapshot (`:23`), `calculationKey` (`:45`), Qualitätsklasse (`:58`), `source.masterHash` je Periode (`:69`), Prüfliste der Eingaben (`:80`);
- `quant/engines/research-weekly-loader.cjs:172` (bricht ab, wenn sich der Stamm während eines Laufs ändert), `quant/engines/real-backtest-quality.cjs`, die v9-Skripte (`scripts/quant/v9*/`) und die eingefrorene Evidenz unter `docs/quant-recovery/**` (nie neu schreiben).

**2. Wer braucht nur einen stabilen Inhalts-Fingerabdruck?** Nur die **Aktualitätsprüfung**: `server/quant-backtest-freshness.cjs:17` (`SECURITY_MASTER`) und der Leser `server/quant-backtest-reader.cjs:33`. Sie fragen „hat sich für die Backtest-Identität etwas geändert?“, nicht „ist die Datei bitgleich?“.

**3. Lassen sich Generationsversion und Inhalts-Fingerabdruck trennen?** Ja, additiv:
- Die Generation bleibt an den Bytes-Hash gebunden (`calculationKey`, Snapshot, `release.json`).
- Neu im Snapshot: `masterContentHash` und `masterContentAlgorithm` (`us-security-master-backtest-content-1`).
- Felder des Fingerabdrucks: `baseline_security_id`, `canonical_id`, `ticker`, `provider`, `currency`, `start_date`, `active_status`, `eligible_us_equity`, `instrument_type`, `source_provenance`. Zeilen sortiert, Doppelungen bleiben, `version` geht ein. Fehlt ein Feld oder hat es einen falschen Typ: Fehler (fail closed).

**4. Wie lassen sich unnötige Quant-Neuaufbauten vermeiden?**
- Freshness meldet bei abweichendem Bytes-Hash, aber **gleichem** Inhalts-Fingerabdruck einen eigenen Zustand `SECURITY_MASTER_UNCHANGED_CONTENT` statt `SECURITY_MASTER`.
- Das gilt **nur**, wenn der Snapshot den Fingerabdruck trägt. Alte Snapshots verhalten sich genau wie heute.
- Wichtig: Inhaltsgleich heißt nicht wiederholungsgleich. `identityHash` und `masterGeneratedAt` stehen im `resultHash`. Ein Neuaufbau ergäbe dieselben Kennzahlen, aber neue Hashes. Deshalb ist das ein Aktualitäts-, kein Reproduzierbarkeitsnachweis.
- Wirkung: Ein Wochenlauf, der nur Zeitstempel ändert (laut Gate `SKIP_NO_MATERIAL_CHANGE`, oder alle 21 Tage `COMMIT`), würde Backtests nicht mehr zurückhalten. Der einmalige Wechsel 1.1.0 → 1.3.0 ändert den Fingerabdruck dagegen (Version, 138 Klassen) und verlangt weiter eine neue Generation (P2).

**5. Wie bleiben die Schutzmechanismen erhalten?**
- Die Bytes-Bindung bleibt für `calculationKey`, Herkunft und Archiv. Nichts wird still überschrieben.
- Neuer Zustand nur zusätzlich, mit eigenem Namen. Der Leser entscheidet ausdrücklich, ob er ihn als aktuell behandelt (eigener Schritt, eigene Freigabe).
- Der Fingerabdruck kann nur strenger als „aktuell“ werden, nie lockerer als heute: Bei jedem Fehler oder fehlenden Feld gilt die heutige Byte-Regel.
- `docs/quant-recovery/**` und archivierte Generationen werden nie neu geschrieben.

## Was dieser PR enthält

| Datei | Inhalt |
|---|---|
| `quant/engines/security-master-content-hash.js` | UMD-Modul, **nicht verdrahtet** |
| `quant/tests/security-master-content-hash.test.mjs` | MCH-1 Golden Case (`cf5fbebf…` auf `26c82617…`); MCH-2 gleich bei flüchtigen Änderungen; MCH-3 neu bei jeder Identitäts-/Klassenänderung, Doppelung, Version; MCH-4 fail closed; MCH-5 `masterHash` = SHA-256 der Datei, kein Verbraucher lädt das Modul; MCH-6 Freshness meldet heute `SECURITY_MASTER` schon bei reinem `generatedAt`-Wechsel (bisher ungetestet) |

## Migration in Schritten (jeder Schritt eigene Freigabe)

1. Dieser PR: Modul und Festschreibung, keine Verhaltensänderung.
2. `materialize-real-backtest-read.cjs` schreibt zusätzlich `masterContentHash` und `masterContentAlgorithm` in neue Snapshots. `calculationKey` bleibt auf Bytes. Alte Generationen unverändert.
3. Freshness: neuer Zustand `SECURITY_MASTER_UNCHANGED_CONTENT`, nur wenn der Snapshot den Fingerabdruck trägt und er gleich ist. Tests: Golden Cases, alte Snapshots wie heute, manipulierter Fingerabdruck im Snapshot → `SECURITY_MASTER`, falscher Algorithmus → `SECURITY_MASTER`.
4. Leser: ob `SECURITY_MASTER_UNCHANGED_CONTENT` als aktuell ausgeliefert wird, ist eine eigene Produktentscheidung.
