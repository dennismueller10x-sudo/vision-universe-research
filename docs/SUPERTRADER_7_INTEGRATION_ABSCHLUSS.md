# Supertrader 7.0 – Integration der parallelen Abschlussarbeiten: Abschlussbericht

Stand 26.10.2026. Alle Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`, alle 13 Strategien `LIVE_NOT_APPROVED`.

In diesem Abschnitt gab es:
- keine Live-Aktivierung, keine Orders, keine Statusaufwertung, keine Zertifizierung;
- keine neuen Datenanbieter, keine Datenkäufe;
- keinen Zugriff auf den gesperrten Tiingo-Endpunkt;
- keine Änderung an der Produktoberfläche und keine neuen automatisierten Datenläufe.

Grundlage ist die Integrationsfreigabe des Eigentümers vom 26.10.2026 mit acht Bedingungen. Mit diesem Bericht ist der Entwicklungsabschnitt Supertrader 7.0 abgeschlossen. Die ausstehende Antwort von Tiingo wird gesondert behandelt.

## 1. Merge-Commits

| Reihenfolge | PR | Inhalt | geprüfter Head | Merge-Commit auf `main` |
|---|---|---|---|---|
| 1 | #937 | Datenvertrag für eine spätere Produktintegration (4 Stufen, Validator) | `31dd695` | `134afa0` |
| 2 | #942 | Ausführungs- und Validierungsprüfung der Nicht-Minervini-Strategien | `e55eca2` | `278cf24` |
| 3 | #940 | Minervini: sechs mechanische Diagnosen (1.2.0) | `da818f5` | `0140bf2` |
| 4 | #931 | EDGAR-Exhibits, Regelsatz 1.4.3 (0 von 83 bestätigt) | `3314e1b` | `746dc46` |
| 5 | #939 | Tiingo-Splits-Probe: Zugang 403, Stufe B vorbereitet und gesperrt | `023f08f` | `5da27cd` |

Ablauf vor jedem Merge:
1. aktuellen `main` einmergen;
2. Erzeuger-Neubau (`completion/rebuild-all.mjs`) bitgleich;
3. lokal die Supertrader-, Core-, Isolations- und Gate-A-Prüfungen;
4. CI auf genau diesem Head grün (gates, core, contract, marker, Cloudflare);
5. Merge per Merge-Commit mit `expectedHeadSha`.

Vercel ist kein Pflichtcheck (main hat keinen Branch-Schutz). Bei #939 meldete Vercel „Deployment rate limited“, also das Free-Plan-Limit, keinen Codebefund.

## 2. Nachweis der acht Bedingungen

| Bedingung | Nachweis |
|---|---|
| 1. Pflichtprüfungen grün, Änderungen = geprüfter Commit | Jeder Head war der zuletzt geprüfte Stand, ergänzt nur um den Merge von `main` (bzw. bei #940 um Tests und Doku). Merge erfolgte mit `expectedHeadSha`. |
| 2. #940: 4 MEDIUM und 5 LOW des ersten Reviews | Alle 9 behoben; Beleg je Befund mit Datei, Test und gefangener Mutation (27 Einzelmutationen) in [SUPERTRADER_7_MINERVINI_MECHANICAL_1_4.md §10](SUPERTRADER_7_MINERVINI_MECHANICAL_1_4.md). Die Befunde späterer Reviews sind ebenfalls behoben oder als ungefährliche Grenze begründet. Basiszählung, Top-Volumen, Gap-Abstand und Runner-Tests ohne bekannten fachlichen Fehler. Zwei zuletzt gefundene Testlücken sind vor dem Merge geschlossen: exakter MA200-Fensterbeginn und „Schlüsse statt Tiefs“. |
| 3. Commits der schreibenden Review-Session | `b7d3a62` und `0cca717` vollständig nachvollzogen, Änderung für Änderung (§10 dort). Ein Fehler in `b7d3a62` war 7 Minuten später in `0cca717` behoben, vor jedem Lauf. Keine weiteren Branches, PRs, Reviews oder Läufe; die Session ist archiviert. |
| 4. #942: Engine-Hash | `codeSha256()` von `runner/run-research.mjs` ergibt `89fbcf86…` an beiden Lauf-Commits (`f60b3bb`, `694b91c`), am PR-Head und auf `main`. Ein Test bindet den AUTHORITATIVE-Eintrag an den aktuellen Engine-Hash. |
| 5. Workflow-Konflikt #931 / #939 | Modus-Listen tokenweise vereinigt: 69 Modi, 51 Commit-Marken, keine Duplikate. Alle 37 Schritte beider Seiten sind erhalten, ebenso jede Sperre: `KK_INTRADAY_FETCH_FROZEN`, `TIINGO_SPLITS_FETCH_FROZEN`, Snapshot- und research-v1-Vertrag. `sf-runner.test.mjs` angepasst. |
| 6. Tiingo fail closed | Drei Sperren: `PROBE_GATE = FROZEN` im Code (Abbruch vor Schlüssel und Snapshot), der Workflow-Schritt vor jedem Schritt mit Schlüssel, und `createTiingoClient` ohne injiziertes `fetch`. Lokal geprüft: `PROBE_FROZEN`, keine Ausgabe. In diesem Abschnitt gab es 0 Anfragen an Tiingo. |
| 7. V4-D1-Quarantäne, CC-5 | 83 Sitzungen ungeklärt, Overlay leer, CC-5 für alle 13 offen. In der Abschlussmatrix ändert sich nur der EDGAR-Belegtext (#931). |
| 8. Referenzen, Varianten, Readiness unverändert | Siehe §3. Kein Ledger- oder Hash-Pfad hat sich in irgendeinem Artefakt geändert. `STRATEGY-SF6-READINESS.json` ist bitgleich (`4f9808aa…`). |

## 3. Vorher/Nachher aller 13 Strategien

Vorher: `main` `7f0e4b5` (vor #937). Nachher: `main` `5da27cd` (nach #939). Beide Stände wurden mit `completion/rebuild-all.mjs` neu gebaut, beide bitgleich mit den committeten Artefakten.

| | Strategie | Zustand | Messklasse | CC erfüllt | Live | Readiness gleich | 7.0-Matrixzeile gleich |
|---|---|---|---|---|---|---|---|
| C01 | `SF_TURTLE_S1` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | FULL_DIAGNOSTIC_STRATEGY_BACKTEST | CC-2, CC-3, CC-6, CC-7 | LIVE_NOT_APPROVED | ja | ja |
| C02 | `SF_TURTLE_S2` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | FULL_DIAGNOSTIC_STRATEGY_BACKTEST | CC-1, CC-2, CC-3, CC-6, CC-7 | LIVE_NOT_APPROVED | ja | ja |
| C03 | `SF_DARVAS_BOX` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | MECHANICAL_COMPONENT_STUDY | CC-2, CC-4, CC-6, CC-7 | LIVE_NOT_APPROVED | ja | ja |
| C04 | `SF_WEINSTEIN_INVESTOR` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | SCREEN_STATISTICS | CC-1, CC-2, CC-6, CC-7 | LIVE_NOT_APPROVED | ja | ja |
| C05 | `SF_WEINSTEIN_TRADER` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | SCREEN_STATISTICS | CC-1, CC-2, CC-6, CC-7 | LIVE_NOT_APPROVED | ja | ja |
| C06 | `SF_MINERVINI_SEPA_VCP` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | SCREEN_STATISTICS | CC-2, CC-6, CC-7 | LIVE_NOT_APPROVED | ja | ja |
| C07 | `SF_MINERVINI_POWER_PLAY` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | SCREEN_STATISTICS | CC-2, CC-4, CC-6, CC-7 | LIVE_NOT_APPROVED | ja | ja |
| C08 | `SF_KK_BREAKOUT` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | SCREEN_STATISTICS | CC-1, CC-2, CC-4, CC-6, CC-7 | LIVE_NOT_APPROVED | ja | ja |
| C09 | `SF_KK_EPISODIC_PIVOT` | VALIDATION_BLOCKED | NOT_MEASURABLE | – | LIVE_NOT_APPROVED | ja | ja |
| C10 | `SF_KK_PARABOLIC_SHORT` | VALIDATION_BLOCKED | NOT_MEASURABLE | CC-1 | LIVE_NOT_APPROVED | ja | ja |
| C11 | `SF_MOKA_POCKET_PIVOT` | SOURCE_BLOCKED | SCREEN_STATISTICS | CC-4, CC-6, CC-7 | LIVE_NOT_APPROVED | ja | ja |
| C12 | `SF_MOKA_BUYABLE_GAP_UP` | RESEARCH_COMPLETE_WITH_EXCEPTIONS | SCREEN_STATISTICS | CC-2, CC-4, CC-6, CC-7 | LIVE_NOT_APPROVED | ja | ja |
| C13 | `SF_RASCHKE_HOLY_GRAIL` | SOURCE_BLOCKED | NOT_MEASURABLE | CC-4, CC-6, CC-7 | LIVE_NOT_APPROVED | ja | ja |

**Zusammenfassung vorher = nachher:**
- RESEARCH_COMPLETE_WITH_EXCEPTIONS 9, VALIDATION_BLOCKED 2, SOURCE_BLOCKED 2;
- Zertifizierungskandidaten 0;
- `liveReadiness` LIVE_NOT_APPROVED, `certification` DIAGNOSTIC_NOT_CERTIFIED.

„7.0-Matrixzeile gleich“ vergleicht jede Zeile von `STRATEGY-SF7-COMPLETION.json` ohne die Belegliste, die PRs nennt.

**Änderungen an den Artefakten insgesamt.** In keinem davon ändert sich ein Ledger-, Trade- oder Hash-Wert:
- `STRATEGY-SF7-COMPLETION.json`: nur der EDGAR-Belegtext und die Version 1.3.0 → 1.4.1 (#931).
- `STRATEGY-SF5-LIFECYCLE.json`: je Strategie ein neuer maßgeblicher Lauf vorn in `snapshotRuns` (40228392651, 47 von 47 Varianten hashgleich mit 40099831813) (#942).
- `STRATEGY-KK-EP-PS-CHART.json`:
  - neuer maßgeblicher Cache-Lauf 40228395395 (0 Anfragen, alle Blöcke gleich);
  - Runner-Version;
  - korrigierter Engine-Hash im Eintrag 40185748527 (#942).
- `STRATEGY-MINERVINI-SOURCE-INVENTORY.json`: Einstufung der neuen Modellannahmen `MA-MIN7-*` (#940).

**Referenzen:**
- Minervini REF SEPA 954 Trades (`1ca52391…`) und Power Play 1.007 Trades (`877ceb33…`) sind ledger-identisch (Lauf 40232389268).
- Alle sf5-Referenzen und -Varianten sind hashgleich (Lauf 40228392651).
- EP und PS sind blockgleich (Lauf 40228395395).
- Gepinnte Verträge unverschoben: SF6-PAPER-2027 1.1.0 `e623b336…` (PREPARED_NOT_ACTIVE), Turtle `89fbcf86…`, sf4 `c834b227…`, `integrityCodeSha256` `7ca45bc9…`.

## 4. Eigentümerentscheidungen dieses Abschnitts (26.10.2026)

- **Weinstein:** Die Referenz bleibt bei „>“. `EX7-WEIN-TRAIL-AT-OR-ABOVE` bleibt ausschließlich eine gekennzeichnete, optionale Research-Lesart. Eine neue Referenz gibt es nur mit zusätzlichen Quellenbelegen.
- **Minervini:** Die sechs mechanischen Diagnosen sind übernommen. Es gibt keine neuen verbindlichen Chase-, Stop-Fallback- oder Ausstiegsregeln und keine weitere Vorregistrierung ohne gesonderte Entscheidung.

## 5. Ergebnis je Strategie

| Strategie | Neu belegt | Referenz |
|---|---|---|
| Minervini SEPA/VCP, Power Play | Diagnosen mit vorab gepinnten Modellannahmen:<br>– Basiszählung (Ausbruch über das Intraday-Basishoch, Neustart über MA200 oder 10 % Marktkorrektur)<br>– Top-Volumen-Rückgang<br>– relative Basistiefe<br>– Abstand von Fill und Gap zum Pivot<br>– Buy-Stop-Puffer in Roh-Dollar<br>– Klimax-Signale je Basiszahl | unverändert |
| Turtle S1/S2 | Ledger und PIT über alle Lesarten nachgerechnet, 0 Fehler | unverändert |
| Darvas, KK Breakout, Pocket Pivot, BGU, Holy Grail | unabhängige Nachrechnung (Fill, Timing, Stop, Gap, Größe, Kasse = Kurve), PIT-Verfälschung, Stabilität, Golden Cases; 0 Verstöße | unverändert |
| Weinstein Investor/Trader | wie oben; SF7-V1 als Opt-in-Lesart (Investor 1.294 statt 1.348 Trades, Trader 1.870 statt 1.808) | unverändert, bleibt bei „>“ |
| Episodic Pivot | SF7-V2 gezählt: bei bis zu 180 von 222 über Nacht gehaltenen Trades liegt das konsolidierte Tagestief unter dem IEX-Stop | unverändert |
| Parabolic Short | Golden Case, PIT-Test | unverändert |

**Stabilität:**
- Bei gleichem Einstieg ändert sich nie der Ausstieg.
- Die Instabilität entsteht allein im Portfolio, über Positionsgrenze und Kasse.

**Produktvertrag (#937):**
- Heute höchstens `MODELED_TRADE_PLAN`: C01, C02, C03, C07, C08, C12.
- Heute höchstens `CONFIRMED_RESEARCH_SETUP`: C11, C13.
- Heute höchstens `CHART_CANDIDATE`: C04, C05, C06, C09, C10.
- `VALIDATED_TRADE_SIGNAL` ist für alle 13 gesperrt.
- Titel mit einer DQ-K5- oder DQ-K3-Sitzung im 400-Tage-Rückblick bleiben bei `CHART_CANDIDATE`.
- Die späteren Integrationsschritte, je ein eigener PR mit Freigabe, stehen in [SUPERTRADER_7_PRODUCT_INTEGRATION_CONTRACT.md](SUPERTRADER_7_PRODUCT_INTEGRATION_CONTRACT.md).

## 6. Verbleibende Blocker

| Blocker | Strategien | Art |
|---|---|---|
| V4-D1: 83 Sitzungen in Quarantäne. Tiingo-Endpunkt gesperrt (403); Stufe B bereit mit 72 Tickern, höchstens 75 Anfragen nach Freischaltung | alle 11 Referenzen außer SEPA und Weinstein Investor | Daten |
| CC-5-Teilkriterien e (Splits unter 3×) und f (Holdout) | alle 13 | Daten und neue Snapshot-Generation (E7-4) |
| englischer Originalwortlaut | Minervini | Quelle (CC-1) |
| EPS-PIT-Reihe | Minervini | Datenqualität |
| Stop- bzw. Trailing-Regel fehlt in der Quelle | Pocket Pivot, Holy Grail | Quelle |
| manuelle Entscheidungen | alle außer Turtle | Ermessen (CC-3) |
| IBD-RS, PIT-Branchen, NYSE-Breite, PIT-Korrelationsgruppen | SEPA, Weinstein, Turtle | Daten (CC-4) |
| konsolidierte Intraday-Minuten | EP (SF7-V2), PS, PP, BGU | Daten |
| Katalysator-Historie, Borrow | EP, PS | Daten |
| unberührtes Fenster | alle | SF6-PAPER-2027, nicht aktiv (CC-8) |

## 7. Tests und CI

**Lokal auf `main` `5da27cd`:**

| Suite | Ergebnis |
|---|---|
| Core | 238 / 0 |
| Quant | 3.056 / 0 |
| Supertrader | 859 / 0 |
| Discover | 576 / 0 |
| Screener | 46 / 0 |
| Technical | 15 / 0 |
| Test-Isolation | sauber |
| Erzeuger-Neubau | bitgleich |
| Workflow | 69 Modi, keine Duplikate |

**Python (`scripts/quant/tests`):** 551 Tests, 1 Fehler, **nicht aus diesem Abschnitt**.
- Fehler: `test_the_committed_footprint_is_within_budget`, `quant/data/sec` 27.125 KB gegen das Budget von 8.192 KB.
- Ursache: das Datenwachstum aus #935 (SEC-Consumer, volle Jahreshistorie) und den folgenden Consumer-Läufen, parallel aus einer anderen Session auf `main` gemergt.
- Keiner der fünf PRs berührt `quant/data`. Der Befund gehört dem Erzeuger dieser Daten und ist an den Eigentümer gemeldet.

**CI auf `main` `5da27cd` (Push nach dem letzten Merge), alle grün:**
- Supertrader Quality Gates (`gates`, `test`);
- CI Config;
- Quant 2.0 Production Pages (`deploy`, `package`, `smoke`);
- company-intelligence-live, Cloudflare Pages;
- Supertrader Production Smoke 40279673326.

Der Smoke-Lauf 40279339344 wurde per Concurrency-Gruppe vom nachfolgenden Lauf abgelöst. Vercel: Free-Plan-Limit, kein Pflichtcheck.

**Reviews:** Jeder PR wurde mindestens einmal unabhängig und nur lesend geprüft, #940 in vier Runden plus Nachweisprüfung. Kein HIGH-Befund; alle MEDIUM-Befunde sind behoben.

## 8. Zwischenfall

Bei #940 hat eine Review-Session, die nur lesen sollte, zwei Commits gepusht und einen Lauf (40228813041, Modus `sf7-minervini`) gestartet. Behandlung:
- Die Session wurde archiviert.
- Ihre Commits sind vollständig geprüft (§2, Bedingung 3).
- Alle späteren Reviews liefen als lokale, rein lesende Prüfungen ohne Schreib- oder Startrechte im Repository.
- Die Abweichung ist in der Doku von #940 offen benannt.

## 9. Abschluss

Der Entwicklungsabschnitt Supertrader 7.0 ist abgeschlossen. Es werden keine weiteren allgemeinen Supertrader-Entwicklungs-PRs eigenständig gestartet.

Offen und gesondert zu behandeln:
- **Tiingo-Antwort:** Entsperren nur mit schriftlicher Bestätigung von Tiingo, eigener Freigabe und kleinem PR (Ablauf in [SUPERTRADER_7_TIINGO_SPLITS_PROBE.md](SUPERTRADER_7_TIINGO_SPLITS_PROBE.md)).
- Antworten der angefragten Anbieter (E7-1).
- E7-4 (neue Snapshot-Generation).
- SF6-PAPER-2027 (Aktivierung nur mit eigener Freigabe).
