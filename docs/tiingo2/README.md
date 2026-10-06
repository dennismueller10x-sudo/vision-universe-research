# Tiingo 2.0: dynamisches US-/ADR-Universum

Dieser Lauf baut auf dem akzeptierten Audit aus [Draft-PR #346](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/346) auf. Die produktiven Daten und das Routing bleiben unverändert. Der neue Refresh erzeugt private Evidenz, nachvollziehbare Entscheidungen und konkrete additive Canonical-Dateien zur späteren Publication.

## Ablauf und Betrieb

```text
Fresh Tiingo Discovery → Listing-Auswahl → Security Classification
→ Identity/Dedupe → Consumer Policy → Preis-/Action-/SEC-Prüfung
→ additive Canonical-Staging-Dateien → bestehende Produktprojektionen
→ manifestgebundene QA → transaktionale Publication
```

`scripts/market/tiingo2-refresh.mjs` verwendet den aktuellen Tiingo-Katalog, nicht den September-Snapshot. `.github/workflows/tiingo2-universe-refresh.yml` führt Discovery und Staging werktäglich um 08:20 UTC aus. Der Schedule wird erst mit einer Übernahme auf den Default-Branch aktiv. Die bisher ausgeführten Branch-Läufe waren rein lesend gegenüber Produktion. Der Workflow besitzt nur `contents: read` und ruft keinen Publication-/Deployment-Schritt auf.

```bash
# Authentifizierter Lauf: vorhandenen TIINGO_API_KEY verwenden, niemals ausgeben.
node scripts/market/tiingo2-refresh.mjs --run-id "operator-YYYYMMDD" --probe --max-symbols 750

# Reproduzierbare Offline-Discovery; ohne --probe keine erfundenen Preisprüfungen.
node scripts/market/tiingo2-refresh.mjs --run-id "offline-YYYYMMDD" \
  --from-zip .market-cache/tiingo2/fresh-symbols.zip --offline

# Ausschließlich abgeleitete, explizit freigegebene Felder exportieren.
node scripts/market/tiingo2-export.mjs \
  --run-dir .market-cache/tiingo2/runs/RUN_ID --out .verification/tiingo2
```

Ein Discovery-Run speichert Ticker, Asset Type, Venue, Listing-Zeitraum, Statusbasis, verfügbare Währung/Namen, Provider-Metadaten, Zeitstempel und Run-ID. Fehlende Provider-Felder bleiben ausdrücklich unbekannt. `endDate` ist keine hinreichende Delisting-Bestätigung. CSV-/ZIP-Parsing, Prüfsummen, immutable Discovery-Runs, Cache-TTL/304 und Wiederaufnahme werden getestet. Fehler ersetzen keine erfolgreiche Discovery.

Preis-Evidenz bleibt lokal unter `.market-cache/tiingo2`. Da Actions-Caches eines öffentlichen Repositories keine Vertraulichkeitsgrenze bilden, persistiert CI ausschließlich `.market-cache/tiingo2-cache.enc`: AES-256-GCM, zufälliger Salt/Nonce, domänenseparierter HKDF mit dem bestehenden `TIINGO_API_KEY` und Branch-Kontext. Kein zusätzlicher Schlüssel ist nötig. Restore authentifiziert vollständig vor dem Entpacken; falscher Schlüssel, Tampering und Key-Rotation führen zu einem sicheren Cache-Miss. Traversal, Links und Credential-Dateien/-Inhalte werden abgewiesen. CI entfernt temporäre Klartextdaten immer; die drei früheren Tiingo2-Klartext-Caches wurden gelöscht. Die vorhandenen Produktions-Caches bleiben unberührt. Nach dem ersten Listing-Abruf werden Metadaten und fünf überlappende Handelstage aktualisiert. Historische Adjusted-Spalten werden nur bei nachgewiesenem konstantem Preis- und Volumen-Multiplikator rebasiert. Rohdatenrevision, fehlender/intransparenter Overlap oder eine neue Listing-Generation erzwingen einen vollständigen Listing-Abruf. Regeländerungen prüfen vorhandene Rohdaten erneut, ohne sie erneut abzurufen. Budgets rotieren über offene Kandidaten; Auth-/Rate-Limit-Fehler stoppen den Lauf, fehlgeschlagene Symbole blockieren nicht dauerhaft dessen Ende. Historische Revisionen vollständig vor dem Overlap erfordern weiterhin den bestehenden periodischen Langserien-Refresh.

## Identität, Policy und Qualität

Ein Ticker allein beweist keine Identität. Die neue Prüfung verlangt passenden Listing-Zeitraum, Venue, Provider-Symbol, vollständige normalisierte Issuer-Namen und eine ausdrückliche Share-Form. Nasdaq-Verzeichnisse dienen der Listing-/Security-Verifikation; Tiingo bleibt der Preisprovider. Recycelte Ticker werden getrennt geprüft. BRK.A/BRK.B und GOOG/GOOGL bleiben eigenständige Securities.

`tiingo2-identity.mjs` bewahrt bestehende IDs und historische Listings. Gleicher CIK oder ähnlicher Name erzeugt höchstens einen Review-Vorschlag. Bestätigte Tickerwechsel benötigen Tiingo-Action-Evidenz oder einen dauerhaften Security-Identifier; `--symbol-actions PRIVATE_JSON` übergibt solche Evidenz. Das Modul erzeugt Alias-/History-/URL-/Watchlist-Prüfvorgaben, schreibt aber keine produktiven Alias-Routen. Im Live-Katalog fehlen entsprechende Action-Identifiers; der finale Lauf bestätigt daher keinen automatischen Tickerwechsel. Katalog-Abwesenheit führt niemals zu einer Löschung.

Die tatsächliche bestehende Consumer-Policy erlaubt Common Equity, ADR und bestehende separate Klassen einschließlich REIT/TRUST/SPAC; sie schließt Banken und REITs nicht pauschal aus. Diese Policy wurde nicht erweitert. Preferred, Warrants, Rights, Units, Funds/ETFs und bestätigte Duplikate bleiben ausgeschlossen. Neue unbekannte Formen benötigen Review. Preferred Bank wird nicht aufgrund seines Firmennamens zu Preferred Equity. Ein NASDAQ-Fünf-Buchstaben-Suffix allein verdrängt ausdrücklich belegte Common Shares nicht. Bare „Depositary Shares“ beweisen keinen ADR. Fund-Beschreibungen über Tochtergesellschaften klassifizieren nicht den operativen Mutterkonzern als Fund.

Jede Entscheidung enthält Reason Codes und aktive/Preis-/Identity-/SEC-/PIT-/Faktor-Prüfungen. `AUTO_ACCEPT` bezeichnet bestandene Kandidaten-Voraussetzungen, keine erfolgte Publication. `productReadiness` ist ebenfalls eine Daten-Voraussetzung; der Export kennzeichnet dies ausdrücklich. Ohne SEC/PIT werden keine Fundamental- oder Quant-Faktoren erfunden. Private `MarketFactors.computeFactors`-Teilberechnungen reichen ausdrücklich nicht für Quant-ready: erforderlich sind reale Canonical-Factor-Evidence-Bytes, passende SHA256/Schema/Methodologie/Identity/CIK/Beobachtungstag und ein tatsächlich verfügbarer Faktor im bestehenden Vertrag. `quantCandidateEligible` beschreibt getrennt die Eingabedaten-Voraussetzungen; `PARTIAL` und fehlende Benchmark-/Langfrist-Metriken bleiben sichtbar. Der bestehende vollständige Sieben-Faktor-Score bleibt methodisch gesperrt. Discover, Screener und SuperTrader benötigen eigene vorhandene Capability-Evidenz.

Das Corporate-Action-Gate unterscheidet `VALID_SPLIT`, `VALID_REVERSE_SPLIT`, `VALID_SHARE_ACTION`, `SUSPICIOUS_PRICE_BREAK`, `MISSING_PROVIDER_ACTION`, `BAD_SERIES` und `UNKNOWN`. Es prüft die Änderung von Adjusted/Raw-Faktoren statt einen legitimen ex-day Marktverlust als Splitfehler zu interpretieren. Tiingo-Cash-Reinvestment verwendet exakt `splitFactor × (1 + cashDividend / exDayClose)`; generische Alt-Aufrufer behalten ihre Previous-Close-Konvention. Gleichzeitige Split-/Cash-Actions, Reverse Splits, Rundung, fehlende Actions und numerischer Overflow werden getestet. Toleranzen und Gap-Gates wurden nicht aufgeweicht. Eine gültige erste Action außerhalb des beobachteten Return-Fensters wird nicht fälschlich als Serienfehler behandelt.

## Publication und Rollback

`tiingo2-publication.mjs` bereitet append-only Raw-, Eligibility-, Name- und Instrument-Shards vor. Bestehende Zeilen/IDs müssen unverändert bleiben. Reconciliation bestehender oder historischer Identitäten wird getrennt blockiert. Der Produktionsdiff zeigt `ADDED`, `REMOVED`, `RECLASSIFIED` und `UNCHANGED`; dieser Refresh erzeugt keine Removals.

Die vorbereiteten Membership-Dateien genügen noch nicht zur Freigabe. `attachCanonicalProjections` verlangt tatsächliche Ausgaben der bestehenden Canonical-/Search-/Capability-/Product-/Discover-Builder sowie verfügbare Preis-Lieferung. Bestehende Manifest- und Search-Shard-Referenzen müssen erhalten bleiben. Anschließend verlangt `applyCanonicalPublication` einen QA-Proof mit der **SHA256 des konkreten Manifests** und PASS für IDENTITY, BASELINE, PROJECTIONS, SEARCH, CHARTS, WATCHLIST, QUANT, DISCOVER, SCREENER, SUPERTRADER, SEC, RELEASE und BROWSER. Ein früherer Baseline-Testbericht ist kein solcher Proof.

Apply verwendet einen Writer-Lock, Hash-CAS aller Quellen, Backup/Receipt und atomare Dateiersetzung. Ein unterbrochener PREPARED-Lauf wird vor einem Retry zurückgesetzt. Ein nachweislich toter lokaler Lock-Owner kann sicher wiederaufgenommen werden; konkurrierende Writer bleiben gesperrt. `rollbackCanonicalPublication` stellt die exakten vorherigen Bytes wieder her und verweigert das Überschreiben nachträglicher Änderungen. Diese Abläufe wurden ausschließlich in isolierten Testverzeichnissen geprüft. Es fand keine produktive Publication statt.

## Ergebnisse und Evidenz

Die finale Auswertung und alle 18 verlangten Ergebnisfelder stehen in [FINAL_REPORT.md](FINAL_REPORT.md). Maschinenlesbare Artefakte liegen in diesem Verzeichnis; vollständige Discovery-Records, normalisierte Provider-Serien und konkrete Stage-Dateien bleiben im privaten Run-Cache. Öffentliche Artefakte enthalten Metadaten, Status, Counts, Hashes und dimensionslose Diagnostik, keine Provider-Kursserien oder absoluten Preis-/Faktorwerte.

- [Fresh Discovery](tiingo2_fresh_discovery.json), [Universe Diff](tiingo2_universe_diff.json), [258 Candidates](tiingo2_staged_candidates.json)
- [False Exclusions](tiingo2_false_exclusions.json), [Corporate Actions](tiingo2_split_false_rejections.json)
- [New Listings](tiingo2_new_listings.json), [Symbol Changes](tiingo2_symbol_changes.json), [Consumer Policy](tiingo2_consumer_policy_report.json)
- [Publication Preview](tiingo2_publication_preview.json), [Final Summary](tiingo2_final_universe_summary.json), [unabhängige QA](tiingo2_regression_qa.json), [finaler Classifier-Review](final-classifier-review.json)
- [Issuer Events / verbleibende Reviews](issuer-event-review.json), [verifizierte Security-Form](security-form-evidence.json)

Die Tests umfassen Discovery, Listing-/IPO-Freshness, Identity/Symbolwechsel, Dedupe, Policy, Preferred/Bank/REIT, Corporate Actions, DNA/AMC/BIRD/AMWL, Cache-Upgrade, Incremental-Rebase, Public-Export sowie Publication/Recovery/Rollback. Die bestehenden Produkt-, SEC-, Release- und Chromium-Smokes werden zusätzlich geprüft. SEC, ESEF, Quant, Discover und SuperTrader wurden nicht neu implementiert; bestehende Produktionsdaten, URLs, Benutzerlisten und Routing wurden nicht migriert.
