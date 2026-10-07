# Mission IX: Präregistrierung

Stand: 07.10.2026. Branch `claude/vision-universe-mission-viii-7hjwma`. Protokoll: `scripts/technical/hsab/protocol9.json`.

Diese Datei wird **vor** der einmaligen Bestätigung A9_CONFIRM committet. Ihr SHA-256 steht in `protocol9.json` (`preregistration.sha256`).

**Freeze-Mechanik** (nach dem Red Team, `reviews/MISSION9_METHODOLOGY_REDTEAM.md` H1/H2):
* Der Freeze-Commit enthält diese Datei, `protocol9.json` mit Status PREREGISTERED und die Engine- und Treiber-Hashes.
* Der Öffnungs-Commit trägt `[hsab9-confirm] freeze=<Freeze-Commit>` am Anfang des Betreffs.
* Der Workflow bricht ab, wenn:
  * zwischen Freeze-Commit und Öffnungs-Commit irgendetwas unter `scripts/technical`, `quant/engines`, im Workflow oder an dieser Datei geändert wurde;
  * der Freeze-Commit kein Vorfahr ist;
  * auf irgendeinem Branch schon eine Öffnungsmarke oder ein Ergebnis existiert;
  * der Branch sich seit dem Öffnungs-Commit bewegt hat.
* Die Öffnungsmarke wird vor Stage 2 gepusht. Ein abgebrochener Lauf gilt als verbraucht und wird berichtet, nicht wiederholt.
* Alle Laufzeit-Regeln (`track-a.mjs` `decideTrackA`, `evaluate.mjs`, `structural-outcomes.cjs`, `validation-stats.cjs`) liegen unter `scripts/technical` und sind damit eingefroren.

Nach dem Öffnen gibt es keine Änderung an Regeln, Klassen oder Schwellen.

Mission VIII bleibt eingefrorene Evidenz: `protocol.json`, `HISTORICAL_ACCURACY_PREREGISTRATION.md` und die Holdout-Ergebnisse werden nicht verändert. Die Engine ist unverändert. Ihre Datei-Hashes stehen in `protocol9.json` unter `freeze.engineFiles`, identisch mit dem Mission-VIII-Freeze bis auf den Treiber `replay.mjs`. Der Treiber hat neue Auswahloptionen bekommen; die Produktausgabe ist davon nicht berührt (Test HSAB-C3 und M9-E1).

## 1. Was schon angesehen wurde (Exploration, kein Beleg)

| Schritt | Daten | Gesehen | Ergebnis |
|---|---|---|---|
| Track A DEV | W_DEV, 94.686 Ereignisse | ja | keine Klasse mit hoher Trefferquote nach Kontrolle; Lift 1–4 Pp. in allen Klassen |
| Track A VAL | W_VAL, 91.939 Ereignisse | ja, nach schriftlichem Freeze | alle vier eingefrorenen DEV-Aussagen repliziert |
| Track B DEV | Überlebende Bucket 0/2, 150.933 Einheiten | ja | VU_BULL senkt die Superwinner-Präzision; RS26 schwach positiv |
| Track B VAL | Überlebende Bucket 1/2, 147.759 Einheiten | ja, nach schriftlichem Freeze | HB1–HB4 repliziert |
| Fallstudie PLTR | ein Titel | ja | nur Erklärung |
| **Mission VIII D_HOLDOUT** | Tag, 1.200 andere Titel, **gleicher Kalender und gleiche Engine** | ja (Mission VIII) | PSS 69,1 % gegen D 68,1 %, Lift +1,0 Pp. [0,5; 1,5]; alle Selektivitätsstufen < +2 Pp. (AGREEMENT_TOP10 +1,7 [0,2; 3,3]) |

Der Mission-VIII-Tagesbefund macht ein positives HA1-Ergebnis von vornherein unwahrscheinlich. Die Bestätigung prüft darum vor allem, ob der Nullbefund auf neuen Titeln hält **und** ob das Konfidenzintervall eine hohe Trefferquote tatsächlich ausschließt. Sonst lautet das Ergebnis INCONCLUSIVE und nicht „kein Edge“.

