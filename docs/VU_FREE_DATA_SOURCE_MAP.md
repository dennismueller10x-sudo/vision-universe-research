# VISION UNIVERSE® — Free Data Source Map

Stand: 2026-09-24. Source Audit als Erweiterung des Multi-Asset-Workstreams, keine Integration. Messgrundlage:
- `quant/data/market/capabilities/free-source-probe.json`, erzeugt von `scripts/market/probe-free-sources.mjs` in GitHub Actions (Job `measure-free-sources`, zwei Runden, 267 Anfragen, keine Werte, keine Schlüssel);
- die Index-P0-Messung (`index-source-probe.json`).

Maschinenlesbare Matrix: `quant/data/market/capabilities/free-source-map.json`.

Kennzeichnung der Befunde:
- **MEASURED** – echter Abruf beziehungsweise wörtlich gelesener Lizenztext.
- **INFERRED** – abgeleitet, nicht einzeln gemessen.
- **UNKNOWN / LICENSE_UNKNOWN** – nicht feststellbar.

„Kostenlos abrufbar“ wird nirgends als „kommerziell nutzbar“ gelesen.

Rahmen des Audits:
- Tiingo bleibt Hauptprovider, Equity-Kurse wurden nicht neu recherchiert.
- Kein neuer Adapter, kein Bezahldienst (`PAID_SERVICES_ENABLED = 0`).
- Quant und Discover sind unverändert.

---

## 1. Capability-Taxonomie

38 Zeilen: die Kategorien A–AK aus dem Auftrag plus Equity-Kurse als Referenzzeile. Die Kategorien wurden nach dem Bedarf von Vision Universe gewichtet:

| Bedarf | Kategorien |
|---|---|
| **CORE** | Equity-Kurse (EQ), Fundamentaldaten (G), Devisen (AJ) |
| **P0** | Indizes (A) |
| **HIGH** | Rohstoffe (B), Edelmetalle (C), Zinsen/Renditen (D), Makro (E), Filings (H), Schätzungen (I), Earnings-Kalender (L), Wirtschaftskalender (P), Insider (Q), Indexmitglieder (U), Zentralbankdaten (AG) |
| **MEDIUM** | Wirtschaftsindikatoren (F), Analystenurteile (J), Kursziele (K), Dividenden (M), Splits (N), IPO (O), institutioneller Besitz (R), 13F (S), ETF-Bestände (T), Sektoren (V), Marktbreite (W), Movers (X), Nachrichten (Y), Short Interest (Z), Aktien im Umlauf (AA), Kapitalmaßnahmen (AB), M&A (AF), Optionen-Referenz (AH), Futures-Referenz (AI) |
| **LOW** | ESG (AC), Kongress-Handel Senat (AD) und Repräsentantenhaus (AE), Krypto-Metadaten (AK) |

## 2. Bestehende VU-Abdeckung

Inventur des Repositorys, Belege in den genannten Workflows und Skripten.

| Status | Capabilities |
|---|---|
| **EXISTING_CORE_CAPABILITY** | Equity-Kurse, Historie, Intraday und Realtime (Tiingo); Fundamentaldaten (SEC companyfacts, 5.480 Emittenten); Aktien im Umlauf (SEC dei); 13F (100 Fonds); Indexmitglieder (index-membership.yml); SIC-Sektoren; Zinsen (Treasury, Bundesbank, NY Fed, EZB); Energie (EIA); Devisen (Currency Core, EZB); Nikkei 225 (FRED) |
| technisch vorhanden, Anzeige gesperrt | Edelmetalle und Krypto (Tiingo); SPX, DJI, SX5E, UKX, HSI, RUT (FMP) |
| aus Bestehendem ableitbar | Dividenden und Splits (Tiingo divCash/splitFactor); Marktbreite (Faktoren je Titel); Movers (Discover-Zeilen); Filings (SEC submissions, intern) |
| Legacy, manuell, ungeprüft | Analystenurteile und Kursziele (Finnhub/FMP, 11 Titel); Nachrichten (deutsche RSS, 1 Eintrag); FMP-Fundamentaldaten (11 Titel) |
| **nicht vorhanden** | Makro, Wirtschaftsindikatoren, Schätzungen, Earnings-, Wirtschafts- und IPO-Kalender, Insider, Short Interest, ESG, Kongress-Handel, M&A, Optionen, Futures |

## 3. FMP-Abdeckung als Vergleichsmaß (vorhandener kostenloser Zugang, MEASURED)

