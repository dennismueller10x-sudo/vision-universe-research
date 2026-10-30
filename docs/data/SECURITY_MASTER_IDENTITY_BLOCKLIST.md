# Security Master 1.3.0 – Backtest-Identitätssperre, Freeze V10–V13c, Alarm

Stand 30.10.2026. Gestapelt auf #1100 (Freeze-Werkzeug). Dieser Teil ist **unabhängig von der Gate-Freigabe**: Die Freigabeliste für den Wechsel kommt aus #1143 (Owner-Entscheidung vom 30.10.2026). Dieses Dokument ändert weder das Gate noch die Freigabe noch den Stamm. Es lief kein Lauf und wurde nichts in `quant/data` geschrieben.

## Warum eine Sperre neben dem Gate

Der Stamm folgt ADR-001: `securityId` = Ticker. Wechselt der Anbieter unter derselben `securityId` das Listing, bleibt die ID im Stamm bestehen. Für einen Backtest wäre das eine Zusammenführung zweier Instrumente über das gleiche Symbol. Das Gate kann das nicht verhindern, weil es nur zählt. Im Probelauf vom 30.10. wären **13 IDs mit geändertem Startdatum** still backtestfähig geblieben, z. B. `ref_LESL` (Beginn 2020-10-29 → 2026-10-05) und `ref_TRUE` (2000 → 2014). Sie lagen unter der Grenze von 25.

Owner-Entscheidung vom 30.10.2026:
- 35 wiederverwendete Ticker nur als ausdrücklich mehrdeutige Identitätsfälle;
- keine Zusammenführung über das Symbol;
- ohne belastbare kanonische Zuordnung nicht backtestfähig;
- ONEOK nicht als backtestfähige Identität;
- die 14 Fälle mit weiterlaufender Reihe bleiben eigene Identitätsblocker.

## Werkzeug und Pflicht

