# Vision Universe: Platform Hardening, Abschlussbericht

**Datum:** 03.10.2026 · **Branch:** `claude/platform-hardening` · **Basis:** `main` @ `ea0ca6578b`
**Einstieg für alle weiteren Arbeiten:** [docs/VISION_UNIVERSE_ARCHITECTURE.md](VISION_UNIVERSE_ARCHITECTURE.md)

---

## Executive Summary

Vision Universe hat jetzt einen erkennbaren **Core**:
- eine Identitätsregel,
- ein Source-of-Truth-Register je Datenart,
- Datenverträge für Produkte,
- einen messbaren Systemzustand,
- deterministische Datenqualitätsregeln,
- eine Selbstdiagnose je Aktie, auch als Seite `/status/`.

Der Audit hat **reale Produktionsfehler** gefunden und behoben. Jeder ist mit einem Lauf, einer Datei oder einem Wert belegt:

1. **Der nächtliche Marktdaten-Refresh war in 4 von 5 geplanten Läufen rot.** Ein wartender Lauf checkte den veralteten Auslöse-Commit aus und lief garantiert in Rebase-Konflikte. Die gleiche Fehlerklasse war am Vortag nur in einem von zwei Jobs behoben worden.
2. **Ein Universums-Intraday-Lauf mit 6.876 Anfragen und 5.237 geschriebenen Tagesverläufen wurde verworfen.** Ein Feature-PR hatte eine generierte Datei mitgebracht.
3. **Das Push-Werkzeug konnte halb rebaste Stände nach `main` schieben** und dabei Erfolg melden.
4. **BRK-B (1,4 % des S&P 500) fehlte in Faktoren und Discover.** Grund waren zwei Identitäten für dasselbe Papier.
5. **Kurse von 0** (CPTAF, DMN) und Präzisionsverlust bei 367 Titeln unter 1 $ durch Cent-Rundung.
6. **Ein eingefrorener Intraday-Stand wurde als „heute“ gezeigt,** neben einem anderen Schlusskurs auf derselben Seite. Am Split-Tag wären −50 % bzw. −90 % angezeigt worden.
7. **Die News-Seite behauptete „Maximal 24 Stunden alt“** bei einem 12 Tage alten Feed mit einer Meldung.
8. **Discover sprang beim Start und bei jedem Währungswechsel nach oben;** Zurück landete immer oben.
9. **Script-Injection** über Workflow-Eingaben in 12 Workflows, **11 tote Supertrader-Links**, eine **leere Academy-Seite** bei Ladefehlern.

Alle Änderungen sind getestet. Neu sind 53 Core-Tests und 13 Regressionstests in bestehenden Suiten. Alle bestehenden Suiten sind grün (§ Tests).
Fachliche Modelle (Quant-Scores, Rankings, Supertrader-Strategien, Regime, Technical) wurden **nicht** verändert.

---

## Architektur vorher

- Ein statisches Produktbündel mit 889 Seiten, ca. 110 Engines, 72 Workflows und 1,1 GB generierten Daten im Git.
- Die Produkte kannten Speicherpfade und verknüpften per Ticker.
- Es gab sieben Arten, die `securityId` zu bilden.
- Fünf Split-Bereinigungen, vier 52-Wochen-Hoch-Definitionen, drei Definitionen der Tagesänderung, zwei der Gesamtrendite.
- Frische wurde nur für Intraday und Tageskurse gemessen. Für Security Master, Fundamentals, Index, News, Quant und Supertrader gab es keinen Systemzustand.
- 20 Push-Stellen ohne Konfliktschutz. Concurrency-Gruppen über Branches hinweg.
- Zwei getrennte Watchlists (Discover, Quant). Keine Nutzer- oder Ereignismodelle.

## Architektur nachher

```
PRODUKTE ──▶ core/client.js (Verträge, Umschlag {state, reason, source, asOf, data})
               │
CORE           core/identity.js        eine Identitätsregel (ADR-001)
               core/registry/domains.json   Source of Truth je Datenart (18 Domänen)
               core/health.js          Systemzustand   ──▶ scripts/core/system-health.mjs, /status/
               core/data-quality.js    11 DQ-Regeln    ──▶ scripts/core/data-quality.mjs
               core/diagnose.js        Selbstdiagnose  ──▶ scripts/core/diagnose.mjs, /status/#/TICKER
               core/contracts/         User-Data- und Event-Schema (App-Vorbereitung)
JOBS           ADR-005: Spitze auschecken, push-with-retry.sh, Erzeugerhoheit, env-Eingaben
CI             core-ci.yml: Tests auf jedem PR; täglich streng gegen main und die Live-Seite
```