| Im freien Tarif **verfügbar** (HTTP 200) | Im freien Tarif **gesperrt** (HTTP 402) |
|---|---|
| Index-EOD (7 Indizes), Rohstoffliste und -kurse, Treasury-Kurve, Wirtschaftsindikatoren (GDP, Fed Funds), US-Fundamentaldaten und TTM-Kennzahlen, Profile, SEC-Filing-Suche, **Analystenschätzungen, Ratings und Konsens, Kursziel-Konsens**, Earnings-Kalender, Dividenden- und Split-Kalender, Insider (latest), Sektor-Performance, Gainers und Most Active, Free Float, Delistings, Senat und Repräsentantenhaus, M&A (latest), VIX, Devisen- und Kryptolisten | NDX, DAX, CAC, SMI; internationale Fundamentaldaten (SAP); Wirtschaftskalender; IPO-Kalender; institutioneller Besitz; 13F; ETF-Bestände; Indexmitglieder (S&P, Nasdaq, Dow); News und Pressemitteilungen; Symbolwechsel; ESG; Futures-Kurse |

Die Anzeige-Erlaubnis im freien FMP-Tarif ist **LICENSE_UNKNOWN**. Die Bedingungen sind ein Subscription Agreement, die Website trennt „Personal Use“ und „Commercial Use“. Sämtliche FMP-Daten bleiben deshalb nicht ausgeliefert.

Finnhub (vorhandener Zugang):
- **HTTP 200:** Earnings-Kalender, IPO-Kalender, Empfehlungen, Insider, Company News.
- **HTTP 403:** Kursziele, EPS-Schätzungen, Wirtschaftskalender, Indexmitglieder, Besitz.
- **Bedingungen, wörtlich gemessen:** *„You hereby agree to not redistribute or share access to data or derived results from the data obtained from Finnhub with anyone or any 3rd party without written approval from Finnhub.“*

## 4. Kostenlose Alternativen – Überblick

| Capability | Freie Quelle (Auth) | Lizenz | Empfehlung |
|---|---|---|---|
| A Indizes | Cboe `SPX_History.csv` (NO_AUTH, ab 1975), FRED NIKKEI225 | Cboe: UNKNOWN (Rechte S&P DJI); FRED N225: Citation required | FREE_SOURCE_LICENSE_REVIEW |
| B Rohstoffe | World Bank Pink Sheet (NO_AUTH, monatlich) | **CC BY 4.0** (gemessen) | USE_OFFICIAL_FREE_SOURCE |
| C Edelmetalle | World Bank Pink Sheet (monatlich) | CC BY 4.0; LBMA: **IBA-Lizenz nötig** | KEEP_EXISTING |
| D Zinsen/Spreads | FRED DFF (Public Domain), BAA10Y, T10Y2Y (Citation), BoE, SNB, BoJ | wie genannt | KEEP_EXISTING |
| E Makro | FRED Public-Domain-Reihen, BLS API v1, EZB, Eurostat, Bundesbank, Destatis, World Bank | Public Domain / frei mit Quellenangabe / DL-DE BY 2.0 | USE_OFFICIAL_FREE_SOURCE |
| F Indikatoren | FRED UMCSENT (Citation), OECD CLI | PMI: kostenpflichtig (INFERRED) | USE_OFFICIAL_FREE_SOURCE |
| G Fundamentaldaten | SEC (bestehend) | SEC: frei weitergebbar | KEEP_EXISTING |
| H Filings | SEC submissions.zip, Tagesindex, 8-K-Atom, Volltextsuche | SEC | DERIVE_FROM_EXISTING_CORE |
| I Schätzungen | – | – | PAID_ONLY |
| J Ratings | – | Finnhub: Weitergabe untersagt | PAID_ONLY |
| K Kursziele | – | – | PAID_ONLY |
| L Earnings-Kalender | SEC 8-K Item 2.02 (nur nachträglich) | SEC | CAPABILITY_GAP |
| M Dividenden | Tiingo (bestehend) | Owner-Erklärung | KEEP_EXISTING |
| N Splits | Tiingo (bestehend) | Owner-Erklärung | KEEP_EXISTING |
| O IPO | SEC Tagesindex (S-1, F-1, 424B4) | SEC | USE_OFFICIAL_FREE_SOURCE |
| P Wirtschaftskalender | BEA `release_dates.json`, Eurostat iCal | Behörden | USE_OFFICIAL_FREE_SOURCE |
| Q Insider | SEC Form 3/4/5 + Data Sets | SEC | USE_OFFICIAL_FREE_SOURCE |
| R Inst. Besitz | SEC 13F Data Sets | SEC | DERIVE_FROM_EXISTING_CORE |
| S 13F | SEC (bestehend) | SEC | KEEP_EXISTING |
| T ETF-Bestände | SEC N-PORT Data Sets; Emittentendateien | N-PORT frei; SSGA einschränkend | FREE_SOURCE_LICENSE_REVIEW |
| U Indexmitglieder | bestehend (ETF-Bestände) | SSGA einschränkend | KEEP_EXISTING |
| V Sektoren | SEC SIC (bestehend), French Library | SEC | KEEP_EXISTING |
| W Marktbreite | eigenes Tiingo-Universum | abgeleitet | DERIVE_FROM_EXISTING_CORE |
| X Movers | eigenes Tiingo-Universum | abgeleitet | DERIVE_FROM_EXISTING_CORE |
| Y Nachrichten | SEC 8-K-Atom, SEC/Fed/EZB/BLS-RSS | Behörden | USE_OFFICIAL_FREE_SOURCE |
| Z Short Interest | FINRA-Dateien, Reg SHO, SEC Fails-to-Deliver | FINRA: UNKNOWN | FREE_SOURCE_LICENSE_REVIEW |
| AA Aktien im Umlauf | SEC dei (bestehend) | SEC | KEEP_EXISTING |
| AB Kapitalmaßnahmen | SEC Tickers/Form 25/Form 10, Nasdaq-Trader-Verzeichnisse | SEC; Nasdaq Trader UNKNOWN | DERIVE_FROM_EXISTING_CORE |
| AC ESG | – | – | NOT_WORTH_IMPLEMENTING |
| AD Senat | Senate eFD | **gesetzlich eingeschränkt** | NOT_WORTH_IMPLEMENTING |
| AE Repräsentantenhaus | House-Clerk-ZIP | gesetzlich eingeschränkt (INFERRED) | NOT_WORTH_IMPLEMENTING |
| AF M&A | SEC Tagesindex (S-4, DEFM14A, 425, SC TO) | SEC | DERIVE_FROM_EXISTING_CORE |
| AG Zentralbanken | FRED WALCL, EZB ILM, BoE, SNB, BoJ | Fed Public Domain, EZB frei | USE_OFFICIAL_FREE_SOURCE |
| AH Optionen-Referenz | FRED VIXCLS (Citation), Cboe, OCC | VIX via FRED erlaubt | USE_OFFICIAL_FREE_SOURCE |
| AI Futures-Referenz | CFTC COT (JSON/TXT) | US-Behörde | USE_OFFICIAL_FREE_SOURCE |
| AJ Devisen | Currency Core (bestehend), FRED DEXUSEU | Public Domain | KEEP_EXISTING |
| AK Krypto-Metadaten | CoinGecko-Liste | Freemium, UNKNOWN | NOT_WORTH_IMPLEMENTING |