DEV und VAL liegen auf **verbrauchten** Wochendaten (Register #1–#3). Sie sind Entwicklung und Validierung, keine Bestätigung.

## 2. Track A: Bestätigung A9_CONFIRM (einmalig)

**Daten:**
* Tagesengine (Produkt, eingefroren).
* Stammaktien des Produktuniversums mit Hash-Rang 1200–2399 nach `sha256("hsab|sample|"+id)`. Das ist titel-disjunkt zu Mission VIII, das nur die Ränge 0–1199 geöffnet hat; `--disjoint-from` erzwingt das.
* Erkennungszeitpunkte (Skala-2-Pivotbestätigung) und Monatsraster 2017-01-01 bis 2026-09-30.
* Outcome-Regel, Horizont, Kontrollen, Kosten und Selektivitätsschwellen sind **unverändert aus Mission VIII**: PSS mit Ziel 1 vor Schlusskurs jenseits der Invalidation, H = 126 Handelstage, Kontrolle D.

**Status:** CONDITIONAL HOLDOUT. Die Titel sind für TI-Tagesszenarien ungeöffnet, der Kalenderzeitraum ist aus den Wochenstudien bekannt.

**Auswertung:** `track-a.mjs` auf dem kursfreien Ereignis-Export.
* Klassen nach Chance/Risiko (CRV = Zielabstand / Invalidationsabstand in ATR): <0,5 · 0,5–0,75 · **0,75–1,33 (symmetrisch)** · 1,33–2 · 2–3 · ≥3.
* Günstig (FAV) = CRV ≥ 4/3 (Code: 1,3334; „1,33“ in Tabellen ist gerundet). Ereignisse mit Invalidationsabstand ≤ 0 haben keine Geometrie-Klasse und werden gezählt, aber nicht klassiert.
* Selektivitätsstufen: ALL, CLEAR, AGREEMENT_TOP25 (|Agreement| ≥ 0,7793), CLEAR_TOP25, AGREEMENT_TOP10 (≥ 0,8706).
* Statistik: Zwei-Wege-Cluster-Bootstrap (Titel × Halbjahr), B = 500.
* Die Selektivitätsschwellen (0,7793 / 0,8706) sind Wochen-Quantile aus Mission VIII W_DEV und bleiben unverändert. Auf Tagesdaten entsprechen sie nicht genau Top 25 % bzw. Top 10 %. Die tatsächliche Abdeckung wird berichtet.

### Hohe-Genauigkeit-Kriterium (HAC) einer Klasse

Alle Bedingungen gleichzeitig:
* n ≥ 300;
* Trefferquote ≥ 0,60;
* Lift gegen Kontrolle D (gleiches Datum, gleiche ATR-Geometrie) ≥ +5 Pp., 95-%-Untergrenze > 0;
* **und** Lift gegen Kontrolle E (zusätzlich einfacher Trend und ATR%-Terzil) ≥ +5 Pp., 95-%-Untergrenze > 0. So zählt ein Lift, den schon der einfache Trend erklärt, nicht als Treffsicherheit.
* Klasse mit CRV ≥ 0,75.

**HAC ausgeschlossen** heißt: n < 300, obere Lift-Grenze gegen D < +5 Pp. oder obere Treffer-Grenze < 60 %.

### HA1 (primär): Entscheidung Track A

* **ROBUST HIGH-ACCURACY EDGE:** SYM·ALL (alle symmetrischen Ereignisse, ohne Auswahl) erfüllt HAC.
* **SELECTIVE HIGH-ACCURACY EDGE:** SYM·ALL erfüllt HAC nicht, aber mindestens eine der acht vorab benannten Stufen erfüllt HAC und bleibt nach Holm über diese acht Stufen signifikant (einseitig, H0: Lift ≤ 0, α = 0,025). Die acht Stufen: SYM·CLEAR, SYM·AGREEMENT_TOP25, SYM·AGREEMENT_TOP10, FAV·ALL, FAV·CLEAR, FAV·AGREEMENT_TOP25, FAV·AGREEMENT_TOP10, RR1.33-2.
* **NO HIGH-ACCURACY EDGE:** keine Stufe erfüllt HAC **und** für SYM·ALL und alle acht Stufen ist HAC ausgeschlossen.
* **INCONCLUSIVE:** sonst (das KI lässt eine hohe Trefferquote offen).

DEV/VAL-Ergebnis mit dieser Regel: NO HIGH-ACCURACY EDGE. Die obere Treffer-Grenze liegt in allen symmetrischen und günstigen Stufen unter 60 %.

### HA2 (sekundär, Holm über 2): Selektivität

ALL·AGREEMENT_TOP10 und SYM·AGREEMENT_TOP10 zeigen einen Lift mit 95-%-Untergrenze > 0. Relevant (Mission-VIII-Regel) ist ein Lift ≥ 2 Pp. bei Untergrenze ≥ 0,5 Pp.

DEV/VAL (Woche): +3,9/+4,3 Pp. bzw. +5,7/+4,9 Pp.

### HA3 (beschreibend): Geometrie erklärt die Trefferquote

In RR<0,5 gelten beide Bedingungen:
* Die Kontrolle D selbst trifft ≥ 0,60 („hohe Trefferquote ohne Information“).
* Nur zur Orientierung: die Trefferquote von VU gegen die naive geometrische Referenz b/(a+b). Diese Referenz ist **kein** gültiger Random-Walk-Maßstab für die Outcome-Regel: Das Ziel zählt bei Berührung, die Invalidation nur per Schluss, Zeitablauf zählt als Fehlschlag. Die Aussage stützt sich daher auf die Kontrolle D.

### HA4 (beschreibend): Trend allein

|Lift FULL − Lift TREND_ONLY| < 1,5 Pp. in ALL·ALL und SYM·ALL.

### HA5 (beschreibend): Erwartungswert

* Strukturelle Erwartung in R für ALL, SYM und FAV, mit Überschuss gegen Kontrolle D.
* Getrennt davon die Ausführungs-Erwartung: Rendite nach Kosten gegen gematchte Kontrolle.

Vorhersage: strukturelle Erwartung < 0 in ALL. Der Überschuss gegen die Kontrolle ist klein und positiv.

Der Gesamt-Lift von `evaluate.mjs` (Replikation des Mission-VIII-Tagesbefunds auf neuen Titeln) wird nur beschreibend berichtet.

## 3. Track B (keine frische Bestätigung möglich, ehrlich herabgestuft)

Alle Wochenpfade sind verbraucht: Überlebende in Mission I–IV, Delistete im Mission-VIII-Holdout. Langfrist-Horizonte von 6–36 Monaten schließen prospektive Daten aus. Track B endet darum auf der Stufe **VALIDATION_ON_CONSUMED_DATA**.

**Einheiten:** Titel × Kalenderquartal mit mindestens 160 Wochen Historie.
* Signalzustand: letzter Erkennungspunkt höchstens 13 Wochen vor dem Quartalsende bzw. exakter Quartalsend-Zustand.
* Erfolg: maximales Vielfaches ≥ 2×/3×/5×/10× innerhalb von 6/12/24/36 Monaten (2× = +100 %).
* Erwartung: Schicht aus Quartal × einfacher Trend × Terzile von Momentum 52W, Volatilität und Abstand zum 52W-Hoch × Altersklasse, ohne die Einheit selbst. Zusätzlich eine reine Datumsbasis.
* Datenqualität: Wochensprung > ×4 oder < ×0,25 schließt das Fenster aus.
* Bootstrap: Titel × Jahr.

**Offenlegung (Red Team M3).** Die folgenden Aussagen wurden nach DEV formuliert. Die Freeze-Notiz ist erst zusammen mit den VAL-Ergebnissen in Git verankert (Commit `923f9fb`). Der VAL-Lauf wurde etwa eine Minute **vor** dem Schreiben der Notiz gestartet, ohne dass Ergebnisse angesehen wurden; beweisen lässt sich das nicht. Track B ist deshalb **explorativ mit Gegenprobe auf verbrauchten Daten**, keine präregistrierte Bestätigung.

Nach dem Red Team wurden vier Fehler behoben und DEV/VAL mit dem korrigierten Code neu gerechnet:
* H3: Anomalie-Tor nur auf die Vergangenheit;
* H4: Mindestkurs verworfen (Look-ahead);
* M1: Zeitblöcke ≥ Horizont;
* M2: Vergleich nur gegen nicht markierte Einheiten derselben Schicht.

Maßgeblich sind die korrigierten Zahlen im Bericht. Die alten Zahlen unten bleiben zur Nachvollziehbarkeit stehen.

Ursprünglich nach DEV formuliert und auf VAL (alter Code) beobachtet:
* **HB1:** VU_BULL, 5×/24M, Schichtvergleich: Obergrenze < 1. VAL 0,79 [0,66; 0,89].
* **HB2:** VU_BULL ∧ Trend ∧ Momentum Top-20: Schichtvergleich, KI enthält 1. VAL 0,93 [0,74; 1,12].
* **HB3:** RS26 Top-20, 5×/24M, Schichtvergleich: Untergrenze > 1. VAL 1,16 [1,02; 1,32].
* **HB4:** Basis 24M: Top-5-%-Anteil an den Gewinnen > 0,40 und Mittel ohne Top 5 % < halbes Mittel. VAL 0,44 bzw. 0,104 gegen 0,285.

Survivorship-Erweiterung (CI, delistete Kohorte, verbraucht) wird nur als Sensitivität berichtet.

**Entscheidung Track B** (mechanisch in `decide-m9.mjs`, auf DEV und VAL mit korrigiertem Code):
* ROBUST ASYMMETRIC EDGE: ein VU-Signal (VU_BULL, VU_BULL_CLEAR, VU_BULL_STRONG, VU_BULL_AND_TREND_MOM, VU_BULL_EXACT) mit 5×/24M-Schichtvergleich > 1 (Untergrenze > 1) auf DEV **und** VAL **und** positivem Überschuss-Mittel (gedeckelt 4×) ohne Top 5 % auf beiden.
* SELECTIVE: dasselbe nur auf einer Stichprobe oder nur ungedeckelt.
* NO ASYMMETRIC EDGE: sonst.

Einfache Signale (RS, Momentum) werden als Kontrolle berichtet und nicht als VU-Edge gezählt.

## 4. Elliott / Wave 3

**Angezeigter Elliott-Zustand:** in DEV nicht auswertbar, weil er fast nie spricht (Motiv in < 3 % der Erkennungspunkte, offene Welle 1–3 praktisch nie).

**Interne Kandidaten** (ausgabeneutrale Forensik-Haken, `--grid-records`).

**Offenlegung (Red Team M3):** Die Definition `earlyUp` entstand **nach** der Sichtung der PLTR-Fallstudie, die genau diese Felder neben dem späteren Vielfachen zeigte, und vor jeder Universumsauswertung. Am 31.03.2023 erfüllt PLTR die Definition. Deshalb gilt:
* Elliott/Wave 3 ist **explorativ**.
* Zusätzlich wird die breiteste Lesart `EW_INT_UP_ANY_OPEN` berichtet (irgendein unvollständiger Aufwärts-IMPULSE, ohne Wellen- und Altersbedingung). Sie wurde vor der Universumsauswertung festgelegt.

Die Definition „frühe Aufwärts-Motivwelle“ (`track-b.mjs` `earlyUp`, Test M9-B1):
* bester interner IMPULSE-Kandidat aufwärts;
* unvollständig;
* 2 markierte Wellen (Welle 2 abgeschlossen, Welle 3 stünde bevor) oder 3 markierte Wellen (Welle 3 bereits markiert und laufend; das ist **nicht** „vor Welle 3“);
* letzte Wellenmarke höchstens 4 Wochen alt.

DEV liegt auf Bucket 0/4, VAL auf Bucket 1/4. Entscheidung mechanisch in `decide-m9.mjs` (`decideElliott`).

**Entscheidung Elliott:**
* INCREMENTAL PREDICTIVE VALUE: Schichtvergleich > 1 (Untergrenze > 1) auf DEV und VAL für 5×/24M oder 2×/12M.
* USEFUL FILTER: innerhalb TREND_MOM bzw. RS26 höhere Präzision auf DEV und VAL.
* STRUCTURAL LANGUAGE ONLY: kein Prognosewert, aber eine stabile, erklärende Beschreibung.
* NO MEASURABLE VALUE: sonst.

## 5. Was nicht getan wird

* keine Änderung an Engine, Elliott, Szenario-Schwellen, Zielen oder Invalidation;
* kein Elliott 3.3;
* kein Nachtuning nach dem Öffnen;
* kein Wiederöffnen von Mission-VIII-Holdouts als Bestätigung;
* die PLTR-Fallstudie fließt in keine Regel ein.
