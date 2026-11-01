# Delistete Aktien in den sechs Backtest-Arten (Stand 31.10.2026)

Auftrag des Owners vom 31.10.: Historische Untersuchungen sollen nicht nur aus heute noch existierenden Unternehmen bestehen. Genutzt werden die bestehenden V13-Register und Archive, ohne neue Engine, ohne erfundene Kursverläufe und ohne künstliche Totalverluste. Seit der Owner-Erklärung vom 31.10. gibt es dafür kein Lizenzhindernis mehr ([docs/data/TIINGO_LICENSE_REVIEW.md](../data/TIINGO_LICENSE_REVIEW.md)).

## 1. Datenbasis

| Register | Umfang | Endbeleg |
|---|---|---|
| `docs/quant-recovery/v13/delisted/register-1.0.0.json` | QUALIFIED 1.675: MERGER 1.130, DISTRESS 56, UNKNOWN 489 | `endSourced=true`: letzter Handelstag SEC-belegt |
| dasselbe, `PRICE_ONLY_CENSORED_END` | 151: UNKNOWN 136, MERGER 10, DISTRESS 5 | `endSourced=false` |
| `docs/quant-recovery/v13b/hist/register-1.1.0.json` | QUALIFIED 1.688 (MERGER 1.135, DISTRESS 63, UNKNOWN 490) | über kein Runner-Profil erreichbar (siehe 4) |

**Reihen:** im privaten R2-Archiv 1.2.0, Teil `v13-derived` mit 1.826 Dateien. Jede Datei ist per `pointsSha256`, `status` und `cik` an das Register gebunden (`quant/engines/research-delisted-series.cjs`). Im Runner werden sie über den Workflow-Modus `[v13-archive:demos]` oder `--private-delisted` gelesen.

**Profile** (`scripts/quant/research/research-population.cjs`):
- mit delisteten Reihen: `V13_DELISTED_F1` (QUALIFIED), `V13_DELISTED_F1C` (zusätzlich zensierte Enden), `V13B_DELISTED_F1W`;
- nur Überlebende: alle übrigen.

## 2. Was je Art heute geht

| Art | Mit delisteten Titeln | Einschränkung |
|---|---|---|
| SAME_STOCK_REPLAY, `RULE_EVENTS` | **ja** (Demo `delisted-xco-bankruptcy`) | genau ein Listing |
| SAME_STOCK_REPLAY, `REAL_WEEKLY_LEDGER` | nein | verlangt `PRODUCT_DEFAULT`, und der Adapter verweigert unbelegte Endwerte |
| PATTERN_EVIDENCE | **ja** | noch kein Demofall |
| SIGNAL_BACKTEST, je Ereignis | **ja** (Demo `acquisition-agn`) | Ergebnisse nach dem letzten Handel werden zensiert |
| SIGNAL_BACKTEST, finanziert (`engine.funded`) | praktisch nein | `fundedSchedule` (V10) behält nur Listings bis zur letzten Sitzung; Delistings im Fenster fallen heraus |
| SETUP_BACKTEST | nein | keine rekonstruierten Setup-Stände für `dl_`-Titel, daher Zustand B |
| STRATEGY_BACKTEST, feste Gewichte | technisch ja, aber verzerrt | Die Sitzungen bilden die Schnittmenge aller Listings; ein delistetes Mitglied verkürzt das Fenster |
| FACTOR_RANKING_BACKTEST | nein | Das V10-Panel enthält nur `ref_`-Listings. Seit diesem PR werden delistete Mitglieder als `NOT_IN_PRIVATE_FACTOR_PANEL_REF_ONLY` ausgewiesen statt still verworfen |

## 3. Endereignisse: keine erfundenen Werte

- Delistete Reihen enden am letzten Handelstag. Ereignisse danach werden als `CENSORED` gezählt (`coverage.censored`, `qa.events[].state`, `dataQuality.terminal`).
- Die Abfindung bei Übernahmen ist nicht belegt (`TERMINAL_CONSIDERATION_NOT_VERIFIED_SCENARIOS_ONLY`). Der Runner setzt deshalb **weder einen Totalverlust noch einen Abfindungswert** an.
- Totalverlust-Szenarien (S2) gibt es nur in den V13-Studien als ausgewiesene Szenarien, nicht im Runner.
- Barabfindung und Aktientausch sind nur für `ref_`-Lebenszyklus-Belege erfasst (`research-weekly-loader.cjs`). Für delistete Reihen gibt es nur die Klassen MERGER, DISTRESS und UNKNOWN.

