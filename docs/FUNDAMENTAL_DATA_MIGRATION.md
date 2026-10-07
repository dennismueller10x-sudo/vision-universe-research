# Fundamentaldaten – Migrationsplan

Stand: Fundamental-Data-Integrity-Audit, 7. Oktober 2026. Begleitdokumente:
- [Audit-Bericht](FUNDAMENTAL_DATA_INTEGRITY_AUDIT.md)
- [Architektur](FUNDAMENTAL_DATA_ARCHITECTURE.md)
- Maschinenlesbar: `scripts/fundamentals-audit/artifacts/FUNDAMENTAL-DATA-MIGRATION-PLAN.json`, `FUNDAMENTAL-REBUILD-PLAN.json`, `FUNDAMENTAL-IMPACT.json`

**Status: PLAN. Nichts davon ist ausgeführt. Produktionsklassifikation: READY_FOR_CONTROLLED_MIGRATION.**

## 1. Was migriert wird

| | Vorher (main 829b35bdce4) | Nachher (Data-Freeze v3) |
|---|---|---|
| Normalisierungslogik | 1.10.0 | 1.15.0 |
| Registry-Mapping | 1.6.0 | 1.8.0 |
| Label | – | `vu-fundamentals-core-1.15.0+registry-1.8.0` |
| Consumer-Schema | vu-consumer-fundamentals-1.0.0 | unverändert |

Behobene Kernfehler: E1, E2 (revidiert durch E2-R), E3, E3b, E4, E9, E10 (siehe Audit-Bericht). E2-R und E10 sind nach dem Red Team in 1.15.0 korrigiert. Consumer-Logik, Faktoren, Schwellen und Strategieregeln sind unverändert.

## 2. Ein Merge ist der Rollout

Die SEC-Workflows laufen nach Zeitplan von `main`:

| Workflow | Zeitplan | Wirkung nach dem Merge |
|---|---|---|
| `sec-fundamentals-daily.yml` | täglich 06:15 UTC | normalisiert jeden berührten Emittenten mit 1.15.0 neu (Versionsstempel → `_is_current` false) |
| `sec-consumer-fundamentals.yml` | montags 07:30 UTC | baut alle Consumer-Bundles neu und committet sie |
| Discover / Screener / Supertrader / Company Intelligence | eigene Läufe | übernehmen die neuen Bundles |

Ein Merge dieses PRs startet den Rollout deshalb automatisch, spätestens nach 7 Tagen. **Der Merge ist die Migrationsfreigabe.** Er darf erst erfolgen, wenn M-B1 und M-B2 entschieden sind.

## 3. Blocker, die der Eigentümer entscheidet

### M-B1 – TTM-EPS entfällt für die meisten Emittenten (Folge von E4)

Bisher entstand Q4-EPS als FY − 9M. Dieser Wert stand im Bundle mit `derived = 0` und war damit nicht als Ableitung erkennbar.

Gegen das von der SEC gemeldete Q4-EPS gemessen, über 669 Paare bei 72 Emittenten:
- nur 48,9 % innerhalb der Rundung;
- p90-Abweichung 15,8 %;
- 80 Paare über 10 % daneben;
- 10 Vorzeichenwechsel.

Ursache sind Splits und schwankende Aktienzahlen. FY − 9M ist kein EPS. Seit 1.11.0 fehlt deshalb das Q4-EPS, wenn die SEC keines meldet, und mit ihm der TTM-EPS (Zahlen: `FUNDAMENTAL-IMPACT.json`).

Verhalten der Consumer ohne Codeänderung:

| Consumer | Verhalten |
|---|---|
| Discover KGV / Gewinn je Aktie | Rückfall auf TTM-Nettogewinn / jüngste Aktienzahl. Dieser Rückfall existiert bereits. |
| Screener `eps` | Rückfall auf das jüngste Geschäftsjahres-EPS. Das Feld ist aber als „Gewinn je Aktie (TTM, verwässert)“ beschriftet (`screener/engine/fields.js`). Für rund 3.200 Titel stünde damit ein Jahreswert unter einer TTM-Beschriftung (Red Team F7). |
| Quant | nicht betroffen (nutzt Jahres-EPS) |
| Company Intelligence | nicht betroffen (summiert EPS bereits heute nicht) |
| Supertrader | nicht betroffen (liest kein EPS aus dem Bundle) |

Optionen:
- **A:** Akzeptieren. UNKNOWN statt Näherung, keine Codeänderung. **Allein nicht ausreichend:** Der Screener beschriftet den Jahreswert als TTM. A geht nur zusammen mit einem Screener-PR, der die Beschriftung an die tatsächliche Basis koppelt.
- **B:** Consumer-seitige Definition TTM-EPS = TTM-Nettogewinn / gewichtete verwässerte Aktien, gekennzeichnet als DERIVED. Eigener PR je Produkt, mit Vorher/Nachher.
- **C:** TTM-EPS nur, wenn das Fenster mit einem Geschäftsjahresende zusammenfällt (= FY-EPS), sonst UNKNOWN.

**Empfehlung:** A plus Screener-Beschriftungs-PR vor dem Rollout. B als nachgelagerter Consumer-PR.

### M-B4 – Umsatz: verbleibende Mehrdeutigkeit

