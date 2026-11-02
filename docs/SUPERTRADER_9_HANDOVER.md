# Supertrader 9 – Abschlussübergabe an die zentrale Vision-Universe-Entwicklung

**Verbindlich ab 02.11.2026.** Bezugsstand: `main` @ `659df6c` (Merge #1190, 02.11.2026 ~08:10 UTC).

Dieses Dokument ist der Einstieg für den Supertrader. Es fasst den Abschlussstand der Supertrader-9-Sitzung (`session_01DVwZC6JN3UjKecEXEQg5Yz`, archiviert) zusammen und verweist auf die Einzelberichte. Bei einem Widerspruch zu älteren Supertrader-Dokumenten gilt dieses Dokument. Ausnahme: Zahlen, die laut ihrer Quelle zu einem späteren Stand gehören.

Grundregeln des Repositorys: [CLAUDE.md](../CLAUDE.md). Architektur und Datenfluss: [docs/VISION_UNIVERSE_ARCHITECTURE.md](VISION_UNIVERSE_ARCHITECTURE.md). Quant-Seite (Security Master, V13-Archiv, Backtests): [docs/quant/QUANT_FINAL_HANDOVER.md](quant/QUANT_FINAL_HANDOVER.md).

---

## 0. Startanleitung für den zentralen Claude-Code-Chat

**Zuerst lesen, in dieser Reihenfolge:**
1. [CLAUDE.md](../CLAUDE.md): Arbeitsregeln, Gates, Tests, Workflow-Regeln (ADR-005).
2. Dieses Dokument.
3. [SUPERTRADER_9_DAILY_OPERATIONS.md](SUPERTRADER_9_DAILY_OPERATIONS.md): Kandidaten-Tageslauf, Veröffentlichungsvertrag C1–C7, Inbetriebnahme.
4. [SUPERTRADER_9_OWNER_APPROVALS.md](SUPERTRADER_9_OWNER_APPROVALS.md): Owner-Entscheidungen und Verlauf, §15 (Aktivierungsweg) und §17–§19 (Abschluss).
5. [SUPERTRADER_9_CERTIFICATION_READINESS.md](SUPERTRADER_9_CERTIFICATION_READINESS.md): alle 13 Methoden (CC-1–CC-8, Blocker, Reihenfolge). **Nicht ändern:** Sein SHA-256 `89a6026937f1…cfde` ist im TOP5-Prüfplan gepinnt.
6. [SUPERTRADER_9_CERTIFICATION_PREP_TOP5.md](SUPERTRADER_9_CERTIFICATION_PREP_TOP5.md) und [SUPERTRADER_9_HISTORICAL_BACKTEST_INFRASTRUCTURE.md](SUPERTRADER_9_HISTORICAL_BACKTEST_INFRASTRUCTURE.md).
7. [docs/quant/QUANT_FINAL_HANDOVER.md](quant/QUANT_FINAL_HANDOVER.md), Abschnitte B2 (Security Master) und F (V13-Archiv).

**Abgeschlossen** (alles auf `main`):
- **Kandidaten-Tageslauf:** Workflow, Veröffentlichungsvertrag, Core-Dauerbetrieb, E2E-Prüfung und Alarme (#1137, #1146, #1191, #1198, #1218, #1220). Pages liefert nach dem Kandidatenlauf aus (#1199).
- **Einmaliger Kandidaten-Refresh:** Commit `b7c4e9e`, Stand 30.10., DQ-SF8 PASS.
- **Historische Backtest-Infrastruktur:** Datenseite (#1189), Ausführungsseite (#1190).
- **Zertifizierungsvorbereitung TOP5:** C02, C01, C08, C12, C03 (#1196).
- **Gemeinsame CI-Blocker beseitigt:** #1219 (Quant-Wochenreihen-Tests), #1239 (Discover NL5). L1–L3 hat Technical behoben (#1188).

**Aufgaben der Quant-Sitzung** (laut [QUANT_FINAL_HANDOVER.md](quant/QUANT_FINAL_HANDOVER.md) §E und §H; Supertrader ändert dort nichts):
- **H1 Security Master 1.3.0 produktiv:** Freigabevorlage #1240, Owner-Datum. **Frist: Laufdatum 10.11.2026.** Ab dem 11.11. meldet die SF8-Eingangsprüfung den Stamm als STALE (`AUX_MAX_AGE_DAYS.master = 60`, `scripts/supertrader/source-faithful/product/input-gate.mjs`). Dann bricht jeder Kandidatenlauf mit Exit 3 ab.
- **H3 V13-Archivgeneration 2.0.0:** #1241. Danach die Leser umstellen, erst dann über die Löschung von 1.2.0 entscheiden.
- **#1119** (SEC-Statuskorrekturen): erst nach 1.3.0.

**Offene Supertrader-PRs** (alle Draft, keiner freigegeben, Basis `main`): #1233, #1234, #1235, siehe §8. Ältere Supertrader-Drafts, die durch gemergte PRs überholt sind, stehen in §8.2.

**Vor Merges und Aktivierungen prüfen:**
- Gate A: PRs mit Supertrader-Pfaden enthalten nur Supertrader-Pfade (`node scripts/supertrader/guard-protected-paths.mjs --base origin/main`).
- Die Schlüsselsuche der Supertrader Quality Gates (`grep api_key|secret|token|password|authorization` gefolgt von `:` oder `=`) muss sauber sein. Feldnamen wie `token` sind dort verboten.
- `SF8_AUTO_PUBLISH` nur nach Nachweis 1 aus §3.3, und erst nach gültigem Security Master 1.3.0.
- #1234 (V13-Studie) liest Archivgeneration 1.2.0. Vor einer Löschung von 1.2.0 muss der Workflow auf 2.0.0 umgestellt sein (§6).
- Sein Pin bindet #1196 an die Readiness-Matrix (`dependsOn` mit SHA-256). Diese Datei bleibt byte-gleich.

**Nächste drei technische Prioritäten:**
1. **V1 abschließen und `SF8_AUTO_PUBLISH` vorbereiten.** S1 mit den Nachtläufen vom 03.11. und 04.11., S5 mit dem SEC-Montagslauf vom 02.11. (geplant ~14:30 UTC). Danach S6 über Security Master 1.3.0 (Quant, bis 10.11.). Das sind nur Nachweise mit echten Lauf-IDs; die Variable setzt der Owner.
2. **#1235 nachziehen:** den Konflikt in `cert-prep-top5.mjs` mit `main` auflösen und das Planfeld `token` im ALL13-Plan wie in #1196 in `sourcePhrase` umbenennen (neuer Pin, Begründung im Commit). Danach unabhängiges Review und Owner-Freigabe. Anschließend der Regeltreue-Nachweis auf dem Referenz-Commit (TOP5 und ALL13).
3. **Echter historischer Lauf der V13-Delisting-Vergleichsstudie** über #1234. Voraussetzungen: Owner-Freigabe, die Secrets `VU_HISTORY_S3_*` und `V13_ARCHIVE_PRIVATE_KEY` vorhanden, Entscheidung zur Archivgeneration (1.2.0 oder nach #1241 2.0.0), sec-pit r12 im Snapshot-Speicher. Vorher #1233 (Turtle-Einheitsstopps) prüfen und integrieren, damit der Ausführungsaudit Turtle nicht mehr als `NOT_CHECKED_LEVEL_UNKNOWN` meldet.

---

## 1. Integrierte PRs der letzten Runde (01.–02.11.2026)

Jeder PR wurde mit gesperrtem Head-SHA und erst nach grüner Pflicht-CI auf aktuellem `main` gemergt.

| PR | Merge-Commit | Inhalt |
|---|---|---|
| #1219 | `f0fd146` | Quant-Wochenreihen-Tests vom wachsenden Datenstand entkoppelt (7 veraltete Tests) |
| #1199 | `1dfffb0` | Pages-Auslieferung auch nach dem SF8-Tageslauf |
| #1217 | `6d065c3` | Rückfall-Zeitplan 30./31.10. belegt (Doku) |
| #1239 | `08edec9` | Discover NL5: Technical-Stufe in der exakten Alarm-Liste (Owner-Freigabe 02.11.) |
| #1200 | `ca236fd` | Betriebsstand nach #1137/#1146 (Doku) |
| #1191 | `f16c447` | Trailer `SF8-Code-Commit` = ausgecheckter HEAD |
| #1218 | `5a60e35` | SF8-Alarm auch bei Fehler vor dem Schritt `mode` |
| #1220 | `9493236` | Signale: Checkout an der Spitze des eigenen Zweigs (ADR-005) |
| #1198 | `3726911` | E2E-Prüfung des SF8-Tageswegs (`SF9_E2E=1`) |
| #1189 | `3fe4fe4` | historische Infrastruktur, Datenseite (PIT-Universum, Identität, Delisting, Abdeckung) |
| #1196 | `2d30160` | Zertifizierungsvorbereitung TOP5, Plan 1.1.1 |
| #1190 | `659df6c` | historische Infrastruktur, Ausführungsseite (Stops, Delisting-Abrechnung, A/B) |

Früher integriert: #1137 (`93884b3`) und #1146 (`f2c2ce8`), Kandidaten-Tageslauf und Core-Dauerbetrieb.

---

## 2. Die 13 Strategien: tatsächlicher Forschungsstatus

**Für alle 13 gilt:** `LIVE_NOT_APPROVED`, `DIAGNOSTIC_NOT_CERTIFIED`, `VALIDATED_TRADE_SIGNAL` gesperrt (`LOCKED_FOR_ALL_13`), keine Orders, keine Broker-Anbindung. Keine Methode ist zertifiziert. CC-5 (Corporate-Action-Quelle) und CC-8 (Paper 2027) sind für alle offen. Quelle der Matrix: [SUPERTRADER_9_CERTIFICATION_READINESS.md](SUPERTRADER_9_CERTIFICATION_READINESS.md), Abschnitt „Kompakte Matrix“.

Kandidaten im veröffentlichten Stand vom 30.10. (Commit `b7c4e9e`, Stufen CHART / CONFIRMED / MODELED):

| | Methode | Zustand / Messklasse | CC erfüllt | CC offen | Kandidaten 30.10. | Vorbereitung |
|---|---|---|---|---|---|---|
| C01 | Turtle S1 | RCWE / FULL_DIAGNOSTIC | 2,3,6,7 | 1,4,5,8 | 36 / 294 / 0 | TOP5 (#1196) |
| C02 | Turtle S2 | RCWE / FULL_DIAGNOSTIC | 1,2,3,6,7 | 4,5,8 | 25 / 274 / 0 | TOP5 (#1196) |
| C03 | Darvas | RCWE / MECH_COMPONENT | 2,4,6,7 | 1,3,5,8 | 217 / 0 / 0 | TOP5 (#1196) |
| C04 | Weinstein Investor | RCWE / SCREEN_STATS | 1,2,6,7 | 3,4,5,8 | 456 / 0 / 0 | ALL13 (#1235, Draft) |
| C05 | Weinstein Trader | RCWE / SCREEN_STATS | 1,2,6,7 | 3,4,5,8 | 392 / 0 / 0 | ALL13 |
| C06 | Minervini SEPA | RCWE / SCREEN_STATS | 2,6,7 | 1,3,4,5,8 | 659 / 0 / 0 | ALL13 |
| C07 | Minervini Power Play | RCWE / SCREEN_STATS | 2,4,6,7 | 1,3,5,8 | 21 / 1 / 9 | ALL13 |
| C08 | Kullamägi Breakout | RCWE / SCREEN_STATS | 1,2,4,6,7 | 3,5,8 | 12 / 0 / 7 | TOP5 (#1196) |
| C09 | Kullamägi Episodic Pivot | VALIDATION_BLOCKED | – | 1–8 | 20 / 0 / 0 | ALL13 |
| C10 | Kullamägi Parabolic Short | VALIDATION_BLOCKED | 1 | 2–8 | 7 / 0 / 0 | ALL13 |
| C11 | Pocket Pivot | SOURCE_BLOCKED / SCREEN_STATS | 4,6,7 | 1,2,3,5,8 | 8 / 431 / 0 | ALL13 |
| C12 | Buyable Gap-Up | RCWE / SCREEN_STATS | 2,4,6,7 | 1,3,5,8 | 210 / 36 / 61 | TOP5 (#1196) |
| C13 | Holy Grail | SOURCE_BLOCKED | 4,6,7 | 1,2,3,5,8 | 40 / 152 / 0 | ALL13 |

RCWE = `RESEARCH_COMPLETE_WITH_EXCEPTIONS`. Die Spalte „CC erfüllt“ ist der Stand der Matrix vom 30.10. Seitdem hat keine Arbeit ein CC-Kriterium geschlossen. Die Vorbereitung prüft Regeltreue (Code gegen Quelle) und sagt nichts über Rendite oder Robustheit.

**Unveränderte Handelsparameter.** In Supertrader 9 wurde keine Handelsregel, kein Parameter, keine Engine und keine Registrierung geändert. Prüfbar ist das so:
- über die gepinnten Pläne (TOP5 1.1.1, `PINNED_PLAN_CONTENT_SHA256` in `cert-prep-top5.mjs`) und die Pins der Engine-Versionen;
- über die 24 registrierten Referenz-Hashes der historischen Studie (`verifyRegisteredReferences`).

---

## 3. Kandidatenpipeline, Veröffentlichungsvertrag, Aktivierung

### 3.1 Pipeline
- **Eine** Pipeline: `.github/workflows/supertrader-sf8-candidates.yml` mit Erzeuger `scripts/supertrader/source-faithful/product/`. Eine zweite gibt es nicht.
- **Wege:**
  - `mode=manual` (Dispatch, optional `commit=true` mit `expected_sha256`);
  - `mode=auto` (nur `main`). Angestoßen wird er aus `supertrader-signals.yml` nach der Nachtkette (Di–Sa 06:17 UTC); der Rückfall-Zeitplan ist `43 11 * * 2-6`.
- **Eingangsprüfung** (`input-gate.mjs`): Materialisierung und Stamm müssen aktuell sein, sonst Exit 3.
- **Datenqualität** DQ-SF8-1..8 (`core/data-quality.js`).

### 3.2 Veröffentlichungsvertrag `sf8-auto-publication-1.0.0`

C1–C7 stehen in [SUPERTRADER_9_DAILY_OPERATIONS.md](SUPERTRADER_9_DAILY_OPERATIONS.md#veröffentlichungsvertrag-sf8-auto-publication-100) (`publication-contract.mjs`, Tests SF9-PUB-1…7). Mögliche Ergebnisse:
- `PUBLISH` (genau ein Commit mit Trailern `SF8-*`);
- `SKIP_SAME_SESSION` (kein Commit, grün);
- `BLOCKED` (kein Commit).

Fail closed: Ein älterer Stand ersetzt nie einen neueren. Es gibt keine Hochstufung und nach einer Modelländerung keine automatische Veröffentlichung.

### 3.3 Aktivierungsvariablen (Repository-Variablen, nur der Owner setzt sie)

| Variable | Stand | Beleg |
|---|---|---|
| `SF8_CANDIDATES_ENABLED` | `true` (am 01.11. 13:20 UTC wirksam) | Lauf B 41310744985 hat committet. Der Job läuft nur, wenn `vars.SF8_CANDIDATES_ENABLED == 'true'` (Workflow Z. 56) |
| `SF8_AUTO_PUBLISH` | **nicht gesetzt** | Zeitplanlauf 41219160911 (31.10.): Jobs `skipped` |

**Aktivierungsweg (a)** (Owner-Entscheidung vom 01.11., [OWNER_APPROVALS §15](SUPERTRADER_9_OWNER_APPROVALS.md#15-owner-entscheidung-01112026-aktivierungsweg-a-für-sf8_auto_publish)):
- **Nachweis 1:** S1–S6 mit echten Lauf-IDs, Security Master 1.3.0 gültig, Registry ohne `activation`, Eingangsprüfung CURRENT. Erst dann `SF8_AUTO_PUBLISH=true`.
- **Nachweis 2:** S7 wird nach dem ersten erfolgreichen automatischen Lauf getrennt geprüft.
- S1–S7 und DQ-Regeln bleiben unverändert, nichts wird gelockert.

---

## 4. V1-Stabilitätskriterien S1–S7 (Definitionen unverändert)

Definitionen: `docs/SUPERTRADER_8_ACTIVATION_READINESS.md`. Nur echte Läufe zählen.

| | Stand 02.11.2026 | Letzte geprüfte Läufe | Nächster Messpunkt |
|---|---|---|---|
| S1 (5 geplante Nachtläufe grün) | **3/5** | 40803128385 (29.10.), 40989532165 (30.10.), 41156681821 (31.10.) | Nachtläufe Mo 02.11. 22:30 und Di 03.11. 22:30 UTC (`30 22 * * 1-5`) |
| S2 (kein Heil-Dispatch) | bisher erfüllt | letzter Heil-Dispatch 40459929703 (27.10.), also davor | mit S1 |
| S3 | erfüllt | – | – |
| S4 | **erfüllt** (31.10.) | 41192838845, 41207577526; DQ-PX-4 danach 0 | – |
| S5 (2 SEC-Montagsläufe grün) | **1/2** | 40339879235 (26.10., grün) | Montagslauf 02.11. (Zeitplan, bisher ~14:30 UTC) |
| S6 (Security Master gültig) | **nicht erfüllt** | Stamm vom 11.09. | Quant H1 (#1240), Frist Laufdatum 10.11. |
| S7 (Datenqualität ohne ERROR) | **nicht erfüllt**, kein Nachweis vorweggenommen | wird nach dem ersten automatischen Lauf gemessen | Nachweis 2, §3.3 |

Lokal auf `main` 659df6c sind DQ-TW-1..8 und DQ-SF8-1..7 PASS. Für S7 zählt das nicht, denn es ist kein automatischer Lauf.

---

## 5. Kandidatenzahl, Datenstand, DQ-Nachweise

- **Veröffentlicht:** `supertrader/data/sf-candidates/`, Stand **2026-10-30**, Commit `b7c4e9e` (01.11.):
  - Lauf A 41310414650 ohne Commit, Lauf B 41310744985 mit Commit;
  - Fingerabdruck `bf75eb0903982b0819eaf9b7e61bbfa22b7d05735677371b26a6b9d69a175f80`;
  - `summary.inputs.inputsSha256` `d1b078f2…3599`.
- **Zahlen:** 3.368 Kandidaten, davon 2.103 CHART, 1.188 CONFIRMED und 77 MODELED. `validatedTradeSignal` 0, `rejectedRecords` 0.
- **Titel:** 5.102 Titel, davon 2.943 PASS, 2.037 CAP und 122 FAIL.
- **FAIL-Gründe:** SESSIONS 103, FRESHNESS 12, PRICE_PARITY 12, IDENTITY_ACTIVE 7.
- **DQ-SF8-1..8 PASS** in Lauf A und Lauf B (DQ-SF8-8 0/3.368). Lokal auf `main` 659df6c PASS:
  - DQ-SF8-1..7 (DQ-SF8-8 nicht separat ausgewertet);
  - DQ-TW-1..8 (DQ-TW-3 0/5.661).
- Der Stand veraltet mit jeder Sitzung, solange `SF8_AUTO_PUBLISH` nicht gesetzt ist. Dann wird DQ-SF8-8 wieder rot. Das ist erwartet und keine Regelabweichung ([DAILY_OPERATIONS](SUPERTRADER_9_DAILY_OPERATIONS.md), „Bekannte Folge“).

---

## 6. Historische Backtest-Infrastruktur und V13-Archiv

**Auf `main` (#1189, #1190):** `research/st9-hist-universe.mjs` und `research/st9-hist-execution.mjs` mit:
- Point-in-Time-Universum (`membersAt`, `assertPointInTime` fail closed);
- Dubletten je `securityId` über `core/identity.js`;
- Delisting-Ausgänge mit Zensierung und Abdeckung je Jahr;
- Ausführungsaudit: Stop bei Gap zur Eröffnung, verpasste Minervini-Stops;
- A/B-Diff, Neu-Hash der 24 registrierten Dateien, Eingabe-Fingerabdruck einschließlich sec-pit (fehlt sie, Exit 3).

Details: [SUPERTRADER_9_HISTORICAL_BACKTEST_INFRASTRUCTURE.md](SUPERTRADER_9_HISTORICAL_BACKTEST_INFRASTRUCTURE.md), Studie: [SUPERTRADER_9_V13_DELISTED_REUSE.md](SUPERTRADER_9_V13_DELISTED_REUSE.md), Registrierung `st9-v13-delisted-registration-1.0.0.json` (eingefroren).

**Es gibt keinen Lauf auf echten Daten und kein Ergebnis.** Alle Tests sind synthetisch.

**V13-Archiv** (privat, R2; Einzelheiten in [QUANT_FINAL_HANDOVER §F](quant/QUANT_FINAL_HANDOVER.md)):

| Generation | Stand | Verwendung |
|---|---|---|
| 1.2.0 | Präfix `research-snapshots/quant-v13/archive-1.2.0/`, Runner-Restore 41073334070 | wird gelesen, auch von #1234 |
| 2.0.0 | neu erzeugt, Hex-Schlüssel, unabhängige Wiederherstellung 41399476800 | #1241, Draft |

- Bei 1.2.0 kürzte die alte Schlüsselerzeugung den Teil `v13-raw` auf 18 Byte. Er ist trotzdem lesbar.
- Der private Schlüssel liegt **nur** im Actions-Secret `V13_ARCHIVE_PRIVATE_KEY`. Das Secret nicht überschreiben und keinen neuen Schlüssel erzeugen.
- V13-Ergebnisse sind intern. Entschlüsselte Reihen und vollständige private Kursreihen gehören nicht ins Repository.

**Voraussetzungen für einen echten Studienlauf:**
- #1234 mit Owner-Freigabe und Auslösung durch den Owner;
- Secrets `VU_HISTORY_S3_ENDPOINT`, `VU_HISTORY_S3_BUCKET`, `VU_HISTORY_S3_ACCESS_KEY_ID`, `VU_HISTORY_S3_SECRET_ACCESS_KEY` und `V13_ARCHIVE_PRIVATE_KEY`;
- sec-pit r12 im Snapshot-Speicher;
- Archivgeneration festgelegt;
- ändert sich eine der 24 registrierten Dateien (etwa `core/identity.js`), ist eine neue Registrierung nötig.

---

## 7. Zertifizierungsvorbereitung und verbleibende fachliche Blocker

- **TOP5 (#1196, auf `main`):**
  - Prüfplan `CERT-PREP-TOP5-PLAN.json` 1.1.1, Prüfer `cert-prep-top5.mjs` (`sf9-cert-prep-check-1.1.1`), Tests `sf-cert-prep-top5.test.mjs` 33/33.
  - Regeltreue auf dem PR-Head: C02 17/17, C01 14/14, C08 15/15, C12 14/14, C03 16/16. **Der Nachweis auf dem Referenz-Commit steht noch aus.**
  - Auslegungsbefunde: F-TUR-ADD-UNIT-N, F-KK-ADR-DENOMINATOR, F-DAR-SAME-BAR-ORDER, F-DAR-Q7-READING.
  - **Nachtrag Plan 1.1.2 (02.11.2026):** Die vier Befunde stehen als Text im Vertrag. Owner-Fragen offen: FP-KK-ADR-DENOMINATOR-STATUS (`KK-SF-BO-STOP` bleibt bis dahin `SOURCE_EXACT`) und FP-DAR-Q7-READING. X-LEDGER und C12-LEDGER sind erledigt: `source-ledger.json` führt die acht Quellen, nicht belegte Felder sind gekennzeichnet. Code-Fingerabdrücke und Golden-Case-Ergebnisse unverändert; Details in [SUPERTRADER_9_CERTIFICATION_PREP_TOP5.md](SUPERTRADER_9_CERTIFICATION_PREP_TOP5.md) §3.1.
  - Die Abhängigkeit vom Dokument aus #1148 ist an dessen SHA-256 gebunden. Liegt die Datei unverändert auf `main`, meldet der Prüfer `PRESENT_MATCHING_PR_1148`.
- **ALL13 (#1235, Draft):** die übrigen acht Methoden.
  - 26 CP-Tests; 41 von 41 Gegenproben werden rot.
  - Befunde F-MIN-WORDING-UNCHECKED, F-WEIN-TRAIL-AT-OR-ABOVE, F-WEIN-MA-GATE-EQUALITY, F-PP-STOP-STATUS-SPLIT.
  - Nachzug nötig, siehe §0, Priorität 2.
- **Blockerklassen:**
  - (a) lösbar, im Repository;
  - (b) Security Master;
  - (c) V13 bzw. Survivorship;
  - (d) Owner oder Quelle.
- **Querschnittsblocker** (Readiness-Matrix, Abschnitt „Querschnittsblocker“):
  - CC-5: Corporate Actions, siehe §7.1.
  - CC-8: Paper 2027. SF6-PAPER-2027 1.1.0 ist vorbereitet, aber nicht aktiv.
  - Survivorship vor 2009.
  - PIT-Stammdaten im Produktlauf.
  - PIT-Branchen- und Korrelationsgruppen (CC-4 für C01, C02, C04, C05).
  - Übersetzte oder Sekundärquellen (CC-1).
  - Ermessensregeln (CC-3).
  - Lizenzdaten: IBD-RS, NYSE-Breite, SIP-Minuten, Borrow.

### 7.1 Die 83 Corporate-Action-Quarantänefälle

- 83 referenzexponierte DQ-K5-Sitzungen, dedupliziert über alle Referenzen.
- Die EDGAR-Regelsätze 1.4.0–1.4.3 mit Exhibits bestätigen **keine** als Split; belegt sind nur 2 echte Bewegungen (DQ-K3). Der Tiingo-Splits-Endpunkt antwortet mit HTTP 403.
- **Regel E1:** Die Quarantäne zählt nie; sie wird nicht umgangen. Die Fälle bleiben gesperrt, bis eine lizenzierte, faktortragende CA-Quelle die Abnahme besteht:
  - mindestens 90 % Event-Treffer;
  - mindestens 95 % exakte Ratio;
  - 0 Falsch-Positive;
  - mindestens 85 % Abdeckung 2008–2017.
- Danach braucht es einen Daten-PR, Snapshot-Generation 3 und Neuläufe gegen dieselben Referenz-Hashes.
- Belege: `SUPERTRADER_6_V4D1_CONTAINMENT.md`, `SUPERTRADER_7_EDGAR_CA_CHECK.md`, `SUPERTRADER_7_EDGAR_EXHIBITS_1_4_2.md`, `SUPERTRADER_7_TIINGO_SPLITS_PROBE.md`, `SUPERTRADER_7_OWNER_DECISIONS_E7.md`.

---

## 8. Offene PRs

### 8.1 Supertrader 9, nicht freigegeben

| PR | Branch | Inhalt | Abhängigkeiten vor einem Merge |
|---|---|---|---|
| #1233 | `…-hist-turtle-stops` | unabhängige Prüfung der Turtle-Einheitsstopps (`st9-hist-execution` 1.1.0) | #1190 ist auf `main`. Vor dem Merge main einmergen, Gate A und volle Suite prüfen, Owner-Freigabe |
| #1234 | `…-hist-v13-workflow` | Workflow `supertrader-st9-v13-study.yml`: nur manuell, Ergebnisse verschlüsselt, Hex-Datenschlüssel | #1189 und #1190 auf `main`. Liest Archiv 1.2.0, nach #1241 auf 2.0.0 umstellen. Owner muss Secrets bestätigen und auslösen. ADR-005 prüfen |
| #1235 | `…-cert-prep-rest` | Zertifizierungsvorbereitung ALL13 (Head `d798215`) | Konflikt in `cert-prep-top5.mjs` lösen, `token` → `sourcePhrase` im ALL13-Plan, neuer Pin, Review, Owner-Freigabe |

### 8.2 Überholte Supertrader-Drafts (nicht mergen, Schließen nur durch Owner)

| PR | Branch | Inhalt |
|---|---|---|
| #1142 | `…-v13-study` | V13-Studie, übernommen in #1189 |
| #1141 | `…-content-hash` | Security-Master-Fingerabdruck, Quant-Bereich, nicht weiterverfolgt |
| #1156 | `…-sec-alarm` | SEC-Consumer-Alarm, außerhalb Gate A |
| #1099 | `supertrader-8-…-v1-status` | V1-Stand vom 29.10., abgelöst durch §4 dieses Dokuments |

Vor einem Schließen bitte im PR prüfen, ob dort noch etwas gebraucht wird.

---

## 9. Produktübergreifende CI- und Browser-QA-Fehler (bekannt, nicht Supertrader)

| Befund | Seit | Zuständig | Wirkung |
|---|---|---|---|
| **Discover Frontend Quality Gates rot** (`discover-frontend-ci.yml`) | 30.10. 17:14 (letzter grüner Lauf 41020282982, 30.10. 07:28) | Discover/Quant-Sitzung (Befund übergeben am 02.11.) | betrifft nur PRs mit Discover-Pfaden |

Zum Discover-Befund:
- Die Direktroute `rheinmetall` (`/discover/#/s/EUROPE/ref_RHM_DE_XETR`) zeigt „Europa noch nicht verfügbar“ (`discover/ui/europe.js`), erwartet ist eine Rheinmetall-Seite. Zusätzlich fehlt in WebKit der Zeitraumtext im Chart (`390-dark-webkit chart range updates evidence`).
- Letzter main-Lauf: 41398352081 auf `08edec9`.
- Zu klären ist, ob die Europa-Sperre beabsichtigt und die QA-Erwartung damit veraltet ist, oder ob ein Datenfehler vorliegt.

**Sonst auf `main` 659df6c lokal grün, jeweils ohne Fehler:**

| Suite | Tests |
|---|---|
| Quant | 3.857 |
| Core | 308 |
| Discover | 581 |
| Technical | 61 |
| Supertrader | 1.014 |
| Screener | 46 |
| SF9-E2E | 11 |

Dazu Python-Quant OK und Testisolation sauber. In der CI waren Quant CI, Core, Technical-World und der Security-Master-Probelauf zuletzt grün. Gates und Pages liefen zur letzten Abfrage noch auf `3fe4fe4`.

**Bekanntes Fenster:** Zwischen dem Refresh-Commit der Nachtkette und dem Kandidaten-Commit ist DQ-SF8-8 rot, solange `SF8_AUTO_PUBLISH` nicht gesetzt ist. Das betrifft auch den Core-Zustandstest.

---

## 10. Schutzregeln und Freigabegrenzen (gelten unverändert weiter)

- **Kein Merge ohne ausdrückliche Owner-Freigabe.** Kein eigenständiger Merge bei neuen echten Blocking- oder Major-Befunden.
- **Gates werden nicht abgeschwächt:**
  - Gate A;
  - Schlüsselsuche;
  - DQ-SF8-1..8;
  - Veröffentlichungsvertrag C1–C7;
  - Eingangsprüfung;
  - Pins der Prüfpläne und der Studienregistrierung.
- **Keine Abschaltung der Datenqualität**, keine zweite Kandidatenpipeline, kein eigenständiger produktiver Daten-Refresh, der die Stabilitätskriterien umgeht.
- **Keine rückwirkende Parameteroptimierung** und keine Änderung an Handelsregeln, Engines oder Registrierungen nebenbei. Fachmodelle ändern sich nur in einem eigenen PR mit Vorher/Nachher (CLAUDE.md).
- **Keine Hochstufung** auf `VALIDATED_TRADE_SIGNAL` ohne vollständige Prüfung. Keine vorzeitige Zertifizierung.
- **Keine Live-Orders**, keine Broker-Aktionen, keine produktiven Migrationen ohne Freigabe.
- **Keine erfundenen historischen Ergebnisse.** Nur echte Lauf-IDs zählen als Nachweis.
- **Die 83 Quarantänefälle nicht umgehen** (E1).
- **Keine kostenpflichtigen Abrufe** ohne Freigabe.
- **Keine Schlüssel und Secrets im Repository oder in Logs.** Keine vollständigen privaten Kursreihen und keine entschlüsselten V13-Artefakte öffentlich. V13-Ergebnisse sind intern.
- **Security Master 1.3.0 gehört der Quant-Seite.** Keine konkurrierenden Änderungen.
- **Generierte Daten** (`supertrader/data`, `quant/data` …) nur über ihren Erzeuger.

---

## 11. Quellenverzeichnis

| Thema | Datei |
|---|---|
| Betrieb, Owner-Entscheidungen, Verlauf §1–§19 | [SUPERTRADER_9_OWNER_APPROVALS.md](SUPERTRADER_9_OWNER_APPROVALS.md) |
| Tageslauf, Vertrag, Inbetriebnahme | [SUPERTRADER_9_DAILY_OPERATIONS.md](SUPERTRADER_9_DAILY_OPERATIONS.md) |
| 13 Methoden, CC-1–CC-8, Blocker (gepinnt) | [SUPERTRADER_9_CERTIFICATION_READINESS.md](SUPERTRADER_9_CERTIFICATION_READINESS.md) |
| TOP5-Vorbereitung | [SUPERTRADER_9_CERTIFICATION_PREP_TOP5.md](SUPERTRADER_9_CERTIFICATION_PREP_TOP5.md) |
| Historische Infrastruktur | [SUPERTRADER_9_HISTORICAL_BACKTEST_INFRASTRUCTURE.md](SUPERTRADER_9_HISTORICAL_BACKTEST_INFRASTRUCTURE.md) |
| V13-Delisting-Vergleichsstudie | [SUPERTRADER_9_V13_DELISTED_REUSE.md](SUPERTRADER_9_V13_DELISTED_REUSE.md) |
| V1-Stand 30.10. (historisch) | [SUPERTRADER_9_V1_STATUS_20261030.md](SUPERTRADER_9_V1_STATUS_20261030.md) |
| Übergabe an Quant 30.10. (historisch) | [SUPERTRADER_9_QUANT_UEBERGABE_20261030.md](SUPERTRADER_9_QUANT_UEBERGABE_20261030.md) |
| V1-Kriterien (Definition) | [SUPERTRADER_8_ACTIVATION_READINESS.md](SUPERTRADER_8_ACTIVATION_READINESS.md) |
| Erste Veröffentlichung, Rückweg | [SUPERTRADER_8_FIRST_RELEASE.md](SUPERTRADER_8_FIRST_RELEASE.md) |
| Paper-Protokoll 2027 | [SUPERTRADER_6_PAPER_VALIDATION_PROTOCOL_2027.md](SUPERTRADER_6_PAPER_VALIDATION_PROTOCOL_2027.md) |
| Quant: Security Master, V13-Archiv | [quant/QUANT_FINAL_HANDOVER.md](quant/QUANT_FINAL_HANDOVER.md) |