| Teil | Inhalt |
|---|---|
| `scripts/market/build-security-master-identity-blocklist.mjs` | Liest alten und neuen Stamm sowie die eigene Tagesreihe und schreibt `security-master-identity-blocklist-1.0.0`. Ohne Reihenverzeichnis bricht es ab |
| Gründe | `SERIES_CONTINUES_AFTER_PROVIDER_END`, `SERIES_UNREADABLE`, `TICKER_CHANGED`, `REACTIVATED`, `TICKER_REUSE_NEW_LISTING`, `LISTING_DROPPED`, `START_DATE_CHANGED` (wird vor OTC geprüft), `CANONICAL_ID_CHANGED_UNCLASSIFIED`, `TICKER_REUSE_ETF`, `INSTRUMENT_TYPE_CHANGED` (jeder Typwechsel), `PROVIDER_DUPLICATE_ROW` |
| nicht gesperrt | nur drei Fälle: reine Börsenumbenennung bei gleichem Startdatum (z. B. AMEX → NYSE MKT); Wechsel zu OTC bei gleichem Startdatum (macht die ID ohnehin nicht backtestfähig); Delisting, dessen eigene Reihe mit dem Anbieter endet. Alles andere ist fail closed |
| `backtest-generation-freeze.cjs build-post-switch --blocklist --prev-master` | **Pflicht** (`BLOCKLIST_REQUIRED`). Die Liste muss den Erzeuger `…-builder-1.1.0` tragen und sich aus dem alten Stamm und dem committeten neuen Stamm **genau nachrechnen** lassen; der alte Stamm ist dabei hashgeprüft gegen die eingefrorene Generation. Sonst bricht der Lauf ab (`BLOCKLIST_NOT_REPRODUCIBLE`); eine handgeschriebene Liste gilt nicht. Gesperrte IDs gehen nicht in die neue Generation, `lineage.json` nennt sie |
| `compare --blocklist` | Pflicht, und zwar dieselbe Liste wie beim Bau. Eine gesperrte ID muss fehlen; ist sie gebaut, gilt `BLOCKLISTED_BUT_PRESENT`. Fehlt eine ID ohne Sperre, oder taucht eine nur in der neuen Generation auf (`NEW_IN_NEW`), ist das Ergebnis `UNEXPECTED_CHANGES`. Eine Freigabe ersetzt die Sperre nicht |
| `compare --approved` | liest nur Freigabelisten mit Schema 1.0.0 oder 1.1.0 (#1143), mehrfach zulässig. Jede muss an denselben alten Stamm gebunden sein wie die Sperrliste. Die neue Generation muss Nachfolger der eingefrorenen sein (`OUTPUT_NOT_SUCCESSOR_OF_FROZEN`) |

Die Sperre wirkt nur auf Backtest-Generationen. Stamm, Discover und Supertrader-Live-Daten bleiben unberührt.

## Probelauf vom 30.10.2026 (Nachweis)

Erzeuger wie im Workflow, nur in ein Arbeitsverzeichnis, ohne Commit. Quellen sind die offene Tiingo-Liste und SEC. Die Datei `identity-blocklist-probe-20261030.json` ist der Nachweis; **verwendet wird sie nicht**. Nach dem echten Commit des Stamms wird die Liste aus diesem Stamm neu erzeugt.

| Grund | IDs |
|---|---:|
| `INSTRUMENT_TYPE_CHANGED` (darunter die 138 Typwechsel des Klassifiziererwechsels, die die ID ohnehin ungeeignet machen) | 137 |
| `TICKER_REUSE_NEW_LISTING` | 34 |
| `START_DATE_CHANGED` | 22 |
| `SERIES_CONTINUES_AFTER_PROVIDER_END` | 14 |
| `LISTING_DROPPED` (`ref_DBRG_P_H`) | 1 |
| `PROVIDER_DUPLICATE_ROW` (`ref_OKE`) | 1 |
| **gesamt** | **209** (je ID der erste zutreffende Grund) |

`ref_CAM` (EQUITY_COMMON → ETF) steht unter `START_DATE_CHANGED`, weil sich auch das Startdatum geändert hat. Die 137 Typwechsel betreffen IDs, die nach dem Wechsel ohnehin nicht backtestfähig sind; die Sperre sorgt nur dafür, dass sie im Vergleich als gesperrt fehlen und nicht als freigegebene Änderung durchgehen. Gegen den Stamm des Probelaufs ergibt sich:
- backtestfähig 6.397 → 6.163 im Stamm, **6.150 mit Sperre**;
- 0 neu backtestfähig;
- keine der 35 Tickerwiederverwendungen und nicht ONEOK backtestfähig;
- übrig bleiben 9 IDs mit anderer `canonical_id`, alle nur mit anderem Börsennamen bei gleichem Startdatum. Bei `ref_APAD` und `ref_NXDR` ist es ein echter Wechsel NYSE → NASDAQ, ein Relisting ist dort nicht erkennbar.

ONEOK bleibt im Gate blockiert, bis ein eigener Erzeuger-PR identische `canonical_id` zusammenführt (#1143, Abschnitt 4). Danach ist ONEOK wieder eine Zeile und erscheint nur dann in der Sperrliste, wenn ein anderer Grund zutrifft.

## Freeze V10–V13c

- `repo-manifest` friert alles unter `docs/quant-recovery/` ein: 550 Dateien, V5.1–V13c samt Archiv-Manifesten, `filesSha256` `6cabb00c…`, Quelle `main` `b8efea83`. `verify-repo` INTACT.
- `verify-repo` meldet INTACT.
- Ausgenommen sind nur die Betriebsunterlagen `docs/quant-recovery/v13/archive/` (Anleitung, öffentlicher Schlüssel, Archiv-Manifeste, die ihre Teile selbst per SHA-256 binden). #1140 hatte die README dort fortgeschrieben.
- Korrektur nach dem Review: **550 Dateien**, `filesSha256` `6cabb00c…`. Ausgenommen ist nur noch eine einzelne Datei, `v13/archive/README.md`; die Archiv-Manifeste 1.0.0 bis 1.2.0 und `archive-pub.pem` sind eingefroren. Jedes Dokument direkt unter `docs/quant-recovery/` ist eingefroren, außer den laufenden Sitzungsübergaben (`SESSION_HANDOVER_<Datum>.md`). Ausnahmen und Gründe stehen im Manifest (`frozen.notFrozen`).
- SMF-1 verlangt Vollständigkeit in jeder eingefrorenen Generation. Neue Generationen in neuen Verzeichnissen bleiben möglich.

**Abgleich mit den früheren Manifesten:**

| Manifest | Dateien | Verhältnis zu 550 (dieser PR) |
|---|---:|---|
| #1100, Stand 29.10. (`5e4c4424…`, V5.1–V9) | 241 | alle 241 enthalten, **0 geänderte Hashes** |
| #1136, Stand 30.10. vormittags (`12bdbbe1…`) | 550 | 549 enthalten; ausgenommen ist nur die fortgeschriebene `v13/archive/README.md`. Neu ist `manifest-1.2.0.json` |
| dieser PR (`6cabb00c…`) | 550 | – |

Neu gegenüber den 241 Dateien: V10 (79 und 7 Berichte), V11 (32 und 1), V12 (119 und 2), V13 (27 und 2), V13b (25), V13c (11).

**Warum die eine Ausnahme den Schutz nicht aufhebt:**
- Die README enthält keine Ergebnisse und keine Hashes.
- Die Hash-Anker des privaten Archivs (`manifest-<version>.json` mit `cipherSha256`, `plainSha256` und `wrappedKeyB64`) und der öffentliche Schlüssel sind eingefroren. Eine Änderung macht SMF-1 rot; eine neue Archivversion ist eine neue Datei.
- SMF-1 prüft ausdrücklich, dass `v13/delisted`, `v13/studies`, `v13/largecap`, `v13/provenance` und die Archiv-Manifeste eingefroren sind.

## Alarm

`security-master-weekly.yml` hat einen Job `alarm` mit `pipeline-alarm.mjs`: nur auf `main`, `issues: write` mit `github.token`, keine Secrets. Anlass war der rote Lauf 40942100928 ohne Alarm. Getestet in SMA-1.

## Ablauf nach dem Wechsel (je Schritt Owner-Freigabe)

```bash
# 1. nach Lauf 2 (Stamm 1.3.0 committet): Sperrliste aus dem committeten Stamm
git show <commit-vor-dem-wechsel>:quant/data/market/security-master/us-security-master.json > W/prev/us-security-master.json
node scripts/market/build-security-master-identity-blocklist.mjs --prev W/prev --next quant/data/market/security-master \
  --measured-on <T> --out W/identity-blocklist.json
# 2. neue Generation, nie in der eingefrorenen Wurzel
node scripts/quant/backtest-generation-freeze.cjs build-post-switch --frozen <privat-1.1.0> --manifest <freeze.json> \
  --output <privat-1.3.0> --blocklist W/identity-blocklist.json --prev-master W/prev/us-security-master.json
# 3. Vergleich: nur freigegebene Änderungen, gesperrte IDs fehlen
node scripts/quant/backtest-generation-freeze.cjs compare --frozen <privat-1.1.0> --output <privat-1.3.0> \
  --approved docs/data/security-master/v130-approved-changes-1.1.0.json --blocklist W/identity-blocklist.json --out W/compare.json
```

Den Leser auf die neue Generation umzustellen ist ein eigener Schritt mit eigener Freigabe.

## Tests

| Test | prüft |
|---|---|
| SMB-1…4 | Klassen, fail closed, Bindung an beide Stämme, Nachweis des Probelaufs |
| SMF-1…7 | Freeze und Sperre: Pflicht, Bindung, `BLOCKLISTED_BUT_PRESENT`, `NEW_IN_NEW`, Formfehler; SMF-7: nur nachrechenbare Listen |
| SMA-1 | Alarm |
