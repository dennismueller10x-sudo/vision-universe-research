# V9 Folgearbeit – Research-Register für Kapitalmaßnahmen-Belege (opt-in)

Status: **reines Research-Modul, standardmäßig aus**, `productionApproved=false`. Gestapelt auf
`claude/v9-fu-identity-registry` (PR #1041). `quant/engines/weekly-real-adapter.cjs` (sha256 `15c468a5…f176a`) und
`quant/engines/corporate-action-evidence.js` (sha256 `6c17d2c9…3d09d`) sind **byte-identisch zu main**; kein produktiver
Aufrufer importiert `research-weekly-loader.cjs` oder `research-ca-evidence.cjs`.

Owner-Entscheid 2026-10-28: Korrekturen nur nach unabhängiger Quellenprüfung, **keine** Pauschal-Aktivierung der 81 V9-Dry-Run-Fälle.
V9-Arbeitsstrang B war hier nur Kandidatenliste; seine Klassifikationen wurden erst nach dem Einfrieren der eigenen Urteile gelesen.

## Ablauf (Unabhängigkeit durch Reihenfolge)

1. `protocol.json` (sha256 `db7e31a8…71c2`, `protocol.sha256`) vor jedem SEC-Abruf und vor jedem Blick auf V9-Urteile committet
   und gepusht (Commit `30a9da552e`, 2026-10-28 07:10 UTC). Rahmen, Identitätsregeln, Annahmeregeln je Klasse, Regex, Fenster, Schwellen.
2. Rahmen neu berechnet (`export-frame.cjs`): 1.087 UNRESOLVED-Ereignisse in 600 Reihen (= erwartete Größe), Prüf-Teilmenge
   (alle Ereignisse ≥ 2011-07-01) 432 Reihen / 647 Ereignisse.
3. SEC-Prüfung aus Rohquellen (`verify_ca_events.py`, ≤ 2 Anfragen/s, eigener Cache; V9-Rohkörper nur als url-gleicher Cache):
   2.337 Netzabrufe. Urteile eingefroren (facts sha256 `33f0cbe3…de02`, 07:37:44 UTC), **danach** V9-Dateien gelesen.
4. Unabhängige Python-Prüfung fand einen Reihenfolgefehler (Bugfix 1, siehe `verdicts.json`): Reihen ohne CIK-Kandidat wurden vor
   der Regel `PROVIDER_SPLIT_RECORDED` als `IDENTITY_UNVERIFIED` markiert. Keine Regel geändert, 1 Ereignis umbenannt (ref_GROM),
   zulässige Menge unverändert.

## Kernregeln (Auszug aus protocol.json)

- **Identität:** dieselbe CIK nennt den Ticker als `dei:TradingSymbol` in der XBRL-Instanz **beider** einklammernder Original-10-K/10-Q
  (vor und nach dem Ereignis, je ≤ 400 Tage) – das schließt Ticker-Wiederverwendung um das Ereignis aus; Börse über
  `dei:SecurityExchangeName` oder (falls nicht getaggt) 10-K-Deckblatt. Kein Public-Float, kein Namens- oder Preisvergleich.
- **GENUINE_MOVE:** Aktienzahl-Kontinuität aus den as-filed Deckblattzahlen der beiden Einklammerungen in [0,8; 1,25]; keine
  XBRL-Split-Fakten (±400 Tage), keine starke Split-Sprache im Nach-Ereignis-Bericht, keine Split-Sprache in 8-Ks (Items 3.01/3.03/5.03/7.01/8.01)
  im Fenster; kein Spike-Reversal; **plus** affirmative Zweitquelle: 8-K mit wesentlichem Ereignis-Item am Sprungtag (−3/+1 Tage).
- `NEGATIVE_EVIDENCE_ONLY` (alles erfüllt außer Zweitquelle): **nicht zulässig**. `SPLIT_UNADJUSTED`: nie zulässig (Erzeuger-Fix, separater PR).
- `SPINOFF_DISTRIBUTION`: nur als `PRICE_RETURN_ONLY` zulässig (in diesem Lauf kein Fall bestanden).
- Eine Reihe wird nur qualifizierbar, wenn **alle** ihre ungelösten Ereignisse zulässig sind.

## Ergebnis

| Urteil (1.087 Ereignisse) | Anzahl |
|---|---|
| OUT_OF_FRAME_PRE_XBRL | 440 |
| IDENTITY_UNVERIFIED (davon TICKER_NOT_NAMED 205, NO_CANDIDATE_CIK 29, EXCHANGE_UNCONFIRMED 6) | 240 |
| INSUFFICIENT_FILINGS | 215 |
| SPLIT_OR_SHARE_CHANGE_EVIDENCE (Aktienzahl 51, Bericht 29, 8-K 18, XBRL 13) | 111 |
| PROVIDER_SPLIT_RECORDED | 37 |
| **GENUINE_MOVE** | **29** |
| NEGATIVE_EVIDENCE_ONLY | 14 |
| SPIKE_REVERSAL | 1 |

Registriert: **24 Ereignisse in 23 Reihen**, alle `GENUINE_MOVE` (5 weitere GENUINE_MOVE-Ereignisse liegen in Reihen mit einem
weiteren nicht zulässigen Ereignis: BIVI, MGNX, MYGN, PRTA, SVRA – nicht registriert).

| Modus (`createResearchLoader`) | QUALIFIED |
|---|---|
| Adapter main / Default (6.190/6.190 Ausgaben byte-identisch) | 4.449 |
| `{ identityEvidence: true }` | 4.453 |
| `{ corporateActionEvidence: true }` | 4.472 |
| `{ identityEvidence: true, corporateActionEvidence: true }` | **4.476** (+23) |

Neu qualifiziert (alle `PRICE_RETURN`): ACRS, ALEC, ALNY, BKSY, BMEA, CPIX (2 Ereignisse), ERII, FMC, GRAL, GRCE, HYFM, MDRR, MIRA,
MVST, NTLA, OM, PACB, PBYI, REPL, SRPT, SSRM, VRRM, VSTS. Kein anderer Ausgang ändert sich (`changed.identityCaVsIdentity` = genau diese 23).

## Abgleich mit V9-B (`v9-agreement.json`)

Ereignisse: 23 gemeinsam zugelassen, 928 gemeinsam gehalten, 130 nur V9 zugelassen, 6 nur hier zugelassen.
Reihen: V9 81, hier 23, Schnittmenge 19; nur hier: HYFM, MDRR (V9: `SPLIT_MENTION_NEAR_DATE_REVIEW`), SSRM, VSTS (V9: Spin-off-Kandidat;
hier Aktienzahl stetig, kein Spin-off im Fenster, 8-K am Sprungtag: Çöpler-Vorfall bzw. Quartalszahlen).
Gründe der 130 nur-V9-Ereignisse: Ticker in den eigenen Instanzen nicht getaggt 64, vor 2011 20, Split-Sprache im Bericht 13 / 8-K 8 / XBRL 7,
keine affirmative Quelle 10, keine Einklammerung 7, Börse unbestätigt 1. Die 4 V9-Spin-offs (u. a. ABT 2013) sind hier nicht zugelassen.

## Dateien

| Datei | Inhalt |
|---|---|
| `protocol.json`, `protocol.sha256` | registriertes Prüfprotokoll |
| `verdicts.json` | Urteil je Ereignis (1.087), Zählungen, Freeze-Hashes, Bugfix-Log |
| `before-after.json` | Parität Default-Pfad, Zählungen je Modus, neu qualifizierte IDs mit Klasse |
| `v9-agreement.json` | Abgleich je Ereignis mit V9-B |
| `independent-check.json` | Python-stdlib-Neuableitung: Rahmen 600/600, Urteile 1.087/1.087, Register 24/24, Quell-sha256 178/178, Vorher/Nachher konsistent |

Register: `quant/engines/research-ca-evidence.cjs` (`research-ca-evidence-1.0.0`), je Datensatz securityId, canonicalId, Woche,
Vorwoche, beide Schlüsse, Verhältnis, Klasse, returnBasis, Identität, Aktienzahl-Kontinuität, Quellen (Accession, URL, sha256, Zitat),
protocolSha256, verifiedAt. Bindung an die Punkte des Ereignisses (Toleranz 1e-5), nicht an einen Dateihash. Jede Abweichung → der
unveränderte `validate()`-Fehler.

Reproduktion:

```bash
node scripts/quant/v9-followups/ca-registry/export-frame.cjs --out <private>/frame.json
python3 scripts/quant/v9-followups/ca-registry/verify_ca_events.py --frame <private>/frame.json --cache-dir <private>/http-cache --facts-out <private>/facts.jsonl
node scripts/quant/v9-followups/ca-registry/build-ca-registry.cjs --facts <private>/facts.jsonl --out quant/engines/research-ca-evidence.cjs
node scripts/quant/v9-followups/ca-registry/before-after.cjs --baseline-adapter <main-adapter> --baseline-ref 07dfe5dd55 --out docs/quant-recovery/v9-followups/ca-registry/before-after.json
python3 -I scripts/quant/v9-followups/ca-registry/check_ca_registry.py --root . --facts <private>/facts.jsonl --before-after docs/quant-recovery/v9-followups/ca-registry/before-after.json --cache <private>/http-cache --out docs/quant-recovery/v9-followups/ca-registry/independent-check.json
python3 -I scripts/quant/v9-followups/ca-registry/compare_v9.py --facts <private>/facts.jsonl --v9-proposal … --v9-resolutions … --v9-dryrun … --out docs/quant-recovery/v9-followups/ca-registry/v9-agreement.json
```

## Grenzen

- Die affirmative Quelle belegt ein offengelegtes wesentliches Ereignis am Sprungtag, keine Kausalität.
- Die Regeln sind bewusst streng (falsche Ablehnungen vor falschen Zulassungen): z. B. Split-Sprache aus alten Exhibit-Listen sperrt.
  Viele vor 2019/2021 fehlende `dei:TradingSymbol`-Tags führen zu `IDENTITY_TICKER_NOT_NAMED`.
- Kein Eingriff in Adapter, Reihen, Security-Master, Produkte oder veröffentlichte Werte.