Ist `Revenues` in einer Einreichung zwischen etwa 12 % und 50 % des Vertragsumsatzes, ist durch keinen geprüften Fall belegt, ob er ein Teilbetrag oder ein Nettogesamtumsatz ist.
- Unter 50 % gilt der Wert von `main` (Vertragsumsatz).
- Darüber gilt `Revenues`.
- Die Lösung ohne Schwelle ist F9 (Abschlusszeile aus dem Filing-XBRL).

Entscheidung: so ausrollen (empfohlen) oder F9 abwarten.

### M-B2 – Rollout-Zeitpunkt

Merge nur unmittelbar vor einem manuell ausgelösten, beobachteten Consumer-Lauf (siehe Schritte).

### M-B3 – Factbook-Store

Ohne Voll-Rebuild bleiben Emittenten ohne neue Einreichung auf 1.10.0. Nach dem Merge einmal `sec-fundamentals-daily` für alle CIKs auslösen (Backfill).

## 4. Schritte

1. Freigabe M-B1, M-B2 und M-B4 durch den Eigentümer; Screener-Beschriftungs-PR (M-B1).
2. Direkt vor dem Merge den Branch auf `main` bringen und prüfen:
   ```bash
   node scripts/fundamentals-audit/freeze.mjs --check
   python3 -m unittest discover -s scripts/quant/tests -p 'test_*.py'
   ```
3. Merge.
4. `sec-consumer-fundamentals.yml` per `workflow_dispatch` auslösen. Dann den alten gegen den neuen Bundle-Stand vergleichen:
   ```bash
   node scripts/fundamentals-audit/bundle-diff.mjs <alt> <neu> diff.json
   node scripts/fundamentals-audit/consumer-impact.mjs <alt> <neu> impact.json
   ```
   Die Abweichung zu `FUNDAMENTAL-IMPACT.json` je Kennzahl darf höchstens 5 % der betroffenen Emittenten betragen. Mehr bedeutet Abbruch.
5. Voll-Rebuild der Factbooks (`sec-fundamentals-daily`, alle CIKs).
6. Discover-, Screener-, Supertrader- und Company-Intelligence-Läufe über ihre Produzenten, nie von Hand. Alle Gates bleiben grün.
7. Stichprobe auf `/status/#/<TICKER>` und den Aktienseiten: TNDM, AMT, DE, CERN, CECO, BRK-B, AAPL.

## 5. Abbruchbedingungen

- `freeze.mjs --check` rot.
- Consumer-Diff weicht über die Toleranz von `FUNDAMENTAL-IMPACT.json` ab.
- Ein Gate wird rot: Discover-Reproduzierbarkeit, Discover-Budget, Supertrader Gate A, Company Intelligence `validate`.
- Ein Emittent verliert alle Werte einer Kennzahl ohne belegte Ursache. Q4- bzw. TTM-EPS (E4) ist belegt.

## 6. Rollback

- Revert des Merge-Commits, dann erneuter Consumer-Lauf.
- Die vorherigen Bundles liegen in der Git-Historie. Die Factbooks normalisieren sich über den Versionsstempel beim nächsten Lauf zurück.
- Kein Datenverlust: Kein Artefakt wird außerhalb seines Produzenten verändert, nichts wird gelöscht.

## 7. Was nicht migriert wird

| Artefakt | Grund |
|---|---|
| Minervini-Research (PR #471/#475, Parser P9) | eingefroren. Eine künftige Version liest den P1-Export (`export_sepa_fund.py`) als neue Datenversion. |
| Supertrader-Validierungsstore (P7, `sec-pit.mjs`) | eigener Supertrader-PR (Gate A): E7 beheben oder durch P1-Export ersetzen |
| Historische Backtest-Ergebnisse | werden nicht überschrieben. Neuberechnung nur als neue, versionierte Läufe. |

## 8. Folge-PRs (nicht Teil dieser Migration)

| ID | Produkt | Inhalt |
|---|---|---|
| F1 | Supertrader | P7 ersetzen oder E7 beheben (Q4-Lookahead, ein Tag je Unternehmen, Basic-Ersatz) |
| F2 | Minervini-Research | P1-Export als neue Datenversion; keine Änderung an eingefrorenen Ständen |
| F3 | Quant-SEC-Kern | E5: Provenienz-Kennzeichen für Ersatzkonzepte bei net_income |
| F4 | Quant-SEC-Kern | E6: Export-Sicht AS_REPORTED_AT_TIME für PIT-Consumer (Vertrag C-PIT-1) |
| F5 | Quant-SEC-Kern | Bundle-Zeilen tragen Transformation (AS_REPORTED / YTD_DIFF / FY_MINUS_YTD) und Konzept |
| F6 | Quant-SEC-Kern | 6-K/40-F-Quartale und dimensionale Fakten nur über Filing-XBRL mit eindeutiger Zuordnung |
| F7 | Discover / Screener / CI / Quant | Consumer-Befunde C1–C4 |
| F9 | Quant-SEC-Kern | Umsatz-Abschlusszeile je Einreichung aus dem Presentation-Linkbase statt Schwelle (M-B4) |
| F10 | Quant-SEC-Kern | Konzeptmenge in der Provenienz abgeleiteter Werte; TTM- und Jahressummen über gemischte Konzepte kennzeichnen oder verweigern (Red Team F5) |
| F8 | Quant-Werkzeug | `cli.py consumer --out` schreibt `consumer_coverage.json` trotzdem nach `quant/data/sec/` (Test-Isolation) |
