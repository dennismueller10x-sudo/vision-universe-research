# V12 LARGECAP – große, bisher gesperrte S&P-500-Listings (P4b)

Stand 29.10.2026, Basis `10d778ebae`. Evidenzart SOURCE_EVIDENCE / RECONSTRUCTION, `NOT_CERTIFIED`, `productionApproved: false`.
Keine Datei unter `*/data`, kein Produktpfad, kein Adapter, keine Gate-Änderung. Default-Loader und alle bisherigen Optionssätze bleiben byte-identisch
(die neue Registererweiterung ist eine **nicht aufzählbare** Eigenschaft `v12`; `JSON.stringify` des Registers und jeder bisherige `registryHash` sind unverändert).

## Protokoll

`protocol-1.0.0.json` (sha256 `f0dcbd33…`, vor jeder Beleg-Abfrage committet, Vorwissen offengelegt):
- **Teil CA** = V10-Protokoll 1.1.2 unverändert (über den V10-Verifizierer als Bibliothek) + L1 (Ereignisse vor 2004 mit Text-Regeln, alte 8-K-Itemnummern), L2 (Ticker-Text im Gesamtdokument inkl. Exhibits), L3 (Kandidaten-CIK fest). Keine Split-/Aktienband-/Affirmativregel gelockert.
- **Teil RESTRICT** (neu): bei nicht zulässigem Ereignis wird kein Ereignis klassifiziert und kein Kurs verändert; das Listing gilt erst ab dem ersten Wochenbalken nach dem letzten nicht zulässigen Ereignis **und** ab der ersten eigenen 10-K/10-Q, die den Ticker nennt; danach unveränderte V10-B1-Identitätsregeln (Cover aktuell, Same-Day-Preis-MATCH, 730-Tage-Regel, Börsenwechsel-/Konkatenationsschutz).
- **Teil Identität**: V10 B1 erneut für TEL, DD, DOW, COR, DOC, ECHO mit L4 (zusätzlich alle DEF 14A/10-K des Intervalls lesen) und L5 (doppelte Stammzeilen gleicher canonical_id: Schlüssel der ACTIVE-Zeile; Ende der Doppelzeile wie Börsenwechsel, Anker beidseitig nötig).
- **Nachtrag 1.0.1 (post hoc, nach Sicht auf den 1.0.0-Lauf)**: Ticker-Startsuche ohne 16-Dokumente-Grenze (7 Fälle waren ohne Prüfung späterer Meldungen gescheitert). Ergebnis 1.0.0 liegt unverändert bei (`restrict-cases-1.0.0.json`).

## Aufgabe 1/2 – Sperrgrund je Listing und Befund (SPY-Mittelgewicht seit 2019H2)

