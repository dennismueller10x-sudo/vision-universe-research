# Fundamental – Übergabe an die Frontend-Optimierung

Stand: 25.10.2026. Der Abschnitt „Fundamental – Backend & SEC“ ist abgeschlossen. Dieses Dokument beschreibt nur den aktuellen Stand; es führt nichts Neues ein.

**Vor jeder Änderung lesen:**
- [CLAUDE.md](../CLAUDE.md): Arbeitsregeln, Gates, Workflows
- [FUNDAMENTAL.md](FUNDAMENTAL.md): Ansichten, Fachregeln, Methodik
- [FUNDAMENTAL_SEC_GAPS.md](FUNDAMENTAL_SEC_GAPS.md): offene SEC-Lücken

## 1. Produktionsstand

| | |
|---|---|
| Live-URL | https://research.visionuniverse.de/fundamental/ (seitenweiter Passwortschutz, nicht umgehen) |
| Live-Commit | Steht in `/release-id.json` (`commit`); am 25.10.2026, 14:44 UTC: `74a49d0`. Jeder Merge nach `main` und jeder Datenlauf erzeugt ein neues Release. |
| Release | `pages-release.yml` („Quant 2.0 Production Pages“) baut mit `scripts/vu2/build-release.mjs` und liefert über GitHub Pages / Cloudflare aus. |
| SEC-Datenstand | Verbraucherdaten vom 25.10.2026; SEC-Tageslauf zuletzt am 25.10.2026, 11:33 UTC |
| Historie live (`/fundamental/data/history/status.json`) | `state: AVAILABLE`, 6.125 Aktien, 5.052 mit SEC-Historie, 10 als ungültig verworfen, 625 Scherben |
| Abdeckung (`quant/data/sec/consumer_coverage.json`) | 6.686 Produkttitel, 5.340 mit CIK, 5.063 mit SEC-Daten, 5.050 mit LTM, 2.172 mit 10 Jahren |

## 2. Architektur und Dateien

Statische Seite ohne Build-Schritt und ohne Abhängigkeiten. Die Hash-Routen werden im Browser gerendert.

| Datei | Rolle |
|---|---|
| `fundamental/index.html` | Hülle. Lädt Shell (`/assets/site-navigation.*`), `core/identity.js`, `core/stock-context.js`, `assets/stock-navigator.*` und `assets/vu-chart.js`. Setzt das Farbschema vor dem ersten Bild (Schlüssel `vu-discover-theme-v1`). |
| `fundamental/app.js` (≈1.300 Zeilen) | Router und alle Ansichten (Startseite, Aktie, Unteransichten) |
| `fundamental/app.css` (≈430 Zeilen) | Eigene Klassen `fu-*`; baut auf den `--vu-*`-Tokens der Shell auf |
| `fundamental/engine/model.js` | Datenmodell: lädt Historie, Discover-Aktiendatei und Screener-Universum und führt sie zusammen |
| `fundamental/engine/catalog.js` | Kennzahlenkatalog (60 Kennzahlen), Ranglisten (`RANKINGS`), Quartalsregel (`quarterMismatch`), historische Bewertung (`historicalValuation`) |
| `fundamental/engine/compare.js` | Mehrere Kennzahlen im Verlauf: Zeitachse, Look-ahead-Sperre, Einheiten, Index (keine neue Kennzahlrechnung) |
| `fundamental/tests/*.test.mjs` | Modell-, Katalog- und Vergleichstests |
| `scripts/fundamental/build-history.mjs` | Läuft im Release-Bau. Projiziert die SEC-Verbraucherdateien in die Scherben `/fundamental/data/history/<shardKey>.json.gz`, die Branchenmediane (`industry/*.json`) und die Vergleichsgruppen (`peers.json`). Wird nie committet. |
| `scripts/fundamental/sec-freshness.mjs` | Wächter: Neue SEC-Meldungen gegen die Verbraucherdaten (`decision`, `pending`, `notAdopted`) |
| `scripts/fundamental/verify-publication.mjs` | Prüft die Auslieferung gegen das Repository (`consumerAsOf` und Accessions frischer Meldungen) |
| `scripts/fundamental/coverage-report.mjs` | Erzeugt `docs/FUNDAMENTAL_DATA_COVERAGE.md` |

