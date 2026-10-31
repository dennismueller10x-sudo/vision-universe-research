# Sitzungsübergabe Quant und Security Master (Stand 31.10.2026, Version 2.0.0)

Ersetzt als Einstieg die Übergabe vom 30.10. (`SESSION_HANDOVER_2026-10-30.md` 1.0.0 auf `main`, 1.2.0 im Draft #1158). Fachdokumente werden nicht ersetzt, die Übergabe verweist auf sie. Eine neue Sitzung braucht keinen Chatverlauf. Abgeschlossene Forschung V10–V13c wird **nicht** wiederholt.

## 1. Gemergt (30./31.10.2026)

| PR | Inhalt | Merge-Commit |
|---|---|---|
| #1163 | Security Master: belegte Doppelzeilen des Anbieters (OKE, TEL; FUN bleibt gesperrt) | `a5d1a9354f` |
| #1167 | Security Master 1.1.0 → 1.3.0: Gate-Schema 1.1.0, Freigabelisten-Builder, maßgebliche Liste (ersetzt #1143, geschlossen) | `bef102dd13` |
| #1175 | G7-Belegregister (GCTK, LNAI, SBXD), Liste aus Lauf 41117465706 | `f84e86b820` |
| #1178 | 16 Backtest-Demos auf `main` neu gebaut (R2-Restore auf dem Runner), Paritätsbericht | `768ecd4e52` |
| #1171 | Prüfung auf veraltete Demos (nur lesend) | `903376c52e` |
| #1169 | Produktreife-Plan P0–P6, Paritätsanzeige | `5c807be4ec` |

## 2. Offen und zur Freigabe vorgelegt

| PR | Inhalt | Stand |
|---|---|---|
| **#1193** | Security Master: produktiver Lauf **sicher gestoppt**. Nachfreigabe DBRG, Korrektur NM3 im Wochenlauf, Liste vom 31.10. (Gate PASS) | wartet auf den Owner. Die Rot-Checks auf dem PR sind die schon bestehenden Fehler auf `main` (Abschnitt 5) |
| #1194 | Quant CI: Demo-Aktualität strikt prüfen (Hash-Abgleich, keine private Validierung) | wartet auf den Owner |
| #1197 | Setup-OOS-Vorarbeit A5 (`countBy` EVENT_DAY) und A6 (`--oos-rows-out`), Konsistenzprüfung | wartet auf den Owner; keine Normänderung |
| #1179 | Owner-Vorlagen Setup-OOS A1–A6 und Tiingo-Lizenz 2.0 (kommerzielle Lizenz, Erklärung 31.10.) | wartet auf den Owner |
| #1119 | Security-Master-Status aus SEC-Delisting-Belegen (132 Zeilen) | **zurückgestellt**, bis die Umstellung 1.3.0 läuft und geprüft ist |
| #1201 | interne Backtest-Vorschau v2 (ersetzt #1138), Spec-Builder | wartet auf den Owner |
| #1202 | Runner-Transparenz für delistete Populationen, Fähigkeitsmatrix, Demos neu gebaut | wartet auf den Owner |
| #1138 | Vorschau v1 | durch #1201 ersetzt, schließen nach dem Merge von #1201 |

## 3. Security Master

- **Version auf `main`:** weiter `us-security-master-1.1.0` (sha256 `26c82617…`). Die Umstellung auf 1.3.0 ist **nicht** committet.
- **Letzter Probelauf:** 41177449137 (31.10., `main` @ `f84e86b`, `approved_changes=true`).
  - Gate PASS · COMMIT bei unveränderten Grenzen.
  - Nach #1193: canonical_id 24/25, Typ 1/25, Deaktivierungen 17/50, Eignung 17/50, G6 0, Namen 1/200.
- **Gestoppt aus zwei Gründen** (Bedingungen des Owners):
  1. ref_DBRG ist neu und noch nicht freigegeben, eine Alterung am Lauftag. Die Änderung ist SEC-belegt: 8-K 2.01/3.01 und 25-NSE, beide vom 30.09.
  2. NM3 im Wochenlauf prüft gegen nicht neu gebaute Discover-Seiten (ATTT). Der Commit-Schritt wäre nie erreicht worden.
- **Folgen der Übernahme simuliert:**
  - keine neuen DQ-Fehler, DQ-ID-4 verbessert sich von 112 auf 69 Warnungen;
  - Discover, Screener und Aktienseiten bleiben unverändert.
- **Vorlage:** `docs/data/security-master/V130_OWNER_APPROVAL_2026-10-31.md`.
- **Nächster Schritt nach dem Merge von #1193, am selben Tag:**
  1. Probelauf mit `commit=false` und `approved_changes=true`.
  2. Folgestand byte-gleich mit `71bffd89…` und kein neuer Eintrag: sofort `commit=true` mit `allow_version_change=true` und `approved_changes=true`.
  3. Neue Einträge: stoppen und die Liste neu erzeugen (Builder mit `--canonical-evidence quant/config/security-master-canonical-change-evidence.json`).
- **Liste neu erzeugen:** Befehlsfolge in `docs/data/security-master/V130_APPROVAL_LIST_REVIEW.md`, Abschnitt „Liste neu erzeugen“, dazu `--canonical-evidence`.

## 4. Verbleibende Identitäts- und Datenprobleme

| Problem | Umfang | Stand |
|---|---|---|
| G7-Restfälle (nicht freigabefähig) | 24 canonical_id-Wechsel | einzeln belegt in `V130_G7_CANONICAL_EVIDENCE.md`: Tickerwechsel, zwei aktive Zeilen, Widersprüche Anbieter/SEC, keine Kette |
| Ticker-Wiederverwendung mit weiterlaufender Reihe | 14 aktive Discover-Seiten (ACTS, BREW, EDVA, ENTL, FTPA, GNMX, INVN, NMBL, NYNY, PCLN, TRIL, USX, WR, WX) | ein eigener PR muss sie auflösen: neue securityId nach `core/identity.js`. Seite und Kurse gehören heute teils zu verschiedenen Wertpapieren (z. B. PCLN) |
| Doppelzeilen ohne Beleg | FUN (12g-3(c)), HUT, BAM, CCSI, NYXH, UHAL-B | fail closed |
| #1119 | 132 SEC-belegte Statuskorrekturen | nach der Umstellung zur Entscheidung vorlegen |

## 5. Bestehende Fehler auf `main` (nicht aus dieser Arbeit)

- **Quant CI:** `technical-ap8-l1/l2/l3` („Datensatz-Spalte … eingefroren leer“). Bei `228edf0` grün, seit den nächtlichen Datencommits rot (`d961971`). Zuständig ist die Technical-Welt (Fachmodell/Datenstand).
- **Core:** DQ-SF8 (SF8-Schlüsse ≠ veröffentlichte Schlüsse am 29.10.). Zuständig ist die Supertrader-Welt (SF8-Kandidatenlauf).
- Beide Fehler erscheinen auf jedem PR, der Quant CI oder Core auslöst.

## 6. Tiingo-Lizenz (Stand 31.10.)

- **Owner-Erklärung vom 31.10.:** kommerzielle Lizenz mit Veröffentlichungsrechten, Stufe `OWNER_DECLARED`. Der Vertragstext liegt nicht im Repository.
- **Gedeckt laut Erklärung:**
  - Berechnung;
  - Anzeige historischer Kurse und Charts;
  - abgeleitete Kennzahlen und Backtest-Ergebnisse;
  - historische Kurse delisteter Aktien aus den vorhandenen Archiven.
- **Nicht belegt:** nur die Weitergabe herunterladbarer Rohdatensätze. Ohne geplante Downloadfunktion besteht kein Handlungsbedarf.
- **Fundstellen:** `docs/data/TIINGO_LICENSE_REVIEW.md` (2.0, in #1179) und `quant/config/provider-profiles.json`.

## 7. Backtests

- **Arten:** 0/6 zertifiziert, `productionApproved=false`. Blocker je Art in `docs/quant/BACKTEST_PRODUCT_READINESS_PLAN.md`, Abschnitt 1.
- **Demos:** 16 Fälle neu gebaut (Run 41117940740).
  - Python-Gegenrechnung: 276.828 Prüfungen, 0 Abweichungen.
  - 15 von 16 Fällen ohne Kennzahländerung. Der Faktorfall ändert sich minimal, weil ATYR im Rahmen fehlt (Datenstand).
  - Der Wächter meldet `Code CURRENT`.
  - Neubau: leerer Commit mit `[v13-archive:demos]` auf `claude/**`.
- **Nach der Umstellung auf Security Master 1.3.0** ändern sich `masterHash` und gegebenenfalls Populationen. Dann die Demos neu bauen und mit `compare-backtest-demos.cjs` vergleichen.

### 7.1 Delistete Aktien (P3.7, #1202)

- **Datenbasis:** Register 1.0.0 mit 1.675 QUALIFIED (MERGER 1.130, DISTRESS 56, UNKNOWN 489, Ende SEC-belegt) und 151 mit zensiertem Ende. Die Reihen liegen im R2-Archiv (`v13-derived`).
- **Profile:** `V13_DELISTED_F1`, `F1C` und `V13B_DELISTED_F1W`.
- **Heute nutzbar:**
  - Replay (RULE_EVENTS);
  - Pattern;
  - Signal je Ereignis.
- **Nicht nutzbar:**
  - Ledger;
  - finanziertes Signal (der Zeitplan filtert Überlebende);
  - Setup (keine Replays für `dl_`-Titel);
  - Strategy (verzerrt durch die Schnittmenge der Sitzungen);
  - Faktor (das Panel enthält nur `ref_`-Titel).
- **Endereignisse:**
  - Ereignisse nach dem letzten Handelstag werden zensiert.
  - Keine Abfindung, weil die Gegenleistung nicht belegt ist.
  - Kein Totalverlust im Runner; Totalverlust gibt es nur als ausgewiesenes V13-Szenario.
- **#1202:**
  - Ein unvollständiges privates Verzeichnis führt zu Zustand B.
  - Die Ende-Kennzeichnung unterscheidet belegte und unbelegte Enden.
  - Faktor-Ausschlüsse werden ausgewiesen.
  - Die Demos sind neu gebaut, ohne Kennzahländerung.
- **Nächste Schritte:** D1–D7 in `docs/quant/BACKTEST_DELISTED_INTEGRATION.md`, z. B. Endwert-Sensitivität, finanziertes Signal und Strategy mit Delistings, Faktorpanel mit Delistings.
- **Gate `survivorship`:** liest heute keine Runner-Ergebnisse. Eine Einbindung wäre eine normative Owner-Entscheidung.

## 8. Interne Backtesting-Vorschau (P5)

- **#1201** (ersetzt #1138, standardmäßig aus, nicht verdrahtet):
  - Lesemodell aus den aktuellen Demos, `display.evidence` je Fall: historische Studie, Simulation, Rekonstruktion, nicht gerechnet; „zertifiziert“ nur im Zustand C.
  - Spec-Builder: Auswahl aus 16 Vorlagen; änderbar sind Zeitraum, Kosten, Benchmark, Signalregeln, Faktor und Methoden. Prüfung über `validateSpec`, Fehler nur als sichere Codes.
  - Durchgängig geprüft: Auswahl → Runner → Zustand A.
- **Ausführungsmodell:** Der Runner läuft nicht auf GitHub Pages (Node, 0,7–2,3 GB RAM, private Archive). Geplant ist ein vorgerechneter Katalog in CI (Raster der Auswahlen → Runner → Python-Prüfung → `build-backtest-preview --extra-result`), nachgeschlagen über `specHash`.
- **Nächste PRs:**
  1. Raster und Katalog-Workflow mit Laufzeitbudget.
  2. Interne Anzeige; braucht eine Owner-Freigabe, und `quant/app/**` ist gesperrt (`ui-protection.json`).
- **Reihenfolge:** Nach dem Merge von #1202 das Lesemodell in #1201 neu erzeugen.

## 9. Fehlende fachliche Zertifizierungsvoraussetzungen

| Art | fehlt |
|---|---|
| SAME_STOCK_REPLAY | strukturell beschreibend (`ruleTest`). Überlebende per Konstruktion; mit delisteten Reihen als Sensitivität ergänzbar, nicht zertifizierbar als Regeltest |
| PATTERN_EVIDENCE | Überlebendenkorrektur (Delisted-Population), Gesamtrendite (TR-Register) |
| SIGNAL_BACKTEST | 0/5 Regeln zertifiziert; Befund V10–V13: kein belastbares Alpha |
| SETUP_BACKTEST | Historie (23/120 Stichtage, 49/180 Tage, 0/100 M6), OOS-Segmentierung (Owner, A1–A6), Owner-Freigabe |
| STRATEGY_BACKTEST | Mitgliedschafts- und Faktorhistorie 2/24 Monate, frühestens etwa 2028-08 |
| FACTOR_RANKING_BACKTEST | Faktorhistorie 2/24, Forward-Monate 0/12, frühestens 2028-01/08 |

## 10. Owner-Entscheidungen

1. **#1193** mergen, danach am selben Tag Probelauf und `commit=true` (Abschnitt 3).
2. **#1194**, **#1197**, **#1179**, **#1202**, danach **#1201** mergen (technisch fertig).
3. **Setup-OOS:** `oosSegmentation` in der Methodik freigeben, das fertige Objekt steht in `SETUP_OOS_EVALUATION.md`, Abschnitt 8. Danach die Auswertung je Ereignisart, jeweils als eigener PR. Spätestens vor etwa 2027-03-26.
4. **Auftrag für die 14 Ticker-Wiederverwendungen** (neue securityIds) als eigenen Identitäts-PR.
5. **#1119** nach erfolgreicher Umstellung neu zur Entscheidung vorlegen.
6. **Produktanzeige der Vorschau:** erst nach eigener Freigabe.

## 11. Einstieg für eine neue Sitzung

1. `CLAUDE.md`, dann dieses Dokument.
2. Security Master: `docs/data/security-master/V130_OWNER_APPROVAL_2026-10-31.md`, `V130_G7_CANONICAL_EVIDENCE.md`, `scripts/market/build-security-master-approval-list.mjs`, `.github/workflows/security-master-weekly.yml`.
3. Backtests: `docs/quant/BACKTEST_PRODUCT_READINESS_PLAN.md`, `BACKTEST_RUNNER.md`, `docs/quant/backtest-demos/REBUILD_2026-10-30.md`.
4. Archiv: `docs/quant-recovery/v13/archive/README.md`. Marken in `quant-v13-archive.yml`: usage, put, get, verify, keycheck, restore, **demos**.
5. Dauerregeln:
   - keine Frontend-Aktivierung;
   - keine Gate- oder Normänderung ohne Freigabe;
   - keine Handänderung generierter Daten;
   - Schlüssel nie in Git oder Logs.