| Listing | Gewicht | Sperrgrund im Loader | Befund (Belege `ca-verdicts-1.0.0.json`, `restrict-cases-1.0.1.json`, `identity-cases-1.0.1.json`) | Ergebnis |
|---|---:|---|---|---|
| AAPL | 6,41 % | CA 2000-09-29 (−52 %, Tag dominiert) | Teil CA: Klammer nach dem Ereignis nicht lesbar (Text-Deckblatt ohne Aktienzahl) → INSUFFICIENT_FILINGS; kein 8-K um den 29.09.2000. RESTRICT: Start 10-K 14.12.2000 nennt AAPL, aber 79 gelesene Dokumente ohne datierten Schlusskurs (auch nicht im Volltext, Diagnose) → NO_SAME_DAY_PRICE_EVIDENCE | gesperrt |
| GOOGL | 2,06 % | CA 2014-04-04 (Klasse-C-Ausschüttung, Anbieter ohne Faktor) | Teil CA: Google Inc. (CIK 1288776) nennt vorher GOOG → kein Bracket. RESTRICT ab erster Alphabet-10-K mit GOOGL (11.02.2016), 9 MATCH (DEF 14A, ±0,9 %) | **qualifiziert ab 2016-02-12** |
| ABT | 0,51 % | CA 2013-01-04 (AbbVie-Spin-off) | Teil CA: Ticker ABT in keinem Bracket-Dokument (auch L2) → IDENTITY_TICKER_NOT_NAMED; Spin-off nicht registrierbar. RESTRICT: Start 2019, keine Schlusskurs-Aussage | gesperrt |
| MS | 0,31 % | CA 2008-10-17 (+99 %, MUFG) | Teil CA: Aktienzahl stetig (1,012), aber Split-Sprache (Wandlungsklauseln der MUFG-Vorzüge) in 8-Ks → SPLIT_EVIDENCE_8K (Regel nicht gelockert). RESTRICT: Start iXBRL 2019, keine Schlusskurs-Aussage | gesperrt |
| USB | 0,18 % | CA 1999-04-16 (Anbieter-Split 3 in der Woche, Kurs ×2,94) | PROVIDER_SPLIT_RECORDED (nie zulässig; Anbieterfaktor passt nicht zur Kursreihe). RESTRICT: Börsenwechsel-Meldungen ohne Anker → Start 2024-05, kein MATCH | gesperrt |
| JCI | 0,12 % | CA 2012-10-05 (Tyco/ADT-Spin-off, Reihe vor 2016 = TYC) | Teil CA: Symbol damals TYC → IDENTITY_TICKER_NOT_NAMED. RESTRICT ab erster 10-K mit JCI (23.11.2016), Börsenwechsel-Regel → 2016-12-30, 5 MATCH | **qualifiziert ab 2016-12-30** |
| TEL | 0,11 % | AMBIGUOUS (2 Stammzeilen gleicher canonical_id, Redomizilierung 2024) | L5: ACTIVE-Zeile eindeutig, Ende der Doppelzeile 2024-09-27 beidseitig verankert (MATCH 2024-09-27 / 2025-09-26); 10 MATCH | **qualifiziert ab 2013-11-15** |
| DD | 0,10 % | AMBIGUOUS | 42 Dokumente (L4 fügte 0 hinzu), kein Schlusskurs → NO_SAME_DAY_PRICE_EVIDENCE | gesperrt |
| DOW | 0,10 % | AMBIGUOUS (V10-Datensatz nur mit Option V10) | L4 +3 Dokumente, frühester MATCH weiter 2026 → wie V10 ab 2024-07-12 | ab 2024-07-12 (schon V10) |
| COR | 0,07 % | AMBIGUOUS (Konkatenation mit CoreSite) | kein Schlusskurs ab 2023-09 | gesperrt |
| MRNA | 0,07 % | AMBIGUOUS (V10-Datensatz) | unverändert, wirkt mit `identityEvidenceProtocolV10` | ab 2019-01-04 (V10) |
| WBD | 0,06 % | CA 2014-08-08 (Klasse-C-Ausschüttung Discovery) | RESTRICT ab 2022 (Ticker WBD), aber Form 25 (06.10.2026) und Forms 15 nach dem letzten Cover → DELISTING_FORM_AFTER_LAST_COVER (Fall für Lifecycle) | gesperrt |
| IFF | 0,06 % | CA 1994-01-21 (Anbieter ohne 3:1-Faktor) | RESTRICT ab 2019, 10 MATCH, aber Form 25-NSE vom 25.09.2026 nach dem letzten Cover (V10-Regel Q-CUR, ohne Prüfung, ob nur Anleihen) | gesperrt |
| KDP | 0,05 % | CA 2018-07-13 (Sonderdividende 103,75 USD + Fusion, Symbol vorher DPS) | Teil CA: vorher DPS, Aktienzahl ×7,7 → nicht zulässig. RESTRICT ab 10-K 28.02.2019, frühester MATCH 2024-10 → 730-Tage-Regel | **qualifiziert ab 2022-10-28** |
| IEX | 0,04 % | CA 1994-12-09 (Kurs ×5,05, Anbieterfehler) | RESTRICT ab 10-K 28.02.2019, 4 MATCH | **qualifiziert ab 2019-03-01** |
| DOC | 0,04 % | AMBIGUOUS (PEAK→DOC 2024) | kein Schlusskurs ab 2024-03 | gesperrt |
| CZR | 0,02 % | AMBIGUOUS (V10-Datensatz) | wirkt mit Option V10 | ab 2020-07-24 (V10) |
| PENN, CPRI, NKTR, ECHO | < 0,01 % | CA bzw. AMBIGUOUS | PENN: SOURCE_PRICE_CONFLICT (DEF-14A-Aussage „29,70 USD am 31.12.2021“ widerspricht der Reihe um 75 %; fail-closed); CPRI/NKTR/ECHO kein MATCH | gesperrt |

