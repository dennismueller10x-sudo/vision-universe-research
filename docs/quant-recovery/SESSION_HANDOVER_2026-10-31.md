# Sitzungsübergabe Quant und Security Master (Stand 31.10.2026, Version 2.1.0)

Ersetzt 2.0.0 (gleicher Tag) und die Übergaben vom 30.10. Eine neue Sitzung braucht keinen Chatverlauf. Abgeschlossene Forschung V10–V13c wird **nicht** wiederholt.

## 1. Gemergt (30./31.10.2026)

| PR | Inhalt | Merge-Commit |
|---|---|---|
| #1163 | Security Master: belegte Doppelzeilen (OKE, TEL; FUN gesperrt) | `a5d1a9354f` |
| #1167 | Gate-Schema 1.1.0, Freigabelisten-Builder, maßgebliche Liste (ersetzt #1143) | `bef102dd13` |
| #1175 | G7-Belegregister GCTK, LNAI, SBXD | `f84e86b820` |
| #1178 | 16 Demos neu gebaut (Runner-Restore) | `768ecd4e52` |
| #1171 | Prüfung auf veraltete Demos | `903376c52e` |
| #1169 | Produktreife-Plan P0–P6 | `5c807be4ec` |
| #1194 | Quant CI: Demo-Aktualität strikt (nur Hash-Abgleich) | `d1447a4107` |
| #1197 | Setup-OOS-Vorarbeit A5/A6 (normneutral) | `8ccb7ed22b` |
| #1179 | Setup-OOS-Vorlage A1–A6, Tiingo-Lizenz 2.0 | `747b2ed7dc` |
| #1202 | Runner-Transparenz für delistete Populationen, Demos neu | `acc487fe31` |
| #1193 | Security Master: DBRG, NM3 gegen committeten Namensstand plus offengelegte Namensabweichung, Liste 31.10. | `c9de7819af` |
| — | **produktiver Lauf 41186967651: Security Master 1.3.0** | `46d8e936b3` |
| #1204 | **Rücknahme von 1.3.0** (siehe 3) | `82fba07ed0` |
| #1205 | Demos auf `main` neu gebaut (setup-oos.cjs), keine Kennzahländerung | `bceb3766c2` |
| #1201 | interne Vorschau v2, Nachweisart, Spec-Builder (ersetzt #1138, geschlossen) | `aee383cd80` |

## 2. Offen

| PR | Inhalt | Stand |
|---|---|---|
| #1206 | 13 Ticker-Wiederverwendungen markieren (Register, `universe-source`), EDVA als Umfirmierung | Teil 1/2, wartet auf Owner-Merge |
| #1207 | Discover schließt markierte Titel aus (keine Karte, Seite, Ranking) | Teil 2/2, Basis #1206 |
| #1208 | vorgerechneter Backtest-Katalog (21 Auswahlen, Python-geprüft) | Draft, wartet auf den Owner |
| #1203 | diese Übergabe | Draft |
| #1119 | 132 SEC-belegte Statuskorrekturen | zurückgestellt, bis 1.3.0 regulär läuft |

## 3. Security Master: Produktstand **1.1.0** (1.3.0 zurückgenommen)

- **Lauf und Prüfung:** Der Lauf 41186967651 (`commit=true`) erfüllte alle Vorbedingungen:
  - Liste `8f0260f0…`, Ausgangsstamm `26c82617…`, Folgestand `71bffd89…`, alle exakt passend;
  - keine zusätzlichen Änderungen;
  - Gate PASS bei unveränderten Grenzen;
  - die 14 Ticker-Wiederverwendungen ohne neue Namenszuordnung.
- **Unabhängige Prüfung danach:** neue Fehler bei
  - `research-v8-classification`, `v10-population` und `v12-largecap`: eingefrorene Research-Frames lassen sich nicht mehr reproduzieren;
  - `security-master-v130-freeze` SMF-4/5/7 und `security-master-content-hash` MCH-3: Fixtures setzen „vor dem Wechsel“ voraus.
- **Ursache:** Die Research-Loader (`research-weekly-loader`, `weekly-real-adapter`) lesen fest den live committeten Stamm. Der Freeze-Plan P2 (`docs/data/SECURITY_MASTER_WEEKLY.md`) setzt eine eingefrorene 1.1.0-Grundlage und eine neue Backtest-Generation voraus; beides fehlte. Meine Simulation vor dem Lauf deckte die Quant-Suite nicht ab.
- **Rücknahme #1204:** Nach der Stoppregel des Owners stehen die sechs Dateien wieder exakt auf dem Stand vor dem Lauf. Die betroffenen Tests laufen 38/38.
- **Für einen erneuten Lauf ist ein Vorbereitungs-PR nötig:**
  1. eine eingefrorene 1.1.0-Grundlage für die V8–V13-Loader und Tests (Option in den Loadern statt fester Pfad);
  2. Freeze- und MCH-Tests auf „nach dem Wechsel“ umstellen;
  3. `build-post-switch` und `compare` für die neue Generation;
  4. danach dieselbe Prüfkette, **einschließlich der vollen Quant-Suite auf dem simulierten Folgestand**.
- **Wochenlauf:** NM3 prüft gegen den committeten Namensstand, `report-name-display-drift.mjs` legt jede Namensabweichung offen. Lauf 41186967651: 16 Seiten mit altem Namen, darunter XRPN mit CIK-Wechsel (gegen G9 gezählt, nicht freigegeben).