ADRs:
- [001 Identität](architecture/ADR-001-canonical-security-id.md)
- [002 Preiswahrheit](architecture/ADR-002-market-data-source-of-truth.md)
- [003 Core/Produkt](architecture/ADR-003-core-product-separation.md)
- [004 Mobile](architecture/ADR-004-mobile-architecture.md)
- [005 Commit-Protokoll](architecture/ADR-005-pipeline-commit-protocol.md)

---

## Implementierte Änderungen

| Commit | Inhalt |
|---|---|
| `b1e28bdeaf` | Pipeline-Härtung: Checkout der Spitze in 26 Workflows, `push-with-retry.sh` prüft jeden Rebase-Halt, 20 Push-Stellen vereinheitlicht, Concurrency je Branch, Injection-Fix in 12 Workflows, `permissions` für 6 CI-Workflows, Testisolation |
| `c889fe655c` | `core/identity.js`; BRK-B-Identität; rohe ID-Bildungen ersetzt; Intraday-Siegel (Bindestrich-Ticker, nie gelieferte Titel); Intraday-Verzeichnis unter Erzeugerhoheit |
| `5fa6264252` | Registry, Health, Datenqualität; Rundungsfix der Kurs-Publisher |
| `f7d54b050f` | Selbstdiagnose, `/status/`, `core-ci.yml`, `repositoryOnly` |
| `a09dd10c77` | Datenverträge `core/client.js`, Golden-Path-Tests |
| `22b2ddbc2c` | News ehrlich datiert, `safeUrl`; Discover-Karten mit Stand-Kennzeichnung; Penny-Darstellung |
| `dbf9724fad` | Supertrader-Seiten für alle verlinkten Symbole; „heute“ nur am Sitzungstag; Academy-Fehlerzustand; Chart-Guards; Legacy-Chart split-bereinigt |
| `35bddc449c` | Discover: Scroll bleibt erhalten, Zurück stellt die Position wieder her |
| `8c88cfac42` | `pages-release` liefert 12 weitere Datenläufe aus; `api/intraday` meldet das Alter |
| `779ba22938` | Red-Team-Fixes (Split-Tag, Pfad-Härtung, Ticker-Toleranz), Dokumentation, App-Readiness |
| `ab238a2de9` | Revert eines Nachweis-Datencommits, den ein Workflow auf den Branch geschrieben hatte. Damit bringt der PR keine pipeline-eigenen Artefakte mit. |

---

## Gefundene Bugs

