# VISION UNIVERSE® — Marketstack Professional Capability & Connector Parity Audit

Stand: 2026-10-07 UTC. **Teilbefund mit getesteten Connector-Korrekturen; der authentifizierte Account-Teil ist blockiert.** Dieser Bericht behauptet keine abgeschlossene Provider-/Tarifklassifikation. Die Umgebung enthält keinen `MARKETSTACK_API_KEY`; der ausdrücklich gestartete Live-Runner endet vor dem ersten Request mit `MARKETSTACK_API_KEY_NOT_CONFIGURED`. Runtime-Credential-Check: keine konfigurierten Secrets. Die GitHub-Verbindung funktioniert, kann aber den bestehenden Actions-Secret nicht lesen. Der notwendige Umgebungszugang wurde während des Laufs angefragt.

Zusätzliche Marketstack-Account-Requests / Credits: **0 / 0**. Öffentliches Website-Backend und kostenlose Provider-Verzeichnisse werden separat als solche geführt. Synthetische Testantworten sind keine Account-Evidence.

## Baseline und Untersuchungsgrenze

| Gegenstand | Gemessener Stand |
|---|---|
| Repository | dennismueller10x-sudo/vision-universe-research |
| aktueller main bei Start | `b39d8d7ddbd093d138e2844ddec2cb2bb07a6962` |
| Draft-Branch | `marketstack-connector-capability-audit`; Start b39d8d7, vor PR auf aktuellen main `829b35bdce417a78ed2cf44319df347d747ac615` gesetzt |
| Marketstack auf main | **kein Connector**, keine Marketstack-Ingestion-/Normalisierungsdateien oder -Workflows; vollständige Git-Tree-Suche, nicht nur Sparse-Dateisuche |
| geprüfter Referenzcode | offener PR #461, `3f11a5a9d523e2b12f448ff91a6ddf7783cdaf7e`; eigener schreibgeschützter Referenz-Worktree |
| weitere getrennte Implementierungen | offene PRs #330/#334/#341/#457; ETF-Probes/Normalisierung von #334/#341 wurden codebasiert mitgeprüft |
| Plan | Professional laut Nutzer; aktuelle offizielle Werbung stimmt überein; Account-Plan und Restbudget **nicht authentifiziert verifiziert** |
| Professional-Werbung | 100.000 monatliche Requests; ETF-Calls separat 20-fach; kein erfundener Account-Reststand |
| API / Auth | Referenzclient: HTTPS `api.marketstack.com/v2`; serverseitiger Query-Key nur innerhalb Fetch |
| Referenzdateien | `providers/marketstack/{client.js,adapter.js,README.md}`; `scripts/marketstack/{probe-missing-identities,ingest-de-eu}.mjs`; `scripts/market/{marketstack-budget,marketstack-cache}.mjs` |
| Pagination | generischer Client mit offset/count/total; EOD/Actions nutzen ihn. Referenzadapter hat **keine Directory-Discovery-Methode** |
| Cache | pro Prozess fünf Minuten, parameterabhängige Keys, Inflight-Deduplikation; kein Stale-Fallback. Private Ingestion nutzt getrennten verschlüsselten Arbeitsbestand/Actions-Caches |
| Budget | Referenz erzwingt gemeinsame Reservation; alte run-spezifische 15k/20k-Autorisierung gilt **nicht** für diesen Lauf. Neuer Audit: Ziel 1.999, absolute Obergrenze 3.500 zusätzliche reservierte Credits |
| Mapping / Normalisierung | Referenz: vollständige verifizierte ISIN/MIC/Listing-/Währungsidentität erforderlich; Raw-Quarantäne und unabhängige Adjustierungs-/Volume-Evidence |
| Quality Gates | Symbol/MIC/ISIN/Currency-Konflikte blockieren; ungültige OHLC/Corporate Actions explizit; vollständige Seiten und Methodikzulassung getrennt; Produktionsisolation |

