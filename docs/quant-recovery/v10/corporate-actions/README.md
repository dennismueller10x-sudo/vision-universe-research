# V10 Strang CA – Kapitalmaßnahmen und Total Return (Research, opt-in)

Status: **NOT_CERTIFIED**, `productionApproved=false`. Kein Produktpfad geändert: `weekly-real-adapter.cjs`,
`corporate-action-evidence.js` und `research-weekly-loader.cjs` sind byte-identisch zu main (`a1a0dd972a`); keine Datei unter `*/data`.
Geändert wird nur das Research-Register `quant/engines/research-ca-evidence.cjs` (Schema unverändert `research-ca-evidence-1.0.0`),
das ausschließlich mit `createResearchLoader(root, { corporateActionEvidence: true })` gelesen wird.

## 1. Kapitalmaßnahmen: Protokoll 1.1.x auf den Rahmen von 600 Reihen / 1.087 Ereignissen

Das eingefrorene Protokoll 1.0.0 (`v9-followups/ca-registry/protocol.json`, sha256 `db7e31a8…71c2`) bleibt unverändert.
1.1.x enthält alle 1.0.0-Regeln und ergänzt (vor dem Rahmenlauf committet):

| Version | Inhalt | Zeitpunkt |
|---|---|---|
| 1.1.0 (`e372e20a…`) | E1 Identität über Text („under the symbol …“) nur wenn kein `dei:TradingSymbol` getaggt ist; E2 Text-Deckblatt für Ereignisse 2004-08-23 … 2011-07-01 (neues 8-K-Item-Regime); E3 8-Ks ohne Items werden auf Split-Sprache geprüft; E4 Nachweis unbereinigter Splits (nie zulässig, nur Anbieterfehler-Vorschlag); E5 Haltegrund-Details | vor jedem SEC-Abruf |
| 1.1.1 (`5319de6f…`) | E2-Anker fällt auf das Shell-Company-Kästchen zurück | nach Rauchtest auf 5 Reihen, vor dem Rahmenlauf |
| 1.1.2 (`c8cb9ec9…`) | E6: ein 8-K, das einen Spin-off nennt, ist keine affirmative Quelle (nur Verschärfung) | **nach Sicht auf Teilurteile** (193/600 Reihen, ref_BCO 2008: Spin-off-Vollzugs-8-K hatte als Beleg gedient) |

Vorwissen ist im Protokoll offengelegt (Zählungen und Tickerlisten des 1.0.0-Laufs, V9-Triage). Das Register trägt eine einzige
`protocolSha256` (Loader-Vorgabe), deshalb wurden **alle** Ereignisse – auch die 24 von 1.0.0 – aus frisch geholten SEC-Quellen neu geprüft.

### Ergebnis (`verdicts.json`, Fakten-sha256 `8e7d6109…0b76`)

| Urteil (1.087 Ereignisse) | 1.1.2 | 1.0.0 |
|---|---:|---:|
| OUT_OF_FRAME (vor 2004-08-23 bzw. vor XBRL) | 250 | 440 |
| IDENTITY_UNVERIFIED (Ticker nicht genannt 224, keine CIK 41, Börse unbestätigt 44) | 309 | 240 |
| INSUFFICIENT_FILINGS (Auslandsemittent 20-F/6-K 150, keine Vor-Klammer 115, keine Nach-Klammer 10, noch keine 10) | 285 | 215 |
| SPLIT_OR_SHARE_CHANGE_EVIDENCE | 131 | 111 |
| PROVIDER_SPLIT_RECORDED | 42 | 37 |
| SPLIT_UNADJUSTED (E4, nur Vorschlag) | 8 | – |
| NEGATIVE_EVIDENCE_ONLY (davon 2 durch E6) | 24 | 14 |
| SPIKE_REVERSAL | 1 | 1 |
| **GENUINE_MOVE** | **37** | 29 |
| SPINOFF_DISTRIBUTION | 0 | 0 |

Registriert: **30 Ereignisse in 28 Reihen** (alle `GENUINE_MOVE`, `PRICE_RETURN`), je ≥ 3 Quellen (Akzession, URL, sha256, Zitat).
Neu: ACAD (2009, Text-Ära), ARLO (E1), MGNX (2 Ereignisse), MOH (2005), NSIT (2009, 8-K Item 4.02), RDN (2009).
Entfallen: VSTS (E6: das Quartals-8-K am Sprungtag nennt den Spin-off von Aramark – bewusst falsche Ablehnung statt Risiko).

### Vorher/Nachher (`before-after.json`, `createResearchLoader`)

| Modus | QUALIFIED | CA-Holds |
|---|---:|---:|
| Default (= Adapter, 6.190/6.190 byte-identisch) | 4.449 | 600 |
| `{identityEvidence}` | 4.453 | 600 |
| `{identityEvidence, corporateActionEvidence}` Register main (1.0.0) | 4.476 | 577 |
| `{identityEvidence, corporateActionEvidence}` Register 1.1.2 | **4.481** | **572** |