**Verteilung der Empfehlungen:**

| Empfehlung | Anzahl |
|---|---|
| KEEP_EXISTING | 11 |
| USE_OFFICIAL_FREE_SOURCE | 10 |
| DERIVE_FROM_EXISTING_CORE | 6 |
| NOT_WORTH_IMPLEMENTING | 4 |
| FREE_SOURCE_LICENSE_REVIEW | 3 |
| PAID_ONLY | 3 |
| CAPABILITY_GAP | 1 |

Der Earnings-Kalender (L) ist die einzige reine Lücke. Die Vorschau-Kalender für Dividenden und NDX sind als Einzelbefunde vermerkt.

## 5. Offizielle Quellen (Priorität 1–2), gemessen

| Herausgeber | Endpunkt / Datei | Ergebnis |
|---|---|---|
| SEC | `company_tickers_exchange.json`, `data.sec.gov/submissions`, `companyconcept` | 200, JSON |
| SEC | `companyfacts.zip` (1,4 GB, täglich), `submissions.zip` (1,57 GB, täglich) | 200 |
| SEC | Tagesindex nach Formular | 200, 3.243 Zeilen |
| SEC | 8-K-Atom | 200, 40 Einträge, heutiges Datum |
| SEC | EDGAR-Volltextsuche | 200, JSON |
| SEC | Insider Data Sets 2026q1 (13,9 MB) | 200 |
| SEC | 13F Data Sets (bis Mai 2026, 99 MB) | 200 |
| SEC | N-PORT 2026q2 (440 MB) | 200 |
| SEC | Fails-to-Deliver (bis Aug. 2026) | 200 |
| SEC | Financial Statement Data Sets | 200 |
| SEC | Presse-RSS | 200 |
| SEC Bedingungen | *„Information presented on sec.gov is considered public information and may be copied or further distributed … without the SEC’s permission.“* Höchstens 10 Anfragen/s, deklarierter User-Agent. | gelesen |
| Fed | Presse-RSS | 200 |
| Fed | FOMC-Kalender | nur HTML |
| Fed | Data Download Program | nur mit Serien-Kennung |
| Fed Bedingungen | *„information on Board's website is in the public domain and may be copied and distributed without permission. Please cite …“* | gelesen |
| BLS | Public API v1 ohne Schlüssel (CPI, Payrolls, Arbeitslosenquote) | 200 |
| BLS | Kalender-ICS und Terminseite vom Runner aus | 403 (Akamai) |
| BLS | Bedingungsseite vom Runner aus | 403 |
| BEA | API ohne Schlüssel | leer (FREE_API_KEY) |
| BEA | `release_dates.json` | 200 |
| Census | Konjunktur-API | „Missing Key“ (FREE_API_KEY) |
| Census | Kalender | nur HTML |
| US Treasury Fiscal Data | Abruf | 404 unter dem verwendeten Pfad – nicht korrekt gemessen (UNKNOWN) |
| EZB | HICP, M3, Bilanz (ILM) als CSV | 200 |
| EZB | Presse-RSS | 200 |
| EZB | Sitzungskalender | nur HTML |
| EZB Bedingungen | Weiterverwendung frei mit Quellenangabe; Änderungen (z. B. Wachstumsraten) sind kenntlich zu machen | gelesen |
| Eurostat | HICP, BIP, Arbeitslosigkeit (JSON-stat) | 200 |
| Eurostat | Veröffentlichungskalender iCal: 2.445 Termine, 2.725 künftige Datumsangaben | 200 |
| Bundesbank | VPI-Reihe | 200 |
| Destatis | GENESIS-Gastzugang | liefert nur die Startseite → FREE_ACCOUNT |
| Destatis | Lizenz *„Datenlizenz Deutschland – Namensnennung – Version 2.0“* | gelesen |
| Bank of England | IADB Bank Rate (CSV) | 200 |
| Bank of England | Bedingungen: Rechte bei der BoE | gelesen, Weiterverwendung offen |
| SNB | Leitzins-Cube | 200 |
| Bank of Japan | API | 200 |
| CFTC | COT als TXT und JSON (Socrata) | 200 |
| FINRA | Reg SHO Daily Short Volume | 200 |
| FINRA | Short-Interest-Dateien (Verweise bis 31.08.2026) | 200 |
| FINRA | Query-API ohne Schlüssel | 200, Sortierung nur mit Partitionsschlüssel |
| Nasdaq Trader | `nasdaqlisted.txt`, `otherlisted.txt` | 200, täglich |
| Cboe | `SPX_History.csv`, `RUT_History.csv`, `DJX_History.csv`, `VIX_History.csv` | 200 |
| Cboe | `NDX_History.csv` | 403 |
| Cboe | Put/Call-Datei | seit 2020 nicht fortgeführt |
| CME | Settlements | *„IP address is blocked due to suspected web scraping“* |
| House Clerk | FD-ZIP | 200 |
| House Clerk | PTR-Verzeichnis | 403 |
| Senat | eFD | Zustimmungsseite |