Während des Audits änderte main sich durch unabhängige Daten-/Seiten-Commits. Die für diesen Connector geprüften Core-/Engine-/Provider-/Konfigurations-/Workflow-Pfade blieben im Tree-Vergleich unverändert; auch der neue main enthält keinen Marketstack-Connector. Diese Änderungen werden nicht Bestandteil des Audit-Diffs.

Main enthält die von #461 benötigten neuen ISIN-Identity-Funktionen nicht. Deshalb importiert dieser Draft ausschließlich den isolierten Transport und einen **inaktiven Provider-Observation-Vertrag**. Er registriert keinen produktiven Provider und baut keine konkurrierende Preiswahrheit. Die vorhandenen offenen Europa-/Quant-PRs bleiben getrennt. Der fehlerhafte Kandidatenstatus in deren Skript wird hier durch den neuen Resolver-Vertrag vermieden; ihre Consumer müssen den Vertrag später bewusst übernehmen.

## Quellen und reproduzierbare Evidenz

- [Offizielles aktuelles v2-OpenAPI](https://api.swaggerhub.com/apis/apilayer-863/MarketstackAPIv2/2.0.0/swagger.json), am 7.10. neu gelesen; SHA256 in [endpoint-inventory.json](endpoint-inventory.json). Alle dokumentierten Routen und Parameter sind enthalten, einschließlich Ticker-/Exchange-Varianten, ETF-/Index-/Bond-/Commodity- und Extended-Metadata-Routen.
- [Aktuelle Dokumentation](https://docs.apilayer.com/marketstack/docs/api-documentation), [Getting Started](https://docs.apilayer.com/marketstack/docs/getting-started), [Professional Pricing](https://marketstack.com/pricing).
- [Offizielle Stock Search](https://marketstack.com/search): UI ruft öffentlich `stock_api.php?offset=…&exchange=…&search=…` auf. **Das ist nicht der authentifizierte Professional-Account.** Originale Antworten in [evidence/website](evidence/website), Hashmanifest [website-raw-manifest.json](website-raw-manifest.json); URLs und UTC-Zeitpunkte pro Matrixfall.
- [Provider-EOD-Workbook](https://marketstack.com/download/v2_eod_tickers_finnworlds_tiingo.xlsx): 512.378 Symbol/MIC-Zeilen, davon 8.919 XETR. Kostenlos geladen; weder aktuelle Prices noch universelle Account-Entitlement-Evidence. Der separate [CSV-Download](https://marketstack.com/download/supported_tickers_2.csv) enthält viele alte endDate-Werte und darf keinen negativen Europa-Coverage-Beweis liefern.
- Referenz-Implementierung: [PR #461](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/461), [PR #334](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/334), [PR #341](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/341). Code und frisch gelesene Spezifikation begründen die Vertragsbefunde; alte Reports dienen nur als separat bezeichnete Beobachtungen.

## Capability- und Usage-Matrizen

[professional-capabilities.csv](professional-capabilities.csv) behandelt **jeden** genannten Professional-Punkt mit Route, Parametern, Pagination, Scope, Nutzung und getrenntem Account-Entitlement. HTTPS, Commercial Use und Support sind keine Daten-Endpunkte. [connector-usage.csv](connector-usage.csv) unterscheidet main (`NOT_USED`) von der Referenzimplementierung (`USED_CORRECTLY`, `USED_PARTIALLY`, `NOT_USED`) und enthält Aufrufer, Consumer, Cache und Fehlermapping. Gleichwertige scoped EOD-Routen müssen nicht alle produktiv verwendet werden.

[capabilities.json](capabilities.json) enthält alle 15 geforderten Provider-Flags. Sie bleiben mangels Account-Responses **UNKNOWN**. Dokumentierte US-IEX-Grenzen und worldwide-stockprice-Werbung stehen separat; Methodenexistenz, Marketing und Raw-Verfügbarkeit werden nicht zu einem `SUPPORTED` vermischt.

Die aktuelle v2-Spezifikation führt global **`/tickerslist`** mit Unternehmens-/Symbolsuche und MIC-Filter auf. `/tickers/{symbol}` ist ein exakter Lookup; global `/tickers` steht nicht in dieser aktuellen Spezifikation. `/tickerinfo` ist eine weitere, bisher im Referenzadapter ungenutzte Metadatenroute. `/exchanges/{mic}/tickers` hat das besondere `data.tickers[]`-Envelope.

## Root Causes mit Evidenzniveau

| Problem | Klassifikation | Beleg / praktische Grenze |
|---|---|---|
| Marketstack auf aktuellem main fehlt | VU integration gap | vollständiger Git-Tree enthält keinen Adapter; früherer Befund kommt aus offenen Feature-PRs |
| exakte Kandidaten erfolglos → `NOT_SUPPORTED` | **VU connector / diagnostic bug** | `probe-missing-identities` testet `.DE`/eingefrorene Kandidaten; `identityResolution` kann nach einem leeren Lookup NOT_SUPPORTED setzen. Name-, Directory- und Exchange-Suchwege fehlen; [Reproduktion](review-b-identity-diagnostic-reproduction.json) |
| symbol suffix/Legacy-Auflösung | **Identity mapping problem** | Website findet `SANT.DE` (Kontron), `STM.DE` (Stabilus), `ADN1.DE`, `HFG.DE`, `HAG.DE`, `R3NK.DE`; kein universelles Suffixschema |
| ungültige Totals / wiederholte Seiten → falsche Vollständigkeit | **VU connector bug, synthetisch belegt** | null/negative/fractional total, überlappende/repetierte Seiten, Suffix-Offset und unvollständiger Batch; [Review C](review-c-final.md). Noch kein Beweis, dass der Provider diese Defekte live liefert |
| normale EOD-/Action-Pagination | kein bewiesener Abschneidefehler | normale volle und kurze Zwischenseiten funktionieren; maxPages meldet sichtbaren Fehler. Discovery paginiert nicht falsch, sie hat bisher gar keinen Directory-Consumer |
| Intraday-Quote ignoriert interval/after_hours | **VU connector bug** | Referenz `getQuote(INTRADAY)` übergibt die Optionen nicht; neuer Vertrag und Regressionstests korrigieren dies |
| Realtime Europa aus IEX ausgeschlossen | **falsche Capability-Schlussfolgerung** | `/stockprice` ist unabhängig und worldwide beschrieben; echte Europa-Verfügbarkeit/Delay bleibt UNKNOWN |
| Raw-Trade-Time als Provider-Update-Time | **VU semantic normalization issue** | Referenz kopiert denselben Trade-/Bar-Timestamp in beide Felder; neuer Vertrag hält Update-Time null, sofern kein Raw-Update-Feld geliefert wird |
| Metadaten-Deskriptoren/Identifikatoren nicht im normalisierten Contract | **VU normalization gap, schema/code-belegt** | Referenz verliert bei vorhandener Quelle u.a. sector/industry/cik/cusip/lei/Exchange-Deskriptoren; vorhandene Raw-Hooks können diese Quelle separat erhalten |
| beobachtetes adj_close in adjustedClose fehlt | **bewusster Transform / Gate** | bleibt `adjustmentObservation.close`, bis Listing/Window-Evidence verifiziert ist; kein Grund, Quant-Adjustierung in diesem Audit zu ändern |
| alter ETF-Page-Extractor nur `data[]` | **VU connector gap** | dokumentierte Holdings liegen `output.holdings[].investment_security`; der neue Vertrag extrahiert sie und hält alle Report-Felder |
| alte Holdings tatsächlich auf 1.000 abgeschnitten | **UNKNOWN; bisher nicht belegt** | ältere befüllte Responses/Materialisierungen: AGG 12.572, BNDX 7.475, IEMG 2.704, LQD 2.910 trotz limit=1000. Diese alten Zahlen sind kein aktueller Account-Test |
| ETF FULL ohne Fonds-/Report-Identität | **VU completeness-contract bug** | synthetisch falscher Ticker, fehlender Report, leere und überlappende Seiten; korrigiert, Gewichte und Duplikate nicht verändert |
| Europa-EOD bis 5.10. statt 6./7.10. | **UNKNOWN** | kein aktueller authentifizierter Raw-/Cache-/Zeitvergleich; korrekter Referenz-Latest-Endpoint allein beweist keinen Publication-Delay |
| Plan limitation | **UNKNOWN** | kein aktueller Account-Entitlement-Response; Pricing/Key-Anwesenheit würde keinen konkreten Account-Plan allein beweisen |

## Website / API / VU-Parität

Die vollständige [39-Fälle-Matrix](website-api-vu-parity-matrix.csv) und [JSON-Evidence](website-api-vu-parity-matrix.json) enthält alle 27 angeforderten Aktien, SPY/QQQ/VOO/VTI/SCHD und sieben konkrete UCITS-Kandidaten: iShares SXR8.DE/EUNL.DE, Xtrackers XDWD.DE/XESC.DE, Vanguard VWCE.DE, SPDR SPY5.DE, Amundi LCUW.DE.

Ergebnis des öffentlichen Website-Tests: **26/27 europäische Hauptlistings** gefunden; Schaeffler nur alternative Listings beobachtet. Alle 27 Firmen haben irgendeinen Treffer; alternative ADR/OTC-Treffer werden nicht als deutsches Hauptlisting gewertet. **12/12 ETF-Kandidaten** gefunden. API Found bleibt UNKNOWN, Raw latest/history NOT_TESTED, VU Marketstack auf main nicht vorhanden. Deshalb wird **kein** Fall ohne Account-Probe als WEBSITE_ONLY oder API_COVERAGE_GAP etikettiert.

Wichtige tatsächliche Suchbefunde:

- SAP.DE liegt bei ungescopter SAP-Suche auf **Seite 2**, offset100 von total144. Ein neuer Discovery-Consumer muss vollständig paginieren. Das beweist nicht, dass der alte Consumer bereits Seite1 abgeschnitten hätte.
- Der Website-Exchange-Selector `XETRA` findet SAP nicht; die Raw-Response/MIC-Suche `XETR` findet SAP.DE. Begriff, Dropdowncode, MIC und Provider-Ticker müssen getrennt bleiben.
- Banco Santander SAN.MC erscheint über Ticker-Suche, obwohl die kombinierte Name/MIC-Suche leer blieb. Ein leerer Suchweg ist keine negative Coverage-Zertifizierung.
- Broad company searches enthalten fremde Firmen/Fonds (Siemens Energy/Healthineers, Fresenius Medical Care, Abbott bei ABB). Diese sind **observedSearchMatches**, keine verifizierten Aliase. Aus dem ausführbaren Plan wurden alle solchen Alias-Fallbacks entfernt.
- Workbook und Website widersprechen sich bei SIX: ABBN.SW/SCMN.SW haben im Workbook BTEE, im Website-Backend XSWX. Automatische Gleichsetzung ist nicht zulässig; echte API-Identity ist offen.

[exchange-mapping-independent.json](exchange-mapping-independent.json) führt alle angeforderten Handelsplätze auf. Suffixspalte wurde aus den gespeicherten Raw-Tickern abgeleitet, nicht aus Börsennamen erfunden. VU Marketstack-Mapping auf main fehlt; Referenz-MIC ist von Provider-/Dropdown-Beobachtung getrennt.

## Latest, Realtime, EOD-Freshness, Historie und Actions

Dokumentation unterscheidet US-IEX-Intraday mit `marketstack_last` von weltweit beworbenem `/stockprice`. Das stockprice-Schema liefert **last known price / last known trade time**, keine universelle Delay- oder Update-Garantie. Pricing erklärt Real-Time Updates als Intraday-Intervalle unter15min. Es gibt Docs-Widersprüche: stockprice-Prosa nennt bid/ask/volume, während das Schema sie nicht enthält; interval-Beispiel `1h` widerspricht dokumentiertem `1hour`; älterer Quickstart enthält eine widersprüchliche EOD-Route. Der neue Vertrag folgt den dokumentierten Routen/Parametern und bewahrt Raw-Abweichungen.

Für SAP/Siemens/Allianz/Telekom/ASML/LVMH/ABB stehen Europas Klassifikation und timestamp/price/currency/exchange/update/delay auf **UNCLEAR / NOT_TESTED**. Kein Real-Time-, Delayed- oder EOD_ONLY-Scope wird aus Marketing abgeleitet. Der Runner vergleicht frisches EOD/latest, enges date_from/date_to-Fenster, qualifizierte stockprice-/explizite lokale Kandidaten und Intraday separat mit CacheTTL0. Er muss danach selbst aus den Raw-Timestamps und verifizierten Sessions bewertet werden; momentan sind falsche Parameter, Publication-Delay, Provider-Cache, privater VU-Cache und Normalisierung als Ursache nicht eindeutig ausgeschlossen.

[representative-plan.json](representative-plan.json) enthält **42 Fälle**: 39 Paritätsfälle plus AAPL/TSLA/NVDA als unterschiedliche Corporate-Action-Kontrollen. SAP/ASML/AAPL erhalten 1Y/5Y/10Y/15Y/full-Boundary-Samples mit limit1/ASC statt Vollhistorienimport. Getrennte Split-/Dividend-Feeds und EOD-Fenster um drei bekannte Splits bewahren Raw-, Adjusted- und Volume-Felder. Verfügbarkeit/Adjustierungssemantik ist erst nach diesen Live-Probes zu beurteilen; keine allgemeine Aussage aus einem Titel.

## ETF-Vollständigkeit und Metadaten

`/etflist` hat dokumentierte Pagination. `/etfholdings` dokumentiert limit/offset, sein Response-Schema jedoch **keine pagination/total**. Ältere Counts über1000 zeigen, dass limit nicht blind als Positionsgrenze gelten darf. Der neue Vertrag stoppt ohne Pagination standardmäßig unbestätigt; explizite Offset-Differenzprobes für SPY/QQQ dienen der Semantikprüfung. Dokumentierte Limits allein beweisen keine wirksame Paging-Unterstützung.

Pro Rückgabe werden reportedTotal, heruntergeladene Zeilen, Seitenzahl, originale signed percent_value-Werte, unveränderte Gewichtssumme, Report-Datum, separate period-end-Werte, Identifikatoren, Country und alle Raw-Report-/Holding-Felder gehalten. Kein synthetischer Gesamtbestand und keine 100%-Normalisierung. FULL bestätigt höchstens vollständig geladene Seiten desselben verifizierten Reports; Aktualität und wirtschaftliche Vollständigkeit bleiben separat. Fehlende Attribute, falscher Fonds, leere Positionen oder wiederholte Seiten verhindern FULL. Wiederholungen werden **nicht** aus dem Bestand oder der Gewichtssumme gelöscht.

Dokumentierte ETF-Felder: fund_name/file_number/cik/reg_lei; series_name/id/lei, ticker/ISIN, report-period/final_filing/signature; pro Position LEI/ISIN/CUSIP/name/title/units/balance/currency/value_usd/percent_value/asset_category/collateral/fair-value/invested_country/issuer_category/loan/payoff/restricted. Kein dokumentierter strukturierter AUM-/TER-/OCF-/Benchmark-/UCITS-/AccDist-/Replikations-/NAV-/Inception-/FundCurrency- oder Allocation-Contract in diesen ETF-Schemas. Das ist **schema-scoped**, keine Aussage PROVIDER_DOES_NOT_HAVE. Extended tickerinfo wurde zuvor nicht genutzt und ist im Runner vorgesehen; tatsächliche zusätzliche Raw-Felder und UCITS-Holdings bleiben UNKNOWN.

[raw-vs-normalized.csv](raw-vs-normalized.csv) trennt aktuelle öffentliche Website-Beobachtung, dokumentierte Felder und bedingte Referenz-Normalisierungsverluste. Nicht getestete Account-Felder werden nicht als RAW_ABSENT klassifiziert. Im neuen Audit bleibt der gesamte Original-Response getrennt von normalisierten Beobachtungen und Produkten.

## Umgesetzte isolierte Korrekturen und Prüfungen

- realer Directory-/Exchange-/Price-/Action-/Holdings-Contract ohne Produktregistrierung oder Fake-Capability;
- robuste count/offset/total-Pagination, veränderte Totals, Wiederholungen, sichtbare Caps, Suffix- und Batch-Vollständigkeit;
- exakte und explizite Symbolkandidaten mit UNKNOWN statt voreiligem Provider-Negativurteil; keine automatisch erfundenen Suffix-/Alias-/ISIN-Mappings;
- verschachtelte Exchange-MIC-Erhaltung und ETF-Extraktion; dediziertes Actions-Schema ohne erfundenen MIC;
- Weitergabe von Intraday-Parametern, unabhängige stockprice-Routingsemantik, warm-cache-bypass bei TTL0;
- dokumentiertes 404_not_found-Fehlermapping; Originaltext vor Normalisierung gespeichert; keine Provider-Time-Erfindung;
- FULL-Gates und Raw-Feld-/Weight-/Duplicate-Preservation; accountabhängige Capability-Flags bleiben UNKNOWN;
- ausdrücklicher Offline-Default, maximal1.999/3.500 reservierte Credits, Ledger vor Fetch, private externe Outputs, Auth/Quota/Budget-Circuit und keine Schedules.

**90/90 Tests unter Node22.23.3 bestanden**: 28 neue Connector-/Runner-Tests plus bestehende Core-Identity-, Provider-, Tiingo- und Realtime-Wiring-Regressionen. [TAP](node22-tests.tap). Produktionsisolation bestanden. Sechs unabhängige Reviews A–F haben die gefundenen Fehler nach Korrektur erneut geprüft: [A](review-a-final.md), [B](review-b-final.md), [C](review-c-final.md), [D](review-d-final.md), [E](review-e-final.md), [F](review-f-final.md). Sie bestätigen die isolierten Verträge, nicht ungetestete Account-Capabilities.

Keine Änderungen an Produktion, Universum, Quant-/ETF-Methodik, Rankings, SuperTrader, Tiingo, Produktdaten, Core-Identity, Workflowdateien oder Schedules. Der Draft enthält nur Provider-Code, Audit-Tests/Runner und Dokumentation/Evidence.

## Die 14 Abschlussfragen

1. **Alle Professional-Endpunkte genutzt? Nein.** Auf main keiner; Referenzadapter nur acht globale/exakte Routen, Directory/Extended-Metadata/ETF/Index/Exchange-Contracts fehlen. Matrix enthält Einzelheiten.
2. **Ticker Discovery vollständig paginiert? Nein als Gesamtprozess.** Referenz hat keinen Directory-Discovery-Consumer. Normale bestehende EOD-Pagination funktioniert; neue Discovery ist seitenübergreifend getestet.
3. **API und Website dieselben Aktien? Nicht verifiziert.** Website-Hauptlisting26/27; authentifizierte API-Parität UNKNOWN, keine WEBSITE_ONLY-Behauptung.
4. **Warum adesso/HelloFresh/HENSOLDT/RENK/Schaeffler fehlten?** Enge Kandidaten-/Identity-Resolution und voreiliges NOT_SUPPORTED sind bewiesen. Website findet die ersten vier lokal; konkrete API-/ISIN-Blocker und deutsches Schaeffler-Listing sind offen. Nicht als Provider-Nichtverfügbarkeit behaupten.
5. **Aktuellere Europa-Preise über anderen Endpoint? UNKNOWN.** Separates stockprice existiert und ist worldwide dokumentiert; aktuelle Responses fehlen.
6. **Real-time Stock Market Prices praktisch Europa?** Weltweit beworbener Last-Known-Trade-Snapshot; reale Markt-/Zeitstempel entscheiden die Klassifikation, nicht der Produktname.
7. **Europa Realtime/Delayed tatsächlich abrufbar? Nicht bewiesen.** Gegenwärtig UNCLEAR, kein US-only-Schluss aus IEX.
8. **EOD wegen Endpoint/Cache veraltet? UNKNOWN.** Referenz verwendet korrekt eod/latest; TTL/cache/date bounds/provider publication müssen mit neuen Raw-Responses verglichen werden.
9. **Holdings mehr als bisher materialisiert? UNKNOWN.** Endpoint kann laut älteren separaten Responses mehr als1000 Zeilen liefern; aktueller Download und Feldvergleich ausstehend.
10. **Holdings künstlich wegen Pagination abgeschnitten? Nicht belegt.** Extraktor-/Contract-Lücke real, pauschale Top1000-Behauptung durch alte große Counts nicht gestützt; tatsächliche offset-Semantik offen.
11. **Welche ETF-Metadaten wirklich vorhanden?** Schema-Felder oben konkret nachgewiesen; Account-Raw-Verfügbarkeit und weitere tickerinfo-Felder UNKNOWN. Keine providerweite Metadaten-Abwesenheit behaupten.
12. **Welche Normalisierungsverluste?** Code/Schemakontrakt zeigt schmale Metadata-Projektion und Timestamp-Semantik; EOD adj_close ist bewusste Beobachtung/Admission-Trennung; ältere Holding-Zeilen/Gewichte wurden schon erhalten. Aktueller per-title Account-Vergleich fehlt.
13. **Notwendige Fixes?** Directory-Contract, robuste Pagination/Completeness, sichere Kandidatenklassifikation, Intraday-Parameter, Raw-/Zeit-/Exchange-Feldhaltung, verschachtelte ETF-Routen und Vollständigkeitsgates umgesetzt; spätere bewusste Übernahme in offene Consumer-PRs und aktuelle Account-Probes nötig.
14. **Frühere Schlussfolgerungen korrigieren?** Kandidatenfehler ≠ Provider-Abwesenheit; US-IEX ≠ worldwide stockprice-Scope; erste1000 ≠ tatsächliche Holdings-Grenze; nicht materialisierte Metadata ≠ providerweit fehlend; unbekannte Capability ≠ unsupported; vorhandene ungemergte Implementierung ≠ aktueller main/Production.

## Ausstehender Abschluss

Zum endgültigen A/B/C-Nachweis fehlt ausschließlich der authentifizierte Ausführungszugang und die daraus entstehende Raw-Evidence-Auswertung. Nach Secret-Bindung:

```bash
node scripts/marketstack/capability-audit.mjs --live --out=/absolute/private/new-marketstack-audit
```

Keine vollständigen Historien oder Universe-Imports nötig. Accountname/Entitlements, alle Rohantworten, Preiszeitpunkte, offset-Differenzen, Holdings-Report-Identitäten und Raw-vs-normalized-Verluste müssen danach geprüft und die UNKNOWN-Zellen evidenzbasiert ersetzt werden. **Der Gesamtlauf ist bis dahin nicht als erfolgreich abgeschlossen zu werten.**
