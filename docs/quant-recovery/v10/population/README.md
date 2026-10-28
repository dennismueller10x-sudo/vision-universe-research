# V10 Strang POPULATION – Identität, Listing-Lebenszyklus, historische Grundpopulation

Status: **SOURCE_EVIDENCE, NOT_CERTIFIED, `productionApproved=false`**. Basis: main `a1a0dd972a`.
Keine Datei unter `*/data` geändert, kein Workflow, kein Produktlesepfad; `weekly-real-adapter.cjs` unverändert.
Alle Erweiterungen sind opt-in-Optionen von `quant/engines/research-weekly-loader.cjs`.

## Reihenfolge (Registrierung vor Ergebnis)

| Commit-Inhalt | Datei |
|---|---|
| Protokoll vor jeder Quellenprüfung | `protocol-1.0.0.json` (+ `.sha256`) |
| Nachtrag: B3-Referenz aus EDGAR-Vollindizes statt Bulk-Archiv (CI-Wächter) | `protocol-amendment-1.0.1.json` |
| Nachtrag: SEC fügt je Abruf einen Bot-Tag vor `</body>` ein → Hash-Vergleich über Inhalt + `sha256Normalized` (nach 4-Fall-Probelauf, offengelegt) | `protocol-amendment-1.0.2.json` |
| Nachtrag: 7 Baseline-IDs mit doppelter `canonical_id` im Stamm → `SELECTED_ROW_NOT_UNIQUE` (nur ausschließend, offengelegt) | `protocol-amendment-1.0.3.json` |

Weitere offengelegte Implementierungskorrekturen nach Sicht auf Zwischenstände (keine Kriterienänderung):
B2 löst „vor Handelsbeginn am *Closing Date*“ über die Definition des Begriffs im selben Dokument auf (zweites Zitat
`LAST_TRADE_DATE_DEFINITION`); B2/B3 erkennen Vorzugs-/Rechte-/Unit-/Warrant-Symbole nach der Nasdaq-Fünftbuchstaben-Regel
(der Stamm führt u. a. XOMAO/XOMAP, CCLDO, TCBIO als `EQUITY_COMMON`).

## B1 Identität – 132 V9-Bindungen gegen SEC-Originale

Regeln Q-CIK, Q-CLS, Q-VEN, Q-CUR, Q-PX, Q-INT (Protokoll). Kern: frisches iXBRL-Cover (Ticker, Klasse Common, Börse = Stamm-MIC,
≤ 400 Tage, kein Form 25/15 danach), **Same-Day-Kurs aus einem SEC-Dokument des Emittenten** (±2 % gegen den
split-bereinigten Wochen- bzw. kreuzgeprüften Tagesschluss), Intervall: erster Preisanker ≤ 730 Tage nach Start, Schnitt hinter
überlappenden Stammzeilen (> 31 Tage) und hinter |z| > 4 an Zeilengrenzen/Börsenwechseln.

| Ergebnis (`identity-cases.json`) | Anzahl |
|---|---|
| geprüft | 132 |
| **qualifiziert `SEC_SAME_DAY_PRICE_AND_COVER`** (Register `v10`, 59 Inland, 3 FPI) | **62** |
| davon im Loader zusätzlich QUALIFIED | 57 (3 CORPORATE_ACTION_UNRESOLVED, 2 INSUFFICIENT_HISTORY) |
| ausgeschlossen | 70 |
| – nur fehlender Same-Day-Preisbeleg (COVER_PAGE_ONLY) | 49 |
| – Same-Day-Preiskonflikt (allein oder mit fehlendem Beleg) | 10 |
| – nicht eindeutige Stammzeile (doppelte `canonical_id`) | 7 |
| – Startdokument nicht wiedergefunden + Klassenwechsel | 2 |
| – Klasse nicht Common | 1 |
| – Delisting-Formular nach letztem Cover | 1 |

Preiskonflikte, fail-closed belassen: 4 echte Daten-Widersprüche zwischen Anbieter-Splitfaktor und Kursniveau
(BCTX, TIL, GAME, HOLO) und 6 Extraktionsartefakte (BTU Nennwert, DNA/RKT/STRR Kurs eines Fusionspartners, WOOF Datumszuordnung,
XRTX C$). DNA, RKT, STRR, WOOF hätten sonst Preisanker; eine manuelle Freigabe würde ein neues Protokoll brauchen.
TRAK bleibt `COVER_PAGE_ONLY` (nie für Studien); die fünf V9-Dossierbindungen sind byte-identisch (Regressionstest).
SEC-Abrufe B1: 376 (Erstlauf), alle Wiederholungen aus dem privaten Cache.