## 6. Quellen ohne Anmeldung (NO_AUTH = true)

- **SEC:** alle genannten Endpunkte und Dateien.
- **Fed, EZB, Eurostat, Bundesbank:** RSS und Datenabrufe.
- **BLS API v1:** mit Tageslimit.
- **BEA:** nur `release_dates.json`.
- **Zentralbanken:** BoE IADB, SNB, BoJ.
- **CFTC, FINRA:** CFTC-Dateien und -JSON; FINRA-CDN und -Query-API.
- **Nasdaq Trader:** Symbolverzeichnisse.
- **Cboe:** Index-Tagesdateien.
- **World Bank:** Pink Sheet und API.
- **IMF:** DataMapper.
- **Kongress:** House-Clerk-ZIP.
- **Akademisch und Freemium:** Kenneth French Data Library, CoinGecko-Liste.
- **FRED:** Graph-CSV aller 20 gemessenen Reihen (GOLDAMGBD228NLBM existiert nicht mehr, 404).

## 7. Quellen mit kostenlosem Schlüssel oder Konto

| Art | Quellen |
|---|---|
| **FREE_API_KEY** | BEA API, Census API (inhaltlich über FRED ohne Schlüssel erreichbar), FRED API (die Graph-CSV braucht keinen Schlüssel), EIA API v2 (EIA ist bereits über XLS angebunden) |
| **FREE_ACCOUNT** | Destatis GENESIS; Nasdaq Data Link (vom Runner aus 403 Incapsula) |
| **vorhanden, Tarif frei, Nutzung ungeklärt** | FMP, Finnhub, Twelve Data (Basic) |

## 8. Derived-Core-Möglichkeiten (vor jedem neuen Provider)

| Produkt | Grundlage |
|---|---|
| Marktbreite: Advance/Decline, % über SMA 50/200, neue 52-Wochen-Hochs minus -Tiefs, McClellan-artige Reihen | vorhandenes Tiingo-Universum (6.404 Faktorreihen) |
| Market Movers: Gewinner, Verlierer, Most Active, Volumen- und Momentum-Führer | dieselben Reihen |
| Institutioneller Besitz je Aktie | Umkehrung der SEC-13F-Datensätze (CUSIP → CIK) |
| Filings-, IPO-, M&A-, Delisting- und Spin-off-Ereignisse | SEC-Tagesindex nach Formular (bestehender SEC Core) |
| Vergangene Earnings-Termine | SEC 8-K Item 2.02 |
| TTM-Kennzahlen | SEC companyfacts (keine zweite Fundamentalquelle) |
| Dividenden- und Split-Historie | Tiingo |