### Critical
| # | Bug | Beleg | Status |
|---|---|---|---|
| C1 | Der Marktdaten-Refresh scheiterte strukturell: ein wartender Lauf mit veraltetem Checkout ergab Rebase-Konflikte | Läufe 37085599297, 36655067686, 36801050774 …; 4 von 5 rot | behoben (ADR-005) |
| C2 | `push-with-retry.sh` schob halb rebaste Stände und meldete Erfolg | Test PR4/PR5 reproduziert | behoben |
| C3 | Ein Universums-Intraday-Lauf wurde wegen eines Konflikts in `intraday/index.json` verworfen (Datei aus PR #366) | Lauf 37083168221 | behoben (Erzeugerhoheit, PR-Warnung) |

### High
| # | Bug | Beleg | Status |
|---|---|---|---|
| H1 | BRK-B unter zwei Identitäten, fehlt in Faktoren und Discover | `tiingo-universe.json:71` | behoben; wirksam beim nächsten Refresh |
| H2 | Kurse von 0 und Präzisionsverlust unter 1 $ (Cent-Rundung) | DQ-PX-1, 367 Reihen | behoben; wirksam beim nächsten Refresh |
| H3 | Eingefrorener Intraday-Stand als „heute“, zwei Kurse auf einer Seite | Screenshot Quant NVDA, 03.10. | behoben |
| H4 | Intraday-Split-Tag: Vortagesschluss vor dem Split ergibt −50 %/−90 % | Red Team | abgesichert |
| H5 | Discover-Siegel nie zu, kein Universums-Nachzug nach Ausfällen | `ingest-intraday.mjs:196` | behoben |
| H6 | Script-Injection über `workflow_dispatch`-Eingaben (Schreibrecht nötig) | 12 Workflows | behoben (außer Social) |
| H7 | News behaupten Frische, Feed 12 Tage alt | `news/news.js` | behoben (UI); Zeitplan ist eine Owner-Entscheidung |

### Medium
| # | Bug | Status |
|---|---|---|
| M1 | Discover springt beim Start und bei Währungswechsel nach oben, Zurück verliert die Position | behoben |
| M2 | 11 tote Supertrader-Links, 4 tote Wochenchart-Pfade | behoben im Erzeuger |
| M3 | Veraltete Kurse auf Discover-Karten ohne Kennzeichnung | behoben |
| M4 | Wochenend-Datenläufe erst montags ausgeliefert | behoben |
| M5 | Concurrency-Gruppen über Branches hinweg | behoben |
| M6 | Testlauf überschrieb ein committetes Artefakt | behoben |
| M7 | `javascript:`-URLs im News-Feed | behoben |
| M8 | Markets-Movers mit eigener Tagesänderung (IEX statt EOD) | offen (ADR-002) |
| M9 | Zwei Gesamtrendite-Definitionen | offen (ADR-002, Methodik-Version nötig) |
| M10 | Universum seit 15.09. nicht neu gebaut: 53 delistete oder übernommene Titel ACTIVE, S&P-Neuzugänge fehlen (NRG, VLTO, SNDK, Q, BNY falsch) | offen; geplanter Erzeuger fehlt |
| M11 | Supertrader lädt 3,6 MB je Seite; Quant-Screener 18,8 MB | offen (FRONTEND.md) |

### Low
| # | Bug | Status |
|---|---|---|
| L1 | Academy leer bei Ladefehler | behoben |
| L2 | Chart-Datumsfehler (`undefined.undefined.26`, Tooltip-Absturz) | behoben |
| L3 | Legacy-Chart `/quant/stock/` mit Rohkursen über Splits (kaum erreichbar: Weiterleitung) | behoben |
| L4 | Toter Code `dashboard/news/news.js` | entfernt |

---

## Datenqualität

Erster Lauf von `scripts/core/data-quality.mjs` (Repository, Sitzung 02.10.2026):

| Messung | Wert |
|---|---|
| geprüfte securityIds (Konfiguration, Universum, Gate-Universen) | 25.071, 0 Abweichungen nach dem Fix |
| Produktuniversum | 7.803 Entscheidungen, 0 Duplikate |
| Tagesreihen | 6.484; aktuell 6.418, 1–4 Sitzungen zurück 13, ≥ 5 Sitzungen zurück 53 |
| Reihen mit Kurs 0 | 2 (behoben im Publisher) |
| Tag/Woche-Übereinstimmung | 5.952 Paare, 0 Abweichungen |
| Aktienseite = Reihe | 5.982, 0 Abweichungen |
| Discover-Index = Seiten | 5.982, deckungsgleich |
| tote ausgelieferte Pfade | 15 (Supertrader, behoben im Erzeuger) |
| Indexmitglieder inaktiv / nicht zuordenbar | 7 / 7 |

Systemzustand (Repository, 03.10.2026 12:16 UTC):
- **Intraday STALE:** Der Tagesverlauf vom 02.10. endet 14:25 New York, der Universumslauf fehlt.
- **News STALE:** 290 h alt, 1 Meldung.
- **Security Master DEGRADED:** 438 h.
- **SEC-Consumer-Schicht DEGRADED:** 238 h. Der Montagslauf vom 28.09. fehlt.
- Alle übrigen Systeme OK. Fundamentals decken 5.479 von 6.853 Titeln ab, Faktoren 6.433 von 6.853.

## Reliability

- Datenläufe starten von der Spitze, prüfen jeden Rebase-Halt, pushen über ein Werkzeug und scheitern laut statt still.
- Erzeugerhoheit gilt nur für Dateien, die jeder Lauf neu baut. Kursdaten sind ausgeschlossen. Sieben Tests halten das fest.
- `core-ci.yml` meldet täglich, ob die Live-Seite und `main` gesund sind, und warnt bei PRs, die generierte Artefakte mitbringen.
- `/status/` und `diagnose.mjs` beantworten „Wo ist der Fehler?“ in Sekunden.

## UI

Behoben: Scroll-Sprünge, Scroll-Wiederherstellung, Kennzeichnung veralteter Stände (Karten, Intraday, News), Penny-Darstellung, tote Links, leere Fehlerseite, Chart-Guards, URL-Schemata.
Browser-Smoke auf 16 Kernseiten bei 390 px und 1.280 px: keine JS-Fehler, kein horizontales Überlaufen.
Komponentenvereinheitlichung bewusst nur dort, wo ein inhaltlicher Fehler entstand; Begründung in [FRONTEND.md](frontend/FRONTEND.md).

## Performance

Gemessen, nicht verändert, weil jede Änderung Produktlogik oder parallel aktive Workstreams berührt:
- Supertrader: 3,6 MB JSON auf jeder der 822 Seiten.
- Quant-Screener: 18,8 MB + 1,2 MB.
- Discover-Start: ca. 820 KB, nach Scrollen ca. 2 MB.

Konkrete Maßnahmen mit erwarteter Wirkung stehen in [FRONTEND.md](frontend/FRONTEND.md#empfohlene-performance-arbeiten-gemessen-nicht-umgesetzt).

## App Readiness

- **Analyse und Empfehlung:** PWA → `/v1/` (Verträge aus `core/client.js`) → Expo/React Native. Siehe [APP_READINESS.md](architecture/APP_READINESS.md) und ADR-004.
- **Vorbereitet:**
  - User-Data-Schema mit einer Watchlist statt heute zwei und Referenz über `instrumentId`.
  - Ereignisschema für Notifications.
  - Kanonische Deep-Link-Routen.
  - Liste der Browser-Speicherschlüssel als Migrationsquelle.
  - API-Feld `freshness` in `/api/intraday`.
- **Nicht gebaut,** weil es dafür keinen Verbraucher gibt: Konten, Push-Zustellung, Entitlements.

## Tests

| Suite | Baseline (vor dem Audit) | Nachher |
|---|---|---|
| Core (`core/tests`) | – | **53/53** |
| Quant und Plattform (`quant/tests`) | 2.302 grün | **2.315/2.315** (+13 neue) |
| Discover, Supertrader, Screener | 494 grün | **494/494** |
| Social + Social-Worker | – | **2.319/2.319** |
| vu-ask, Ask, Academy, vu-live, Waker, Access-Gate, Resource-Budget, Company Intelligence (JS) | – | **135/135** |
| SEC (Python) | 486 grün | **486/486** |
| vu2 (Python) | – | **32/32** |
| Company Intelligence (Python) | – | **126/126** |

Neue Regressionstests:
- `push-with-retry` PR4–PR7
- Intraday-Siegel (3), Split-Tag (1)
- Rundung (4), Freshness-Label (1)
- Identität (5), Health (17), Datenqualität (10), Diagnose (8), Verträge (8), Golden Paths (5)

**Gesamt:** 5.316 Node-Tests und 644 Python-Tests, alle grün. Kein Testlauf hat eine Datei unter `quant/data`, `discover/data` oder `social/data` verändert (`git status` nach dem Lauf sauber).

---

## Remaining Risks

1. **Identität ist tickerbasiert.**
   - Umbenennungen (FB→META) erzeugen eine neue `securityId`; der Umbenennungspfad bekommt keine Eingaben.
   - ISIN, FIGI und CUSIP sind leer.
   - Produkt-Builder verknüpfen per Ticker („first match wins“).
2. **Universum veraltet** ohne geplanten Erzeuger. Delistings bleiben ACTIVE, Neuemissionen und S&P-Neuzugänge fehlen.
3. **Mehrfache Kennzahldefinitionen:**
   - Split-Bereinigung 5×, 52W-Hoch 4×, Tagesänderung in Markets, Gesamtrendite 2×.
   - Zusammenführen nur mit Vorher/Nachher-Vergleich und Methodik-Version.
4. **`discover/data/`** hat sechs Schreiber in fünf Concurrency-Gruppen, und der Build löscht das Verzeichnis komplett.
5. **Social-Workflows:** nackte Pushes, interpolierte Eingaben, Admin-Schlüssel per `?key=`.
6. **Research-Zugangsmaske** arbeitet nur clientseitig (Owner-Entscheidung, ob sie Zugriffsschutz sein soll).
7. **Security-Härtung offen:** keine SHA-Pins, `wrangler@4` floatet, `vu-live` ohne Verbindungslimit, Secret-Scan mit Lücken.
8. **Performance:** 3,6 MB (Supertrader) und 18,8 MB (Quant-Screener) Initiallast.
9. **News ohne Zeitplan.**
10. **Nicht-atomare Schreibvorgänge** in Generatoren. Kritisch nur in Commit-Schritten mit `if: always()` (`tiingo-scale.yml`).
11. **Intraday stand am 02.10. ab 14:25 ET.** Der Universumslauf ging am Konflikt C3 verloren, ein Nachzug war wegen H5 unmöglich. Beides ist behoben. Den Freitagsstand vervollständigt erst ein manueller Lauf oder die nächste Sitzung.

## Recommended Next Steps

1. **Nach dem Merge:**
   - `market-data-refresh.yml` und `supertrader-signals.yml` einmal manuell starten. Das macht BRK-B, die Penny-Kurse und die Supertrader-Seiten in den Daten wirksam.
   - Danach `node scripts/core/data-quality.mjs` muss ohne ERROR laufen.
2. **Intraday 02.10. nachziehen:** `intraday-snapshots.yml` mit `scope=universe` für die Sitzung, oder auf die nächste Sitzung warten.
3. **Universum aktuell halten:** einen Zeitplan für `build-us-eligibility.mjs` und `universe-master.yml` (wöchentlich) mit DQ-IX-1 als Gate.
4. **News-Zeitplan** (Owner-Entscheidung: externe RSS-Abfragen), zum Beispiel alle 6 Stunden.
5. **Supertrader `signals.json` sharden** (je Symbol). Abstimmung mit dem Supertrader-Workstream.
6. **Quant-Screener auf `screening.json.gz`** umstellen, mit Ergebnisvergleich.
7. **Social-Workflows** auf ADR-005 umstellen (Workstream Social).
8. **SHA-Pins + Dependabot**, `wrangler` exakt, gitleaks über die volle Historie.
9. **ADR-002-Rest:** Markets-Movers auf EOD-Basis, `investorReturn` auf `canonical-total-return.js` (Methodik-Version), eine Split-Bereinigung.
10. **PWA-Stufe** (APP_READINESS §7.1).

---

## Final Validation

Gemessen am 03.10.2026 auf dem finalen Stand des Branches.

| Prüfung | Ergebnis |
|---|---|
| Alle Testsuiten (Node, Python) | 5.316 + 644 grün |
| Testisolation | keine Produktionsdatei verändert |
| Workflow-YAML (73 Dateien) | alle parsebar; workflow-bezogene Tests 312/312 |
| Systemzustand (Repository) | Intraday STALE, News STALE, Security Master/SEC-Consumer DEGRADED, Rest OK. Das ist der reale Datenstand, nicht eine Folge dieses Branches. |
| Datenqualität (Repository) | Identität 0 Fehler; ERROR-Befunde (Kurs 0, Supertrader-Pfade) im Code behoben, in den Daten wirksam nach dem nächsten Refresh und Supertrader-Lauf |
| Golden Paths | Stock (NVDA Mega Cap, MOG-A Share Class, TSM ADR), Discover (Startseite → Karte → Seite → Reihe), Supertrader (Signal → Discover-Titel → Reihe): grün |
| Wertpapierklassen | Mega Cap NVDA ✓; ADR TSM ✓; Share Class MOG-A/BRK-A ✓; Penny CPTAF (Diagnose zeigt Kurs 0 → Fix im Publisher); delistet/übernommen AVB (Diagnose: 33 Sitzungen veraltet, Karte jetzt mit „Stand“); Split NVDA (Charts split-bereinigt, Split-Tag-Schutz Intraday) |
| Browser-Smoke | 16 Kernseiten × 390 px/1.280 px: 0 JS-Fehler, 0 horizontales Überlaufen |
| Nachweislauf in Produktion | `sec-fundamentals-daily.yml` lief mit der Injection-Härtung auf diesem Branch erfolgreich (Lauf 37122420202) |
| Live-Seite | aus dieser Sandbox nicht erreichbar (Netzwerk-Policy); `core-ci.yml` prüft sie täglich in Actions |
