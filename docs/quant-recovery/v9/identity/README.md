# V9 Workstream A – Listing identity (weekly research adapter)

Status: **research evidence + proposal, not wired**. `productionApproved=false`. No engine, master, series or workflow file was changed.

## Ausgangslage (reproduziert, main `e490982f2b`)

`scripts/quant/v9/identity/reproduce-weekly-reasons.cjs` (unveränderter `createLoader`): 6.190 Kandidaten, 4.449 QUALIFIED, 180 `AMBIGUOUS_LISTING_IDENTITY`, 4 `INACTIVE_LISTING_TERMINAL_VALUE_UNVERIFIED` (BGC, COHR, DCOM, TRAK), 3 `LISTING_IDENTITY_MISMATCH` (EFOR, SGI, SUNE), 2 `ORIGINAL_SOURCE_CLASSIFICATION_CONFLICT`.

## Dateien

| Datei | Inhalt |
|---|---|
| `dossiers-7.json` | SEC-Dossiers der 4 inaktiven + 3 Mismatch-Fälle: Submissions (CIK, Namen, formerNames, Listing-Formulare), Schlüsselfilings mit Zitat + SHA-256, SEC-genannte Schlusskurse gegen die Wochenreihe, Niveaubruch-Tests, Ticker-Kette, Entscheidung |
| `ambiguous-resolution.json` | 180 mehrdeutige IDs: Strukturursache, CIK, iXBRL-Cover (erstes/letztes Filing mit Ticker), Klasse, Börse, Volltext-Tickerbeleg, Entscheidung + nutzbares Intervall |
| `identity-evidence-proposal.json` | vorgeschlagenes Register (`research-identity-evidence-1.0.0-proposal`) |
| `dry-run-counts.json` | Vorher/Nachher der Wochenqualifikation (unveränderte `validate()`) |
| `independent-check.json` | unabhängige Python-Prüfung (stdlib) |

Reproduktion (SEC ≤ 2 req/s, Rohbodies nur im privaten Cache `…/scratchpad/v9-private/identity/http-cache`):

```bash
node scripts/quant/v9/identity/reproduce-weekly-reasons.cjs --out <private>/base-reasons.json
python3 scripts/quant/v9/identity/resolve_ambiguous.py --reasons <private>/base-reasons.json --out docs/quant-recovery/v9/identity/ambiguous-resolution.json
python3 scripts/quant/v9/identity/build_dossiers.py --out docs/quant-recovery/v9/identity/dossiers-7.json
python3 scripts/quant/v9/identity/build_proposal.py --dossiers … --ambiguous … --out docs/quant-recovery/v9/identity/identity-evidence-proposal.json
node scripts/quant/v9/identity/dry-run-qualification.cjs --proposal … --out docs/quant-recovery/v9/identity/dry-run-counts.json
python3 -I scripts/quant/v9/identity/check_identity.py --docs docs/quant-recovery/v9/identity --cache <private>/http-cache --out docs/quant-recovery/v9/identity/independent-check.json
```

## Ergebnisse

### Die 7 Dossier-Fälle

Alle sieben Wochenreihen sind **eine** Wertpapierklasse des *heutigen* Ticker-Inhabers (Tiingo-Historie folgt dem Emittenten über Tickerwechsel); die Master-Zeile zeigt auf einen **anderen, früheren Inhaber desselben Tickers**. Es ist also keine terminale Bewertung nötig, sondern eine Identitätsreparatur.