**Datenpfade der Seite** (Einzelheiten in FUNDAMENTAL.md, Abschnitt „Daten“):

| Pfad | Inhalt |
|---|---|
| `/fundamental/data/history/…` | SEC-Historie |
| `/discover/data/stocks/US_REAL/<T>.json` | Kurs und aktuelle Bewertung |
| `/screener/data/universe-US_REAL.json` | Querschnitt |
| `/quant/data/market/discover-series-long/<securityId>.json` | Wochenkurse mit Split-Beleg |
| `/dashboard/data/analyst_ratings.json` | Analysten, nur 11 Titel |

Fehlt die SEC-Historie, liest die Seite die Discover-Aktiendatei und zeigt das an: Hinweis „Volle Historie gerade nicht verfügbar“ und `data-fu-source="discover"`.

**Identität** nur über `core/identity.js` (`shardKey`, `securityIdForTicker`); die CIK kommt aus der Discover-Aktiendatei.

## 3. Ansichten und Funktionen

| Route | Ansicht |
|---|---|
| `#/` | Startseite: Hero, sechs Ranglisten-Karten (auf dem iPhone waagerecht wischbar), Branchen, Discover-Auswahlen |
| `#/entdecken`, `#/suche`, `#/methodik` | Ziele des Produkt-Docks |
| `#/rangliste/<id>`, `#/branche/<SIC2>` | Rangliste einer Kennzahl; Branche nach SIC-Hauptgruppe |
| `#/<T>` | Überblick: Kurs, Kennzahlen, Entwicklung, Umsatz und Gewinn, Branche, Datenstand mit Hinweis auf noch nicht verarbeitete SEC-Berichte |
| `#/<T>?ansicht=kennzahlen` | Katalog aller Kennzahlen mit Suche und Kategorien |
| `#/<T>?ansicht=kennzahl&k=<id>[&p=q]` | Kennzahl-Detail: jährlich oder quartalsweise, 3J/5J/10J/Max, Balken oder Linie, Vergleich mit Branchenmedian oder Wettbewerbern, CAGR, Tabelle mit SEC-Quelle je Wert |
| `#/<T>?ansicht=kennzahl&k=<id>&plus=<id>.<id>[&d=achsen\|index\|getrennt]` | Kennzahl-Detail mit bis zu drei weiteren Kennzahlen im gemeinsamen Verlauf (FUNDAMENTAL.md, „Mehrere Kennzahlen im Verlauf“) |
| `#/<T>?ansicht=vergleich[&t=sektor]` | Branchenvergleich: Wettbewerber (SIC 4), Branche (SIC 2) oder Sektor |
| `#/<T>?ansicht=finanzen[&t=bilanz\|cashflow][&p=q]` | GuV, Bilanz, Cashflow |
| `#/<T>?ansicht=mehr\|dividende\|analysten\|bewertung\|aktie\|unternehmen\|quellen` | Weitere Bereiche |

Unteransichten stehen im Query-Teil, damit `core/stock-context.js#parse` die Adresse als Aktie erkennt.

**Querverweis:** Von `#/<T>` führt ein Link zu Quant (`/quant/#/aktie/<T>/zahlen`). Der Link ist ein Regressionsweg und muss erhalten bleiben.

## 4. Datenquellen und SEC-Aktualisierung

**Quelle:** SEC EDGAR, kostenlos, mit User-Agent `VisionUniverseResearch info@visionuniverse.de`.
- Hauptquelle ist `companyfacts.zip` (Bulk).
- Ergänzung: SEC Financial Statement Data Sets der letzten vier Quartale. Daraus kommen nur Meldungen, von denen companyfacts nichts enthält (`scripts/quant/sec/fsds.py`). Das Bundle nennt die Quelle in `dataSource.supplement`.
- Kein bezahlter Anbieter.