## B2 Eingefrorene Kursenden

475 Reihen (Wochenlauf ≥ 4: 341, davon ≥ 8: 332; Tageslauf ≥ 5: 475). `lifecycle-cases.json`:

| Kategorie | alle 475 | davon Woche ≥ 4 |
|---|---|---|
| Fusion/Übernahme (8-K 2.01) | 81 | 75 |
| Delisting Form 25/25-NSE/3.01 | 86 | 71 |
| Deregistrierung Form 15 | 1 | 1 |
| noch gelistet, Anbieter veraltet | 78 | 8 |
| Vorzug/Recht/Unit/Warrant | 44 | 34 |
| ungeklärt (109 ohne CIK, 76 ohne Beleg) | 185 | 152 |

**Quellenbelegter letzter Handelstag: 30 Reihen** (Register `quant/engines/research-listing-lifecycle.cjs`): Gegenleistung
CASH_MERGER 9, STOCK_MERGER 7, UNKNOWN 12 (Wahlrecht/CVR/nur „Offer Price“), DELISTED_NO_CONSIDERATION 2.
136 Delistings/Fusionen ohne datierten Handelsschluss-Satz bleiben ungelöst; 2 widersprechen der Reihe (BRNS, DENN) und bleiben gesperrt.
Wiederholte Schlusskurse gelten nie als Handel; `paymentDate` bleibt `null` (nicht belegt).

**Erzeuger-Befund:** 168 Reihen mit SEC-Delisting-/Fusionsbeleg sind im Stamm `ACTIVE` (Anbieter-`endDate` bleibt durch Fortschreibung
aktuell). Patch-Vorschlag, **nicht angewendet**: `producer-patch-proposal.diff`. Zusätzlich: der Stamm führt Vorzugs-/Notes-Symbole als
`EQUITY_COMMON` (73 qualifizierte Reihen im Frame-Lauf, s. B3).

## Loader – QUALIFIED je Konfiguration (`before-after.json`)

| Optionen | QUALIFIED |
|---|---|
| Default (`createResearchLoader(root)`) | 4.449 – 6.190/6.190 Ausgaben byte-identisch zum Adapter |
| `identityEvidence` | 4.453 |
| `identityEvidence` + `identityEvidenceProtocolV10` | 4.510 |
| `corporateActionEvidence` | 4.472 |
| `listingLifecycleEvidence` | 4.372 (95 `FROZEN_TAIL_UNRESOLVED`, MISSING_WEEKS 218 → 199) |
| `identityEvidence` + `corporateActionEvidence` | 4.476 |
| alle vier | 4.456 |

`listingLifecycleEvidence` (Schnittstelle laut gemeinsamem Brief): eingefrorene Wochenenden werden am belegten letzten Handelstag
geschnitten (`listingLifecycle: {schemaVersion, status, lastTradeDate, frozenTailBarsRemoved, terminal:{kind, cashPerShare, stockRatio,
acquirerTicker, paymentDate, evidence}}`), ohne Beleg `FROZEN_TAIL_UNRESOLVED`, Bewegung nach dem Handelstag `LISTING_LIFECYCLE_CONFLICT`,
History-Guard `LISTING_LIFECYCLE_HISTORY_GUARD_MISMATCH`. `identityEvidenceProtocolV10` ist eine eigene Option, weil der Owner-Entscheid
vom 28.10.2026 `identityEvidence:true` an die fünf Dossier-Datensätze bindet. **Freigabe der 62 V10-Bindungen durch den Owner offen.**

## B3 Historische Grundpopulation (`population-frame-1.0.0.json`)

Frame = alle vier Optionen, QUALIFIED, NYSE/Nasdaq/NYSE American, Common (Stamm + Symbolkonvention): **4.366 Listings**, davon 28 mit
belegtem späterem Delisting. Ausschlüsse je Grund in `counts.excludedByReason`; IDs + `idsSha256`, Regel + `ruleSha256`.
Referenz: EDGAR-Vollindizes `form.gz` 2000–2026 (108 Dateien, `sec-reference-full-index.json`), verschiedene CIKs mit 10-K/10-K405 je Jahr
(alle Registranten inkl. OTC – nur Größenordnung).

