# Supertrader 8.0 – Integrationsstatus

Stand 27.10.2026. Supertrader 8.0 ist technisch vollständig auf `main` integriert, aber **nicht öffentlich aktiviert**. Die Gesamtdokumentation steht in [SUPERTRADER_8_PRODUCT_INTEGRATION.md](SUPERTRADER_8_PRODUCT_INTEGRATION.md).

## Merges (Owner-Freigabe vom 26.10.2026)

| PR | Inhalt | Geprüfter Head | Merge-Commit |
|---|---|---|---|
| #969 | EOD-Datenadapter und Datenqualitätsvertrag | `232ccd0` | `66486ab` |
| #970 | Kandidaten-Pipeline, Forschungsstufen, Ranking | `d7424b6` | `236902d` |
| #971 | Frontend-Integration, Vorschau standardmäßig aus | `c512241` | `57ed383` |

Gemergt wurde jeweils per Merge-Commit, nacheinander. Vor jedem Merge kam `main` in den PR, und die Pflichtprüfungen liefen auf dem tatsächlichen Merge-Stand. Für #971 wurde der nach der CI hinzugekommene `main` (nur Daten-Läufe und #984) lokal geprüft und nicht erneut gepusht.

## Pflichtprüfungen

**PRs:** core, contract, marker, gates (Gate A bis F mit Browser-QA gegen das Release), shell, vu3-regression, fundamental-compare und Cloudflare Pages waren auf allen drei geprüften Heads grün.

Auf #971 wurden `core` und `gates` je einmal neu gestartet. Ursache war die Infrastruktur, nicht der Code:
- `core`: Der Git-Checkout hing 15 Minuten, und das Zeitlimit griff, bevor ein Test lief.
- `gates`: Checkout (5,5 Minuten) und Browser-Installation (11 Minuten) waren so langsam, dass Gate F ins 30-Minuten-Limit lief.

**Vercel** war auf allen PRs rot wegen des Free-Plan-Limits (`api-deployments-free-per-day`, 100 Deployments pro Tag). Vercel ist kein erforderlicher Check; das Limit ist eine dokumentierte Einschränkung (Owner, 26.10.).

**`main` nach dem Merge:**

| Workflow | Commit | Ergebnis |
|---|---|---|
| Shell Quality Gates | `57ed383` | grün |
| Quant 2.0 Production Pages | `57ed383` | grün |
| Supertrader Quality Gates | `57ed383` | rot – nur Quant-2.0-Regression, 1 von 3.120 (siehe unten), kein Supertrader-Test |
| Supertrader Quality Gates (manuell neu gestartet) | `7cc3f26` | grün (Run 40461747972: Gate B–F, Discovery- und Quant-2.0-Regression, Browser-QA 390/1280 px, Secret-Prüfung) |

## Quant-Befund (nicht Supertrader)

- **Test:** `quant/tests/product-services.test.mjs:147` – „shared Screener and Atlas suppress raw quotes and prohibit price probing under derived-only grants“, `AssertionError: expected true, actual false`.
- **Erstmals rot:** auf `main` `f10afd9` („Marktdaten-Refresh … (Tiingo EOD)“, 27.10.). Auf `236902d` war der Test noch grün. Dazwischen lagen nur Daten-Läufe und #984, kein Supertrader-Code.
- **Ursache laut Quant-Session:** Der Test setzte voraus, dass NVDA `momentum6m >= 0` erfüllt. NVDA lag am 27.10. bei −5,3 %.
- **Behoben:** durch #988 (`7cc3f26`, „Quant-Test: Screener-Prüfung marktunabhängig“). Lokal auf `7cc3f26`: 46 von 46 Tests grün.

Für die Supertrader-Session ist nichts mehr offen.

## Bestätigungen auf `main`

- **Produktionsoberfläche unverändert:** Ohne Vorschau-Schalter (`?sfPreview=1`) lädt die Supertrader-Seite weder `sf-research.js` noch Kandidatendaten.
  - Browser-QA auf dem `main`-Release: 62 Aufrufe, 0 Fehler, keine Research-Anfrage.
  - Der öffentliche Build enthält 0 Dateien unter `supertrader/data/sf-candidates`.
  - Navigation, Dock, Hero und Charts sind unverändert. `supertrader.js` wurde nur ergänzt, nichts entfernt.
- **Referenzschutz:** keine Änderung unter `scripts/supertrader/source-faithful/artifacts`, `supertrader/data` oder `core/registry`.
  - Alle 13 Strategien stehen auf `liveReadiness: LIVE_NOT_APPROVED`.
  - `VALIDATED_TRADE_SIGNAL` ist für keine Strategie erreichbar.
  - Die 83 Quarantäne-Sitzungen und CC-5 bestehen unverändert.
  - Es gibt keine neuen Datenanbieter und keine API-Kosten.
- **Tests auf `main`:** core 239/0; Supertrader 896/0, darin Produktvertrag und Vorschau 17/0.
- **C08:** Die Momentum-Schwelle 98 bleibt eine gekennzeichnete Research-Modellannahme (O-6). Die Erkennung nutzt nur abgeschlossene Tagesbalken; die technische Materialisierung entsteht nach Sitzungsende.
- **Scheduler:** Auf `main` gibt es keinen SF8-Workflow, und kein Workflow ruft den Produktpfad (`source-faithful/product`) auf.

## Offen für eine spätere öffentliche Freigabe

- Visuelle Owner-Abnahme der befüllten Vorschau.
- Echte WebKit-/Safari-Prüfung; bisher nur Chromium-Emulation, ausdrücklich **nicht bestanden**.

## Tageslauf #973

Der PR bleibt Draft und deaktiviert, mit Basis `main`:
- keine Repository-Variable `SF8_CANDIDATES_ENABLED`,
- kein Zeitplan,
- kein produktiver Datenlauf.

Voraussetzungen, alle offen:
- **V1:** Stabilität der SEC-/Quant-Consumer-Pipeline nachweisen.
- **V2/V3:** Registry und Datenqualität, siehe [SUPERTRADER_8_INTEGRATION_BLOCKER_V2_V3.md](https://github.com/dennismueller10x-sudo/vision-universe-research/blob/supertrader-8-d-daily-activation/docs/SUPERTRADER_8_INTEGRATION_BLOCKER_V2_V3.md) auf dem #973-Branch.
- **V4:** Abgleich mit `published-close.js`.
- **V5:** Freigabe der Vorschau durch den Owner.
- **V6:** Variable setzen und ein eigener PR für den Zeitplan.

## Infrastruktur-Hinweis (Vorschlag, nicht umgesetzt)

Die Timeouts entstehen beim Checkout aller Branches eines Repositorys mit rund 2 Millionen Git-Objekten und bei der Browser-Installation. Ein flacher Checkout nur des PR-Refs (`fetch-depth`) und eine zwischengespeicherte Browser-Installation würden sie dauerhaft beheben. Das betrifft Core- und CI-Workflows und gehört deshalb in einen eigenen, vom Owner freigegebenen PR.