Ausgeschlossen: Nachbau proprietärer Indizes (keine S&P-, Nasdaq- oder DAX-Replikation).

## 9. Lizenzstatus (gemessen, wo lesbar)

| Klasse | Quellen |
|---|---|
| **Public Domain / frei weitergebbar** | SEC; Fed; FRED-Reihen der Klasse „Public Domain“: CPIAUCSL, PCEPI, UNRATE, PAYEMS, GDPC1, INDPRO, RSAFS, HOUST, M2SL, WALCL, DFF, DCOILWTICO, DEXUSEU |
| **Citation required** (Anzeige mit Quellenangabe) | FRED UMCSENT, T10Y2Y, BAA10Y, PCOPPUSDM, VIXCLS, NIKKEI225 |
| **Pre-approval required** (nicht verwenden) | FRED BAMLH0A0HYM2 (ICE BofA), NASDAQCOM, NASDAQ100, SP500, DJIA |
| **CC BY 4.0** | World-Bank-Commodity-Datensatz, gelesen: *„This dataset is licensed under Creative Commons Attribution 4.0“* |
| **DL-DE BY 2.0** | Destatis |
| **frei mit Quellenangabe** | EZB |
| **eingeschränkt** | LBMA (*„A licence from IBA is required … to obtain, use or redistribute“*); Senate eFD (*„unlawful … for any commercial purpose, other than by news and communications media“*); Finnhub (keine Weitergabe); SSGA (*„may not be reproduced … without SSGA’s express written consent“*) |
| **LICENSE_UNKNOWN** | FMP (freier Tarif), Cboe-Tagesdateien, FINRA-Dateien, Nasdaq Trader, iShares, Invesco, ARK, OCC, BoE (Weiterverwendung), CoinGecko, Kenneth French, OECD und IMF (Bedingungsseiten 403) |

## 10. Index-Sonderbericht

| Index | Status | Befund |
|---|---|---|
| Nikkei 225 | **live** | FRED NIKKEI225, Citation required; Gegenprobe gegen die Nikkei-Tagesdatei |
| S&P 500 | neu: offizielle freie Datei | Cboe `SPX_History.csv`, 13.039 Tage 1975–2026-09-22, NO_AUTH, täglich um 01:51 UTC aktualisiert. Die Indexrechte liegen bei S&P DJI, die Cboe-Bedingungen waren nicht lesbar → **FREE_SOURCE_LICENSE_REVIEW**. Technisch sauberer als FMP (offizielle Börsendatei, keine Anmeldung). |
| Russell 2000 | wie S&P 500 | Cboe `RUT_History.csv` ab 2020, gleiche Einstufung |
| Dow Jones | keine freie Quelle | Cboe führt nur DJX (Dow ÷ 100, anderes Instrument, nicht verwendet); FRED DJIA Pre-Approval; FMP LICENSE_PENDING |
| **Nasdaq 100** | **NASDAQ100_SOURCE = NO_FREE_COMMERCIAL_SOURCE_FOUND** | Cboe `NDX_History.csv` 403; Nasdaq Data Link 403 (Incapsula); Nasdaq Global Index Watch nur HTML; FRED Pre-Approval; FMP 402; Twelve Data „ab Grow“ |
| DAX | keine freie Quelle | STOXX-API 401, FMP 402, Twelve Data Basic 404, EZB FM ohne DAX-Reihe |
| Euro Stoxx 50, FTSE 100 | nur FMP (LICENSE_PENDING) | EZB FM führt Euro Stoxx 50 nur monatlich |
| CAC 40, SMI, Hang Seng, Shanghai Composite, MSCI World | unverändert | wie in `docs/VU_INDEX_COVERAGE_P0.md` |

Die Indexmitglieder sind getrennt davon vorhanden (siehe §16). Ihre Lizenz ist eine eigene Frage und nicht mit der des Indexstands gleichzusetzen.

## 11. Analyst-Data-Sonderbericht

- **Ergebnis: keine belastbare kostenlose Quelle** für Ratings, Konsens, Kursziele, EPS- und Umsatzschätzungen oder Revisionen. Diese Daten sind Anbieterprodukte. Unternehmens-IR und die SEC enthalten Ist-Zahlen und Guidance, keine Konsensschätzungen. → Schätzungen, Ratings und Kursziele: **PAID_ONLY**.
- **FMP frei liefert** Schätzungen, Grades (1.802 Einträge für AAPL), Konsens und Kursziel-Konsens. Die Anzeige-Erlaubnis ist ungeklärt.
- **Befund zur bestehenden Legacy-Strecke** `update-analyst-ratings.yml`: Sie veröffentlicht Finnhub-Empfehlungen in `dashboard/data/analyst_ratings.json`. Die gemessenen Finnhub-Bedingungen untersagen Weitergabe ohne schriftliche Zustimmung. **Owner-/Rechtsprüfung empfohlen** (siehe §20).