| ID | Reihe ist | Master-Zeile ist | Beleg Reihe = Emittent | Entscheidung / nutzbar ab |
|---|---|---|---|---|
| COHR | II-VI → Coherent Corp. (CIK 820318), IIVI→COHR 2022-09-08, XNAS→XNYS 2023-02-23 | Coherent, Inc. (CIK 21510; Fusion 2022-07-01: $220 + 0,91 II-VI-Aktien) | 11 Same-day-MATCH (z. B. 2021-04-30 $67,14 = Reihe 67,14); Splits 2005/2011 = II-VI-8-Ks | BIND, ab 2001-09-28 (frühester 10-K mit „IIVI“) |
| BGC | eSpeed → BGC Partners → BGC Group (CIK 1094831), ESPD→BGCP 2008-04-02, Nachfolge-Emittent 2023-07-03 (1:1) | General Cable (CIK 886035; $30,00 bar, 2018-06-06) | 11 MATCH (2007-09-28 $8,53/1,555 = 5,49; 2023-05-19 $4,64) | BIND, ab 2018-12-07: Faktor 1,555 am 2018-12-03 ist **Newmark-Spin-off (0,463895 NMRK/Aktie), kein Split** |
| DCOM | Bridge Bancorp → Dime Community → Dime Commercial (CIK 846617), BDGE→DCOM 2021-02-01, XNAS→XNYS 2026 | Legacy Dime (CIK 1005409; 0,648 Bridge-Aktien je Aktie, 2021-02-01) | 14 MATCH (u. a. 2021-12-31 $35,16) | BIND, ab 2011-03-11 (früher OTC-BB-Zeitraum ausgeschlossen) |
| TRAK | ReposiTrak (CIK 50471), TRAK auf NYSE spätestens ab 8-K 2024-06-17 | Tiingo-Zeile 1999–2024-10-07 (Emittent nicht belegt) | Reihe liegt vollständig im cover-bestätigten Ticker-Segment; kein Preisbeleg vorhanden | BIND, ganze Reihe (107 Wochen) |
| SGI | Tempur-Pedic → Tempur Sealy → Somnigroup (CIK 1206264), TPX→SGI 2025-02-18 | Silicon Graphics Int'l (CIK 1316625; $7,75 bar, 2016-11-01) | 9 MATCH (2026-04-10 abgeleitet 11,36/0,1455 = 78,08 vs. 78,06) | BIND, ab 2004-04-02 |
| EFOR | On Assignment → ASGN → Everforth (CIK 890564), ASGN→EFOR 2026-04-24 | Tiingo EXPM-Zeile 2015–2022 (nicht belegt) | 12 MATCH im ASGN-Segment | **HOLD**: −52 % am 2026-04-23 (Tag nach Ergebnis-8-K), kein SEC-Preis im EFOR-Segment |
| SUNE | Communications Systems → Pineapple → SUNation (CIK 22701) | SunEdison (CIK 945436; Chapter 11 2016-04-21) | 2 MATCH | **HOLD**: Same-day-Mismatch 2025-04-04 (SEC $0,261 → 52,2 bereinigt vs. Reihe 43,2; −90 % Wochenbruch vor dem SEC-Splitdatum 2025-04-21); CVR-Ausschüttung 2022-03-25 unbereinigt |

Terminalwerte der Master-Vorgänger sind belegt, werden aber **nicht** benötigt und **nicht** in die Reihen eingesetzt.

### Die 180 mehrdeutigen IDs

Ursache: 173 IDs mit 2, 7 mit 3 Master-Zeilen je Baseline-ID; **keine** kanonische ID wird von mehreren Baseline-IDs geteilt. Flags: frühere inaktive Zeile desselben Tickers (Ticker-Wiederverwendung) 128, spätere inaktive Zeile 48, Kurzzeilen ≤ 31 Tage 30, Master-Typ PREFERRED 15, gleiche Startdaten 7, Suffix-Konventionen (Nasdaq 5. Buchstabe, `_P_`, R/U) 15.

| Zustand | Anzahl |
|---|---|
| RESOLVED_SINGLE_COMMON_LISTING | 132 (54 ganze Reihe, 21 gekürzt wegen unbelegter Frühhistorie, 57 gekürzt mit Überlappung zu anderer Master-Zeile = Konkatenationsrisiko) |
| RESOLVED_NOT_COMMON | 29 (15 Preferred, 5 Depositary-Preferred, 8 ADS, 1 Unit) |
| UNRESOLVED | 19 (9 kein SEC-Tickereintrag, 4 Ticker nicht auf aktuellem Cover, 2 ohne verwertbare iXBRL-Cover, 2 Klassentitel unklar (TTE „Shares“, VNO „4.45% Series O“), 2 Delisting-Formular nach letztem Cover) |

### Dry run (vorgeschlagene Bindung, unveränderte Adapterprüfungen)