+6 / −1 Reihen; nur diese 29 Register-Reihen ändern ihre Ausgabe. Studienwirkung: ACAD 1.170, MOH 1.217, NSIT 1.399 (ab 2000),
RDN 1.399 (ab 2000), MGNX 681, ARLO 430 Wochenbalken kommen hinzu; VSTS fällt heraus.

### V9-Trockenlauf (81 Fälle, `agreement.json`, nach dem Einfrieren gelesen)

Jeder Fall einzeln: **20 zugelassen**, gehalten 61 (Split-/Aktienzahl-Evidenz 27, Identität 22, keine affirmative Quelle 10, vor 2004 1,
Filings fehlen 1). Keine Pauschalaktivierung.

### Anbieterfehler (`provider-errors.json`, keine Datenänderung)

8 E4-Fälle. Nur **PZZA 2014-01-03 (Faktor 2, XBRL-Verhältnis 2 bestätigt)** ist belastbar – unabhängige Wiederentdeckung des bereits
von #1042 reparierten Splits (Positivkontrolle). Die übrigen 7 (GCTK, GOVX, INBS, INO, MNPR, MTVA, ZONE) sind als
`UNCONFIRMED_E4_ONLY_DO_NOT_APPLY_WITHOUT_MANUAL_RATIO_CHECK` markiert: die „Split-Aussage“ ist oft Warrant-Boilerplate, der
Aktienzahl-Sprung eher eine Emission. E4 ist damit als Nachweis zu schwach; kein Erzeuger-Vorschlag außer PZZA.

### Unabhängige Prüfung (`independent-check.json`, Python stdlib, keine Repo-Importe): **PASS**

Rahmen 600/600, Urteile 1.087/1.087, Register 30/30, Quell-sha256 272/272 aus dem Privat-Cache, E1-Text 12/12 und E2-Deckblatt 8/8 neu
geparst, Vorher/Nachher konsistent.

## 2. Total Return: Dividenden-Register (`tr-register-1.0.0.json`)

Protokoll `tr-protocol-1.0.0` (vor jedem Abruf) mit offengelegten Nachträgen 1.0.1 (Extraktion auch auf zusammengezogenem Leerraum,
JPM-Fund), 1.0.2 (nur als Rückfall – Fehlpaarungen der Vereinigung), 1.0.3 (Sätze mit zwei Beträgen ungenutzt – **NVDA 2026-06-04 stand in
V9 mit 0,01 statt 0,25 USD**), 1.0.4 (Takt-Schnitt > 120 Tage zwischen Stichtagen – A 2024 verdeckte eine fehlende Oktober-Dividende).
1.0.3/1.0.4 sind reine Verschärfungen, alle nach Sicht entschieden.

Regeln: Zahltag und Betrag aus SEC-Satz/-Zeile, Stichtag belegt, Ex-Tag **nur abgeleitet** (`DERIVED_SETTLEMENT_RULE_NOT_SOURCED`),
Barbuchung am Zahltag, keine Ex-Tag-Buchung, Verfügbarkeit aus SGML-Header, Beträge in Reihen-Einheiten (geteilt durch spätere
Anbieterfaktoren; NVDA-/WMT-Splits mit SEC-Quelle bestätigt; IBM 1,046 = Kyndryl-Spin-off als Nicht-Split-Faktor → TR-Fenster dort geschnitten).

| Titel | belegte Quartale | V9 | längstes TR-Fenster | TR-CAGR / PR-CAGR (Ledger) |
|---|---|---|---|---|
| MSFT | 47/47 | 47 | 2015-01 … 2026-09 | 23,16 % / 22,63 % |
| WMT | 47/47 | 47 | 2015-01 … 2026-09 | 12,36 % / 11,61 % |
| **IBM** | **47/47** | 43 | 2015-01 … 2021-11-03 (+ 2021-11-04 … 2026-09) | 0,58 % / −3,46 % |
| NVDA | 42/47 | 46 | 2020-07 … 2026-03 | 62,19 % / 62,17 % |
| A | 26/47 | 26 | 2023-01 … 2023-09 | – (Fenster kurz) |
| **JPM** | **16/47** | 15 | 2015-01 … 2018-12 (durchgehend) | 15,24 % / 13,07 % |
| XOM | 14/47 | 14 | 2023-01 … 2026-06 | 8,49 % / 5,57 % |
| META | 1/11 | 1 | 2024Q1 | – |