## 12. Ownership- und 13F-Bericht

- **Bestehend:** SEC-13F-Strecke (100 Fonds, vierteljährlich).
- **Offiziell frei:** SEC Form 13F Data Sets (alle Melder, bis Mai 2026, 99 MB) und die offizielle Liste der 13(f)-Wertpapiere (PDF/TXT je Quartal).
- **Ableitbar:** institutioneller Besitz je Aktie (Halter, Stückzahl, Veränderung zum Vorquartal) über CUSIP → CIK im bestehenden Company Master. → **DERIVE_FROM_EXISTING_CORE**, keine parallele SEC-Architektur.
- **Grenze:** 45 Tage Verzug nach Quartalsende, nur Long-Positionen in 13(f)-Wertpapieren.

## 13. Insider-Bericht

**CANDIDATE_OFFICIAL_SOURCE:** SEC Form 3/4/5.

| Kriterium | Befund |
|---|---|
| Abdeckung | Alle US-Emittenten mit Section-16-Pflichten |
| Latenz | Form 4 innerhalb von 2 Werktagen; im EDGAR-Tagesindex und in der Volltextsuche (gemessen: Form-4-Treffer bis heute) |
| Maschinenlesbarkeit | XML je Meldung (Schema `ownershipDocument`) plus vierteljährliche **Insider Transactions Data Sets** (2026q1, 13,9 MB, strukturierte Tabellen) |
| Emittenten-Abgleich | Über die CIK, die der Company Master bereits führt |
| Transaktionssemantik | SEC-Transaktionscodes (P/S/A/M/F/G …), direkt/indirekt, Derivat/Nicht-Derivat; Kauf/Verkauf eindeutig aus Code und Richtung |
| Lizenz | SEC, frei weitergebbar |

→ **USE_OFFICIAL_FREE_SOURCE**, noch kein Produkt gebaut.

## 14. Makro-Bericht

| Indikator | Quelle (Lizenz) | Auth |
|---|---|---|
| CPI, Arbeitslosenquote, Payrolls | BLS API v1 oder FRED CPIAUCSL/UNRATE/PAYEMS (Public Domain) | NO_AUTH |
| BIP, PCE | FRED GDPC1/PCEPI (BEA, Public Domain); BEA-API nur mit Schlüssel | NO_AUTH über FRED |
| Einzelhandel, Wohnungsbau | FRED RSAFS/HOUST (Census, Public Domain) | NO_AUTH |
| Industrieproduktion, M2, Fed-Bilanz | FRED INDPRO/M2SL/WALCL (Fed, Public Domain) | NO_AUTH |
| Verbraucherstimmung | FRED UMCSENT (Citation required); Conference Board = PAID | NO_AUTH |
| PMI | keine freie Quelle (S&P Global/ISM, INFERRED) | PAID_ONLY |
| Zinsstrukturkurve, Leitzinsen | bestehend; zusätzlich BoE, SNB, BoJ | NO_AUTH |
| Credit Spreads | FRED BAA10Y (Citation); ICE BofA Pre-Approval | NO_AUTH |
| Eurozone HICP, BIP, Arbeitslosigkeit, M3 | Eurostat JSON-stat, EZB CSV | NO_AUTH |
| Deutschland | Bundesbank-API (NO_AUTH), Destatis (DL-DE BY 2.0, Konto) | gemischt |
| International | World Bank API (NO_AUTH), IMF DataMapper (NO_AUTH, Bedingungen UNKNOWN), OECD SDMX (Datenabruf 500, Struktur 200 – nicht belastbar gemessen) | NO_AUTH |

→ **USE_OFFICIAL_FREE_SOURCE.** Einbindung als eigene Assetklasse MACRO im bestehenden Instrument Master; Einheiten wie Index, Prozent und Stück sind bereits vorhanden. Frische erfolgt über das vorhandene Profil REFERENCE_MONTHLY.

## 15. Kalender-Bericht

- **Wirtschaftskalender:** aus offiziellen Plänen aufbaubar.
  - BEA `release_dates.json` (maschinenlesbar, gemessen).
  - Eurostat iCal (2.445 Termine, gemessen).
  - Fed- und EZB-Sitzungstermine: nur HTML, ändern sich einmal jährlich → gepflegte Konfigurationsdatei statt Scraping.
  - BLS: der Kalender ist vom Runner aus gesperrt (403). BLS-Termine müssten gepflegt oder aus einem erlaubten Pfad bezogen werden.
  - Census und Destatis: nur HTML.
  - Aufwand: MITTEL. → USE_OFFICIAL_FREE_SOURCE (teilweise).
