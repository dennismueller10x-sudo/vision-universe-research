# Supertrader 6.0 – Strategy Completion & Certification Readiness: Abschlussbericht

Stand: 24. Oktober 2026 (Eigentümerentscheidungen E1–E6 eingearbeitet).
- **Basis:** `main` @ `cfecc0a3e` (nach #868).
- **Research Snapshots:**
  - DEV `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d` (2016–2026, unverändert);
  - neu HOLDOUT `sts1-85959e4bab0681baa6ed221bee94821e` (2008–2015).
- **Abrechnung:** `research-v1`.

Alle historischen Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`. Keine Strategie ist live, zertifiziert oder handelbar; alle sind `LIVE_NOT_APPROVED`. Es gibt keine Orders, keine Brokeranbindung und keine Performanceaussage. Die Kennzahlen jedes Laufs liegen versiegelt beim Eigentümer. Öffentlich sind nur Zählungen und Hashes.

Maschinenlesbar und generiert:
- [SUPERTRADER_6_READINESS_MATRIX.md](SUPERTRADER_6_READINESS_MATRIX.md) und `scripts/supertrader/source-faithful/artifacts/STRATEGY-SF6-READINESS.json`. Sie enthalten 13 Strategien × 15 Dimensionen mit Evidenz je Zelle und werden vom Builder aus Artefakten und Lauf-Belegen erzeugt. Keine Note ist von Hand gesetzt.
- Die Kriterien stehen in `completion/sf6-readiness-criteria.mjs`. Version 1.1.0 wurde festgeschrieben, bevor ein 6.0-Ergebnis gelesen war. Version 1.2.0 setzt die Eigentümerentscheidungen E1–E6 um und macht dabei jedes Kriterium nur strenger.
- Das prospektive Paper-Protokoll steht in `completion/sf6-paper-protocol-2027.mjs`, erläutert in [SUPERTRADER_6_PAPER_VALIDATION_PROTOCOL_2027.md](SUPERTRADER_6_PAPER_VALIDATION_PROTOCOL_2027.md).
- Die Laufdaten stehen in `completion/sf6-run-facts.mjs`.

---

## Management Summary

**Was funktioniert jetzt**
- **Alle 11 messbaren Strategie-Referenzen laufen reproduzierbar** auf dem eingefrorenen Snapshot: Turtle S1/S2, Darvas, Weinstein Investor/Trader, Minervini SEPA und Power Play, Kullamägi Breakout, Pocket Pivot, Buyable Gap-Up, Holy Grail.
  - Jede Referenz läuft unter vier Kostenstufen (0/10/20/50 bps), in zwei Zeitfenstern (2016–2026 und 2008–2015) und unter drei Quarantäne-Lesarten für Kurssprünge.
  - Alle 11 sind **ledger-hash-identisch** mit den maßgeblichen Referenzläufen aus 2.0 bis 5.0. Bei den 9 Nicht-Turtle-Referenzen sind auch die Trade-Hashes identisch; die Turtle-Läufe veröffentlichen nur den Ledger-Hash. Gleiche Tradezahlen werden dabei nie als Hash-Identität gezählt.
  - Jeder Lauf ist abgestimmt (Ledger-Replay).
- **Der Reverse-Split-Blocker V4-D1 ist erstmals strategiebezogen eingegrenzt, aber nicht gelöst.** Er bleibt ein echter Datenintegritätsblocker (E1).
  - Es gibt 1.210 verdächtige Kurssprünge ≥ 5× in 454 Wertpapieren, zu 72 % bei Kursen unter 1 $.
  - Direkt exponiert sind je Strategie 0 bis 2 % der Trades. Über einen Sprung gehalten wurden höchstens 3 Trades je Strategie.
- **Ein zweiter Zeitraum (2008–2015) ist erstmals für alle buchgetreuen Lifecycles gemessen.** Er ist kein unberührter Holdout: Er wurde in R14 einmal für andere Implementierungen geöffnet, und für ältere Delistings ist die Tickerliste lückenhaft.

**Was ist erstmals vollständig**
- **Pocket Pivot und Holy Grail laufen mit allen neun Phasen**, aber nur als klar gekennzeichnete Modellvarianten:
  - Pocket Pivot mit einem Stop am Tief des Signaltags;
  - Holy Grail mit einem Trailing über Swing-Tiefs.
  - Die Referenzen bleiben bei 8/9 Phasen, weil die Quellen diese Phasen nicht nennen.
- **Die Stichprobe für Episodic Pivot und Parabolic Short ist bereinigt.**
  - Die Parabolic-Short-Stichprobe war zu Gap-up-Tagen verzerrt.
  - Die EP-Varianten liefen auf unterschiedlichen Tagesmengen.
  - Beides ist behoben, nur auf Basis des vorhandenen Caches (0 neue Abrufe), dazu kommt eine geschichtete Auswertung.
- **Minervini hat eine split-bereinigte, PIT-sichere EPS-Evidenz.** Sie betrifft 29 von 762 SEPA-Einstiegen mit Fundamentaldaten. Die Evidenz ist nie ein Gate, es ändert sich kein Trade.

**Was bleibt unvollständig**
- Pocket-Pivot-Stop und Holy-Grail-Trailing: Die Quelle ist gesperrt.
- Episodic Pivot: Katalysator-Historie fehlt; das konsolidierte Intraday-Volumen fehlt.
- Parabolic Short: Borrow- und Locate-Historie fehlt.
- Minervini: der englische Originalwortlaut und das IBD-RS-Rating fehlen.
- Weinstein: PIT-Branchen-Stage und NYSE-Breite fehlen.
- Turtle: PIT-Korrelationsgruppen fehlen.

**Was ist zuverlässig messbar**
- Zählungen, Abstimmung, Reproduzierbarkeit, Expositionsgrad gegenüber Datenfehlern sowie die Kostensensitivität auf Kennzahlenebene (versiegelt).
- **Drei Aussagen, die getrennt bleiben (E6):**
  - **Numerische Reproduzierbarkeit: belegt.** Gleiche Eingaben und gleicher Code ergeben bitgleiche Ledger.
  - **Trade-Stabilität: gering.** In den kapazitätsgebundenen Modellstudien ändern sich nach kleinen Eingabeänderungen rund 70 bis über 90 % der Trades durch Knock-on. Betroffen sind Kullamägi, Turtle S1, Pocket Pivot und Holy Grail. Diese hohe Sensitivität der Portfoliostudien ist ein eigener Befund.
  - **Robustheit: nicht belegt.** Die Kennzahlen sind versiegelt und nicht bewertet, und ein unberührter Zeitraum fehlt.
  - Bewertet wird nur auf Ebene von Kennzahlen und Verteilungen, nie über die Identität einzelner Trades.

**Wo die Datenbasis nicht reicht**
- Der Holdout ist stark survivorship-verzerrt: Nur 813 von 6.427 Listings sind inaktiv.
- Intraday-Daten gibt es erst ab 2017 und nur vom Handelsplatz IEX.
- Es gibt keine zweite Corporate-Action-Quelle.
- Es gibt keine historischen Analysten-, Katalysator- und Borrow-Daten.

**Höchste Certification Readiness**
- Keine Strategie ist `CERTIFICATION_CANDIDATE`. Die acht harten Kriterien wurden vor den Ergebnissen festgelegt.
- Nach E1, E2 und E4 ist CC-5 für alle Strategien offen, bis V4-D1 durch belegte Kapitalmaßnahmen aufgelöst ist. CC-8 bleibt offen bis zur Auswertung von SF6-PAPER-2027, frühestens Ende 2027.
- Am nächsten liegen:
  - **Turtle S2**: Es fehlen echte PIT-Korrelationsgruppen (der SIC-Proxy zählt nicht), die V4-D1-Auflösung und die Paper-Evidenz.
  - **Kullamägi Breakout**: Es fehlen die manuellen Quellenentscheidungen, die V4-D1-Auflösung und die Paper-Evidenz.
  - **Turtle S1**: zusätzlich eine mehrdeutige Quellenregel.

**Was nach der Integration offen bleibt** (keine 7.0-Phase; jeder Punkt braucht eine eigene Freigabe)
1. **V4-D1 gezielt prüfen (E1):** ≤ ~260 Kandidaten hinter Referenz-Trades. Quellen in dieser Reihenfolge: vorhandene Tiingo-Felder, Marketstack im bestehenden Zugang, SEC-8-K/10-Q. Keine Massenabrufe, keine neuen Kosten. Plan in [SUPERTRADER_6_V4D1_CONTAINMENT.md](SUPERTRADER_6_V4D1_CONTAINMENT.md), nicht ausgeführt.
2. **SF6-PAPER-2027 aktivieren (E2):** erst nach Ihrer Freigabe eines eigenen PRs mit Aufzeichnung und Aufbewahrung. Bis dahin ist das Protokoll nur festgeschrieben.
3. **Die versiegelten Kennzahlen** von BASE, DQ und Holdout prüfen, auf Ebene von Kennzahlen und Verteilungen (E6).
4. **EP/PS-Stichprobe (E5):** Nur der priorisierte Plan im Rahmen des bestehenden Budgets ist dokumentiert. Es gibt keine Abrufe.

---

## 1. Was gebaut wurde: vier Draft-PRs

| Workstream | Zweig | Inhalt | Maßgeblicher Lauf |
|---|---|---|---|
| A – Datenintegrität (#878) | `claude/supertrader-6-data-integrity` | `integrity/discontinuity.mjs` (kausaler Sprung-Detektor, Quarantäne 1.1.0 mit BOOK/PRIOR), `research/run-sf6-integrity.mjs`, Modus `sf6-integrity`, [SUPERTRADER_6_V4D1_CONTAINMENT.md](SUPERTRADER_6_V4D1_CONTAINMENT.md) | [40001276389](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40001276389) |
| B/C/D – Validierung, Modellvarianten (#879) | `claude/supertrader-6-validation` | `research/sf6-references.mjs`, `research/run-sf6-validation.mjs` (Protokoll 1.1.0), `research/sf6-model-variants.mjs` (PP-Stop, HG-Trailing, Darvas-Allzeithoch belegt), `research/minervini-fundamentals-sf6.mjs`, Holdout-Snapshot-Modi, Modi `sf6-validation(-holdout)` | DEV [40001421221](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40001421221), Holdout-Capture [39998409317](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39998409317), Holdout [40007428374](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40007428374) |
| E – EP/PS-Stichprobe (#880) | `claude/supertrader-6-ep-ps-sample` | `research/kk-sample.mjs` (saubere Präfixe, Schichtung), Cache-only-Modus `kk-intraday-cache`, PS offene Trades und Überlappung, Median-Fix | [40001460163](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/40001460163) (0 Anfragen) |
| F – Readiness (#881) | `claude/supertrader-6-readiness` | Kriterien 1.2.0 (E1–E6), Paper-Protokoll SF6-PAPER-2027 (nicht aktiviert), Matrix-Builder mit E6-Aufteilung, Laufdaten mit Hash-Abgleich, dieser Bericht | – |

Alle Zweige sind auf Supertrader-Pfade beschränkt (Gate A). Die Testisolation ist sauber. Die Supertrader-Testsuite ist je Zweig grün: 642 bis 646 bestanden, 0 fehlgeschlagen, 1 vorbestehend übersprungen.

## 2. Bisherige Fehler, die tatsächlich behoben wurden

| Befund | Wo | Wirkung (öffentliche Zählung) |
|---|---|---|
| PS-Stichprobe überrepräsentierte Gap-up-Tage etwa 4,5-fach. EP und PS teilen eine Hash-Reihenfolge, EP wurde zuerst abgerufen. | `run-kk-intraday.mjs` | 51 nur über den EP-Pfad gecachte Tage fallen weg. PS-Referenz 239 → 228 Trades. |
| EP-Varianten liefen auf unterschiedlichen Tagesmengen (Tage ohne IEX-Basis). | `kk-ep-lifecycle.mjs` | „EP ohne Volumenregel“ 1.106 → 1.042 Trades. Die EP-Referenz bleibt unverändert bei 611. |
| Offene PS-Trades fehlten in den Kennzahlen; überlappende Trades derselben Serie. | `kk-ps-study.mjs` | Offene Trades werden gezählt und markiert. Neue Berichtsvariante „eine Position je Ticker“. |
| PS-Median war der obere Median. | Runner | nur versiegelte Werte |
| Minervini-EPS-Wachstum über Aktiensplits ohne Bereinigung (−50 % bei 2:1). | `minervini-components.mjs` (unverändert, gepinnt); neue Evidenz `minervini-fundamentals-sf6.mjs` | DEV: 29 von 762 SEPA-Einstiegen mit Evidenz korrigiert. Bei 405 ist ein Quartal nicht korrigierbar, meist ein abgeleitetes Q4; es wird jetzt markiert statt still verwendet. Holdout: 7 von 278. |
| Darvas: Laut 5.0 gab es kein Listing-Datum, deshalb keine belegte Allzeithoch-Variante. | Die Listing-ID trägt den Beginn | neue Abdeckungsvariante: 5.629 Trades (DEV), 3.349 (Holdout) |

In der eigenen 6.0-Arbeit fanden zwei unabhängige Reviews vor jedem Ergebnis 4 HIGH-Befunde. Alle sind behoben und mit Regressionstests abgesichert (Abschnitt 11).

## 3. V4-D1: gelöst oder eingegrenzt?

**Eingegrenzt, nicht gelöst.** Einzelheiten stehen in [SUPERTRADER_6_V4D1_CONTAINMENT.md](SUPERTRADER_6_V4D1_CONTAINMENT.md).
- **Markierung und Schwellen:**
  - Markiert wird eine Obermenge: jede Sitzung mit einem Gesamtrendite-Relativ ≥ 5 bzw. ≤ 1/5 (DQ-K5) oder ≥ 3 bzw. ≤ 1/3 (DQ-K3).
  - k = 5 stammt aus #722 und wurde dort nach einem Datenaudit nachträglich gesetzt.
  - k = 3 stammt aus #758.
- **Zensus DQ-K5:**
  - 1.210 Sitzungen in 454 Wertpapieren;
  - 867 davon bei einem Vortageskurs unter 1 $, nur 109 im Research-Universum;
  - 14 sind Residuen erklärter Splits (falscher Tag oder falsches Verhältnis).
- **Exposition** (direkt = Rückblick 400 Tage oder Haltedauer):
  - Minervini SEPA 0 %, Weinstein Investor 0 %, Darvas 0,10 %, Weinstein Trader 0,22 %;
  - Kullamägi 0,34 %, Pocket Pivot 0,37 %, BGU 0,44 %, Holy Grail 0,75 %;
  - Power Play 0,99 %, Turtle S1 1,83 %, Turtle S2 1,97 %.
  - Über einen Sprung gehalten: 0 bis 3 Trades je Referenz.
- **Was offen bleibt:**
  - nicht erklärte 2:1-Splits, die keine Schwelle sieht;
  - 3:1- bis 5:1-Splits in der K5-Lesart;
  - die Frage, ob ein Sprung ein Fehler oder eine echte Bewegung war. Dafür braucht es eine zweite Corporate-Action-Quelle.
- **Wie es weitergeht (E1):** V4-D1 bleibt ein echter Datenintegritätsblocker. Keine Quarantäne-Lesart ist eine endgültige Lösung oder eine Zertifizierungsausnahme. CC-5 ist daher für keine Referenz erfüllt, und die Dimension Kapitalmaßnahmen steht höchstens auf TEIL. Aufgelöst wird V4-D1 nur durch gezielt geprüfte Kapitalmaßnahmen aus vorhandenen Quellen.

## 4. Wie zuverlässig sind die historischen Daten?

- **DEV-Snapshot (2016–2026):**
  - unverändert `EXACT` in allen sechs 6.0-Läufen;
  - Survivorship durch inaktive Listings berücksichtigt (3.226 delistete Segmente);
  - V4-D1 eingegrenzt (Abschnitt 3);
  - der Abschnitt mit Kursen unter 1 $ ist der Hauptherd der Sprünge.
- **HOLDOUT-Snapshot (2008–2015), neu:**
  - Generation 2, zwei unabhängige Wiederherstellungen;
  - 5.221 Segmente, davon 678 delistet.
  - Die Tickerliste ist für alte Delistings lückenhaft (813 von 6.427 Listings inaktiv). Ergebnisse sind daher **nach oben verzerrt**.
  - Für die Minervini-Fundamentals sind 3.896 Listings mit SEC-PIT-Daten verfügbar.
- **Intraday (EP/PS):**
  - nur IEX, ab 2017;
  - Stichprobe 2.000 EP- und 2.014 PS-Tage, deterministisch nach Hash.
  - Geschichtet bleiben 11,3 % je Schicht. Schichten mit hoher Liquidität ≥ 100 Mio. $ fallen mangels Kandidaten heraus.
- **Fundamentals:**
  - PIT nach Einreichungsdatum (konservativ);
  - Restatements werden nie übernommen;
  - Splits sind jetzt erkannt;
  - abgeleitete Q4-Werte sind nicht korrigierbar.

## 5. Vollständige Research-Lifecycles und diagnostische Backtests

| Stufe | Strategien |
|---|---|
| vollständiger diagnostischer Strategie-Backtest (Vertragsmessklasse `FULL_DIAGNOSTIC`) | Turtle S1, Turtle S2, beide mit Datenausnahme (Korrelationslimits) |
| vollständige Modellstudie mit 9/9 Phasen unter deklarierten Modellannahmen | Darvas, Weinstein Investor, Weinstein Trader, Minervini SEPA, Minervini Power Play, Kullamägi Breakout, Buyable Gap-Up |
| Modellstudie 8/9 Phasen, 9/9 nur als SF6-Modellvariante | Pocket Pivot (Stop), Holy Grail W-RAS97 (Trailing) |
| Intraday-Modellstudie auf einer Stichprobe | Episodic Pivot (chartbasierter Kandidat, kein Original-EP) |
| hypothetische Einzeltrade-Studie | Parabolic Short (nicht ausführbar ohne Borrow-Daten) |

Kein Lauf ist ein zertifizierter Strategie-Backtest. Die Vertragsmessklassen sind unverändert (2 FULL_DIAGNOSTIC / 1 COMPONENT / 7 SCREEN / 3 NOT_MEASURABLE), denn eine Modellstudie hebt sie nicht an.

## 6. Reproduzierbarkeit und methodische Belastbarkeit

**Reproduziert**
- Alle 11 Referenzen sind **Hash für Hash** mit den maßgeblichen Läufen aus 2.0 bis 5.0 verglichen (Turtle 39397517900, Minervini 39746264325, sf5 39939890956):
  - Ledger-Hash: 11 von 11 identisch.
  - Trade-Hash: 9 von 9 identisch, wo die Referenz ihn veröffentlicht. Für Turtle ist er `NOT_PUBLISHED_BY_REFERENCE` und wird nicht aus Zählungen abgeleitet.
  - Die Ergebnisse stehen je Referenz in `sf6-run-facts.mjs` (`baseMatchesAuthoritative`).
- Die REF-Kostenstufe des Validierungslaufs hat denselben Trade- und Ledger-Hash wie BASE im Integritätslauf (11 von 11).
- Alle Läufe sind abgestimmt.

**Methodisch belastbar**
- Kostensensitivität, Periodenaufteilung, Regime- und Liquiditätsaufteilung. Alle Klassen sind zur Vorsitzung bekannt, die Protokolle sind vorab festgeschrieben.
- Die Expositionsanalyse V4-D1.

**Eingeschränkt belastbar**
- **Holdout:** einmal geöffnet und survivorship-verzerrt. Er zeigt, dass alle Lifecycles in einem zweiten Zeitraum lauffähig sind und vergleichbare Tradezahlen erzeugen, zum Beispiel:
  - Turtle S1: 716 (DEV 820);
  - Minervini SEPA: 522 (DEV 954);
  - Weinstein Investor: 995 (DEV 1.348).

  Eine Out-of-Sample-Bestätigung ist das nicht.
- **Einzeltrade-Aussagen:** Siehe die Pfadabhängigkeit in Abschnitt 3 des V4-D1-Berichts.

**Nicht belastbar**
- Die Identität einzelner Trades (Trade-Stabilität gering, E6) und jede Aussage über einen „Vorteil“ einer Strategie (Robustheit nicht belegt). Die Kennzahlen sind versiegelt und wurden in diesem Bericht nicht gelesen oder bewertet. Keine Kennzahl hat eine Regel oder Variante ausgewählt.

Zählungen aus DEV (öffentlich) zur Einordnung, ohne Performanceaussage:
- **Kostenabhängigkeit:**
  - Darvas: 19.556 Trades bei REF, 7.343 bei 50 bps;
  - Kullamägi: 9.114 → 5.064.

  Kosten verändern hier die Kapitalbindung stark. Das deutet auf eine ausgeprägte Abhängigkeit von Ausführungsannahmen.
- **Pocket-Pivot-Modellstop:** blockiert 32.413 Einstiege (Eröffnung am oder unter dem Signaltagstief) und wirkt damit auch als Einstiegsfilter (deklariert). 4.534 Trades statt 1.872.
- **Holy-Grail-Trailing:** 2.217 Trades statt 4.025; 884 Stop-Anhebungen; 393 Ausstiege über das Trailing.

## 7. Verbleibende Quellenlücken

| Strategie | Lücke | Status |
|---|---|---|
| Turtle S1 | offener hypothetischer Breakout, Failsafe-Exit | Original schweigt (wörtlich geprüft); beide Lesarten laufen |
| Darvas | Box-Boden-Beginn, Auswahl, Größe | mehrdeutig bzw. manuell |
| Weinstein | Stage, Volumenurteil, RS, Overhead | manuell |
| Minervini SEPA / Power Play | englischer Originalwortlaut | nicht frei verfügbar; alle Regeln nur abgeleitet |
| Kullamägi Breakout | Setup, Größe | manuell |
| Episodic Pivot | Katalysator, Seitwärtsphase | Daten fehlen bzw. manuell |
| Parabolic Short | Kontext | manuell |
| Pocket Pivot | Initialstop | SOURCE_BLOCKED (nur SF6-Modellvariante) |
| BGU | Volumenfenster | SOURCE_AMBIGUOUS; 50 Sitzungen als Konvention (D-BGU-VOLWINDOW) |
| Holy Grail | Trailing, Größe | SOURCE_BLOCKED; Einstieg/Stop aus Sekundärquelle W-RAS97 (D-RAS97) |

In 6.0 wurde keine neue Quelle beschafft, und keine Regel wurde aufgewertet. Es gab keine kostenpflichtige oder urheberrechtswidrige Quellenbeschaffung.

## 8. Minervini SEPA/VCP und Power Play: Stand

| | SEPA/VCP | Power Play |
|---|---|---|
| technische Vollständigkeit | 9/9 Phasen (4.0-Engine, unverändert, Fingerabdruck `b1d81fb8…`) | 9/9 Phasen; Missing-Low-Fix aus #844 erhalten |
| Source Fidelity | 0 exakt / 9 abgeleitet / 7 manuell / 1 Daten; nur über Übersetzung belegt | 0 / 5 / 4 / 0; nur über Übersetzung |
| offene qualitative Entscheidungen | Priorität, Qualität, VCP-Gültigkeit, RS (11 essenziell) | Volumen der Startphase (6 essenziell) |
| historische Datenabdeckung | IBD-RS fehlt (VU-Perzentil nur Evidenz); EPS PIT nach Einreichung, jetzt split-bereinigt | vollständig |
| Ausführungsrealismus | Buy-Stop-Limit am Pivot, pessimistisch; Kosten 0–50 bps gemessen | wie SEPA |
| V4-D1-Exposition | 0 % | 0,99 % |
| Holdout | 522 Trades | 425 Trades |
| zulässige Messklasse | Modellstudie (`MODEL_LIFECYCLE_STUDY`) | Modellstudie |
| verbleibende Zertifizierungsblocker | CC-1 (Übersetzung), CC-3 (manuell), CC-4 (RS), CC-8 | CC-1, CC-3, CC-8 |

Ohne erfundene Originalregeln und ohne Datenkauf ist Minervini technisch fertig. Weiter kommt es nur mit englischen Primärquellen und einer Entscheidung über die manuellen Auswahlregeln.

## 9. Episodic Pivot und Parabolic Short: charttechnischer Stand

- **Episodic Pivot:**
  - Tages-Gap-Screen, ORH-Einstieg aus echten IEX-Minuten, Volumentempo nur auf IEX, KK-034-Stop, Ausstieg unter MA20;
  - Referenz 611 Trades auf 1.828 gemeinsamen Tagen;
  - geschichtet 463 (Jahr × Liquidität) bzw. 429 (zusätzlich × Regime);
  - es gibt keine Katalysator-Prüfung, es bleibt ein **chartbasierter EP-Kandidat**.
- **Parabolic Short:**
  - beschleunigter Anstieg, Intraday-Umkehr (ORL/rote 5-Minuten-Kerze/VWAP-Retest), Stop über dem Tageshoch, Ziel MA10;
  - 228 abgeschlossene Trades auf dem sauberen Präfix, geschichtet 150 bzw. 126;
  - Shorts bleiben **hypothetisch**: keine Borrow-, Locate- oder Leihkostenhistorie, kein Uptick-Rule-Modell.
- **Budget:** Es gab keine neuen Abrufe und keine Budgeterhöhung. Für eine größere Stichprobe hat Entscheidung E5 im Rahmen der bestehenden Grenzen Vorrang.

## 10. Manuelle Entscheidungen und fehlende Daten für eine Zertifizierung

- **Manuelle Quellenentscheidungen, die die Modellannahmen ersetzen:**
  - alle Strategien außer Turtle (CC-3);
  - Anzahl essenzieller Entscheidungen je Strategie: Darvas 8, Weinstein 14/12, Minervini 11/6, Kullamägi 7, Pocket Pivot 7, BGU 8, Holy Grail 3, EP 2, PS 4.
- **Fehlende Daten:**
  - PIT-Korrelationsgruppen (Turtle);
  - PIT-Branchen-Stage und NYSE-Breite (Weinstein);
  - IBD-RS (Minervini);
  - Katalysator- und News-Historie (EP);
  - Borrow-Historie (PS);
  - konsolidiertes Intraday-Volumen (EP, PS, Pocket Pivot, BGU);
  - zweite Corporate-Action-Quelle (alle);
  - Evidenz aus dem prospektiven Paper-Fenster SF6-PAPER-2027 (alle).

## 11. Unabhängige Reviews

Zwei Reviews haben nur den Code gesehen, ohne die Schlussfolgerungen dieses Berichts. Beide liefen vor jedem 6.0-Ergebnis.

| Review | CRITICAL | HIGH | MEDIUM | LOW | Wichtigste Befunde → Behebung |
|---|---|---|---|---|---|
| Code / PIT / Abrechnung | 0 | 2 | 2 | 6 | **H1**: Quarantäne rechnete gehaltene Positionen zum Vortagesschluss ab, echte Abstürze verschwanden → zwei Lesarten BOOK/PRIOR, Test mit −85 %-Absturz. **H2**: Delisting wurde zur Datenlücke → Endursache bleibt, Test. **M1**: Schnitt auf Rohdaten verschob Bereinigungen → Schnitt auf bereinigten Kursen, Test. **M2**: Holdout nutzte DEV-Perioden → Perioden je Fenster. LOW: Konzentration, Profitfaktor, EPS ohne stille Werte und Abgleichstexte behoben; PP-Einstiegsfilter, Darvas-Listing-ID und Merge-Konflikt der Modusliste dokumentiert (Abschnitte 6, 2, 13). |
| Quellentreue / Aussagen | 0 | 2 | 6 | 5 | **HIGH**: k = 5 war als „vorregistriert“ beschrieben → korrekt als post hoc in #722. **HIGH**: CC-8 ließ einen geöffneten Zeitraum zu → nur nie geöffnete Fenster. MEDIUM: PP-Analogie überzeichnet, HG-Trailing entfernt auch den Ausstieg, Darvas „belegt“ zu stark, Abrechnungswirkung der Quarantäne, Kriterien (Sekundärquelle, DQ-K3, neuer Zustand) → alle umgesetzt. |

Offen sind **keine CRITICAL- und keine HIGH-Befunde**. Zusätzlich hat ein Prüfagent die Lückenanalyse (Phase A) und Workstream E bearbeitet. Ich habe dessen Arbeit gegengeprüft: Abrufsperre im Cache-only-Modus, Workflow-Schritt, Eintrag des Laufs.

Eine bewusst offene Einordnung: Bei Darvas misst die Referenz weiterhin vor allem die pessimistische Intrabar-Annahme. In der Allzeithoch-Variante enden 86 % der Trades am Einstiegstag mit einem angenommenen Stop. Das ist die Eigentümerentscheidung D-DARVAS-SIZE-INTRABAR und kein Fehler.

## 12. Antworten auf die 18 Fragen des Auftrags

1. **Sind alle 13 Strategien so weit wie möglich technisch fertiggestellt?**
   - Ja, soweit Quellen und vorhandene Daten es zulassen. Es gibt keine offene Implementierungslücke (`IMPLEMENTATION_GAP` 0).
   - Verbleibende Lücken sind Quellen- oder Datensperren oder manuelle Entscheidungen.
2. **Welche neuen Implementierungen wurden geliefert?** Siehe Abschnitt 1:
   - Integritäts-Quarantäne und -Runner;
   - Validierungsrunner mit Kosten, Perioden, Regime, Liquidität und Konzentration;
   - Holdout-Snapshot;
   - drei Modell- bzw. Abdeckungsvarianten;
   - split-bereinigte EPS-Evidenz;
   - EP/PS-Stichprobe mit Cache-only-Modus und Schichtung;
   - Readiness-Matrix mit 15 Dimensionen.
3. **Welche Fehler wurden behoben?** Siehe Abschnitt 2 für die bestehenden Fehler und Abschnitt 11 für die Review-Befunde der 6.0-Arbeit.
4. **V4-D1?** Eingegrenzt, nicht gelöst. Er bleibt ein echter Datenintegritätsblocker (E1, Abschnitt 3).
5. **Datenzuverlässigkeit?** Siehe Abschnitt 4.
6. **Vollständige Research-Lifecycles?**
   - Neun Strategien mit 9/9 Phasen (inklusive Turtle).
   - Pocket Pivot und Holy Grail mit 8/9 Phasen, 9/9 nur als Modellvariante.
   - EP als Intraday-Modellstudie, PS als hypothetische Studie.
7. **Vollständige diagnostische Backtests?** Nur Turtle S1/S2, mit Datenausnahme.
8. **Reproduzierbar?** Numerisch ja: Alle 11 Referenzen sind ledger-hash-identisch, dazu kommen die Läufe für EP/PS (Abschnitt 6). Die Trade-Stabilität ist gering, die Robustheit nicht belegt (E6).
9. **Methodisch belastbar?** Kosten-, Perioden-, Regime- und Liquiditätsaufteilung sowie die V4-D1-Exposition. Der Holdout ist nur eingeschränkt belastbar (Abschnitt 6).
10. **Quellenlücken?** Siehe Abschnitt 7.
11. **Minervini?** Technisch fertig. Blocker sind Quelle, manuelle Entscheidungen und RS (Abschnitt 8).
12. **EP/PS?** Charttechnisch ausgebaut auf einer bereinigten, geschichteten Stichprobe. Sie bleiben Modellstudie bzw. hypothetisch (Abschnitt 9).
13. **Manuelle Entscheidungen?** Alle Strategien außer Turtle (Abschnitt 10).
14. **Fehlende Daten für eine Zertifizierung?** Siehe Abschnitt 10.
15. **Als Nächstes zertifizierbar?** Am nächsten liegen Turtle S2, dann Kullamägi Breakout und Turtle S1. Vor 2028 ist keine Strategie zertifizierbar: CC-5 braucht die V4-D1-Auflösung, CC-8 die Paper-Evidenz (Management Summary).
16. **Was fehlt vor einer Produktintegration?**
    - mindestens ein `CERTIFICATION_CANDIDATE`;
    - die Auflösung von V4-D1;
    - die ausgewertete Paper-Validierung SF6-PAPER-2027;
    - die Bewertung der versiegelten Kennzahlen durch den Eigentümer;
    - eine Live-Daten- und Ausführungsprüfung.

    Nichts davon ist in 6.0 vorgesehen. Es gibt keine UI- oder Menüänderung.
17. **Zur Merge-Freigabe bereite Draft-PRs?** Die vier PRs aus Abschnitt 1, alle getestet und reviewt. Die Merge-Reihenfolge steht in Abschnitt 13, die Freigabevorlage in Abschnitt 16.
18. **Entscheidungen des Eigentümers?** E1–E6 sind am 24.10.2026 getroffen und umgesetzt (Abschnitt 14).

## 13. Merge-Reihenfolge

1. **#878 A (Integrität)**: zuerst. Basis ist `main`, ohne Konflikt.
2. **#880 E (EP/PS)**: danach. Konflikt nur in der Modusliste von `.github/workflows/supertrader-validation.yml` und im Moduslisten-Test `scripts/supertrader/tests/sf-runner.test.mjs`; beide Modi bleiben (`sf6-integrity` und `kk-intraday-cache`).
3. **#879 B/C/D (Validierung)**: danach. Derselbe Moduslisten-Konflikt, dazu die Snapshot-Modi `capture-holdout` / `restore-holdout`; alle Modi bleiben. So war es auch in 5.0 bei #866/#868.
4. **#881 F (Readiness)**: zuletzt. Der Zweig enthält nur Readiness-Dateien und Dokumente. Nach den drei Merges wird `node scripts/supertrader/source-faithful/completion/build-sf6-readiness.mjs` auf dem Zweig ausgeführt. Der Matrix-Test prüft, dass Artefakt und Builder übereinstimmen.

Die Konflikte löse ich vor jedem Merge auf dem jeweiligen Zweig mit einem Merge-Commit von `main`, ohne Rebase. Danach laufen die Tests, Gate A und die Testisolation erneut.

## 14. Eigentümerentscheidungen vom 24.10.2026 und ihre Umsetzung

| | Entscheidung | Umsetzung |
|---|---|---|
| E1 | V4-D1 bleibt ein echter Datenintegritätsblocker; keine Quarantäne-Lesart als Lösung oder Ausnahme; gezielte Prüfung vorhandener CA-Daten ohne neue Kosten und ohne Massenabrufe | Kriterien 1.2.0: CC-5 nur bei belegter Auflösung, `CC5.satisfiesCriterion = false`, Dimension höchstens TEIL; Prüfplan in #878, nicht ausgeführt |
| E2 | versioniertes, prospektives Paper-Protokoll ab 01.01.2027; kein Scheduler, kein Live-Handel; keine rückwirkende Holdout-Bezeichnung | `SF6-PAPER-2027` 1.0.0, Fingerabdruck gepinnt, Status `PREPARED_NOT_ACTIVE`; CC-8 nur aus diesem Protokoll; Holdout 2008–2015 als bereits genutzt und survivorship-belastet gekennzeichnet |
| E3 | PP-Stop und HG-Trailing bleiben Forschungsvarianten; keine Aufwertung der Messklassen | Referenzen bei 8/9 Phasen; Varianten zählen nie für CC-2; Messklassen unverändert (#879) |
| E4 | SIC-Korrelationsgruppen bleiben Research-Proxys | CC-4 schließt sie ausdrücklich aus; die Turtle-Referenzen laufen ohne Korrelationslimits |
| E5 | keine zusätzlichen EP/PS-Intraday-Abrufe; nur ein priorisierter Plan | Plan in #880 (insgesamt ≈ 2.760 Anfragen im bestehenden Budget), nicht ausgeführt; 0 Abrufe in 6.0 |
| E6 | Bewertung über Kennzahlen und Verteilungen; Sensitivität sichtbar; Reproduzierbarkeit, Trade-Stabilität und Robustheit getrennt | Matrix-Zeile „E6“ je Strategie; Tabelle in [SUPERTRADER_6_VALIDATION_AND_HOLDOUT.md](SUPERTRADER_6_VALIDATION_AND_HOLDOUT.md) Abschnitt 5; Management Summary |

## 15. Prüfungen vor der Merge-Freigabe

| # | Prüfung | Ergebnis | Beleg |
|---|---|---|---|
| 1 | Die vier HIGH-Befunde sind behoben und durch Regressionstests abgesichert. | **ja** | H1 → `SF6-DQ-SETTLE`, H2 → `SF6-DQ-CUT`, k = 5 post hoc → `SF6-DQ-PROVENANCE` (#878); CC-8 mit geöffnetem Fenster → Matrix-Test (#881). Mutationsprobe: Mit zurückgesetzter Korrektur schlagen SETTLE/CUT (H1) bzw. CUT (H2) fehl, ebenso LEVELS für M1. |
| 2 | Die BASE-Referenzen sind mit den maßgeblichen Versionen abgeglichen, ohne Tradezahl-Gleichheit als Hash-Identität zu werten. | **ja** | Ledger-Hash 11/11 identisch, Trade-Hash 9/9 identisch, Turtle-Trade-Hash `NOT_PUBLISHED_BY_REFERENCE`; je Referenz in `sf6-run-facts.mjs`; der Test verlangt den Hash-Abgleich in der Evidenz. |
| 3 | Die Minervini-EPS-Korrektur ändert nur historisch belegbare Fälle, und die 405 ungeklärten Fälle bleiben sichtbar. | **ja** | Korrigiert wird nur bei einem in den Kursdaten deklarierten Split zwischen beiden Einreichungen (DEV 29, Holdout 7). Ungeklärte Fälle stehen auf `null` mit Grund (DEV 405, Holdout 46). Die 4.0-Werte bleiben erhalten, kein Trade ändert sich (#879). |
| 4 | Der Holdout 2008–2015 ist als bereits genutzt und survivorship-belastet gekennzeichnet. | **ja** | Validierungsbericht Abschnitt 1, Matrix-Evidenz „NOT an untouched holdout“, Paper-Protokoll; erfüllt CC-8 nie. |
| 5 | Alle vier PRs sind auf dem finalen Stand grün und konfliktfrei. | siehe Freigabevorlage | Stand der Checks bei Abgabe; die erwarteten Moduslisten-Konflikte werden in der Merge-Reihenfolge aufgelöst (Abschnitt 13). |

## 16. Freigabevorlage

> **Freigabe Supertrader 6.0 (technischer Entwicklungsauftrag)**
>
> Ich gebe die Draft-PRs #878, #880, #879 und #881 in dieser Reihenfolge zum Merge frei. Die Moduslisten-Konflikte werden jeweils per Merge-Commit aufgelöst, und vor #881 wird die Matrix neu gebaut.
>
> Bestätigt:
> - V4-D1 ist eingegrenzt, nicht gelöst (E1).
> - SF6-PAPER-2027 ist festgeschrieben, nicht aktiviert (E2).
> - Modellvarianten und SIC-Proxys sind keine Originalregeln (E3, E4).
> - Es gab keine neuen Intraday-Abrufe (E5).
> - Bewertet wird über Verteilungen, die Sensitivität bleibt sichtbar (E6).
> - 0 von 13 Strategien sind `CERTIFICATION_CANDIDATE`. Alle bleiben `LIVE_NOT_APPROVED` und `DIAGNOSTIC_NOT_CERTIFIED`.
> - Keine Live-Aktivierung, keine Broker-Orders, keine neuen Datenanbieter, keine Änderung der Produktoberfläche, keine Änderung an Gates oder Branch Protection.
>
> Mit dem Merge ist Supertrader 6.0 abgeschlossen. Eine Phase 7.0 wird nicht gestartet. Die Aktivierung von SF6-PAPER-2027 und die V4-D1-Prüfung brauchen je eine eigene Freigabe.

## 17. Abschluss

Mit der Integration der vier PRs ist Supertrader 6.0 als technischer Entwicklungsauftrag abgeschlossen. Es folgt keine eigenständige Supertrader-7.0-Phase. Die offenen Punkte aus der Management Summary (V4-D1-Prüfung, Aktivierung von SF6-PAPER-2027, Prüfung der versiegelten Kennzahlen, EP/PS-Plan) starten nur nach einer gesonderten Freigabe des Eigentümers.
