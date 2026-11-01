# Sitzungsübergabe Quant, Security Master und interne Vorschau (Stand 01.11.2026 abends, Version 5.0.0)

Nachfolger von `SESSION_HANDOVER_2026-11-01.md` (4.0.0). Eine neue Sitzung braucht keinen Chatverlauf.

**Prozessregel:** Gemergt wird nur, was der Owner konkret freigibt. Technische Dringlichkeit erweitert den Scope nicht.

## 1. Gemergt in dieser Runde

| PR | Inhalt | Merge-Commit |
|---|---|---|
| #1223 | Integration #1215 vervollständigt: Bundle neu, Generation über das Register | `4c31bc5618` |
| #1216 | Vorschau-Seite `/konto/admin/backtests/` (noindex, nicht verlinkt), Browser-QA, Abnahmeprotokoll | `eb1d37e6a6` |
| #1221 | Technical: Choppiness-Vertrag [0,∞] | `18a573b879` |
| #1228 | Core DQ-SF8: Test leitet die erlaubten Lücken aus den Daten ab | `dd50ee19cb` |
| #1225 | Firmenverzeichnis-Suche ohne alte Identität der 9 | `5031866b33` |
| #1226 | SEC-Namen für NYSE-American-Titel (+214 CIKs, 0 Namen geändert) | `4359700237` |
| #1229 | Watchlist-Anzeige: deutscher Text, Warnchip, keine Produktlinks | `00e49f7164` |
| #1230 | nur der belegte Teil: NVDA-Richtungsprüfung in `vu3-regression-qa` | `a1896e67af` |
| #1222 | Freigabeliste 1.1.0 → 1.3.0 mit EDVA | `3af80445a4` |

- **#1219** (Supertrader-Chat, dieselben 7 veralteten Quant-Fixtures wie mein #1224) ist ebenfalls auf `main` (`f0fd146a7e`). **#1224 ist damit überholt**; schließen nach Owner-Entscheidung.
- **Regulärer Screener-Neubau** nach #1221 (Lauf 41343345197, `c307119561`): Stand 30.10., 5.663 Titel, BMBL 131,4 als einziger Wert über 100. PCLN, USX und INVN fehlen, wie vorgesehen.

## 2. `main` @ `f0fd146a7e`, lokal voll verifiziert

| Suite | Ergebnis |
|---|---|
| Quant | **3857/0** (vorher 10 rot) |
| Core | **308/0** (vorher DQ-SF8 rot) |
| Discover/Screener/Supertrader | 1577/1, nur NL5, siehe 3 |
| Technical | 61/0 |
| Python | OK |
| Testisolation | keine Produktionsdatei verändert |