- **Earnings-Kalender:** keine freie offizielle Vorschau. Vergangene Termine liefert SEC 8-K Item 2.02 (Volltextsuche, gemessen). Massen-Scraping von IR-Seiten ist ausgeschlossen. → **CAPABILITY_GAP** für künftige Termine. FMP und Finnhub liefern sie, sind aber lizenzseitig ungeklärt beziehungsweise untersagt.
- **IPO-Kalender:** SEC-Tagesindex mit S-1/F-1 (Registrierung) und 424B4 (Preisfestsetzung). Das ergibt nachträgliche und laufende Ereignisse, keine verbindlichen Termine. → USE_OFFICIAL_FREE_SOURCE.
- **Dividendenkalender:** Historie über Tiingo; eine Vorschau der Deklarationen gibt es nicht offiziell strukturiert.

## 16. ETF- und Holdings-Bericht

| Quelle | Befund | Bedingungen |
|---|---|---|
| SSGA (SPY, DIA) | XLSX, täglich, NO_AUTH | gemessen: Wiedergabe nur mit schriftlicher Zustimmung |
| ARK | CSV, täglich | nicht lesbar (403) |
| iShares | CSV-Download liefert vom Runner aus HTML (die bestehende index-membership-Strecke lädt erfolgreich) | nicht lesbar (404) |
| Invesco QQQ | 406 ohne passende Accept-Header | nicht lesbar |
| iShares EXS1 (DAX) | 404 unter dem geratenen Pfad | – |

- **Kanonische freie Alternative:** SEC Form N-PORT Data Sets. Vierteljährlich, 440 MB, alle US-Fonds und ETFs mit Einzelpositionen, rund 60 Tage verzögert, Lizenz SEC.
- **Empfehlung:** FREE_SOURCE_LICENSE_REVIEW für tagesaktuelle Emittentendateien; N-PORT für verzögerte, frei verwendbare Bestände.
- **Indexmitglieder:** Die bestehende Strecke leitet Mitgliedschaften aus Emittentendateien ab. Abgeleitete Fakten sind etwas anderes als die Wiedergabe der Datei, die SSGA-Klausel sollte dennoch geprüft werden.

## 17. Corporate-Actions-Bericht

- **Dividenden und Splits:** Tiingo (bestehend), keine neue Quelle.
- **Symbolwechsel, Neu- und Delistings:**
  - Nasdaq-Trader-Symbolverzeichnisse, täglich 18:01 UTC, NO_AUTH; Bedingungen nicht lesbar.
  - SEC `company_tickers_exchange.json` (SEC-Lizenz).
  - SEC Form 25 (Delisting).
  - → DERIVE_FROM_EXISTING_CORE im Company Master (Tagesdifferenz).
- **Fusionen:** SEC S-4, DEFM14A, 425, SC TO-T, SC 14D9. **Spin-offs:** Form 10-12B. Beides über den SEC-Tagesindex als Ereignisse; Deal-Details bleiben im Dokument.

## 18. Market-Breadth-Bericht

Vollständig aus dem vorhandenen Tiingo-Universum ableitbar. Heute liegen bereits je Titel vor: über SMA 20/50/100/200, neues 52-Wochen-Hoch, Volumenausbruch. Es fehlt nur die Aggregation zu Tagesreihen:
- Advance/Decline-Linie;
- Anteil über SMA 50/200;
- neue Hochs minus neue Tiefs;
- Up/Down-Volumen.

Diese Zeitreihen wären deterministisch und methodisch offen dokumentierbar. → **DERIVE_FROM_EXISTING_CORE**, kein Provider. Put/Call als Ergänzung ist nicht frei: die Cboe-Datei endet 2020, OCC-Bedingungen nicht lesbar.

## 19. Lücken (ohne freie belastbare Quelle)

- Konsensschätzungen, Analystenratings, Kursziele, Revisionen → PAID_ONLY.
- Künftige Earnings-Termine → CAPABILITY_GAP.
- **Nasdaq 100 (Stand)** → NO_FREE_COMMERCIAL_SOURCE_FOUND.
- DAX (Stand) → keine freie Quelle.
- Dow Jones (Stand) → nur FMP (Lizenz offen).
- PMI, Conference Board → PAID_ONLY.
- Optionsketten (OPRA), Futures-Settlements (CME) → PAID_ONLY.
- ESG → NOT_WORTH_IMPLEMENTING.
- Kongress-Handel → gesetzlich eingeschränkt.
- Internationale Fundamentaldaten → im FMP-Tarif gesperrt, keine offizielle freie Alternative außerhalb der jeweiligen Register.

## 20. Prioritäten

1. **Prüfpflichten aus dem Audit (vor jedem Ausbau):**
   - a) Finnhub-Bedingungen gegen die veröffentlichte Legacy-Strecke `analyst_ratings.json`;
   - b) SSGA-Klausel gegen `index-membership`;
   - c) FMP- und Cboe-Anzeige für Indexstände.