## 4. In diesem PR korrigiert (Transparenz, keine Kennzahländerung)

1. **Unvollständiges privates Verzeichnis:** Fehlen zu Registerzeilen die Dateien, endet der Lauf in **Zustand B** mit `MISSING_INPUT:PRIVATE_DATA_INCOMPLETE:delistedSeries <Anzahl>`. Bisher brach er hart ab. Der Lauf wird nie still mit einer kleineren Population gerechnet.
2. **Ende-Kennzeichnung:** `dataQuality.terminal.state` unterscheidet jetzt belegte Enden (`SOURCED_TERMINAL_CLASS_CENSORS_EVENTS_AFTER_LAST_TRADE`) von teilweise unbelegten (`TERMINAL_END_PARTLY_UNSOURCED_EVENTS_AFTER_LAST_OBSERVATION_CENSORED`, mit Anzahl). Das betrifft das Profil F1c.
3. **Faktorfall:** Delistete Mitglieder ohne Panelzeile stehen in `extras.kindExcluded`.

Die 16 Demofälle sind davon in ihren Kennzahlen nicht betroffen. Nur der Code-Hash des Runners ändert sich, deshalb werden die Demos mit `[v13-archive:demos]` neu gebaut und verglichen.

## 5. Nächste Schritte (vorhandener Code, aufsteigender Aufwand)

| Nr. | Schritt | Wirkung | Art der Änderung |
|---|---|---|---|
| D1 | Cache-Treffer für F1w: Dokumente über `RF.buildContext` statt über das rohe `loadDelisted` laden | korrektes Profil F1w bei warmem Cache | Fehlerbehebung |
| D2 | Endwert-Sensitivität für Pattern und Signal: `terminalForward` und `scenarioReturn` aus `scripts/quant/v13/studies/lib.cjs` als ausgewiesenes Nebenergebnis, neben dem zensierten Hauptergebnis | macht die Spanne der Abfindungsszenarien sichtbar, ohne Annahme im Hauptergebnis | eigener PR mit Vorher/Nachher |
| D3 | Profil für Register 1.1.0 (`registerVersion`/`extraDirs` durch `buildContext` und `dataFingerprint` reichen) | +13 Ketten (HIST) | neue Registrierung nötig |
| D4 | Finanzierter Signal-Backtest: Runner-eigener Zeitplan, der beendete Listings behält und zum letzten Schluss schließt | Portfoliorechnung ohne Überlebendenfilter | eigener PR; V10-Code bleibt unverändert |
| D5 | Strategy mit festen Gewichten: Sitzungen als Vereinigung, Zielgewicht 0 ab dem letzten Handelstag, Verkauf zum letzten Schluss | realistische Strategiepfade mit Delistings | eigener PR; der Kurs-Simulationsvertrag bleibt |
| D6 | Setup: private Replays für `dl_`-Titel mit dem vorhandenen Rekonstruktionspfad | Setup-Rekonstruktion ohne Überlebendenfilter | bleibt Rekonstruktion, erfüllt nie das Gate für veröffentlichte Stände |
| D7 | Faktor: privates Panel einschließlich delisteter Listings (Verknüpfung über CIK, `pit_docs.py`/`panel.cjs`) | Faktor-Ranking ohne Überlebendenfilter | größter Aufwand |

**Gate-Wirkung:** Das Zertifizierungsgate `survivorship` liest heute nicht die Runner-Ergebnisse, sondern `signal-backtest-v1.json` und `survivorship-control-v1.json`. Ein Lauf mit delisteten Titeln ändert dort also nichts. Sollen solche Läufe in die Zertifizierung einfließen, ist das eine normative Entscheidung des Owners.

## 6. Demo-Neubau zu diesem PR

Run **41179269415** (`[v13-archive:demos]`, Branch dieses PR): 16 Fälle, Python-Gegenrechnung mit 276.828 Prüfungen und 0 Abweichungen.

Gegenüber den Demos auf `main` (#1178) hat sich **keine Kennzahl, kein Ereignis und kein Zustand** verändert. Geändert haben sich nur Hashes:
- der Code-Hash von `backtest-runner.cjs`;
- das Zertifizierungsdatum;
- die fortgeschriebene SPY-Reihe, sichtbar im Hash des Marktregime-Ergebnisses.

Hinweis zur Reihenfolge: Die interne Vorschau (#1201) liest die Demos. Wird dieser PR zuerst gemergt, muss ihr Lesemodell danach neu erzeugt werden (`build-backtest-preview.cjs --out`).
