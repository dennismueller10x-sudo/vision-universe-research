# Vision Universe – Gesamtfortschritt

Stand **03.11.2026, 19:30 UTC**, `main` @ `406bb76`. Dies ist eine Zusammenstellung aus vorhandenen Quellen, keine neue Analyse. Bei Widerspruch gilt die verlinkte Fachquelle. Bitte nach jedem Merge, jeder Freigabe und jedem Lauftag nachziehen.

**Quellen:**
- [VISION_UNIVERSE_ARCHITECTURE.md](VISION_UNIVERSE_ARCHITECTURE.md) und [MASTER_COMPLETION_3_0.md](MASTER_COMPLETION_3_0.md): Merge-Liste, Matrix, E1–E18.
- [quant/QUANT_FINAL_HANDOVER.md](quant/QUANT_FINAL_HANDOVER.md) und [SUPERTRADER_9_HANDOVER.md](SUPERTRADER_9_HANDOVER.md).
- [technical/TECHNICAL_COMPLETION_PLAN.md](technical/TECHNICAL_COMPLETION_PLAN.md) und [technical/TECHNICAL_WORLD_PROGRESS.md](technical/TECHNICAL_WORLD_PROGRESS.md).
- [FUNDAMENTAL_HANDOFF.md](FUNDAMENTAL_HANDOFF.md).
- [accounts/PRODUKTIONSPLAN.md](accounts/PRODUKTIONSPLAN.md), [accounts/NUTZERFUEHRUNG.md](accounts/NUTZERFUEHRUNG.md), [accounts/WATCHLIST.md](accounts/WATCHLIST.md), [accounts/FREIGABEN.md](accounts/FREIGABEN.md) und [accounts/RECHTLICHE_ABNAHME.md](accounts/RECHTLICHE_ABNAHME.md).
- [mobile/PHASE2_REPORT.md](mobile/PHASE2_REPORT.md) und [mobile/TESTFLIGHT_PLAN.md](mobile/TESTFLIGHT_PLAN.md).
- `node scripts/core/system-health.mjs` (03.11., 19:30 UTC) und die offenen PRs auf GitHub (03.11., 19:30 UTC).

**Kategorien:**
- **Live:** auf `main` und veröffentlicht, geprüft.
- **Offener PR:** implementiert, aber nicht integriert.
- **Aus:** gemergt, aber ausgeschaltet oder wartet auf eine Owner-Freigabe.
- **Fehlt:** laut Plan oder Übergabe tatsächlich noch offen.
- **Blockade:** produktrelevant, mit dem Entscheider.

**Systemzustand am 03.11.:**
- STALE:
  - `eligibility.json` (seit 20.10., 1.190 h alt);
  - News (seit 13.10.).
- DEGRADED:
  - US-Wertpapierstamm (11.09.);
  - Company Master und Fundamentals (SEC), beide mit Stand 01.11. Der SEC-Tageslauf ist am 02.11. und am 03.11. im Schritt „Größenkontrolle“ gescheitert (Läufe 41474158720 und 41650347339);
  - Supertrader-Kandidaten (eine Sitzung zurück);
  - Markets.
- Alle anderen Datenarten sind OK. Darunter Europe Discover mit 449 Titeln, Stand 03.11.

---

## 1. Quant – zentrales Investment-Intelligence-Produkt