2. **Makro** über FRED-Public-Domain-Reihen, BLS, EZB und Eurostat – größter Nutzen bei klarer Lizenz.
3. **Insider** über SEC Form 4.
4. **Wirtschaftskalender** aus BEA-JSON und Eurostat-iCal plus gepflegten FOMC-/EZB-Terminen.
5. **Marktbreite und Movers** abgeleitet.
6. **Institutioneller Besitz** aus 13F-Datensätzen.
7. **Amtlicher Ereignis-Feed:** SEC 8-K, Fed, EZB.
8. **Kupfer und Rohstoff-Monatsreferenz** über die World Bank.
9. **Short Interest** nach FINRA-Lizenzprüfung.
10. **Kapitalmaßnahmen, IPO und M&A** aus dem SEC-Tagesindex.

---

## Top 10 Free Data Opportunities für Vision Universe

| # | Chance | Quelle | Auth | Lizenz | Aufwand |
|---|---|---|---|---|---|
| 1 | Makro-Kern: CPI, PCE, Arbeitsmarkt, BIP, Industrieproduktion, Einzelhandel, Wohnungsbau, M2, Fed-Bilanz | FRED (Public-Domain-Reihen), BLS, EZB, Eurostat | NO_AUTH | Public Domain / frei mit Quelle | MITTEL |
| 2 | Insider-Transaktionen | SEC Form 3/4/5 + Data Sets | NO_AUTH | SEC | MITTEL |
| 3 | Wirtschaftskalender | BEA `release_dates.json`, Eurostat iCal, gepflegte Fed/EZB-Termine | NO_AUTH | Behörden | MITTEL |
| 4 | Marktbreite (A/D, % über SMA, Hochs/Tiefs) | eigenes Tiingo-Universum | – | abgeleitet | NIEDRIG |
| 5 | Market Movers | eigenes Tiingo-Universum | – | abgeleitet | NIEDRIG |
| 6 | Institutioneller Besitz je Aktie | SEC 13F Data Sets | NO_AUTH | SEC | MITTEL |
| 7 | Amtlicher Ereignis-Feed | SEC 8-K-Atom, SEC/Fed/EZB-RSS | NO_AUTH | Behörden | NIEDRIG |
| 8 | Kupfer und Rohstoffe als Monatsreferenz (schließt die COPPER-Lücke) | World Bank Pink Sheet | NO_AUTH | CC BY 4.0 | NIEDRIG |
| 9 | Zentralbank-Erweiterung (Fed-Bilanz, BoE, SNB, BoJ) und VIX | FRED WALCL, FRED VIXCLS, BoE, SNB, BoJ | NO_AUTH | Public Domain / Citation (BoE offen) | NIEDRIG |
| 10 | Kapitalmaßnahmen, IPO- und M&A-Ereignisse | SEC-Tagesindex, SEC-Tickerdatei | NO_AUTH | SEC | MITTEL |

Nicht in den Top 10, weil die Lizenz zuerst geklärt werden muss: Short Interest (FINRA), S&P 500 und Russell 2000 über die Cboe-Tagesdateien, tagesaktuelle ETF-Bestände beim Emittenten.

## Zielzustand

| Ziel | Stand |
|---|---|
| FMP_COVERAGE_MAPPED | PASS (45 Endpunkte gemessen) |
| TIINGO_DUPLICATION_AVOIDED | PASS |
| OFFICIAL_FREE_SOURCES_MAPPED | PASS |
| NO_AUTH_SOURCES_MAPPED | PASS |
| DERIVED_CORE_OPPORTUNITIES | PASS |
| INDEX_SOURCE_RESEARCH | PASS – S&P 500 neu über Cboe (Lizenzprüfung); NASDAQ100_SOURCE = NO_FREE_COMMERCIAL_SOURCE_FOUND |
| ANALYST_DATA_RESEARCH | PASS – PAID_ONLY, Legacy-Befund Finnhub |
| OWNERSHIP_RESEARCH | PASS |
| INSIDER_RESEARCH | PASS – CANDIDATE_OFFICIAL_SOURCE |
| MACRO_RESEARCH | PASS |
| CALENDAR_RESEARCH | PASS |
| ETF_HOLDINGS_RESEARCH | PASS |
| CORPORATE_ACTIONS_RESEARCH | PASS |
| LICENSE_STATUS_MAPPED | PASS (UNKNOWN benannt, nicht aufgelöst) |
| NEW_PAID_SERVICES | 0 |
| NEW_PARALLEL_ARCHITECTURES | 0 |
| FINAL_SOURCE_MATRIX | COMPLETE (`free-source-map.json`, 38 Zeilen) |

Nicht gemessen oder nicht belastbar gemessen, jeweils als UNKNOWN geführt:
- US Treasury Fiscal Data (falscher Pfad);
- OECD-Datenabruf (500);
- IMF-PCPS-Nutzdaten (Antwort ohne Beobachtungen);
- Bedingungsseiten von OECD, IMF, FINRA, Cboe, iShares, Invesco, ARK, OCC und BoJ (403/404/406).