Lücken bleiben Lücken: JPM ab 2019 und XOM 2015–2022 haben in SEC-Quellen keinen Stichtag (JPM 10-Q nennt Zahltag ohne Stichtag:
10 Quartale `GAP_RECORD_DATE_NOT_STATED`); XOM 2022Q4 steht im 8-K, aber Stichtag und Zahltag in zwei Sätzen – nach Protokoll nicht zulässig.
companyfacts-Gegenprobe: MSFT 47/47 MATCH; verbleibende MISMATCH sind erklärbar (NVDA 2021 nachträglich split-bereinigt, WMT Jahresbeschluss, JPM zwei Beschlüsse im Quartal).

`portfolioEvents` je Titel sind direkt als `CASH_DIVIDEND`-Ereignisse für `research-portfolio.cjs` nutzbar
(`effectiveDate` = erste Wochensitzung ≥ abgeleitetem Ex-Tag, `payDate` belegt, `informationAvailableAt` = SEC-Annahme).
Etiketten: `PRICE_RETURN` | `TOTAL_RETURN` (nur innerhalb eines Fensters) | `CA_UNRESOLVED` | `TERMINAL_UNKNOWN` – nie vermischt.

**Parität** (`tr-ledger-summary.json`, `tr-ledger-parity.json`): Einzeltitel-Kauf-und-Halten mit der unveränderten Engine vs. unabhängige
Python-Rechnung aus Reihe und Register: **8/8 PASS** (relative Abweichung 0, gleiche Zahl berechtigter Ereignisse). Zweite Sprache ist kein Holdout.

## Reproduktion

```bash
P=<scratchpad>/v10-private/corporate-actions
node scripts/quant/v9-followups/ca-registry/export-frame.cjs --out $P/frame-v9script.json
python3 scripts/quant/v10/corporate-actions/verify_ca_events_v11.py --frame $P/frame-v9script.json --cache-dir $P/http-cache --facts-out $P/facts-1.1.2.jsonl
node scripts/quant/v10/corporate-actions/build-ca-registry.cjs --facts $P/facts-1.1.2.jsonl --out quant/engines/research-ca-evidence.cjs --verdicts docs/quant-recovery/v10/corporate-actions/verdicts.json --provider-errors docs/quant-recovery/v10/corporate-actions/provider-errors.json
node scripts/quant/v10/corporate-actions/before-after.cjs --baseline-registry <research-ca-evidence.cjs von a1a0dd972a> --baseline-ref a1a0dd972a --out docs/quant-recovery/v10/corporate-actions/before-after.json
python3 -I scripts/quant/v10/corporate-actions/check_ca_registry_v11.py --root . --facts $P/facts-1.1.2.jsonl --before-after …/before-after.json --provider-errors …/provider-errors.json --cache $P/http-cache --out …/independent-check.json
python3 -I scripts/quant/v10/corporate-actions/compare_verdicts.py --root . --out …/agreement.json
python3 scripts/quant/v10/corporate-actions/harvest_dividends_v10.py --private $P
python3 scripts/quant/v10/corporate-actions/build_tr_register.py --private $P --out …/tr-register-1.0.0.json
node scripts/quant/v10/corporate-actions/run-tr-ledger.cjs --register …/tr-register-1.0.0.json --private $P/tr-ledger --out …/tr-ledger-summary.json
python3 -I scripts/quant/v10/corporate-actions/check_tr_ledger.py --root . --register …/tr-register-1.0.0.json --summary …/tr-ledger-summary.json --out …/tr-ledger-parity.json
```

SEC: ≤ 1 Anfrage/s je Prozess (Strang ≤ 2/s), rund 4.400 Abrufe für CA (4.120 Körper), rund 2.600 für Dividenden; Privat-Cache nur im Scratchpad.

## Grenzen

- Affirmative Quelle belegt ein offengelegtes Ereignis am Sprungtag, keine Kausalität.
- E1-Textidentität ist schwächer als `dei:TradingSymbol` (Ticker-Nennung im eigenen Bericht derselben CIK vor und nach dem Ereignis).
- Spin-offs (ABT/AbbVie, JCI/Tyco, SPXC, CVEO) bleiben gehalten (`IDENTITY_TICKER_NOT_NAMED`); BCO 2008 (Brink's Home Security) über E6 als
  `NEGATIVE_EVIDENCE_ONLY`; die Spin-off-Regel (Datum muss nach der Ausschüttungsformel stehen) erkennt solche 8-Ks nicht – kein `SPINOFF_DISTRIBUTION` in diesem Lauf.
  KDP 2018 (Sonderdividende, Ticker DPS→KDP) und GOOGL 2014 (Klasse-C-Ausschüttung, keine Vor-Klammer) bleiben ebenfalls gehalten.
- Auslandsemittenten (150 Ereignisse) sind mit 10-K/10-Q-Regeln nicht prüfbar; ADS-Verhältnisänderungen widerlegen Aktienzahl-Kontinuität nicht.
- Dividendenvollständigkeit endet an der SEC-Quellenlage; Ex-Tage bleiben abgeleitet.
