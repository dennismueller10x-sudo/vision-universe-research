# Official filings follow-up

`scripts/official-filings/europe-follow-up.mjs` evaluates official financial evidence for an explicitly SHA256-pinned private Discover identity catalog. Financial coverage is a separate result; missing filings, LEI, shares, EPS or financial engine inputs never remove an admitted Discover security.

The producer imports the unchanged reviewed `europe-fundamentals-mapping-2.1.0` mapper. It does not copy financial normalization, change metrics, load UI data, perform network calls or write production files. Existing official OAM records, original ESEF packages and parser receipts are replayed through that mapper's original-byte context, unit, concept, issuer, fiscal period and numeric checks. Its supported filing ingestion is currently French OAM/ESEF. The source policy reserves SEC for actual SEC filers; this wrapper does not add a SEC filing ingestion path.

Catalog binding requires exact Company → Security → Listing associations, checksummed ISIN, one selected primary listing, current private identity admission, European issuer country, exact listing MIC and local quote currency, and protected ID exclusion. The selected listing is a product display choice; it is not promoted to a certified exchange primary. Secondary quote currencies remain local. ADR identities are refused; no ADR financial or quote information is transferred to European listings.

A new exact ISIN-scoped, hash-bound GLEIF response can resolve an issuer for the separate financial evaluation without changing or consolidating catalog company keys. An issuer-owned class/country reference without an exact financial issuer relationship remains `OFFICIAL_IDENTITY_REQUIRED` here. Multiple listings and classes never become one company through a name match.

Marketstack fundamentals, if separately supplied, remain `OPTIONAL_SUPPLEMENT`. Original fields survive with exact company/security/class/listing/MIC/currency and raw hash binding. They cannot supply official facts, establish local shares/EPS, certify currency conversion or create Quant inputs. No paid provider requests are needed by this producer.

Outputs are `FUNDAMENTALS_PARTIAL`, `FUNDAMENTALS_NONE` or `OFFICIAL_IDENTITY_REQUIRED`. Every row retains `discoverAdmissionDependency: false`, `quantFinancialInputReady: false`, `admittedToRanking: false` and `publicationAllowed: false`. Full financial readiness remains zero. Original filing links without parsed verified facts are reported separately from fiscal facts. Dated source observations remain explicitly dated.

Validation: `node --test scripts/official-filings/tests/europe-follow-up.test.mjs`. Tests exercise authentic tiny ESEF ZIP facts, missing official identity without Discover removal, separate issuer resolution without company merging, pinned catalog/private gates, foreign/ADR/protected/class conflicts, secondary currencies, normalized numeric tampering and optional provider supplementation. Actual expanded-catalog coverage must be reported only after binding the final catalog and replaying its original official source bytes.

## Actual private follow-up

The original official evidence was replayed on 10 October 2026 against the 503-security catalog captured in identity pass 6, SHA256 `76ff8e56c7693fa4245fc78791203be7819f6926361dbbf9571f1a8815617672`. It contains 493 verified legal entities plus one security-scoped issuer group. The private follow-up report SHA256 is `6a676073a9f46d31a77b0789f99c259f528a872c90042c7b8ca52c8d92829baa`.

There are 11 `FUNDAMENTALS_PARTIAL` securities, 489 `FUNDAMENTALS_NONE` and three `OFFICIAL_IDENTITY_REQUIRED`, with 32 separately reported official filing links and 80 verified issuer-level fiscal facts. URW contributes six verified FY2025 facts from its already captured original official package. All 11 partial rows remain uncertified for local shares, EPS and financial engine inputs. Full financial readiness and Quant input readiness are zero.

The three financial identity gaps are Nordea, Nokia and UPM. Their Discover issuer/class or issuer-country proofs are preserved in catalog evidence. The existing financial mapper does not claim an exact GLEIF ISIN relationship where the actual query returned zero rows. Nokia and UPM have authentic dated issuer notices with exact ISIN/LEI plus separately observed active Finnish legal entities; Nordea has an exact ordinary-class reference with Finland. These distinct identity sources are not synthesized into GLEIF responses or promoted into financial facts. None of these financial gaps affects Discover admission.

Independent review approved the nine new wrapper tests; the unchanged mapper's 17 tests also passed. The scoped review confirmed pinned catalog/private boundaries, secondary quote preservation, missing-financial independence and optional supplements excluded from official facts and financial inputs. SHA256 binds bytes; operational authenticity additionally depends on the pinned collector and upstream source proof chain.

## Independent identity review