**Behoben:**
- die drei #1215-Fehler (Bundle, MG-5);
- AP8 L1–L3 (Screener stand wegen BMBL);
- die 7 Fixtures (#1219);
- DQ-SF8;
- die NVDA-Prüfung in vu3/Shell;
- PCLN in der Suche;
- SEC-Namen NYSE American;
- der Rohcode `IDENTITY_QUARANTINED`.

## 3. Noch rot oder offen auf `main`

| Befund | Stand |
|---|---|
| Discover NL5 | Ursache: direkter Commit `3caa8ca150` (Technical-Stufe im Nachtlauf). Fix **#1239** (exakte Liste ergänzt), nicht freigegeben |
| Quant Browser QA (4 NVDA-Befunde) | Fix **#1236**: vorher 4 Befunde, nachher 0; Gegenprobe rot. **Konflikt:** `ui-protection.json` gehört zum Freeze (SMF-1). Owner entscheidet über eine einzelne protokollierte Ausnahme |
| Shell-QA Menüziele < 44 px (wechselnd) | Ursache unbelegt; Warten und genaue Befundangabe in **#1237** |
| Supertrader Production Smoke | Research-Kandidaten ohne veröffentlichten Stand: Welt des Supertrader-Chats, nicht angefasst |
| Social CI | rot seit 30.10., nicht im Auftrag |
| **Sicherheit V13-Archiv** | `-pass file:` kürzt Binärschlüssel am ersten `\n`/NUL, nachgeprüft: 0,8 % leer, 3 % ≤ 3 Byte. Fix für künftige Verschlüsselungen in **#1238**. Bestehende Teile: Owner-Entscheidung, nur mit geprüftem Restore |

## 4. Security Master

- **Produkt:** 1.1.0 (`26c82617…`). Kein produktiver Wechsel.
- **Freigabevorlage #1240** (`V130_SWITCH_FREIGABE.md`):
  - Probelauf 41285528656, Folgestand `4d9a0e03…`, Liste `0a72def6…` (auf `main`), Gate PASS.
  - **Simulation auf `main`** mit den sechs Stammdateien, volle Suiten:
    - keine neuen Fehler;
    - Discover-Neubau ohne Abweichung, danach NM3 und 485 grün;
    - Freeze-Parität: Evidenz-Loader lesen 1.1.0, Produkt liest `LIVE`;
    - Katalog-Generation 1 und das Bundle bleiben gültig, Abnahme 61/61.
  - **Ablauf:**
    1. Probelauf am Lauftag (bytegleich, sonst stoppen).
    2. `commit=true`.
    3. Sofort danach der Marktdaten-Lauf.
    4. Generation 1.3.0 eintragen (eigener PR).
    5. Optional Katalog-Generation 2 in einem neuen Verzeichnis.
- **#1119** bleibt zurückgestellt.

## 5. Interne Vorschau

- **Auf `main` und live:**
  - Worker antwortet 404 `PREVIEW_NOT_ACTIVATED`, auch mit gefälschtem Token;
  - fremde Herkunft 403, PUT/DELETE 405, alles `no-store`;
  - Seite 200 `noindex`, nirgends verlinkt;
  - Bundle unter `/workers/vu-account/data/` → **404** (`src/` desselben Releases → 200).
- **Abnahmeprotokoll** `scripts/account/backtest-review-acceptance.mjs`: 61 Prüfungen.
  - alle sechs Arten, alle 21 Auswahlen (20 A + 1 B, nie zertifiziert);
  - `NOT_PRECOMPUTED` je Art;
  - 9 ungültige Kombinationen mit sicherem Code;
  - Generation und Hash;
  - Sitzung und Rolle.
- **Account-CI:** Chromium und WebKit grün; SQL-Tests und `flows` 57/57 lokal.
- **Aktivierung #1227** (Draft, nicht mergen ohne Freigabe):
  - Voraussetzungen V1–V4 und V6 live belegt;
  - Testkonto und einmalige Schritte im Dokument, Abschnitte 2 und 8.

## 6. Owner-Freigaben

1. **Aktivierung der Vorschau:**
   - Testkonto nennen (eigenes, bestätigtes Konto, nicht das mit `pricing_admin`);
   - Rolle per SQL vergeben;
   - #1227 mergen.
2. **Fixes:**
   - #1239 (NL5);
   - #1236 und die Freeze-Ausnahme für `ui-protection.json`;
   - #1237 (Shell-QA);
   - #1238 (Archiv-Schlüssel) und die Entscheidung über bestehende Archivteile.
3. **#1224 schließen** (überholt durch #1219).
4. **Produktiver 1.3.0-Lauf** nach #1240, mit Datum.
5. **Setup-OOS A1–A6**, spätestens vor etwa 2027-03-26.

## 7. Nächster Schritt zur bedienbaren Backtesting-Funktion

Nach Freigabe 6.1:
1. Testkonto anlegen, Rolle vergeben, #1227 mergen.
2. Unter `https://research.visionuniverse.de/konto/admin/backtests/` die 21 vorgerechneten Auswahlen ausprobieren.

Danach entscheidet der Owner:
- welche weiteren Auswahlen vorgerechnet werden (Raster `docs/quant/backtest-catalog/grid.json`, Neubau über `[v13-archive:catalog]` in einer neuen Generation);
- ob die Vorschau später über den Kreis der Prüfer hinaus geöffnet wird. Das wäre eine eigene Freigabe, ohne Zertifizierung.

## 8. Einstieg

1. `CLAUDE.md`, dann dieses Dokument.
2. `docs/accounts/BACKTEST_VORSCHAU_AKTIVIERUNG.md` (#1227), `docs/data/security-master/V130_SWITCH_FREIGABE.md` (#1240), `SECURITY_MASTER_GENERATIONS.md`.
3. **Arbeitsumgebung:**
   - nur einzelne Branches holen (`git fetch origin main <branch>`);
   - Release-Builds (1,8 GB) nach Gebrauch löschen;
   - Drafts über `gh api -X POST repos/<owner>/<repo>/pulls/<n>/ccr/ready_for_review` auf „bereit“ setzen.