Teil CA: 14 Ereignisse, **0 zulässig** → keine CA-Registererweiterung und keine CA-Loader-Option (`ca-verdicts-1.0.0.json`: INSUFFICIENT_FILINGS 5, IDENTITY_UNVERIFIED 3, SPLIT_OR_SHARE_CHANGE_EVIDENCE 4, PROVIDER_SPLIT_RECORDED 1, NEGATIVE_EVIDENCE_ONLY 1). Die Spin-offs (ABT, JCI) und Klasse-C-Ausschüttungen (GOOGL, WBD) sind damit nicht als PRICE_RETURN_ONLY registriert; die Historie vor dem Ereignis bleibt ausgeschlossen.

## Aufgabe 3 – Register und Loader

- `quant/engines/research-identity-evidence.cjs`: nicht aufzählbare Erweiterung `v12` (`research-identity-evidence-1.2.0`, 6 Datensätze: GOOGL, JCI, KDP, IEX `RESTRICT_SINGLE_ROW`; TEL `SELECT_EXISTING_ROW_BY_KEY`; DOW `SELECT_EXISTING_ROW`), Erzeuger `scripts/quant/v12/largecap/build-identity-v12.cjs`.
- `research-weekly-loader.cjs`: neue Option `identityEvidenceProtocolV12` (erfordert `identityEvidenceProtocolV10`; Liste `LOADER_OPTIONS_V12`, `LOADER_OPTIONS` unverändert), Validator `validateIdentityEvidenceV12`, fail-closed (Stammzeilen/-schlüssel, Historienwächter, Cover-Alter ≤ 400 Tage, danach unverändertes `validate()` inkl. CA-Overlay auf dem Restintervall).

## Aufgabe 4 – Wirkung (`before-after-1.0.0.json`, `coverage-1.0.0.json`)

QUALIFIED: base3 `{identityEvidence, corporateActionEvidence, listingLifecycleEvidence}` **4.526** → +`identityEvidenceProtocolV10` **4.583** → +`identityEvidenceProtocolV12` **4.588** (neu: GOOGL, IEX, JCI, KDP, TEL; keine Reihe verloren; geänderte Ausgabe nur DOW-Bindung).

SPY-Abdeckung Mitglieder/Gewicht in % (Jahresmittel; base3 → V10 → V12; mit `build-outputs.cjs` 1.2.0 neu gerechnet, base3 reproduziert `coverage-1.2.0.json` exakt):

| Jahr | base3 | V10 | V12 | Obergrenze (alle zugeordneten) |
|---|---|---|---|---|
| 2019 | 84,2 / 87,4 | 84,2 / 87,4 | 85,0 / 89,2 | |
| 2022 | 90,4 / 87,5 | 90,7 / 87,7 | 91,6 / 89,9 | |
| 2024 | 93,1 / 88,7 | 93,6 / 88,8 | 94,6 / 91,3 | 96,0–97,0 / 99,0–99,3 |
| 2025 | 94,3 / 88,9 | 94,8 / 89,0 | 95,8 / 91,6 | 97,0–98,0 / 99,3–99,5 |