| Kategorie | Stand |
|---|---|
| **Live** | `/quant/`: Radar, Faktor-Screener, Strategieprofile, Aktienseite (Faktoren, Technical, Setup-Karte, Muster, Chart, Evidenz), SEC-Zahlen, Methodik, Vergleich, Chartlagen. `#/backtest` zeigt den Stand je Art **ohne Ergebniszahl**. Die Oberfläche ist byte-gesperrt (UI-Sperre, #1236). Heute gemergt: #1279 (Identitätshinweise) und #1296 (M11-Tests). Quant-Daten OK (06:00 UTC). |
| **Offener PR** | #1265 Setup-OOS A1–A6 (A4 je Ereignisart, FV-6) · #1259 Musterstudie mit Gesamtrendite (FV-5, Schritt 2) · #1241 V13-Archiv Generation 2.0.0 · #1242 iPhone-Layout der Vorschau · #1119 132 SEC-Statuskorrekturen (bis nach 1.3.0 zurückgestellt) · #1141 Inhalts-Fingerabdruck · historische Drafts #758, #737, #721, #763 |
| **Aus** | Interne Backtest-Vorschau, 21 Auswahlen (`VU_BACKTEST_REVIEW_ENABLED=false`, Rolle `backtest_reviewer` 0, Aktivierung über #1227). Research-Adapter und Vorschau-Dienst `DISABLED`. Ergebniszahlen auf `#/backtest` gesperrt (`CERTIFIED_KINDS=[]`). Security Master 1.3.0: Freigabepaket gemergt (#1240), Lauftag offen. |
| **Fehlt** | **0/6 Backtest-Arten zertifiziert.** Setup, Strategie und Faktor brauchen Historie: frühestens 2028-04 bzw. 2028-08. Öffentliche Backtest-Integration in `#/backtest` (H4: Praxistest, UI-Revision). Delistete Titel in finanzierten Läufen (D4, D5, D7). Kein Rechnen auf Abruf. Läufe mit Secrets R1–R3 (FV-4, Survivorship, Gesamtrendite). Katalog-Generation 2 gegen 1.3.0 (H7). |
| **Blockade** | Lauftag Security Master 1.3.0 (Owner, E1, §7) · OOS-Schnitt #1265 (Owner) · #1259 Pattern-Research 1.2.0 (Owner, E15) · Bereich auf der Quant-Aktienseite, UI-Sperre (Owner) · Praxistest der Vorschau (Owner, G/H2) · Archiv 2.0.0 und Löschung von 1.2.0 (Owner, H3) · `eligibility.json`-Neubau, 439 Änderungen (Owner, E11, nach 1.3.0) |

## 2. Supertrader – 13 Methoden

| Kategorie | Stand |
|---|---|
| **Live** | `/supertrader/` mit Research-Kandidaten: Stand 30.10., 3.368 Kandidaten, DQ-SF8 PASS, `validatedTradeSignal` 0. Kandidaten-Tageslauf mit Veröffentlichungsvertrag C1–C7 (`SF8_CANDIDATES_ENABLED=true`). Historische Backtest-Infrastruktur auf `main` (#1189, #1190), ebenso Turtle-Einheitsstopps (#1233), V13-Studien-Workflow (#1234), ALL13-Vorbereitung (#1235) und Evidenzmatrix 1.2.0 (#1247). Zählung: BELEGT 23, TEILWEISE 58, OFFEN 0, BLOCKIERT 49. |
| **Offener PR** | C09 Füllminute #1262 (Fachmodell) und #1263 (Engpasszähler): warten auf die Merge-Entscheidung · #1267 PIT-Branchengruppen (SIC, FF49) · Paper 2027: #1268, #1270, #1272, #1273 (R6 erst nach #1262/#1263) · #1277 „Technischer Zustand“ auf der Aktienseite (braucht #1276) · #1278 Production Smoke (in Arbeit) · #1298 CI-Checkout Gate A (in Arbeit) · überholte Drafts #1142, #1099 und ältere (Schließen nur durch Owner) |
| **Aus** | `SF8_AUTO_PUBLISH` nicht gesetzt. Folge: ab 05.11. ist DQ-SF8-1 rot. SF6-PAPER-2027 vorbereitet, Schalter AUS. |
| **Fehlt** | **Keine der 13 Methoden ist zertifiziert, validiert oder produktreif.** V1: S1 3/5, S5 1/2, S6 erst nach 1.3.0, S7 erst nach dem ersten automatischen Lauf. Formaler Regeltreue-Nachweis auf dem Referenz-Commit. C09 und C10 sind VALIDATION_BLOCKED (SIP-Minuten, Borrow-Historie), C11 und C13 SOURCE_BLOCKED. |
| **Blockade** | Owner: #1262/#1263 (E18) · #1267 Gruppen (E7-5, FF49) · #1268 E-P1..3 · R6/ST9 Registrierungs-Nachtrag 1.0.1 · `st-labels.js` · `SF8_AUTO_PUBLISH` (E2, Nachweis 1 nach 1.3.0) · FP-ST-01..10, davon **FP-ST-02 vor dem 01.01.2027** · Lesarten PS-C01/C03/C08/C12. Lizenz: CA-Quelle (CC-5). Laufzeit und Secrets: V13-Lauf (E12). |

## 3. Technical – Analyse- und Strategieplattform

| Kategorie | Stand |
|---|---|
| **Live** | `/technical/`: Screener mit 5.663 Titeln, Chart Studio `#/chart/<T>`, 13 Strategie-Vorlagen mit Checkliste, Analyse-Assistent mit 8 Zielen (#1245, #1251), Kurssprung-Kennzeichnung und GIBO-Bereinigung (K1, K2), Wochen- und Monatsfelder. Der Nachtlauf committet selbst, DQ-TW-1..8 PASS. Kein P0/P1-Kriterium der Completion-Matrix ist offen. `/screener/` übernimmt 16 Technical-Spalten. |
| **Offener PR** | #1275 (Chart Studio zeigt den Quant- und Supertrader-Stand derselben Aktie) · #1276 (Stand je Aktie als Scherben `technical/data/stock`, Basis für #1277) · #1192 (Abschlussbericht, nur Doku) |
| **Aus** | KI-Suche (F5): vorbereitet, der Modellaufruf über `workers/vu-ask` kostet Geld, zurückgestellt. S4 (historische Vorlagentests): RESEARCH_LIMITED, nicht im Produkt. |
| **Fehlt** | Eine gemeinsame Abfrage-Engine für `/technical/` und `/screener/` (WORLD_PROGRESS §6, Nr. 6). K3: Live-Messung der mobilen Performance nach dem Deploy. AP4 und weitere W/M-Felder (Fachmodell). AP6: Evidenz im Produkt. L4: Owner liest die Assistenten-Texte vor einer Hervorhebung außerhalb von Technical. |
| **Blockade** | Wochenchart E4/D5: Lizenz für Wochen-OHLC (Owner, zurückgestellt). KI-Suche (Owner, Kosten). 82 Titel mit beendeter Reihe (Marktdaten, entschieden: kein Abruf). Strategie-Akademie A-1..A-4 (Owner, E9). |

## 4. Discover und Fundamental – Research-Produkte

| Kategorie | Stand |
|---|---|
| **Live** | `/discover/`: US-Universum mit 6.094 Datensätzen, Im Blick (Intraday), Themen, Aktienseite. **Europa live seit 03.11.** mit 435 von 449 Titeln, 14 je Aktie als gesperrt gekennzeichnet (#1281, #1283, #1288, #1290). Discover Frontend Quality Gates auf `main` wieder grün (Lauf 41674582417). Marketstack-Diagnose (#1287). `/fundamental/`: SEC-Kennzahlen und -Historie, Consumer Layer 5.054/6.686, Querverweis zu Quant `#/aktie/<T>/zahlen`. |
| **Offener PR** | #1285 Europa-Abdeckung und Lückencluster · #1294 Offline-Identitätsprüfung XPAR (Paris) · #1295 Anbieter- und Lizenzprüfung Europa-Historie · #1297 Lückenbericht und Support-Anfrage · #778 Visual First VU3 · SEC-Kern (blockiert, nicht mergen): #481, #504, #505, #510 |
| **Aus** | Company Intelligence ist DISABLED. Europa-Tagesaktualisierung: vorbereitet, nicht freigegeben. |
| **Fehlt** | Fundamental: 48 ältere SEC-Meldungen, Quartale für 20-F/40-F, Segmentdaten, Restatements nur `as_of_latest`. Zwei überholte Aussagen in FUNDAMENTAL.md, Abschnitt „Grenzen“. **SEC-Tageslauf seit 02.11. rot (Größenkontrolle), Fundamentals DEGRADED.** Europa: Historie für 14 Titel; RS ohne verifizierten europäischen Vergleichsindex. |
| **Blockade** | Europa-Tagesaktualisierung (Owner): ohne sie **ist Europa ab etwa 07.11. veraltet**. Anbieterfrage für die Europa-Historie (Owner, #1295). `eligibility.json` (Owner, nach 1.3.0). |

## 5. Verknüpfung der Produktwelten

| Kategorie | Stand |
|---|---|
| **Live** | Gemeinsamer Kern: `core/identity.js`, eine Preiswahrheit, `core/registry/domains.json`, `/status/` und `/status/#/<T>`. `/screener/` liest Technical-Spalten aus einer Quelle. Die Quant-Aktienseite zeigt Technical-Signale und verlinkt Discover. Fundamental verlinkt Quant. Supertrader verlinkt die Quant-Aktie. Die Watchlist bündelt Quant, Technical und Supertrader, ohne Gesamtscore (`core/watchlist-view.js`). `/mein-dashboard/` bietet einen Schnellzugriff auf alle Welten. |
| **Offener PR** | #1275 (Technical ← Quant/Supertrader) · #1276 + #1277 (Supertrader ← Technical, Gate A getrennt) |
| **Aus** | Watchlist-Ereignisse (`core/watchlist-view.js#events`): vorbereitet, keine Zustellung. |
| **Fehlt** | Die Discover-Aktienseite (`discover/detail.js`) führt in keine andere Welt; geprüft am 03.11. per Suche nach Quant-, Technical- und Supertrader-Links. Gemeinsame Abfrage-Engine Screener/Technical. Technical-Befunde auf den Supertrader-Seiten (in #1277). |
| **Blockade** | Bereich auf der Quant-Aktienseite (UI-Sperre, Owner). `st-labels.js` (Owner). |

## 6. Konto, Dashboard, Watchlist, Abos, Mobile App – Kundenstart

| Kategorie | Stand |
|---|---|
| **Live** | Worker `vu-account` auf `konto.visionuniverse.de` (rollt automatisch aus). Supabase mit 12 Migrationen, RLS überall. Registrierung offen. Willkommensseite, `/mein-dashboard/`, `/konto/`, persönliche Watchlist und Tarifverwaltung `/konto/admin/tarife/` (ohne Rolle 401/403). Checkout `testers`: Pro 1,00 €, Stripe Tax aktiv. `/kuendigen` und `/widerrufen` öffentlich, Ausführung manuell. Brevo-Listen und DOI-Vorlage ok. Mobile App: Capacitor-Prototyp unter `app/` auf `main` (#1280), 36 Tests, aus der Pages-Auslieferung ausgeschlossen. |
| **Offener PR** | #1258 Konto-UX (Menüeintrag „Mein Dashboard“, Farbsprache, Willkommensseite) · #1301 Masterübergabe Mobile App · #1302 TestFlight-Workflow (**nicht mergen vor der Umgebung `app-testflight`**) · #1300 Healthcheck Chartbild · #630 Cookie-Banner · #631 und #624 Brevo |
| **Aus** | Rechtstexte im Entwurf (`legalApproved: false`). Newsletter und Kontaktabgleich aus. Kündigungen werden nicht automatisch ausgeführt. Watchlist-Benachrichtigungen „gespeichert, aber noch nicht aktiv“. Euro-Anzeige vorbereitet (`inEuro`). TestFlight-Vorlagen inaktiv. |
| **Fehlt** | **Noch kein echtes Zahlungsereignis** (Z1). Abschluss-PR mit `go-live-config.mjs --checkout=public`. Zustellung der Benachrichtigungen. App: Worker-Anmeldeschiene `/v1/auth/app/*` (eigener PR vorgeschlagen), Gerätetest, Etappe B (App-Modus im Hauptfenster), kein verifizierter Xcode-Build. |
| **Blockade** | Rechtliche Abnahme A1–A14 und B1 (Rechtsberatung). Fehlende Angaben R2 (Owner). Steuerbestätigung S1 (Steuerberatung). Stripe-Branding S2 und Klarna S3 (Owner). Testkauf Z1 (Owner). Endfreigabe `zahlungsfreigabe` (Owner). App: Apple Developer Program, Entwicklername, App-ID und Secrets in `app-testflight` (Owner). |

---

## 7. Zeitkritische Fristen

| Datum (UTC) | Was | Folge bei Versäumnis | Zuständig |
|---|---|---|---|
| **Do 05.11.2026** | Lauftag Security Master 1.3.0 (#1240, Schritte 1–8), Nachkontrolle 06:30 UTC | Ohne Lauf bleibt S6 offen, `SF8_AUTO_PUBLISH` bleibt unmöglich | Owner-Freigabe, Ausführung zentral |
| ab 05.11. | DQ-SF8-1 rot (Kandidaten `maxLag` 2), solange `SF8_AUTO_PUBLISH` fehlt | veraltete Supertrader-Kandidaten | Owner (E2) |
| **ab etwa 07.11.** | Discover Europa veraltet ohne Tagesaktualisierung | Europa-Seiten zeigen einen alten Stand | Owner-Freigabe (in Vorbereitung) |
| 10.11. | letzter zulässiger Lauftag des Stamms | – | – |
| **Mi 11.11., 11:43 UTC** | harte Grenze: Stamm STALE, `input-gate.mjs` beendet jeden Kandidatenlauf mit Exit 3 | Supertrader-Tageslauf steht | Quant H1 |
| nach 1.3.0 | `eligibility.json` neu bauen (E11, Vorher/Nachher), Katalog-Generation 2 (H7), #1119 | Universum bleibt auf dem Stand vom 15.09. | Owner |
| 26.11. | Firmennamen STALE (wird mit 1.3.0 gelöst) | – | Quant |
| **vor 01.01.2027** | Aktivierungs-PR SF6-PAPER-2027 (FP-ST-02, erste Sitzung 04.01.2027) | Paper-Test 2027 entfällt | Owner |
| vor etwa 26.03.2027 | Setup-OOS A1–A6 (FV-6, #1265) | Setup-Zertifizierung verschiebt sich | Owner |

## 8. Nächste Umsetzungsschritte (autonom möglich)

Keiner dieser Schritte braucht eine neue Owner-Freigabe für die Umsetzung, und keiner ändert ein Fachmodell, ein Gate oder ein generiertes Artefakt von Hand. Jeder Schritt ist ein eigener PR mit Merge nach Review. Bereits Umgesetztes oder als PR Offenes steht nicht in dieser Liste.

1. **SEC-Tageslauf wieder grün.**
   - Ursache des Abbruchs in der „Größenkontrolle“ am 02.11. und 03.11. finden und an der Quelle beheben. Die Kontrolle selbst wird nicht gelockert.
   - Danach prüfen, ob S5 (SEC-Montagslauf) davon betroffen ist.
   - Quelle: `system-health` 03.11. (Fundamentals und Company Master DEGRADED), Läufe 41474158720 und 41650347339, [SUPERTRADER_9_HANDOVER.md §4](SUPERTRADER_9_HANDOVER.md).
   - Dateien: `scripts/ci/pruefe-datengroesse.sh`, `.github/workflows/sec-fundamentals-daily.yml` (Schritte 17–18), Erzeuger unter `scripts/quant/` für `quant/data/sec` und `quant/data/fundamentals`.
2. **Discover-Aktienseite mit den anderen Welten verknüpfen.**
   - Block „Dieselbe Aktie in …“ mit Links zu Quant `#/aktie/<T>`, Technical `#/chart/<T>`, Fundamental und Supertrader. Ein Link erscheint nur, wenn die Welt den Titel führt. Die Kennung kommt über `core/identity.js`.
   - Quelle: Priorität 5; Lücke laut §5 dieses Dokuments; Vorbild ist der Querverweis in [FUNDAMENTAL_HANDOFF.md §3](FUNDAMENTAL_HANDOFF.md); „Company Pages“ in [VISION_UNIVERSE_ARCHITECTURE.md §1](VISION_UNIVERSE_ARCHITECTURE.md).
   - Dateien: `discover/detail.js`, `discover/detail.css`, `discover/tests/`.
   - Gates: nur Discover-Pfade; Frontend-Budget ≤ 180.000 Byte und ≤ 12 Requests.
3. **Gemeinsame Abfrage-Engine für `/technical/` und `/screener/`.**
   - Eine Engine statt zwei; die Treffer bleiben gleich (Universumstest Treffer alt = neu).
   - Quelle: [TECHNICAL_WORLD_PROGRESS.md §6, Nr. 6](technical/TECHNICAL_WORLD_PROGRESS.md).
   - Dateien: `screener/engine/query.js`, `screener/engine/fields.js`, `technical/engine/model.js`, `technical/app.js`, `screener/tests/`, `technical/tests/`.
4. **Anmeldeschiene der App im Worker.**
   - `POST /v1/auth/app/login|refresh|logout` mit denselben Limits wie das Web, Tokens im Antworttext, nur für Anfragen ohne Cookie und ohne Browser-Origin.
   - Die App-Schiene `authTransport: worker` ist schon implementiert und getestet. Der Standard bleibt `supabase`, bis der Gerätetest gelaufen ist.
   - Quelle: [mobile/PHASE2_REPORT.md §2](mobile/PHASE2_REPORT.md), [mobile/SECURITY_LOGIN.md](mobile/SECURITY_LOGIN.md).
   - Dateien: `workers/vu-account/src/` (Auth-Routen), `workers/vu-account/tests/unit.test.mjs`, `flows.test.mjs`, `app/www/js/`, `app/tests/`.
5. **Watchlist-Ereignisse als vorbereitete Datenart, ohne Zustellung.**
   - Ein Erzeuger mit `--out` vergleicht zwei veröffentlichte Übersichten über `core/watchlist-view.js#events`, mit idempotenter `eventId`.
   - Registry-Eintrag `PREPARED_DISABLED` wie bei #1273. Es gibt keine E-Mails und keinen Push.
   - Quelle: [accounts/WATCHLIST.md §7 und §9](accounts/WATCHLIST.md).
   - Dateien: `core/watchlist-view.js`, neu `scripts/account/build-watchlist-events.mjs`, `core/registry/domains.json`, `core/contracts/events.schema.json`, `core/tests/watchlist-view.test.mjs`.
6. **Mobile Performance von Technical live messen und senken.**
   - Live-Messung nach dem Deploy (K3) im iPhone-Viewport.
   - Danach die Datenpakete von Technical verkleinern; die Quant-UI bleibt dabei gesperrt.
   - Quelle: [TECHNICAL_COMPLETION_PLAN.md §1 K3](technical/TECHNICAL_COMPLETION_PLAN.md), [mobile/PERFORMANCE.md](mobile/PERFORMANCE.md), [mobile/UI_INTEGRATION.md](mobile/UI_INTEGRATION.md) (Risikotabelle).
   - Dateien: `app/scripts/measure-payload.mjs`, `scripts/technical/world/build-screener.mjs`, `technical/app.js`, `technical/tests/`.

**Nicht autonom** (wartet auf Owner, Recht, Lizenz oder Zeit):
- Lauftag 1.3.0;
- Europa-Tagesaktualisierung;
- `eligibility.json`;
- alle E- und FP-Entscheidungen;
- öffentlicher Checkout;
- TestFlight;
- Wochen-OHLC;
- KI-Suche;
- Läufe mit Secrets.
