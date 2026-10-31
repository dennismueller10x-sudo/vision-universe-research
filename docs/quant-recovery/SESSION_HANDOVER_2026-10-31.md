# Sitzungsübergabe Quant und Security Master (Stand 31.10.2026, Version 3.0.0)

Ersetzt 2.1.0 (gleicher Tag). Eine neue Sitzung braucht keinen Chatverlauf. Abgeschlossene Forschung V10–V13c wird **nicht** wiederholt.

**Prozessregel des Owners (31.10.):** Es gelten nur die konkret genannten Merge-Freigaben. Technische Dringlichkeit erweitert den Scope nicht. #1205 wurde ohne ausdrückliche Freigabe gemergt; das wiederholt sich nicht.

## 1. Merges dieser Runde (nur die freigegebenen)

| PR | Inhalt | Merge-Commit | Prüfung vor dem Merge |
|---|---|---|---|
| #1206 | 13 Ticker-Wiederverwendungen markieren (Register, `universe-source`) | `b663b1c844` | volle Suiten auf `main` + PR: gleiche Fehlermenge |
| #1207 | Discover schließt markierte Titel aus | `0085fc7a31` | wie oben; einziger neuer Fehler: Erzeugerbesitz 485, nach Erzeuger-Neubau grün (49/49) |
| #1208 | Backtest-Katalog, 21 Einträge (20 A, 1 B) | `ea95de8f07` | siehe 4 |

Danach ist der reguläre Marktdaten-Lauf **41213952384** gelaufen (manuell gestartet, inkrementell). Er committete `64c7bb42ce`. Ergebnis auf `main`:
- keine Seite, kein Indexeintrag, kein Treffer in US- oder GLOBAL-Suche für die 13;
- EDVA und alle übrigen behalten ihre Seite.