QUALIFIED 4.449 → **4.565 (+116)**: 111 aus den mehrdeutigen IDs, 5 aus den Dossiers (BGC, COHR, DCOM, SGI, TRAK). 21 gebundene IDs scheitern weiter an anderen Prüfungen (13 INSUFFICIENT_HISTORY nach Kürzung, 7 CORPORATE_ACTION_UNRESOLVED, 1 MISSING_WEEKS) und werden **nicht** gezählt. AMBIGUOUS 180 → 48, INACTIVE 4 → 0, MISMATCH 3 → 2 (EFOR, SUNE gehalten).

Unabhängige Prüfung: **PASS** – Dossiers 7/7, mehrdeutige 180/180 Entscheidungen und validFrom identisch, 823/823 Quellen-Hashes gegen die gecachten Bodies, alle History-Guards, eigene Python-Reimplementierung der Adapterprüfungen: 116 = 116, keine ID-Abweichung.

## Entscheidungsregeln

Dossiers (R1–R5): R1 aktuelle SEC-Tickerzuordnung = Reihen-CIK, alle Zitat-Claims gefunden, kein Same-day-Preis-Mismatch im nutzbaren Intervall. R2 Start = max(Reihenstart, frühester venue-geprüfter 10-K/10-Q-Tickerbeleg, Ende belegter CA-Schnitte). R3 jedes Ticker-Segment mit Tickerwechsel innerhalb der Reihe braucht ≥ 1 Same-day-MATCH (±2 %); Start = frühestes Segment, ab dem alle Segmente belegt sind. R4 unerklärter Niveaubruch (|z| > 4 gegen 52 Wochen) verschiebt den Start dahinter, sonst HOLD. R5 aktuelles iXBRL-Cover trägt den Ticker als Common, ≤ 200 Tage alt, kein Form 25/15 danach.

Mehrdeutige IDs: CIK über aktuelle SEC-Tickerliste (normalisiert/Basisticker/Volltext-Fallback); iXBRL-Cover (`dei:TradingSymbol`, `dei:Security12bTitle`, `dei:SecurityExchangeName`) des letzten und – per Binärsuche – des ersten Filings mit dem Ticker; Klasse aus dem Cover-Titel (geteiltes ADS/Ordinary-Symbol → ADS); genau eine aktive Common-Master-Zeile mit passender Börse; Startpunkt = Reihenstart, wenn ein IPO-/Listing-Dokument den Ticker ≤ 7 Tage nach Reihenstart nennt, sonst frühester **faktischer** Eigenbeleg in 10-K/10-Q/20-F/40-F, sonst erstes iXBRL-Cover; Niveaubruch an Grenzen anderer Master-Zeilen kürzt weiter.