**Tägliche Kette** (ohne manuellen Eingriff, am 25.10.2026 nachgewiesen):

1. **`sec-fundamentals-daily.yml`** (cron 06:15 UTC; GitHub startet ihn erfahrungsgemäß rund 5 Stunden später) liest den SEC-Tagesindex und schreibt `quant/data/fundamentals/daily/state.json`.
2. **`fundamental-sec-freshness.yml`**, Job `check` (per `workflow_run`, Rückfall 14:40 UTC):
   - Bei neuen 10-Q/10-K stößt er `sec-consumer-fundamentals.yml` an (`REFRESH_CONSUMER`); sonst lautet die Entscheidung `CURRENT`, und es läuft nichts.
   - Alarm, wenn eine neue Meldung seit mehr als 3 Tagen nicht übernommen ist oder der Erzeuger seit 8 Tagen keinen erfolgreichen Lauf hatte.
3. **`sec-consumer-fundamentals.yml`** (Erzeuger) baut `quant/data/sec/consumer/CIK*.json` und die Discover-Daten, lässt die Regressionssuite laufen und committet nach `main`.
4. **`pages-release.yml`** startet per `workflow_run` und baut dabei die Fundamental-Historie neu.
5. **`fundamental-sec-freshness.yml`**, Job `publish`: wartet auf das Release und führt `verify-publication.mjs` gegen die Live-Seite aus.

**Fachliche Grundlagen in Quant** (`scripts/quant/sec/`):
- Registry: `quant/config/sec-metric-registry.json`
- Nachfolge-Emittenten: `quant/config/sec-successor-issuers.json`
- Versionen: `scripts/quant/sec/version.py`; die Normalisierung steht auf 1.12.0, `mapping_version` auf 1.7.0.

## 5. Bekannte Einschränkungen und offene Punkte

**Daten** (Ursachen je Meldung in FUNDAMENTAL_SEC_GAPS.md):
- **48 ältere SEC-Meldungen nicht übernommen.**
  - 16 Meldungen von Emittenten mit 52/53-Wochen-Kalender, z. B. KO, GD, NXPI, GRMN.
  - 8 Meldungen stehen in keiner SEC-Quelle.
  - 10 enthalten in XBRL nur das Deckblatt.
  - 14 sind Änderungsmeldungen.
- **Ohne Quartale:** 20-F/40-F-Filer (z. B. NTR, AU) haben nur Jahreswerte.
- **Ohne Umsatz:** IFRS-Banken und -Versicherer (z. B. BCS, BCH, CIB), bewusst, weil IFRS 15 dort nur den Provisionsertrag meint. US-Banken haben Umsatz aus `us-gaap:Revenues`.
- **Leere Kennzahlen bei Banken und Versicherern:** Bruttogewinn, Finanzschulden und Ähnliches.
- **Werte je Aktie im Verlauf** sind über Splits nicht zurückgerechnet. Der Hinweis steht an der Kennzahl; offene Nacharbeit laut FUNDAMENTAL.md.
- **Quartale** reichen 8 bis 10 Quartale zurück. Segmentdaten fehlen.
- **Restatements:** Ein historischer Wert ist immer der jüngst gemeldete (`as_of_latest`); in der Methodik beschrieben.

