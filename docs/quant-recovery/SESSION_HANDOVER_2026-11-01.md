# Sitzungsübergabe Quant, Security Master und interne Vorschau (Stand 01.11.2026, Version 4.0.0)

Nachfolger von `SESSION_HANDOVER_2026-10-31.md` (3.0.0). Eine neue Sitzung braucht keinen Chatverlauf.

**Prozessregel:** Gemergt wird nur, was der Owner konkret freigibt. Technische Dringlichkeit erweitert den Scope nicht.

## 1. Gemergt (Freigabe vom 01.11.)

| PR | Inhalt | Merge-Commit | Prüfung vor dem Merge |
|---|---|---|---|
| #1210 | Security-Master-Generationen: eingefrorene, hashgebundene 1.1.0 für V8–V13 | `b0f188d33f` | volle Suiten auf `main`, `main`+PR, `main`+PR+echtem Folgestand 1.3.0 |
| #1209 | EDVA als Umfirmierung (SBEV → EDVA, Splash → Endovia, CIK 0001553788) | `f28cbcd24b` | volle Suiten `main`+PR |
| #1214 | Quant: Verzeichnis, Faktor-Evidenz, Radar ohne alte Identität der 13 Wiederverwendungen | `d6858fa10a` | volle Suiten; Vorher/Nachher im PR (Rangwirkung ≤ 0,97 Punkte) |
| #1213 | Technical ohne die 13 | `1dddc1e4e5` | volle Suiten zusammen mit #1212 |
| #1212 | Watchlist-Zusammenfassung: die 13 ohne Namen, Kurs, Abschnitte; keine Neuzuordnung nach Ticker | `ca090fb69a` | Konto-Suiten 98/98, Watchlist-Browser-QA |
| #1215 | interne Vorschau, Backend (Rolle `backtest_reviewer`, Worker, Bundle, Release schließt `workers/*/data/` aus) | `ea855da6f5` | SQL-Tests, `flows` 57/57, Browser-QA, Release mit statischem Server, Shell-QA |

Nach dem Merge von #1215 lief „Konten — Produktion automatisch“ grün: Migration, Worker und Gesundheitsprüfung.

**Echter Deployment-Test (01.11., live):**

| Prüfung | Ergebnis |
|---|---|
| `GET https://konto.visionuniverse.de/v1/admin/backtests` | 404 `PREVIEW_NOT_ACTIVATED`, ohne Daten |
| `…/lookup` (GET) | 404 `PREVIEW_NOT_ACTIVATED` |
| `…/lookup` (POST) | 403 |
| `https://research.visionuniverse.de/workers/vu-account/data/backtest-review-bundle.json` | **404**, obwohl `…/workers/vu-account/src/backtests.mjs` aus demselben Release ausgeliefert wird (200) |

**Warum der Ausschluss nötig war:** Pages liefert `workers/**` aus. Das Bundle wäre also ohne #1215 öffentlich gewesen. Im öffentlichen Repository bleibt es lesbar, wie alle committeten Katalogergebnisse.

## 2. Offen und nicht gemergt (Owner-Entscheidung nötig)