| ISO-Jahr | Anbieterreihen | qualifiziert | später delistet (belegt) | 10-K-Filer SEC | Abdeckung | Survivor-Anteil |
|---|---|---|---|---|---|---|
| 2000 | 1.553 | 1.382 | 10 | 9.699 | 14 % | 99,3 % |
| 2005 | 1.905 | 1.662 | 12 | 8.942 | 19 % | 99,3 % |
| 2010 | 2.270 | 1.948 | 14 | 8.955 | 22 % | 99,3 % |
| 2015 | 2.940 | 2.430 | 16 | 7.767 | 31 % | 99,3 % |
| 2020 | 4.134 | 3.185 | 20 | 6.615 | 48 % | 99,4 % |
| 2025 | 5.876 | 4.366 | 28 | 6.558 | 67 % | 99,4 % |
| 2026 | 6.190 | 4.348 | 10 | 6.291 | 69 % | 99,8 % |

Alle Jahre in der Datei. **Aussagegrenze:** Der qualifizierbare Bestand ist das heutige Anbieter-Universum. Über 99 % der Listings jedes
Jahres sind Survivors; belegte Delistings stammen nur aus 2025/2026 (eingefrorene Reihen). Die historische Marktpopulation inklusive der
seit 2000 verschwundenen Listings ist **nicht** abgebildet; die Abdeckung von 14 % (2000) gegen die 10-K-Filer zeigt die Größenordnung der
Auswahlverzerrung. Studien auf diesem Frame sind Survivor-Studien.

## Unabhängige Gegenprüfung

`python3 -I scripts/quant/v10/population/check_population.py` (stdlib, eigener HTML-Text, eigene Regex/Kalender, kein Import der Pipeline):
761/761 Quell-Hashes aus dem privaten Cache, Entscheidungen 132/132 gleich (62 = 62), jede qualifizierte Bindung hat ≥ 1 unabhängig im
Dokument wiedergefundenen MATCH-Anker (62/62; 283/299 Anker insgesamt), Lifecycle 30/30 (Handelstag, Reihen-Gate, Guard, Beträge im Zitat),
Register = Fälle. Urteil `PASS_DECISIONS_AGREE_RESCAN_HITS_NEED_ADJUDICATION`: die bewusst lockerere Neusuche über 3.108 Dokumente meldet
35 zusätzliche „Mismatches“ bei qualifizierten IDs; alle von Hand gelesen, keiner ist ein Same-Day-Schluss des gebundenen Listings
(`independent-check-adjudication.json`: 29 Datumszuordnung, 4 kein Marktschluss, 2 anderer Emittent). Eine zweite Sprache ist kein Holdout.

## Reproduktion

```bash
P=<scratchpad>/v10-private/population    # privater SEC-Cache (http-cache/), nie im Repo
node scripts/quant/v10/population/reasons.cjs --configs '{"default":null}' --out $P/reasons-default.json
python3 scripts/quant/v10/population/b1_identity.py --out docs/quant-recovery/v10/population/identity-cases.json
python3 scripts/quant/v10/population/b2_lifecycle.py --reasons $P/reasons-default.json --out docs/quant-recovery/v10/population/lifecycle-cases.json
node scripts/quant/v10/population/build-registers.cjs
node scripts/quant/v10/population/reasons.cjs --out $P/reasons.json
python3 scripts/quant/v10/population/b3_population.py --reasons $P/reasons.json --out docs/quant-recovery/v10/population/population-frame-1.0.0.json --reference-out docs/quant-recovery/v10/population/sec-reference-full-index.json
node scripts/quant/v10/population/before-after.cjs --reasons $P/reasons.json --out docs/quant-recovery/v10/population/before-after.json
python3 -I scripts/quant/v10/population/check_population.py --root . --cache $P/http-cache --out docs/quant-recovery/v10/population/independent-check.json
python3 -I scripts/quant/v10/population/adjudicate_check.py --root . --out docs/quant-recovery/v10/population/independent-check-adjudication.json
node --test quant/tests/v10-population.test.mjs
```

SEC nur über `scripts/quant/sec/http_client.py` (2 req/s, User-Agent mit Kontakt). Abrufe insgesamt 4.685 (= Einträge im privaten Cache;
B1-Erstlauf 376 gemeldet, B3 108 Indexdateien, Rest B2 inkl. Volltextsuche und Submissions); Wiederholungsläufe 0 neue Abrufe.
Zusätzlich vor dem Nachtrag 1.0.1 ein einmaliger Download des Bulk-Archivs, ungelesen gelöscht.
