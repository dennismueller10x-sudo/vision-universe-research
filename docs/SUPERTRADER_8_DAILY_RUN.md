# Supertrader 8.0 – Tageslauf der Research-Kandidaten (vorbereitet, deaktiviert)

Stand 2026-10-27 (Anpassung nach V1–V4: #1025, #1026, #1027). Owner-Entscheidung O-2: Der Tageslauf wird als eigener PR vorbereitet und ist standardmäßig deaktiviert. Er wird nicht aktiviert, bevor die SEC-/Quant-Consumer-Pipeline nachweislich stabil ist und der Owner ihn ausdrücklich freigibt.

## Was der PR enthält

| Datei | Zweck |
|---|---|
| `.github/workflows/supertrader-sf8-candidates.yml` | Workflow ohne Zeitplan. Er lässt sich nur manuell starten (`workflow_dispatch`), und der Job läuft nur, wenn die Repository-Variable `SF8_CANDIDATES_ENABLED` auf `true` steht. Committet wird nur mit der Eingabe `commit=true`. |
| `scripts/supertrader/source-faithful/product/input-gate.mjs` | Eingangsprüfung: `CURRENT`, `STALE`, `MISSING`, `CALENDAR`. `STALE` gilt auch, wenn eine Nebenquelle älter als ihre Höchstdauer ist oder kein Erzeugungsdatum trägt (`AUX_MAX_AGE_DAYS`): Wochenreihen, Kontinuität und SEC-SIC 10 Tage, Namen 45 Tage, Security Master 60 Tage. |
| `build-candidates.mjs --require-current <heute>` | Bricht vor dem Schreiben mit Exit 3 ab, wenn die Prüfung nicht `CURRENT` ergibt. |
| `scripts/supertrader/tests/sf-sf8-daily.test.mjs` | Prüft Sitzungslogik (Wochenende, Thanksgiving), veraltete und fehlende Quellen sowie die Kalenderabdeckung. |
| `sf-product-contract.test.mjs` / `SF8-DAILY-DISABLED` | Hält die Abschaltung fest. Verboten sind automatische Auslöser (`schedule`, `push`, `pull_request`, `workflow_run`), ein Job ohne Variable, eine fehlende Eingangsprüfung, Secrets, `${{ inputs.* }}` in `run`-Blöcken und das Ausliefern von `records/`. Außerdem gelten die ADR-005-Regeln (Checkout der Spitze, Concurrency je Branch, `push-with-retry.sh`). |

Die bisherige Schutzregel `SF-PRODUCT-NO-RUN-INTEGRATION` wurde nur für genau diese eine Datei gelockert, ebenso `SF2-LEGACY-ISOLATION`, die schon eine gleichartige Ausnahme für `supertrader-validation.yml` enthält. Jeder andere Workflow, das Frontend und `core/registry/domains.json` bleiben ohne Bezug zum Produktpfad. Gegenprobe: Ein Zeitplan, `if: true`, `${{ inputs.commit }}` im Shell-Text oder ein Verweis aus einem anderen Workflow lässt den Test jeweils rot werden.

## Ablauf eines Laufs

1. Die Produkt- und Vertragstests laufen (`scripts/supertrader/tests/sf-*.test.mjs`). Sind sie rot, entsteht kein neuer Stand.
2. Eingangsprüfung:
   - Alle Pflichtquellen müssen vorhanden und nicht leer sein: Tagesbalken, Universum, Namen, Stammdaten, Listing-Kontinuität, Wochenreihen, Kalender, SEC-SIC.
   - Der Marktstand der Tagesbalken muss mindestens die letzte abgeschlossene XNYS-Sitzung vor dem UTC-Lauftag erreichen.
   - Der Lauftag muss in der Kalenderabdeckung liegen (2022–2027).
   - Die Nebenquellen müssen ihr Höchstalter einhalten. Der Security Master trägt `generatedAt` 2026-09-11; wird er nicht erneuert, blockiert der Lauf ab dem 10.11.2026 bewusst.
3. Der Kandidatenlauf liest nur committete Dateien. Es gibt keine Netzzugriffe, keine Secrets und keine Kosten.
4. Die öffentlichen Teile (`summary.json`, `index.json`, `strategy/`, `ticker/`) werden in ein eigenes Verzeichnis kopiert; nur dieses wird geprüft und committet.
5. Datenbudget: Die öffentlichen Teile (`summary.json`, `index.json`, `strategy/`, `ticker/`) dürfen zusammen höchstens 16 MB groß sein, jede Datei höchstens 2 MB. Lauf vom 23.10.2026: 12,7 MB unkomprimiert, 1,4 MB komprimiert, größte Datei `strategy/C06.json` mit 1,25 MB.
6. Datenqualität V3: `node scripts/core/data-quality.mjs --only=sf8 --sf8-dir=<öffentliche Teile> --sf8-activated` prüft DQ-SF8-1..8 (Frische, Identität, Stufensperren, keine Order-/Stopmarken unter MODELED, Quarantäne, Ergebnisverträge, Budget, Preisabgleich V4) vor Upload und Commit. Rot ist jede Regel, die nicht besteht oder nichts geprüft hat, und ebenso das Fehlen der acht Regeln, etwa wenn #1027 nicht gemergt ist.
7. Das vollständige Ergebnis wird 14 Tage als CI-Artefakt aufbewahrt: mit den Vertragsdatensätzen `records/` und dem DQ-Bericht.
8. Commit nur mit `commit=true`. Zusätzlich muss der Eintrag `supertrader-sf8-candidates` in `core/registry/domains.json` existieren **und freigegeben sein**: `activation.state ACTIVATING` vor dem ersten Lauf oder ohne `activation` danach, nie `PREPARED_DISABLED` (V2/V6, im Workflow erzwungen). Committet wird genau das geprüfte Verzeichnis; `records/` wird nie committet. Solange der Eintrag vorbereitet ist, ist ein Commit in zweifacher Hinsicht ausgeschlossen:
   - Der Workflow bricht ab.
   - Ein Artefakt unter einer vorbereiteten Datenart macht `core/tests/health.test.mjs` sowie DQ-SF8 rot, und `system-health` meldet FAILED (`PUBLISHED_WITHOUT_ACTIVATION`).

## Voraussetzungen vor der Aktivierung (offen)

| # | Voraussetzung | Stand |
|---|---|---|
| V1 | SEC-/Quant-Consumer-Pipeline und Marktdatenkette nachweislich stabil | **Teilweise erfüllt.** Belegt sind fail-closed und Alarm: Am 27.10. wurde der Lauf rot, Issue #986 ging auf, und der Supertrader-Anstoß wurde zurückgehalten. Außerdem waren 8 von 9 geplanten Nachtläufen grün. Offen sind die Freigabeschwelle (fünf aufeinanderfolgende geplante Nachtläufe nach 1527253 ohne manuellen Eingriff) und der Security Master, für den es keinen Erzeuger mit Zeitplan gibt; ohne Erneuerung blockiert die Eingangsprüfung ab dem 11.11.2026. Siehe `docs/SUPERTRADER_8_ACTIVATION_READINESS.md` (#1025). |
| V2 | Registrierung von `supertrader/data/sf-candidates` in `core/registry/domains.json` | **Umgesetzt, Merge offen:** #1025 (Schutztests eng geöffnet) → #1027 (Eintrag `PREPARED_DISABLED`, Health `DISABLED/NOT_ACTIVATED`). |
| V3 | DQ-Regeln für die neue Datenart | **Umgesetzt, Merge offen:** #1027, DQ-SF8-1..8 (alle ERROR, fail closed). Dieser Workflow wendet sie vor dem Commit an. |
| V4 | Abgleich `price.close` mit `quant/engines/published-close.js` (ADR-002) | **Umgesetzt, Merge offen:** #1026 (`sf8-data-quality-1.1.0`). Alle 3.001 Kandidaten stimmen am 26.10. auf den Cent; Kandidaten unverändert. Zusätzlich prüft DQ-SF8-8 das committete Ergebnis. |
| V5 | Freigabe der befüllten Vorschau (Inhalt und Darstellung) durch den Owner, Safari/WebKit | Offen (separat). |
| V6 | Ausdrückliche Freigabe, in dieser Reihenfolge und jeweils als eigener, vom Owner gemergter PR: (a) Supertrader-PR: `registry-guard.mjs` akzeptiert `ACTIVATING`. (b) Core-PR: `activation.state` → `ACTIVATING`; der Systemzustand zeigt DISABLED/AWAITING_FIRST_RUN, solange kein Artefakt existiert. (c) Variable `SF8_CANDIDATES_ENABLED=true`, erster Lauf mit `commit=false`, DQ-Bericht prüfen. (d) Lauf mit `commit=true`. (e) Supertrader-PR, der `activation` nicht mehr verlangt, danach Core-PR, der das Feld entfernt; ab dann ist ein fehlendes Artefakt FAILED. (f) Zeitplan in einem weiteren PR, gekoppelt an das Ende der Kette, nicht an eine Uhrzeit. Jeder Zwischenstand ist grün, und kein PR bringt Daten mit. | Gesperrt. |

## Bekannte Grenze

`--as-of` schneidet nur die Tagesbalken. Stammdaten wie Listing-Beginn, Status, SIC und Kontinuität zeigen den heutigen Stand, deshalb ist eine historische Wiederholung nicht vollständig zeitpunktgenau. Den Tageslauf betrifft das nicht, denn er rechnet immer auf dem aktuellen Stand.

## Was der Lauf nicht tut

- Er hebt keine Strategie an. Alle 13 bleiben `LIVE_NOT_APPROVED`, und `VALIDATED_TRADE_SIGNAL` bleibt gesperrt (`CONTRACT_LOCK`).
- Er löst die 83 Quarantäne-Sitzungen nicht auf, und CC-5 bleibt offen.
- Er schaltet keine Vorschau frei. Ohne `?sfPreview=1` beziehungsweise ohne den localStorage-Schalter fragt die Supertrader-Seite keine Kandidatendaten an. Der Schalter ist keine Zugriffskontrolle: Alles, was committet ist, ist auf GitHub Pages öffentlich abrufbar. Ein Commit (`commit=true`) ist deshalb eine Veröffentlichung und braucht die Freigaben V1 bis V6.