The separate identity producer's 18 tests passed independently. Its original CSV/GLEIF readers now require exact GLEIF ID/attributes agreement, complete cardinality and both ISIN-scoped pagination links. Explicit conflicting provider LEIs stay in review. The issuer-owned Nordea table projects its ordinary ISIN and country without its ADR identifier, ADR prices or a guessed LEI. Nokia and UPM issuer-notice bridges preserve the dated class relationship and independently captured current entity evidence; they assert no GLEIF ISIN-query relationship, currency transfer or fiscal readiness.

## Plan: Fundamentaldaten für die 449 Discover-Titel (Strang M, 08.11.2026)

Owner 08.11.: Europa zumindest in Discover, Screener und Fundamental zeigen. Entscheidung: **nur Plan, keine Umsetzung in Strang M**, weil keine Quelle mit geklärten Nutzungsrechten Deutschland abdeckt.

**Ist-Stand.** 10 der 449 Titel haben Basiszahlen (`cardFundamentals` = `BASIC_ISSUER_FACTS`, 17 ESEF-Werte aus der französischen OAM). 0 von 319 deutschen Titeln. Alle 449 haben eine LEI. Die Aktienseite zeigt diese Zahlen schon unter „Fundamentale Basisinformationen“; die Fundamental-App (`/fundamental/`) liest nur SEC-Daten.

**Stichprobe 08.11.2026** (je Emittent ein Aufruf `filings.xbrl.org/api/entities/<LEI>/filings`, 440 Emittenten, kostenlos, ohne Konto, keine Kurs- oder Lizenzdaten gespeichert):

| Emittenten | mit ESEF-Bericht | ohne | Abruffehler | jüngstes Geschäftsjahr |
|---|---:|---:|---:|---|
| nicht deutsch (129) | 106 | 15 | 8 | 65 × 2025, 19 × 2026, 17 × 2024 |
| deutsch (311) | 1 | 293 | 17 | 1 × 2023 |

Deutsche ESEF-Berichte liegen im **Unternehmensregister** (amtliches OAM) und auf den Investor-Relations-Seiten der Emittenten, nicht in der XBRL-International-Sammlung.

**Rechte.** Für keine der Quellen sind die Nutzungsbedingungen geklärt: `filings.xbrl.org/about` antwortet 404, eine Lizenz für Daten oder API ist nicht auffindbar. Das Unternehmensregister lehnt automatisierte Abrufe ab (HTTP 403) und muss von einer Person gelesen werden. Zahlen aus Pflichtveröffentlichungen sind Fakten. Die Pakete selbst bleiben ohne Klärung privat (keine Rohdaten committen).

**Wege, Aufwand und Abdeckung**

| Weg | Abdeckung (Titel) | davon DE | Aufwand | Voraussetzung |
|---|---:|---:|---|---|
| A. Französische OAM (vorhanden) | 10 | 0 | erledigt | – |
| B. `filings.xbrl.org` xBRL-JSON: Umsatz, Ergebnis, operativer Cashflow je LEI, Konzern, letztes Geschäftsjahr; Prüfungen wie der vorhandene Mapper (LEI-Kontext, Periode, Einheit, Vorzeichen) | ~110 | ~1 | 2–3 PR-Tage: Erzeuger, Workflow monatlich, Tests, Anzeige auf der Aktienseite | Nutzungsbedingungen von XBRL International schriftlich geklärt |
| C. Unternehmensregister | bis 319 | bis 319 | unklar: kein API, automatisierter Abruf gesperrt | Erlaubnis oder Datenlizenz des Bundesanzeiger Verlags: **Anfrage nötig** |
| D. ESEF-ZIP von den IR-Seiten der Emittenten (offiziell von den Emittenten veröffentlicht) | DAX/MDAX/SDAX ~127, weitere nach Aufwand | ~127 | hoch: Link-Liste je Emittent pflegen (jährlich), 1–2 Wochen für 127 | keine; Links je Emittent manuell prüfen |
| E. Fundamental-App für Europa öffnen | – | – | 1–2 PR-Tage | erst, wenn B oder D Zahlen liefert |

**Empfehlung.** Zuerst B klären (eine E-Mail an XBRL International; bei Zustimmung ~110 Titel ohne neuen kostenpflichtigen Anbieter). Für Deutschland D für DAX, MDAX und SDAX (127 Titel), weil es ohne Anfrage und ohne Anbieter geht, aber Pflegeaufwand hat. C nur, wenn der Owner die Lizenzfrage stellt. Bis dahin bleibt die Aktienseite bei „Fundamentale Basisdaten für diese Aktie noch nicht verfügbar.“ Quant bleibt für Europa gesperrt (Plan §11, keine Modelländerung).