**Offenlegung nachträglicher Regeländerungen** (nach Sicht auf Zwischenergebnisse, alle in Richtung strenger oder korrekter Extraktion): Preisvergleich in MATCH/WEAK_MATCH getrennt, nur Same-day entscheidend (nach EFOR 2012-03-20 Mid-week-Abweichung); Segmentregel R3; Ausschluss von Extraktions-Fehltreffern („would have a value“, „exercise price“); Volltext-Tickerbelege nur mit US-Börse im selben Satz, eigenem Bezug („our/we/the Company's“), ohne `WI`/`PR`/`.XX`-Suffix, nach Reihenstart nur faktisch und nur aus periodischen Berichten (nach Fehltreffern TEN/Oslo, DOC/CWBC/CZR Fusionspartner); Symbolnormalisierung `PSAPrQ`/`JPM PR M`; ADS bei geteiltem Symbol. Die Zahlen oben stammen aus dem letzten Lauf mit allen Regeln.

## Vorgeschlagene Engine-Änderung (nicht umgesetzt)

1. Neue Datei `quant/engines/research-identity-evidence.cjs`: `module.exports = { schemaVersion: 'research-identity-evidence-1.0.0', scope, records }` mit den Records aus `identity-evidence-proposal.json` (`BIND_SOURCE_RESOLVED_LISTING`; `CONFIRM_NOT_COMMON`/`HOLD_SOURCE_CONFLICT` nur informativ).
2. `weekly-real-adapter.cjs#createLoader`, vor der Ambiguitätsprüfung:

```js
const IdentityEvidence = require('./research-identity-evidence.cjs');
if (IdentityEvidence.schemaVersion !== 'research-identity-evidence-1.0.0' || !Array.isArray(IdentityEvidence.records)) throw Error('INVALID_RESEARCH_IDENTITY_EVIDENCE');
const identityBindings = new Map(IdentityEvidence.records.filter(r => r.decision === 'BIND_SOURCE_RESOLVED_LISTING').map(r => [r.securityId, r]));
// in loader(securityId, suppliedBytes), after reading bytes and rows:
const record = identityBindings.get(securityId);
if (record) {
  const b = record.binding, g = record.historyGuard, doc = JSON.parse(bytes);
  const known = b.masterRowAction === 'SELECT_EXISTING_ROW' ? rows.some(r => r.canonical_id === b.canonicalId)
                                                            : b.replacesCanonicalIds.every(id => rows.some(r => r.canonical_id === id));
  if (!known) throw Error('IDENTITY_EVIDENCE_MASTER_ROW_MISSING');
  if (hash(doc.points.filter(p => p[0] >= g.checkedFrom && p[0] <= g.checkedTo)) !== g.pointsSha256) throw Error('IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH');
  if (b.activeStatus !== 'ACTIVE_SEC_CONFIRMED' || !/COMMON/.test(b.instrumentClass) || doc.ticker !== record.ticker) throw Error('IDENTITY_EVIDENCE_BINDING_INVALID');
  const points = doc.points.filter(p => p[0] >= b.validFrom && (b.validTo === null || p[0] <= b.validTo));
  if (!points.length) throw Error('INSUFFICIENT_HISTORY');
  const sliced = { ...doc, points, from: points[0][0], to: points.at(-1)[0] };
  const identity = { canonical_id: b.canonicalId, baseline_security_id: securityId, ticker: doc.ticker, currency: b.currency, provider: b.provider,
    start_date: b.validFrom, active_status: 'ACTIVE', eligible_us_equity: true, instrument_type: 'EQUITY_COMMON', source_provenance: 'V9_SEC_IDENTITY_EVIDENCE:' + b.cik };
  const r = validate(sliced, identity);
  return { ...r, identityEvidence: { cik: b.cik, canonicalId: b.canonicalId, validFrom: b.validFrom, validTo: b.validTo, sources: record.sources.length },
    warnings: r.warnings.concat(['SOURCE_RESOLVED_IDENTITY_BINDING', 'SERIES_RESTRICTED_TO_SOURCED_INTERVAL']),
    sourcePath: rel, sourceBytesHash: hash(bytes), masterVersion: master.version, masterGeneratedAt: master.generatedAt };
}
```

`dry-run-qualification.cjs` führt exakt diese Logik außerhalb der Engine aus. Offene Entscheidung für den Lead: `lastConfirmedCover` veraltet; ein Ablauf (z. B. Bindung nur gültig, solange `asOf − lastConfirmedCover.filingDate ≤ 200/400 Tage`) sollte mit eingebaut werden.

## Grenzen

- SEC-Tickerliste ist nur aktuell; historische Tickerbindung stützt sich auf iXBRL-Cover (ab 2019/2021), Volltext-Statements (ab 2001) und Same-day-Preise. Kontinuität zwischen zwei Belegen desselben Tickers wird angenommen (kein Zwischenwechsel nachweisbar ausgeschlossen).
- Kein SEC-Preisbeleg für TRAK; Identität dort nur über Cover/Ticker/Börse.
- Ex-post split-bereinigte Anbieterreihen bleiben ohne Rohkurs-Rekonstruktion; BGC-Spin-off-Faktor ist als Split verbucht (deshalb Schnitt 2018-12-07).
- Der Workstream liefert keine repräsentative historische Population inkl. Delistings; die Kürzungen schließen Frühhistorie aus, statt sie zu belegen.
- Mid-week-Preisvergleiche (z. B. COHR 2018-11-08 nach Finisar-Ankündigung) sind beschreibend; einige Mid-week-Einträge sind Extraktions-Fehltreffer (Referenzbereiche), ohne Einfluss auf die Entscheidung.