## 4. Identität

- **13 Ticker-Wiederverwendungen** (ACTS, BREW, ENTL, FTPA, GNMX, INVN, NMBL, NYNY, PCLN, TRIL, USX, WR, WX): Unter dem Ticker handelt heute ein ETF.
  - Belegt durch die Anbieterliste 31.10. (sha `fc51593e…`): alte Aktienzeile beendet, neue ETF-Zeile ab dem Beginn unserer Reihe. Die SEC-Liste führt kein operatives Unternehmen.
  - Korrektur in #1206 und #1207: markieren und in Discover ausschließen.
  - Herausnehmen aus dem Universum wäre unsicher: DH1 und die Artefakt-Konsistenz kippen, bis die Pipeline neu baut.
  - Lokaler Neubau: 13 ohne Seite, EDVA bleibt, discover/screener 627/627.
- **EDVA:** dieselbe Emittentin (CIK 0001553788, Splash Beverage → Endovia am 2026-08-21). Offen: Name und Stammzeile (Erzeuger-PR).
- **Technical** liest die Wochenreihen direkt, nicht über `universe-source`. Ein Ausschluss dort gehört in einen eigenen Technical-PR.
- **Weiter offen:** 24 nicht freigabefähige canonical_id-Wechsel (`V130_G7_CANONICAL_EVIDENCE.md`); FUN, HUT, BAM, CCSI, NYXH, UHAL-B fail closed; XRPN (CIK-Wechsel).

## 5. Bestehende Fehler auf `main` (andere Welten)

- Quant: `technical-ap8-l1/l2/l3`, rot seit den Nachtdaten vom 30.10. (`228edf0` grün).
- Core: DQ-SF8.
- Quant Browser QA: 4 Befunde, auch auf fremden Branches.

## 6. Tiingo-Lizenz

- Owner-Erklärung 31.10.: kommerzielle Lizenz mit Veröffentlichungsrechten (`provider-profiles.json`, `docs/data/TIINGO_LICENSE_REVIEW.md` 2.0).
- Keine Einschränkung für historische Charts, delistete Kurse oder abgeleitete Backtest-Kennzahlen.
- Herunterladbare Rohdatensätze sind nicht vorgesehen.

## 7. Backtests

- **Arten:** 0/6 zertifiziert, `productionApproved=false`. Die fehlenden Voraussetzungen stehen in `BACKTEST_PRODUCT_READINESS_PLAN.md`:
  - Setup: Historie und OOS-Freigabe;
  - Strategy und Faktor: frühestens 2028;
  - Signal: keine Regel zertifiziert;
  - Pattern: Überlebende und Gesamtrendite;
  - Replay: beschreibend.
- **Demos:** auf `main` aktuell (#1205). Wächter `CURRENT`, Python 276.828/0.
- **Delistete Titel:** Fähigkeitsmatrix und Schritte D1–D7 in `docs/quant/BACKTEST_DELISTED_INTEGRATION.md`.
- **Vorschau (#1201, gemergt):** standardmäßig aus, nicht verdrahtet. `display.evidence` trennt Studie, Simulation, Rekonstruktion und zertifiziert (nur Zustand C).
- **Katalog (#1208):**
  - Inhalt: `docs/quant/backtest-catalog/`, Marke `[v13-archive:catalog]`.
  - Lauf 41191910240: 21 Einträge (20 A, 1 B), Python 560.140/0, Integrität 0 Verstöße.
  - Nächste Stufe: `lookup` an die Vorschau anschließen; die interne Oberfläche braucht eine Owner-Freigabe.

## 8. Setup-OOS

- Vorarbeit A5/A6 ist gemergt (#1197).
- Die fachliche Segmentierung A1–A6 ist unverändert offen. Das fertige `oosSegmentation`-Objekt steht in `docs/quant/SETUP_OOS_EVALUATION.md`, Abschnitt 8.

## 9. Owner-Entscheidungen

1. #1206, danach #1207 mergen (Identitätskorrektur).
2. #1208 mergen (Katalog).
3. Auftrag für den Vorbereitungs-PR zu Security Master 1.3.0 (Abschnitt 3), danach einen neuen Lauf freigeben.
4. EDVA: Namens- und Stammkorrektur als Erzeuger-PR.
5. Setup-OOS A1–A6 entscheiden, spätestens vor etwa 2027-03-26.
6. Interne Oberfläche für die Vorschau und den Katalog: eigene Freigabe.
7. #1119 erst nach regulärer Umstellung auf 1.3.0.

## 10. Einstieg

1. `CLAUDE.md`, dann dieses Dokument.
2. Security Master: `docs/data/security-master/V130_OWNER_APPROVAL_2026-10-31.md`, `TICKER_REUSE_QUARANTINE.md`, `docs/data/SECURITY_MASTER_WEEKLY.md` (Freeze P2).
3. Backtests: `docs/quant/BACKTEST_PRODUCT_READINESS_PLAN.md`, `BACKTEST_RUNNER.md`, `BACKTEST_PREVIEW.md`, `docs/quant/backtest-catalog/README.md`.
4. Archiv-Marken (`quant-v13-archive.yml`): usage, put, get, verify, keycheck, restore, demos, catalog.