**Dokumentation:** In FUNDAMENTAL.md, Abschnitt „Grenzen“, sind zwei Aussagen überholt.
- Die Nachfolge-CIK wird inzwischen zusammengeführt (#901, #910); XOM, DMRC, CIB und AU haben eine volle Historie.
- „Wettbewerber folgen der SEC-Hauptgruppe (zwei Stellen)“ widerspricht dem Abschnitt „Vergleichsgruppen“: Standard ist SIC 4.
- Beide Stellen sind noch nicht korrigiert, weil sie den Frontend-Text nicht betreffen.

**Betrieb:**
- Vercel-Vorschauen für PRs scheitern zeitweise am Tageskontingent. Das ist kein Pflicht-Check; nicht wiederholt anstoßen.
- Actions warnen, dass Node 20 veraltet ist (`actions/checkout@v4` u. a.); das ist nur eine Warnung.

## 6. Tests und Qualitätsprüfungen

```bash
node --test "fundamental/tests/*.test.mjs"        # 60 Tests: Modell, Katalog, Projektion, KGV, Quartalsregel, Routen, Kennzahlenvergleich
node --test "core/tests/*.test.mjs" "quant/tests/*.test.mjs" "discover/tests/*.test.mjs"
python3 -m unittest discover -s scripts/quant/tests -p 'test_*.py'   # SEC-Pipeline
node scripts/quality/check-test-isolation.mjs
node scripts/core/data-quality.mjs
```

**Browser** (Playwright: `executablePath: '/opt/pw-browsers/chromium'`):
1. Release lokal bauen: `node scripts/vu2/build-release.mjs --output=<dir>`.
2. `<dir>` statisch ausliefern.
3. `node scripts/quality/vu3-regression-qa.mjs --url=http://127.0.0.1:<port> --out=<tmp>` prüft Wege, Theme, Visual-Bausteine und Kontrast. Die Fundamental-Prüfungen stehen dort in Zeile 105 und 178–188; sie verlangen u. a. die Klassen `.fu-k .fu-chg`, `.fu-crow .fu-spark i`, `.fu-cagr`, `.fu-bc.is-last .fu-b`, `.fu-stmt`, `.fu-gauge .mk-self`, `.fu-lines .fu-l-self`, `.fu-entry-list li`, `.fu-tile .fu-meter-bar i` und `.fu-mc .fu-l-m.m1` (mehrere Kennzahlen im Verlauf).
4. `scripts/quality/shell-browser-qa.mjs` prüft Shell und Dock (Fundamental-Ziele in Zeile 35–37).

**Release-Smoke:** `scripts/vu2/production-smoke.mjs` mit `CHROMIUM_PATH=/opt/pw-browsers/chromium` prüft u. a., dass `/fundamental/#/NVDA` aus der Historie liest.

**CI:**
- `fundamental-ci.yml` (Pfade `fundamental/**`, `scripts/fundamental/**`)
- `shell-ci.yml`, Job `vu3-regression` (u. a. `fundamental/**`)
- `pages-release.yml`

**Bekannte Prüfwerte zum Gegenlesen** (live am 25.10.2026):

| Ticker | Wert |
|---|---|
| URI | Q3 2026 Umsatz 4,893 Mrd. $; LTM 17,50 Mrd. $ |
| META | Q3 2026 64,60 Mrd. $ |
| TSLA | Q3 2026 28,05 Mrd. $ |
| NVDA | LTM 302,97 Mrd. $ (Q3 GJ26 bis Q2 GJ27) |
| XOM | Q2 2026 116,02 Mrd. $ |
| NTR | GJ 2025 = 31.12.2025 |

## 7. Feststehende Designvorgaben

- **Design ist abgenommen.** Keine neue Designrunde, keine Änderungen an Navigation, Charts, Farben oder Icons ohne ausdrückliche Freigabe.
- **Grundlage** ist die gemeinsame Shell und das Design-System ([PREMIUM_DESIGN_SYSTEM_2.md](PREMIUM_DESIGN_SYSTEM_2.md), [design/VU3_UI_SYSTEM.md](design/VU3_UI_SYSTEM.md)).
  - Fundamental nutzt die `--vu-*`-Tokens. Eigene Tokens stehen in `fundamental/app.css` (`--fu-*`): Akzent Lime `#9ccf1a` hell / `#c8f531` dunkel, Akzenttext `--vu-accent-text`.
  - Richtung (auf/ab) läuft über `--vu-up` / `--vu-down`.
- **Theme:** Hell und Dunkel, dieselbe gemerkte Wahl wie die ganze Plattform (`localStorage` `vu-discover-theme-v1`). Ohne Wahl startet die Seite hell; der Kommentar in `index.html` („ohne Wahl dunkel“) ist veraltet, maßgeblich ist der Code.
- **Mobile zuerst (iPhone Safari):**
  - 16-px-Eingaben gegen Fokuszoom, Bedienelemente mindestens 44 px.
  - Keine horizontale Seitenverschiebung, 16 px Seitenrand (`--fu-gutter`), Platz für das Dock (`--vu-dock-space`).
  - `prefers-reduced-motion` wird beachtet.
- **Typografie:** Inter, Zahlen tabellarisch (`.fu-num`).
- **Inhaltliche Regeln** (fester Teil des Designs):
  - Kein Urteil: keine Einstufungen („stark“, „solide“), kein Score, keine Gut/Schlecht-Farben im Vergleich.
  - Nichts wird geschätzt. Fehlende Werte bleiben leer, mit Grund.
  - Quelle je Wert sichtbar; Datenstand und „neuerer SEC-Bericht noch nicht verarbeitet“ bleiben sichtbar.
  - Rückfall auf die Discover-Daten nur mit sichtbarem Hinweis.
- **Sprache:** Deutsch, die Begriffe wie in den bestehenden Ansichten.

## 8. Nicht ohne ausdrückliche Freigabe ändern

- **Gemeinsame Shell und andere Produktwelten:**
  - `assets/site-navigation.*`, `assets/stock-navigator.*`, `assets/vu-chart.js`, Dock, Header
  - `discover/**`, `quant/**`, `screener/**`, `supertrader/**`
  - Discover hat ein eigenes Frontend-Budget-Gate; die Gates aus CLAUDE.md gelten (Supertrader Gate A, Discover, Company Intelligence).
- **Quant-Fachmodell und SEC-Pipeline:** `scripts/quant/**`, `quant/config/sec-*.json`, `quant/engines/**`. Änderungen nur in einem eigenen Quant-PR mit Vorher/Nachher-Vergleich.
- **Generierte Artefakte** (nie von Hand ändern oder mitbringen): `quant/data/**`, `discover/data/**`, `social/data/**`. Die Fundamental-Historie entsteht nur im Release.
- **Identität und Preiswahrheit:** `core/identity.js`, `core/stock-context.js`, `quant/engines/return-series.js`, `quant/engines/published-close.js`
- **Workflows und Release:** `.github/workflows/sec-*.yml`, `fundamental-sec-freshness.yml`, `pages-release.yml`, `scripts/vu2/build-release.mjs`, `scripts/fundamental/build-history.mjs` (bestimmt das Format der Scherben, das `model.js` liest)
- **Prüfungen:** Tests, Gates und Kontrastprüfungen werden nicht abgeschwächt oder abgeschaltet. Die in `vu3-regression-qa.mjs` geprüften Klassen und Wege bleiben erhalten oder werden im selben PR nachgezogen.
- **Passwortschutz der Seite:** nicht umgehen.

## 9. Historie dieses Abschnitts (PRs)

| PR | Inhalt |
|---|---|
| #869 | Fundamental 2.0 |
| #900 | Geschäftsjahresende aus der SEC-Registrierung |
| #901, #910 | Nachfolge-Emittenten XOM, DMRC, CIB, AU |
| #903, #904 | Wächter: Alarm bei veralteten Daten; nur `main` |
| #907, #916 | Lückenbericht |
| #908 | Umsatz = Gesamtumsatz (URI), IFRS-15-Rückfall |
| #913, #914 | Ergänzung aus den SEC Financial Statement Data Sets |
| #915 | Geschäftsjahresgrenzen nur aus Perioden bis zum Meldedatum |
