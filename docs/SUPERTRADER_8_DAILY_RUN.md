# Supertrader 8.0 – Tageslauf der Research-Kandidaten (vorbereitet, deaktiviert)

Stand 2026-10-26. Owner-Entscheidung O-2: Der Tageslauf wird als eigener PR vorbereitet und ist standardmäßig deaktiviert. Er wird nicht aktiviert, bevor die SEC-/Quant-Consumer-Pipeline nachweislich stabil ist und der Owner ihn ausdrücklich freigibt.

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
4. Datenbudget: Die öffentlichen Teile (`summary.json`, `index.json`, `strategy/`, `ticker/`) dürfen zusammen höchstens 16 MB groß sein, jede Datei höchstens 2 MB. Lauf vom 23.10.2026: 12,7 MB unkomprimiert, 1,4 MB komprimiert, größte Datei `strategy/C06.json` mit 1,25 MB.
5. Das vollständige Ergebnis einschließlich der Vertragsdatensätze `records/` wird 14 Tage als CI-Artefakt aufbewahrt.
6. Nur mit `commit=true` und nur, wenn `core/registry/domains.json` den Pfad `supertrader/data/sf-candidates` registriert (V2, im Workflow erzwungen), gelangen `summary.json`, `index.json`, `strategy/` und `ticker/` nach `supertrader/data/sf-candidates/`. `records/` wird nie committet.

## Voraussetzungen vor der Aktivierung (offen)

| # | Voraussetzung | Stand |
|---|---|---|
| V1 | SEC-/Quant-Consumer-Pipeline nachweislich stabil (mehrere aufeinanderfolgende erfolgreiche Läufe, Footprint-Test grün) | Ein erfolgreicher Lauf (40307188633, 26.10.2026, nach #963). Der Footprint-Test auf `main` ist grün (39/0). Ein einzelner Lauf ist kein Stabilitätsnachweis. |
| V2 | Registrierung von `supertrader/data/sf-candidates` als eigene Datenart in `core/registry/domains.json` mit diesem Workflow als Erzeuger | Offen, eigener Integrationsblocker: [SUPERTRADER_8_INTEGRATION_BLOCKER_V2_V3.md](SUPERTRADER_8_INTEGRATION_BLOCKER_V2_V3.md). Braucht zuerst einen Supertrader-PR, der zwei Schutztests eng öffnet, dann einen Core-PR. Der Commit-Schritt bricht ohne Registrierung ab. |
| V3 | DQ-Regeln für die neue Datenart in `core/data-quality.js` und `scripts/core/data-quality.mjs`: Frische, Schema, Stufensperre, keine Ordermarken unter MODELED, keine `records/`, Budget | Offen, im selben Blocker-Dokument mit sieben konkreten Regeln. |
| V4 | Abgleich `price.close` mit `quant/engines/published-close.js` (ADR-002) | Offen. Die Kandidaten zeigen bisher den Tagesschluss der technischen Materialisierung. |
| V5 | Freigabe der befüllten Vorschau (Inhalt und Darstellung) durch den Owner | Offen. Die Vorschau ist nur lokal und isoliert geprüft. |
| V6 | Ausdrückliche Freigabe: Variable `SF8_CANDIDATES_ENABLED=true` setzen, danach erst einen Zeitplan in einem eigenen PR ergänzen | Offen. |

## Bekannte Grenze

`--as-of` schneidet nur die Tagesbalken. Stammdaten wie Listing-Beginn, Status, SIC und Kontinuität zeigen den heutigen Stand, deshalb ist eine historische Wiederholung nicht vollständig zeitpunktgenau. Den Tageslauf betrifft das nicht, denn er rechnet immer auf dem aktuellen Stand.

## Was der Lauf nicht tut

- Er hebt keine Strategie an. Alle 13 bleiben `LIVE_NOT_APPROVED`, und `VALIDATED_TRADE_SIGNAL` bleibt gesperrt (`CONTRACT_LOCK`).
- Er löst die 83 Quarantäne-Sitzungen nicht auf, und CC-5 bleibt offen.
- Er schaltet keine Vorschau frei. Ohne `?sfPreview=1` beziehungsweise ohne den localStorage-Schalter fragt die Supertrader-Seite keine Kandidatendaten an. Der Schalter ist keine Zugriffskontrolle: Alles, was committet ist, ist auf GitHub Pages öffentlich abrufbar. Ein Commit (`commit=true`) ist deshalb eine Veröffentlichung und braucht die Freigaben V1 bis V6.