Frühere Merges des Tages: Version 2.1.0, Abschnitt 1 (unter anderem #1163, #1167, #1175, #1193, #1201, #1202, #1204 Rücknahme 1.3.0, #1205).

## 2. Offene PRs (keiner ist zum Merge freigegeben)

| PR | Inhalt | Stand |
|---|---|---|
| #1210 | **P2:** eingefrorene, hashgebundene Security-Master-Generation 1.1.0 für abgeschlossene Studien; Demos neu gebaut | Draft; Migrationsprüfung am echten Folgestand ohne neue Fehler (siehe 3) |
| #1209 | EDVA als Umfirmierung (SBEV → EDVA, Splash Beverage → Endovia, CIK 0001553788): Erzeuger-Register, Stamm und Name | Draft |
| #1214 | Quant: Verzeichnis, Faktor-Evidenz, Radar ohne alte Identität der 13 | Draft, mit Vorher/Nachher (Rangwirkung ≤ 0,97 Punkte) |
| #1213 | Technical: Weltscreener und Technical Intelligence ohne die 13 | Draft |
| #1212 | Watchlist-Zusammenfassung: die 13 ohne Namen, Kurs und Abschnitte | Draft |
| P4 | interne Backtest-Vorschau: Backend (Rolle `backtest_reviewer`, Worker, Bundle) und getrennter Seiten-Entwurf | in Arbeit, siehe 5 |
| #1203 | diese Übergabe | Draft |
| #1119 | 132 SEC-belegte Statuskorrekturen | zurückgestellt bis zur regulären Umstellung auf 1.3.0 |

## 3. Security Master

**Stand:** Produkt **1.1.0** (`26c82617…`). 1.3.0 bleibt zurückgenommen (#1204); ein erneuter Lauf braucht eine eigene Owner-Freigabe.

**Architektur (#1210, Owner P2):**
- Register `quant/config/security-master-generations.json`.
- Eingefrorene Kopie `quant/frozen/security-master/us-security-master-1.1.0.json`: derselbe Git-Blob `ee1fe3ad…`, das Repository wächst nicht.
- `resolve()` fail closed.
- Research-Loader mit Evidenz-Optionen lesen 1.1.0. Neue Research-Generationen nennen ihre Generation ausdrücklich.
- Der Produkt-Adapter bleibt bytegleich zu `main`, gesichert durch zwei Tests.
- Freeze-Tests sind nicht abgeschwächt: MCH-1 läuft jetzt immer, SMF-Fixtures nutzen 1.1.0, Assertions unverändert.
- Katalog und Demos sind an 1.1.0 gebunden (MG-6). Der Katalog wird nicht überschrieben und mischt keine Generationen.

**Migrationsprüfung** am echten Folgestand `46d8e936b3` (sha `71bffd89…`), volle Suiten Quant, Core, Discover/Screener/Supertrader, Technical, Python, Isolation:
- keine neuen Fehler gegenüber `main`;
- V8, V10, V12, SMF und MCH, die den Rückzug ausgelöst hatten, bestehen;
- erwartet ist allein NM3 (alte Seitennamen bis zum Discover-Neubau). Deshalb gehört nach jedem `commit=true` sofort ein Marktdaten-Lauf.

**Unabhängiges Review dieser Architektur: Befund und Grenzen**
- Die abgeschlossenen Einmal-Skripte V7–V13 (24 JS/Python-Dateien) lesen den Stamm weiter direkt.
  - Ihre Code-Hashes stehen in den Registrierungen; Änderungen würden die Provenienz brechen.
  - Nach einer Umstellung werden sie nur auf ihrem registrierten Commit neu ausgeführt.
  - MG-5 verhindert neue direkte Leser.
- `common.cjs#sourceManifest` hasht jetzt die gelesene Generation (vor dem Wechsel bytegleich). Die Code-Hash-Änderung ist in den Demos dokumentiert.

**Vor einem erneuten Lauf 1.3.0:**
1. #1210 mergen.
2. EDVA-Entscheidung (#1209). Danach die Freigabeliste neu erzeugen; sie enthält EDVA noch nicht.
3. Am selben Tag Probelauf und volle Suiten auf dem Folgestand.
4. Owner-Freigabe.
5. `commit=true`, sofort danach der Marktdaten-Lauf.

## 4. Backtests

- **Katalog** (#1208, gemergt), Generation 1:
  - `catalogHash` `7ea6383e…`, Raster `d9e0fef0…`, Lauf 41191910240;
  - 21 Einträge: 20 im Zustand A, 1 im Zustand B (Strategie-Profil, fehlende PIT-Faktor-Snapshots);
  - alle `NOT_CERTIFIED`;
  - Python-Gegenrechnung 560.140/0;
  - Budgets eingehalten: höchstens 34,6 s und 2,55 GB je Lauf, 184 s gesamt;
  - keine Rohreihen, keine Schlüssel.
- **Reproduktion des Katalogs auf `main` nach den neuen Wochenreihen:**
  - Alle 16 öffentlich rechenbaren Fälle ergeben dieselben Kennzahlen und Methodenergebnisse.
  - Abweichend sind nur die Datenstand-Hashes; die Bindung macht das sichtbar.
- **Demos:** in #1210 neu gebaut (Lauf 41219164818, Python 276.732/0).
  - Die Abweichungen gegenüber `main` stammen nur aus den neuen Wochenreihen: Rahmen 4.715 → 4.717, Faktor-Demo −24 Ereignisse. Nachweis: Der `main`-Code liefert denselben `populationHash`.
  - Vorschau-Lesemodell `previewHash` `98b22e6d…`.
- **Arten:** 0/6 zertifiziert, `productionApproved=false`.

## 5. Interne Vorschau (P4)

- Beweisbar geschützt ist nur der Weg über den Konto-Worker mit Supabase-Rolle, nach dem Muster `/konto/admin/tarife/`.
- `docs/` wird von Pages nicht ausgeliefert, das Repository ist aber öffentlich.
- **Umsetzung:**
  - Rolle `backtest_reviewer` (Migration, keine Vergabe);
  - Worker-Routen `/v1/admin/backtests*` mit Aktivierungsschalter, standardmäßig aus;
  - hashgebundenes Bundle (Menü, Vorschau, Katalog);
  - Seite `/konto/admin/backtests/` als getrennter Draft (noindex, nicht verlinkt, keine gesperrten Quant-UI-Dateien).
- Nicht vorgerechnete Auswahlen heißen „nicht vorgerechnet“.

## 6. Setup-OOS (P5)

- A1–A6 sind unverändert offen; keine Normänderung, kein Gate angepasst.
- Unvollständige Endwerte, fehlende Faktorhistorie und rekonstruierte Setup-Stände erscheinen nirgends als zertifiziert:
  - Runner, Katalog und Vorschau tragen `NOT_CERTIFIED` und die Nachweisart;
  - `CERTIFIED_STRATEGY` nur mit Zertifizierungsartefakt (Zustand C).
- Tiingo-Historie: Nutzung nach der Owner-Erklärung vom 31.10. Delistete Titel nur dort, wo die Engines sie korrekt tragen (`BACKTEST_DELISTED_INTEGRATION.md`, D1–D7).

## 7. Verbleibende Fehler (nicht in dieser Runde verursacht)

| Welt | Befund |
|---|---|
| Quant | `technical-ap8-l1/l2/l3` (rot seit den Nachtdaten vom 30.10.) |
| Quant | `v10-population`: Lebenszyklus- und Rahmen-Test erwarten den Datenstand 2026-10-23, auf `main` liegt nach den Langreihen vom 30.10. der 2026-10-30 |
| Core | DQ-SF8 |
| Quant Browser QA | 4 Befunde |
| Technical | Datenvertrag des Screeners: `choppiness14` BMBL = 131,4. Der reguläre Screener-Lauf schreibt deshalb nichts (Exit 2); eigener PR nötig |
| Watchlist-Oberfläche | zeigt den Grund `IDENTITY_QUARANTINED` als Rohcode (gesperrte bzw. Konto-UI, eigener PR) |
| Firmenverzeichnis-Suche | PCLN weiter „Priceline.com“ (Erzeuger `build-sec-universe.mjs`) |
| Company Names | Die SEC-Liste führt NYSE-American-Titel als „NYSE“; fast alle AMEX-Zeilen bekommen deshalb keinen SEC-Namen (eigener PR mit Vorher/Nachher) |

## 8. Owner-Entscheidungen

1. #1210 (P2-Architektur) mergen. Danach entscheiden, ob ein neuer 1.3.0-Lauf vorbereitet wird.
2. #1209 EDVA mergen. Der Wochenlauf übernimmt Name und Stamm.
3. #1214 (Quant, Rangwirkung), #1213 (Technical), #1212 (Watchlist) mergen. Die Watchlist blendet auch die richtigen ETF-Namen von BREW, INVN, NYNY und WR aus, das Quant-Verzeichnis behält sie. Gewünschte Linie festlegen.
4. P4: Rolle vergeben, Aktivierung, Backend-PR, Seiten-Draft.
5. Setup-OOS A1–A6, spätestens vor etwa 2027-03-26.
6. #1119 erst nach regulärer Umstellung auf 1.3.0.

## 9. Einstieg

1. `CLAUDE.md`, dann dieses Dokument.
2. Security Master: `docs/data/security-master/SECURITY_MASTER_GENERATIONS.md` (#1210), `TICKER_REUSE_QUARANTINE.md` (Konsumententabelle in #1214), `V130_OWNER_APPROVAL_2026-10-31.md`.
3. Backtests: `docs/quant/BACKTEST_PRODUCT_READINESS_PLAN.md`, `BACKTEST_PREVIEW.md`, `docs/quant/backtest-catalog/README.md`.
4. Archiv-Marken (`quant-v13-archive.yml`): usage, put, get, verify, keycheck, restore, demos, catalog.