| PR | Inhalt | Hinweis |
|---|---|---|
| **#1223** | Integration #1215 vervollständigen: Bundle neu, Generation über das Register | **`main` ist seit #1215 in 3 Quant-Tests rot** (Bundle veraltet nach #1210; MG-5). Ursache: meine Merge-Reihenfolge. Keine Laufzeitwirkung |
| **#1216** | Vorschau-Seite `/konto/admin/backtests/` (noindex, nicht verlinkt) mit Browser-QA | freigegeben „nach #1215“. Wartet nur auf #1223 (Bedingung 8). Browser-QA Chromium und WebKit grün |
| **#1227** | **Aktivierung:** Schalter in Produktion ein | erst nach Owner-Freigabe; siehe 5 |
| #1222 | neue Freigabeliste 1.1.0 → 1.3.0 mit EDVA, Probelauf 41285528656 | kein `commit=true` |
| #1221 | Technical: Choppiness-Vertrag [0,∞] (BMBL 131,4 ist echt) | entblockt den Screener-Lauf; AP8 L1–L3 werden damit grün |
| #1224 | Quant: 7 veraltete Test-Fixtures auf registrierte Stände | Quant von 10 auf 3 rote Tests (verbleibend AP8, durch #1221) |
| #1225 | Firmenverzeichnis-Suche: PCLN u. a. ohne alten Namen | Wirkung erst mit dem nächsten Erzeugerlauf |
| #1226 | SEC-Namen für NYSE American: +214 CIKs, 0 Namen geändert | dto. |
| #1229 | Watchlist-Anzeige: deutscher Text statt `IDENTITY_QUARANTINED`, Warnchip, keine Produktlinks | |
| DQ-SF8 und Browser-QA | in Arbeit | siehe 7 |
| #1203 | Übergabe 3.0.0 | |
| #1119 | 132 Statuskorrekturen | zurückgestellt bis zur Umstellung auf 1.3.0 |

## 3. Security Master