Stichtag 30.06.2025: 93,8/90,0 → 95,4/92,4. **Kein SPY-Stichtag erreicht 95 % / 99 %**; die verbleibende Gewichtslücke ist zu rund drei Vierteln AAPL (6,4 %), dann ABT, MS, USB, DD und nicht zugeordnete Titel. QQQ 2025: 94,1/87,6 → 96,0/90,8; DIA unverändert bis auf 2026.

## Unabhängige Prüfung – `independent-check-1.0.0.json` (`python3 -I verify_largecap.py`): PASS

A 41 zitierte SEC-Körper neu gehasht; B 31 Preisbelege mit eigenem Parser, eigenem Split-Produkt und Same-Day-Balken (Woche oder geprüfter Tagesbalken); C/D validFrom aller 6 Datensätze nachgerechnet, Historienwächter, keine splitgroße Bewegung nach validFrom; E Teil-CA-Urteile konsistent; F 426 Abdeckungswerte (SPY/QQQ/DIA/IWB, 3 Optionssätze) aus dem INDEXPOP-Register neu gerechnet.

## Reproduktion

```bash
P=<scratchpad>/v12-private/largecap
node scripts/quant/v12/largecap/export-ca-frame.cjs --out $P/ca-frame.json
python3 -I scripts/quant/v12/largecap/verify_ca.py --frame $P/ca-frame.json --facts-out $P/ca-facts.jsonl            # SEC
python3 -I scripts/quant/v12/largecap/build-ca-verdicts.py --facts $P/ca-facts.jsonl --out docs/quant-recovery/v12/largecap/ca-verdicts-1.0.0.json
python3 -I scripts/quant/v12/largecap/b1run.py --ca-facts $P/ca-facts.jsonl --restrict-out docs/quant-recovery/v12/largecap/restrict-cases-1.0.1.json --identity-out docs/quant-recovery/v12/largecap/identity-cases-1.0.1.json   # SEC
node scripts/quant/v12/largecap/build-identity-v12.cjs
node scripts/quant/v12/largecap/qualify-sets.cjs --private-dir $P/effect --out docs/quant-recovery/v12/largecap/before-after-1.0.0.json
node scripts/quant/v12/largecap/coverage.cjs --indexpop-private <scratchpad>/v12-private/indexpop --private-dir $P/effect --out docs/quant-recovery/v12/largecap/coverage-1.0.0.json
python3 -I scripts/quant/v12/largecap/verify_largecap.py . $P docs/quant-recovery/v12/largecap/independent-check-1.0.0.json
node --test quant/tests/v12-largecap.test.mjs
```

SEC: 1.045 Netzabrufe (Ledger `request-ledger.jsonl`), ≤ 2/s über `scripts/quant/sec/http_client.py`; frühere Privat-Caches nur lesend wiederverwendet.

## Grenzen / offene Punkte

- AAPL bleibt der Haupthebel; mit diesen Regeln gibt es keinen SEC-Schlusskurs-Anker (Apple nennt in Proxy/10-K keinen datierten Schlusskurs im Regelformat). Eine andere Ankerart (z. B. Quartals-Hoch/Tief-Tabellen) wäre eine neue Protokollversion → Freigabe.
- RESTRICT-Listings haben keine Historie vor validFrom (GOOGL ab 2016, JCI ab 2016-12, KDP ab 2022-10); die Ereignisse selbst bleiben unklassifiziert.
- IFF/WBD: V10-Regel Q-CUR schließt bei jedem Form 25 nach dem letzten Cover aus (IFF vermutlich Anleihe-Delisting – nicht geprüft, Regel nicht gelockert); WBD ist tatsächlich deregistriert (Lifecycle-Fall).
- Nicht split-große Anbieterfaktoren (z. B. Spin-off-Anpassungen) werden weder vom CA-Gate noch hier geprüft.
