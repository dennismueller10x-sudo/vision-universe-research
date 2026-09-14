# DISCOVER V3 — Company Name Enrichment Pass

Stand: Mo 14.09.2026 · Branch `claude/vision-universe-discover-v3` · nicht gemergt, nicht veröffentlicht.
Auftrag: ausschließlich die fehlenden Firmennamen des kanonischen Company Masters
beheben — über eine kanonische Enrichment-Schicht, ohne Discover-Redesign, ohne
Änderung an Chart-Engine, Intraday-/Live-Logik, Universe-Mitgliedschaft, ohne
neue SEC-Pipeline und ohne zweite Company-Master-Architektur.

## 1. Quellen-Audit (vor dem Bau)

| Quelle im Repository | Namen? | Schlüssel | Befund |
|---|---|---|---|
| Company Master `security-master/eligibility.json`, `us-security-master.json` (8 021 Zeilen) | nein | securityId | kein Namensfeld |
| Tiingo Symbolliste (`supported_tickers`), Provider Mapping | nein | providerSymbol | Liste ohne Namen; Mapping vollständig (7 004 / 7 004) |
| Tiingo Stammdaten `providers/tiingo/adapter.js → getMetadata` (`/tiingo/daily/<symbol>`) | **ja** (`name`) | securityId → providerSymbol; Antwort trägt `ticker` | vorhandener Adapter, bisher nur im Runtime-Nachweis genutzt (Apple Inc) |
| SEC `company_tickers_exchange.json` (bereits Quelle des SEC-Providers `scripts/quant/sec/provider.py`, `providers/sec/adapter.js`) | **ja** (Entity-Name) | Ticker + Börse, CIK | öffentlich, ohne Schlüssel; aus der Sandbox nicht erreichbar, in CI ja |
| SEC-Bestand `quant/data/sec/inspector_index.json`, `universe_resolution.json` | ja | Ticker/CIK | 5 Titel |
| `discover/config/company-names.json` (kuratiert), `quant/config/*.json`, `dashboard/config/universe.json` | ja | Ticker | 515 Titel, teils Kurzformen („Palantir"), 1 Eintrag war nur der Ticker |
| alte Gate-/Universumsdateien `scale/universe-*.json` | nein (`company: null`) | securityId | tragen nur kuratierte Sektoren |
| `hedgefonds/data/hedgefonds.json` (13F-Emittentennamen) | ja, aber CUSIP-basiert, Kürzel in Versalien | CUSIP | kein Schlüssel im Master → nicht verwendet |
| `dashboard/data/research_profiles.json` | wenige, mit Ticker im Namen („NVIDIA Corporation NVDA") | Ticker | nicht verwendet |

Ergebnis des Audits: Die Namen sind über die **bereits angebundenen Provider** verfügbar
(Tiingo-Stammdaten je Titel, SEC-Tickerverzeichnis). Keine neue externe Datenquelle.

## 2. Source Priority (deterministisch)

1. `TIINGO_METADATA` — der Anbieter, der die Identität des Masters definiert
   (canonical_id `tiingo:<Börse>:<Ticker>:<Start>`); Schlüssel securityId → providerSymbol;
   die Antwort muss dasselbe Symbol tragen, sonst `PROVIDER_SYMBOL_MISMATCH`.
2. `SEC_COMPANY_TICKERS` — Entity-Name der SEC; Schlüssel Ticker **und** Börsenfamilie
   (NASDAQ / NYSE / AMEX=NYSE American / NYSE Arca / BATS=Cboe), CIK wird mitgeführt;
   bei Mehrdeutigkeit oder Börsenwiderspruch kein Kandidat.
3. `VU_CURATED` — bestehende kuratierte Repository-Namen (je Ticker).

Ein kanonischer Company-Master-Name (Priorität 0 im Auftrag) existiert nicht; die
Schicht **ist** jetzt der kanonische Name zum Master. Kandidaten aller Quellen bleiben
je Zeile in der Datei, damit ein späterer Lauf denselben Vorrang ohne erneuten Abruf
rechnet.

## 3. Artefakt und Verdrahtung

* `scripts/market/build-company-names.mjs` → `quant/data/market/security-master/company-names.json`
  (eine Zeile je Titel des Produktuniversums: `securityId, ticker, exchange, providerSymbol,
  companyName, displayName, nameSource, nameAsOf, cik, status, reason, candidates`) und
  `company-names-summary.json` (Coverage nach Quelle, offene Gründe, Stichprobe).
* Regeln: kein leerer String, kein Ticker als Name (auch nicht in Kleinschreibung; „Aon" für
  AON ist ein Eigenname und bleibt), kein tickerartiger String; `companyName` ist der
  gelieferte Name unverändert; `displayName` entfernt nur eine Rechtsform am Ende
  (Inc/Corp/Ltd/plc/…), erhält Klassenzusätze („Class A") und lässt Namen ganz, deren Rest
  auf ein Bindewort endet („Eli Lilly and Company", „JPMorgan Chase & Co.") oder dem Ticker
  gleicht.
* `scripts/market/universe-source.mjs` legt `companyName / displayName / nameSource / nameAsOf`
  je securityId an den Titel (nur RESOLVED-Zeilen) — Mitgliedschaft unverändert.
* Discover (`build-discover-data.mjs`, `contract.js`): `companyName` = displayName → companyName
  der Schicht → Repository-Namensquellen → sonst `SOURCE_MISSING` (Ticker nur als
  Überschrift-Fallback in der Oberfläche, nie als gespeicherter Name). Aktienseite trägt
  zusätzlich `legalName` und `nameSource`; Karten bleiben schlank.
* Workflow `.github/workflows/company-names.yml` (Dispatch oder Push-Marke `[company-names]`):
  Namensschicht (Tiingo + SEC + kuratiert, Budget 7 000 Anfragen/Lauf, Wiederaufnahme über die
  Datei), Discover-Build, Capability Matrix, Secrets-/Hygiene-Guards, Regressionssuite, Commit.
  Teilt die Concurrency-Gruppe mit dem Marktdaten-Refresh (gemeinsames Stundenkontingent).

## 4. Ergebnis (gemessen, CI-Läufe 34807181463 + Folgelauf, Stand 14.09.2026)

| | Wert |
|---|---:|
| VORHER: Titel ohne Firmennamen | 6.499 |
| NACHHER: Titel ohne Firmennamen | 23 |
| Coverage | 6.981 / 7.004 = 99,67 % |
| Aktive Equities mit Namen | 6.455 / 6.477 = 99,66 % |
| Neu ergänzt | 6.476 |

Davon nach Quelle (Vorrang Anbieter → SEC → kuratiert):

| Quelle | Titel |
|---|---:|
| Provider Metadata (Tiingo `getMetadata`) | 6.776 |
| SEC (company_tickers_exchange.json, Ticker + Börse, CIK) | 205 |
| bestehende VU-Daten (kuratiert) | 0 |
| sonstige verifizierte Quelle | 0 |

Nicht auflösbar: 23

| Grund | Titel | Bedeutung |
|---|---:|---|
| `PROVIDER_HAS_NO_NAME` | 21 | der Anbieter führt den Titel, aber ohne Namen (Stammdaten leer); SEC und kuratierte Liste kennen ihn nicht |
| `ALL_CANDIDATES_REJECTED` | 2 | ZAZZT, ZBZZT: Nasdaq-Testsymbole, der Anbieter liefert den Ticker als Namen — verworfen |

Von den Regeln verworfene Kandidaten: `VU_CURATED:TICKER_AS_NAME` 1, `SEC_COMPANY_TICKERS:TICKER_LIKE` 1, `SEC_COMPANY_TICKERS:TICKER_AS_NAME` 2, `TIINGO_METADATA:TICKER_AS_NAME` 4

### 4.1 Stichprobe (25 Titel)

| Ticker | Company Name (companyName) | displayName | Source | Security ID | Provider Mapping | CIK |
|---|---|---|---|---|---|---|
| AAPL | Apple Inc | Apple | TIINGO_METADATA | ref_AAPL | tiingo:AAPL | 0000320193 |
| MSFT | Microsoft Corporation | Microsoft | TIINGO_METADATA | ref_MSFT | tiingo:MSFT | 0000789019 |
| NVDA | NVIDIA Corp | NVIDIA Corp | TIINGO_METADATA | ref_NVDA | tiingo:NVDA | 0001045810 |
| AMZN | Amazon.com Inc | Amazon.com | TIINGO_METADATA | ref_AMZN | tiingo:AMZN | 0001018724 |
| GOOGL | Alphabet Inc - Class A | Alphabet Class A | TIINGO_METADATA | ref_GOOGL | tiingo:GOOGL | 0001652044 |
| META | Meta Platforms Inc - Class A | Meta Platforms Class A | TIINGO_METADATA | ref_META | tiingo:META | 0001326801 |
| TSLA | Tesla Inc | Tesla | TIINGO_METADATA | ref_TSLA | tiingo:TSLA | 0001318605 |
| AMD | Advanced Micro Devices Inc | Advanced Micro Devices | TIINGO_METADATA | ref_AMD | tiingo:AMD | 0000002488 |
| PLTR | Palantir Technologies Inc - Class A | Palantir Technologies Class A | TIINGO_METADATA | ref_PLTR | tiingo:PLTR | 0001321655 |
| AVGO | Broadcom Inc | Broadcom | TIINGO_METADATA | ref_AVGO | tiingo:AVGO | 0001730168 |
| LLY | Lilly(Eli) & Company | Lilly(Eli) & Company | TIINGO_METADATA | ref_LLY | tiingo:LLY | 0000059478 |
| WMT | Walmart Inc | Walmart | TIINGO_METADATA | ref_WMT | tiingo:WMT | 0000104169 |
| JPM | JPMorgan Chase & Company | JPMorgan Chase & Company | TIINGO_METADATA | ref_JPM | tiingo:JPM | 0000019617 |
| V | Visa Inc - Class A | Visa Class A | TIINGO_METADATA | ref_V | tiingo:V | 0001403161 |
| MU | Micron Technology Inc | Micron Technology | TIINGO_METADATA | ref_MU | tiingo:MU | 0000723125 |
| NFLX | Netflix Inc | Netflix | TIINGO_METADATA | ref_NFLX | tiingo:NFLX | 0001065280 |
| ORCL | Oracle Corp | Oracle | TIINGO_METADATA | ref_ORCL | tiingo:ORCL | 0001341439 |
| CRM | Salesforce Inc | Salesforce | TIINGO_METADATA | ref_CRM | tiingo:CRM | 0001108524 |
| COST | Costco Wholesale Corp | Costco Wholesale | TIINGO_METADATA | ref_COST | tiingo:COST | 0000909832 |
| UNH | Unitedhealth Group Inc | Unitedhealth Group | TIINGO_METADATA | ref_UNH | tiingo:UNH | 0000731766 |
| XOM | Exxon Mobil Corp | Exxon Mobil | TIINGO_METADATA | ref_XOM | tiingo:XOM | 0002115436 |
| KO | Coca-Cola Company | Coca-Cola | TIINGO_METADATA | ref_KO | tiingo:KO | 0000021344 |
| DIS | Walt Disney Co (The) | Walt Disney Co (The) | TIINGO_METADATA | ref_DIS | tiingo:DIS | 0001744489 |
| INTC | Intel Corp | Intel | TIINGO_METADATA | ref_INTC | tiingo:INTC | 0000050863 |
| QCOM | Qualcomm Inc | Qualcomm | TIINGO_METADATA | ref_QCOM | tiingo:QCOM | 0000804328 |

### 4.2 Regression (Capability Matrix vorher → nachher, Nachrechnung lokal identisch)

| Kennzahl | vorher | nachher |
|---|---:|---:|
| productUniverse | 7.004 | 7.004 |
| tiingoResolved | 7.004 | 7.004 |
| tiingoUnresolved | 0 | 0 |
| historicalAvailable | 5.696 | 5.696 |
| historicalQualityAccepted | 6.636 | 6.636 |
| intradayAvailable | 5.188 | 5.188 |
| liveCapable | 227 | 227 |
| factorEligible | 6.514 | 6.514 |
| discoverEligible | 6.406 | 6.406 |
| stockPages | 6.514 | 6.514 |
| namesMissing | 6.499 | 23 |

Die 21 Titel ohne Anbieter-Namen (u. a. BNRG, CRY, DXF, GLT, GLYC, KLMN, MESA, NYMT, PLA, QRTEA, SVAC, WILC, ZTST, ZZK, CBO-P-A) sind
beim Anbieter ohne Stammdaten und nicht (mehr) im SEC-Verzeichnis — überwiegend delistete oder umgezogene Titel, die der Master als
Mitglied führt; Wiederholung nach 30 Tagen (`retryAfter`). Kein Name wurde geraten.

Befund für den Master (nicht Teil dieses Auftrags, Mitgliedschaft unverändert): das Produktuniversum enthält Börsen-Testsymbole
(ZJZZT, ZVZZT, ZWZZT, ZXZZT „NASDAQ TEST STOCK", ZVV „LISTED TEST SYMBOL", CBO/CBX/IGZ „NYSE LISTED TEST", ZBZX, ZCZZT, ZXYZ-A).
Ihre Namen sind korrekt so geliefert; ob sie ins Produktuniversum gehören, ist eine Master-Entscheidung.


## 5. Identitätssicherheit — was der erste Lauf gezeigt hat

Der erste CI-Lauf (Tiingo-Stammdaten für 7 000 Titel, 71 Minuten) lieferte 6 971
Anbieter-Namen. Der Abgleich mit dem SEC-Verzeichnis ergab bei **194 Titeln einen
Widerspruch ohne ein gemeinsames Wort**. Stichprobe:

| Ticker | Anbieter-Stammdaten (Tiingo) | SEC-Registrant heute | Ursache |
|---|---|---|---|
| STRK | Microstrategy Inc | Strategy Inc | Umbenennung |
| FLG | New York Community Bancorp Inc | Flagstar Bank, National Association | Umbenennung |
| AAMI | BrightSphere Investment Group Inc | Acadian Asset Management Inc. | Umbenennung |
| NGNE | Neoleukin Therapeutics Inc | Neurogene Inc. | Reverse Merger |
| PS | Pluralsight Inc - Class A | Pershing Square Inc. | Ticker-Wiederverwendung |
| CTAA | Qwest Corporation | Clearthink 1 Acquisition Corp. | Ticker-Wiederverwendung |
| AMSS | GraniteShares 2x Short AMD Daily ETF | Amass Brands | Ticker-Wiederverwendung |
| DTI | DTI Group Ltd | Drilling Tools International Corp | Ticker-Wiederverwendung |

Die Anbieter-Stammdaten sind in diesen Fällen veraltet. Deshalb gilt die Regel:
**Einigkeit** (gemeinsames bedeutungstragendes Wort oder gleicher Wortanfang, z. B.
„Kimberly-Clark Corp" / „KIMBERLY CLARK CORP") → Anbieter-Name (bessere Schreibweise,
Klassenzusatz); **Widerspruch** → der heutige SEC-Registrant zu Ticker + Börse, und der
Widerspruch steht an der Zeile (`nameConflict`). Das ist keine unscharfe Zuordnung —
beide Kandidaten sind über Schlüssel zugeordnet; die Regel entscheidet nur, welcher der
beiden Namen der aktuelle ist. Wo kein SEC-Eintrag existiert (Preferreds, Warrants, viele
ETF-/Auslandstitel), bleibt der Anbieter-Name ohne Gegenprobe.

Weitere Regeln aus dem Lauf: Anbieter-Antworten, die nur den Ticker enthalten (SLB, YPF
u. a.), werden verworfen und aus der SEC ergänzt; kurze Versalien-Namen (AECOM für ACM)
gelten nur mit Bestätigung durch die zweite Quelle; die vier Nasdaq-Testsymbole
(ZAZZT, ZBZZT, ZXZZT, ZZK) bleiben ohne Namen — es gibt keinen.

Class Shares: GOOG/GOOGL (Alphabet Class C/A), BRK-A/BRK-B, BF-A/BF-B, NWS/NWSA, META,
PLTR, V tragen den Klassenzusatz des Anbieters; jede Klasse ist eine eigene securityId.

## 6. Tests, Nachrechnung, Regression

| Prüfung | Ergebnis |
|---|---|
| `node --test quant/tests/*.test.mjs` | 801 Tests, 0 Fehler (neu: CN1–CN6 Namensschicht: kein Ticker/leerer Name, displayName-Regel, deterministischer Vorrang, Widerspruchsregel, SEC-Schlüssel, Anbieter-Symbolprüfung, Artefakt = Produktuniversum, Klassenaktien, gleiche securityId = gleicher Name; US6/US7 Overlay) |
| `node --test discover/tests/*.test.mjs` | 170 Tests, 0 Fehler (neu: NM1–NM3 Vertrag displayName → companyName → Ticker, Suchindex ohne Ticker-Namen, Aktienseite mit legalName/nameSource) |
| `verify-technical-data.mjs`, `verify-discover-data.mjs` | keine Abweichung |
| `assert-public-data-hygiene.mjs`, `assert-no-secrets.mjs` | grün |
| `build-capability-matrix.mjs --dry-run` | lokal nachgerechnet, identisch mit der committeten Matrix; `namesMissing` 6 499 → 23 |
| `build-company-names.mjs --dry-run` (ohne Abruf) | Vorrang aus den gespeicherten Kandidaten reproduziert: 6 981 / 7 004, identische Quellenverteilung |
| Browser-QA (lokaler Server, CI-Daten) | V3 38/38, Live 29/29 — Namen auf Karten, Hero und Aktienseite, keine Konsolenfehler |

Regression: Produktuniversum 7 004, Tiingo resolved 7 004, Historical 5 696, Intraday 5 188, Factor eligible 6 514, Discover eligible 6 406,
Stock pages 6 514 — alle unverändert (Tabelle 4.2). Der Pass hat keine Datei außerhalb der Namensschicht, des Discover-Builds und der
Matrix verändert; Chart-Engine, Intraday-/Live-Logik und Client-Skripte sind unberührt (`git diff c1eb9e8f..HEAD --stat -- discover/ui quant/engines/realtime` leer).

## 7. Was dieser Pass nicht getan hat

* kein Discover-Redesign, keine Änderung an Chart-Engine, Intraday-/Live-Logik, Universe-
  Mitgliedschaft, keine SEC-Pipeline, keine zweite Company-Master-Architektur
* keine Namensableitung per KI, keine erfundenen Namen, kein Ticker als Name
* keine aggressive Normalisierung: Anbieter- und SEC-Schreibweisen bleiben (z. B.
  „Lilly(Eli) & Company", „Walt Disney Co (The)", Versalien bei ETF-Namen) — ein
  redaktionelles displayName-Polishing gehört in den angekündigten Visual-Pass
* nicht nach `main` gemergt, nicht veröffentlicht