- **Produktstand:** 1.1.0 (`26c82617…`).
- **Freeze-Architektur (#1210):**
  - Register `quant/config/security-master-generations.json` und Kopie `quant/frozen/security-master/us-security-master-1.1.0.json` (gleicher Git-Blob `ee1fe3ad…`).
  - Research-Loader mit Evidenz-Optionen lesen 1.1.0. Neue Generationen nennen ihre Generation ausdrücklich.
  - Der Produkt-Adapter bleibt bytegleich.
- **Die 28 Research-Dateien, die den Stamm direkt lesen (Test MG-5):**
  - 27 sind bytegleich.
  - `v10/studies/common.cjs` hasht im Manifest die gelesene Generation; vor dem Wechsel ist das bytegleich.
  - Die Registrierungen unter `docs/quant-recovery/**` sind unverändert (SMF-1).
- **Simulation des echten Folgestands 1.3.0** (`46d8e936b3`) auf `main` + #1210, volle Suiten:
  - keine neuen Fehler;
  - nur NM3 und Erzeugerbesitz 485 (neue Namen, Seiten noch nicht neu gebaut); sie werden mit dem Marktdaten-Lauf nach `commit=true` grün.
- **Freigabeliste (#1222)** aus Probelauf 41285528656:
  - Die alte Liste stand bei canonical_id **25 von 25**.
  - Mit der neuen Liste nicht freigabefähig: canonical_id 24, Deaktivierungen 16, Eignung 16, Namen 1 (XRPN). Gate PASS.
  - EDVA ist im Folgestand ACTIVE und eignungsfähig auf der neuen AMEX-Zeile, Name Endovia (SEC).
- **Ablauf zum Wechsel:**
  1. #1222 mergen.
  2. Am Lauftag denselben Probelauf; nur mit bytegleichem Folgestand `4d9a0e03…` weiter.
  3. Volle Suiten.
  4. Owner-Freigabe.
  5. `commit=true`, sofort danach der Marktdaten-Lauf.
  6. Katalog und Bundle als neue Generation neu bauen.

## 4. Identität

- Die 13 Wiederverwendungen sind auf `main` in Discover, Screener, Supertrader, Quant (Verzeichnis, Faktoren, Radar), Technical und Watchlist ohne alte Identität.
- **ETF-Linie des Owners:**
  - BREW, INVN, NYNY und WR erscheinen im Quant-Verzeichnis als ETF mit richtigem Namen (Quant führt ETFs, ohne Aktienanalyse), nicht in Aktienansichten.
  - Technical und Watchlist halten sie in Quarantäne, bis die aktuelle Identität eindeutig aufgelöst ist (eigene securityId nach ADR-001).
  - Gespeicherte Watchlist-Einträge werden nie nach Ticker neu zugeordnet.
- **Offen:** die Suche (#1225) und die Anzeige-Texte (#1229).

## 5. Interne Vorschau: Aktivierung (#1227, braucht die Owner-Freigabe)

Voraussetzungen und Prüfungen stehen in `docs/accounts/BACKTEST_VORSCHAU_AKTIVIERUNG.md` (in #1227).

1. #1223 mergen, dann #1216 mergen und auf die Pages-Auslieferung warten.
2. **Owner nennt das Testkonto** und vergibt die Rolle per SQL. Es gibt keine Selbstvergabe und keinen Workflow.
3. #1227 mergen. Die Automatik rollt den Worker aus.
4. **Prüfen:**
   - ohne Sitzung 401 statt 404;
   - Konto ohne Rolle 403;
   - Testkonto: `https://research.visionuniverse.de/konto/admin/backtests/` zeigt nur vorgerechnete, hashgebundene Einträge, alle nicht zertifiziert;
   - nicht Vorgerechnetes heißt „nicht vorgerechnet“.
5. **Abschalten:**
   - sofort: Rolle entziehen (SQL);
   - vollständig: PR mit Schalter `"false"`.

## 6. Backtests

- **Katalog:** Generation 1 (`7ea6383e…`, 21 Einträge, an 1.1.0 gebunden), kein Überschreiben.
- **Demos:** in #1210 neu gebaut (Lauf 41219164818, Python 276.732/0).
- **Arten:** 0/6 zertifiziert.
- **Setup-OOS A1–A6:** unverändert offen.

## 7. Fehler: Stand

| Befund | Diagnose | PR |
|---|---|---|
| Technical-Choppiness BMBL 131,4 | echte Kurslücke (Übernahmeankündigung 13.10.); der Vertragsbereich [0,100] war mathematisch falsch, die Formel bleibt | #1221 |
| AP8 L1–L3 | Folge davon: Der Screener-Datensatz blieb auf dem 29.10. stehen | mit #1221 und dem nächsten Lauf |
| V10-Population und 6 weitere Quant-Tests | veraltete Fixtures (Live-Stand statt registrierter Stand) | #1224 |
| PCLN in der Firmenverzeichnis-Suche | Erzeuger `build-universe-indexes.mjs` | #1225 |
| SEC-Namen NYSE American | SEC führt sie als „NYSE“ | #1226 |
| Rohcode `IDENTITY_QUARANTINED` | fehlender Anzeigetext | #1229 |
| Bundle veraltet und MG-5 seit #1215 | Merge-Reihenfolge | #1223 |
| DQ-SF8, Browser-QA, Shell-QA (wechselnde Menüziel-Befunde < 44 px; NVDA-Checkliste nur einmal in CI) | in Arbeit | folgt |
| Social CI | rot auch auf `main` seit 30.10. | nicht bearbeitet |

## 8. Owner-Entscheidungen

1. #1223 mergen, danach #1216.
2. Aktivierung: Testkonto nennen, Rolle vergeben, #1227 mergen.
3. #1222 (Freigabeliste) und danach, ob und wann der produktive 1.3.0-Lauf vorbereitet wird.
4. #1221, #1224, #1225, #1226, #1229 und die folgenden PRs zu DQ-SF8 und Browser-QA.
5. Setup-OOS A1–A6, spätestens vor etwa 2027-03-26.

## 9. Einstieg

1. `CLAUDE.md`, dann dieses Dokument.
2. Security Master: `docs/data/security-master/SECURITY_MASTER_GENERATIONS.md`, `V130_APPROVAL_2026-11-01.md` (#1222), `TICKER_REUSE_QUARANTINE.md`.
3. Vorschau: `docs/quant/BACKTEST_PREVIEW.md` Abschnitt 9, `docs/accounts/BACKTEST_VORSCHAU_AKTIVIERUNG.md` (#1227), `docs/accounts/FREIGABEN.md`.
4. **Hinweis für Arbeitsumgebungen:**
   - nur einzelne Branches holen (`git fetch origin main <branch>`); ein voller Fetch füllt die Platte;
   - Aufräumen über `git worktree remove`.
