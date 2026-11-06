# E5 – Unabhängige Treueprüfung C08: Kullamägi Breakout

Stand: 05.11.2026. Strang E, Codex. **Forschung, nicht zertifiziert.** Keine Code-, Parameter- oder Datenänderung. Geprüfter `main`-Commit: `24568ffc722572e0a463a7b6420a02f6a31b07d2`. Alle Datei-/Zeilenangaben beziehen sich auf diesen Commit; keine Aussage über spätere Änderungen.

## Urteil

C08 ist eine offengelegte **Tagesdaten-Modellstudie mit wesentlichen Abweichungen**, kein treuer historischer Nachbau der vollständigen Kullamägi-Methode. Besonders schwer wiegen die fehlende Auswahl/Priorisierung der stärksten Aktien, fehlende Anpassung an den Markt, der verspätete Einstieg und das dadurch veränderte Stoppniveau. Die feste 10-Tage-Linie ist eine ausdrücklich erlaubte Anfänger-Lesart, aber kein Ersatz für seine gesamte, vom Tempo der Aktie abhängige 10/20-Tage-Verwaltung.

**Frühe Gewinnerbeendigung:** Es gibt keinen pauschalen Vollverkauf nach 3–5 Tagen und kein fixes Gewinnziel. Potenziell abgeschnitten werden Gewinner durch den festen MA10 statt eines passenden MA20, den nominalen Break-even-Stopp und das Vortagestief der Folgetagesausführung. Ein gleichzeitig ausgelöster MA-Ausstieg verkauft die ganze Position statt nur eines Drittels. Das ist teilweise zulässige Quell-Lesart, teilweise Modellkonvention; nicht jeder frühe Ausstieg ist ein Implementierungsfehler. Wie viel Rendite diese Mechanismen kosten oder sparen, ist ohne vergleichbare historische Läufe offen.

## Prüfgrundlage und Quellen

Gelesen: `AGENTS.md`, `CLAUDE.md`, Neustart-Plan und E-Stand auf `main`; C08-Vertrag, Methodenfunktionen, Modellannahmen, Varianten, Lesartenentscheidung, Produktdetektor, gemeinsamer Lifecycle und Forschungsreferenz sowie `docs/SUPERTRADER_13_METHODS_EVIDENCE.md`.

Unabhängig am 05.11.2026 abgerufene öffentliche Primärquellen:

- **Q1:** Kristjan Kullamägi, [My 3 timeless setups that have made me tens of millions](https://qullamaggie.com/my-3-timeless-setups-that-have-made-me-tens-of-millions/), 08.01.2021. Abschnitte „Breakouts“, „How to find these setups?“, „How do you trade this setup?“ und eigene Antworten vom 09.02., 13.04. und 17.04.2021. SHA-256 der abgerufenen HTML-Datei: `62ff5417702819f81cd6b55d4c8f2952fea5b47737fd667c2ebd6580a0632423`.
- **Q2:** Kullamägi, [FAQ](https://qullamaggie.com/faq/), insbesondere „What is the Average Daily Range (ADR) in TC2000 and what’s the formula for it?“. HTML-SHA-256: `7b63d7d4a21eb007fb3f23b09c360f3696448154194316e2867c78fa56fa28a3`.

Die heutigen HTML-Hashes sind Abrufbelege, keine Gleichheitsbehauptung mit den älteren Repository-Quellhashes. Leserkommentare wurden nicht als Autorenregeln verwendet. Eingebettete Videos/Twitch-Inhalte wurden nicht vollständig nachgeprüft. Die repositoryeigene Evidenzextraktion dient zum Auffinden der Regeln, nicht als unabhängiger Beweis ihrer Richtigkeit.

Entscheidende Originalstellen aus Q1:

> “Scan for the 1 or 2% of stocks that are up the most over these 3 timeframes” (1, 3, 6 Monate).
>
> “just look at the daily chart and enter when the stock is starting to break out.”
>
> “Stop is always lows of the day and stop should not be wider than the ATR or ADR of the stock”.
>
> “You should sell 1/3 to 1/2 of the position after 3-5 days, and then move the stop to break even.”
>
> “The rest of the position should be trailed with the 10- or the 20-day moving average. Depends on how fast the stock is. If a beginner stick to the 10-day. You wait for the first CLOSE below the 10-day.”

Marktkontext: eigene Antwort vom 17.04.2021: “Fewer or no trades”; vom 09.02.2021: “yes but individual/group stock action trumps all”. Ein zwingender SPY-200-Tage-Filter lässt sich daraus **nicht** ableiten. Ebenso ist ein Kauf beim Ausbruch belegt, aber keine Pflicht zu einem bestimmten Broker-Auftragstyp: Er schreibt am 09.02.2021 “I use market orders mostly”. „Kauf-Stopp“ wird unten als bedingter Kauf bei Ausbruchsüberschreitung verstanden.

## Regelweiser Abgleich und Wirkung

Pfadkürzel für die Fundstellen (jeweils vollständig aufgelöst):

- **K:** `scripts/supertrader/source-faithful/methods/kullamagi.mjs`
- **L:** `scripts/supertrader/source-faithful/research/kk-breakout-lifecycle.mjs`
- **E:** `scripts/supertrader/source-faithful/research/lifecycle-engine.mjs`
- **V:** `scripts/supertrader/source-faithful/contracts/kullamagi.mjs`
- **P:** `scripts/supertrader/source-faithful/product/detectors.mjs`
- **S:** `scripts/supertrader/source-faithful/common/series.mjs`

„Hoch/mittel/gering“ bezeichnet mögliche materielle Bedeutung, nicht gemessene Renditeänderung. Die Richtung ist nur dort angegeben, wo sie aus dem Mechanismus folgt.

| ID / Regel | Umsetzung, Abweichung und genaue Fundstelle | Einfluss auf das Ergebnis |
|---|---|---|
| F01 – stärkste 1–2 % | Q1 verlangt das Scannen der aktuellen Leader über 1/3/6 Monate. K:53–66 berechnet Perzentile, schließt aber nichts aus; L:18–20 und L:108–113 verwenden diese Ränge weder zur Auswahl noch zur Kaufpriorität. E:203–205 vergibt knappe Mittel nach datumsabhängig neutraler Reihenfolge. Der Verzicht auf einen sechsfachen AND-Filter in der Autorenantwort rechtfertigt nicht den vollständigen Verzicht auf Momentum. | **Hoch.** Andere Population, mehr schwache Ausbrüche und möglicher Kapitalverbrauch vor echten Leadern. Vermutlich schlechtere Setup-Qualität; Nettoeffekt nicht quantifiziert. Verhindert Gewinner bereits beim Kauf statt sie später zu verkaufen. |
| F02 – Produkt/Forschung messen unterschiedliche Auswahl | P:236–256 verlangt bestes Perzentil ≥98, bevor ein Plan entsteht; K:65 nimmt das Maximum der verfügbaren Horizonte. Das ist weder zwingend Top-2 % in allen drei Horizonten noch insgesamt nur eine 2-%-Menge; es ist eine Vereinigung von Leaderlisten. Die historische Referenz hat diese Auswahl gar nicht. V:60 nennt dennoch „screen the top 1–2 %“, bei `gate: false`. | **Hoch.** Historische C08-Ergebnisse validieren keine Produktstrategie mit P98. Max/OR über Horizonte ist eine mögliche Operationalisierung, kein aus Q1 eindeutig bestimmter Algorithmus. Bindungen, fehlende Historie und Querschnitt beeinflussen die Auswahl. |
| F03 – Marktfilter/Exposition | V:30 schließt KK-050/051 als Reviewer-Kontext aus. E:45–49 hält Marktanpassung ausdrücklich außerhalb des Modells; L:114–128 prüft keinen Marktindikator und skaliert Risiko nicht nach Umfeld. | **Hoch.** Es wird auch in ungünstigen Phasen mit derselben Regel gehandelt, solange lokale Setups entstehen. Mehr Fehlversuche/Kosten plausibel; Wirkung auf CAGR und Drawdown offen. Kein Beleg für eine bestimmte mechanische Ersatzschwelle. |
| F04 – Setupqualität | Q1 fordert geordneten Rücksetzer, höhere Tiefs, enger werdende Konsolidierung und „Surfen“ an steigenden Linien. L:86–99 prüft lediglich Schluss über 10-Tage-Hoch, Vorbewegung ≥30 % vom tiefsten Tief der 63 Tage vor der Konsolidierung zum ersten Konsolidierungsschluss sowie steigende MA10/20 über fünf Sitzungen. Höhere Tiefs, Verengung, geordneter Rücksetzer, Nähe zur Linie und Volumenkontraktion werden nicht als Setupbedingungen geprüft. K:75–79 zeigt höhere Tiefs nur als Evidenz; P:254 reicht sie nur weiter. | **Hoch.** Ein beliebiges lokales Hoch wird leichter zum „Setup“. Feste zehn Sitzungen bilden die typischen 2 Wochen bis 2 Monate nur am unteren Rand ab; Verlauf und Ausbruchsniveau werden ersetzt. Beide Richtungen möglich, besonders Gefahr zusätzlicher minderwertiger Trades. |
| F05 – Kauf am Ausbruch | L:57 setzt `NEXT_OPEN`; L:89–90 wartet auf den abgeschlossenen Schluss über dem alten Hoch, L:124–128 legt `ON_OPEN` an. E:86 kauft dann am Open, ohne erneute Ausbruchsüberschreitung zu verlangen. Der bereits vorhandene BUY_STOP-Zweig E:87–90 wird für C08 nicht benutzt. Q1 erlaubt Tagescharts, sagt aber „when … starting to break out“, nicht „nach Schlussbestätigung am nächsten Morgen“. Die Schlussauktion-Alternative L:116–122 verwendet bereits finales Schluss-/Tiefwissen; K:42–49 und V:45 schreiben diesen Schlusszeitpunkt stärker fest als Q1. | **Hoch.** Frühe Teile kräftiger Ausbrüche fehlen; Gap-up-Gewinner können wegen ADR überhaupt entfallen. Umgekehrt werden manche intraday gescheiterten Ausbrüche ausgelassen. Ein Open unter dem Ausbruchsniveau wird gekauft, sofern noch über dem Stopp und innerhalb ADR. Das ist keine Ausbruchs-Kauf-Stopp-Ausführung. |
| F06 – Tagestief-Stopp gehört zum falschen Tag | Im REF ist `stop: b.low` in L:128 das Tief des **Signaltags**, nicht des Einstiegstags am nächsten Morgen. E:92–96 prüft diesen Stopp gegen den Folgetagesbalken, E:215–216 beendet bei Berührung sicher am Einstiegstag. Das neue Tagestief kann höher oder tiefer sein als das alte; beide Stopps sind nicht austauschbar. | **Hoch.** Ein altes, zu hohes Tief kann einen danach starken Trade sofort beenden; ein altes, tieferes Tief vergrößert das Risiko und reduziert die Stückzahl. Bei ursprünglichem Intraday-Einstieg wäre das Tief nur bis zum Einstieg bekannt. Ein später neu entstehendes finales Einstiegstagstief rückwirkend als Stopp einzusetzen wäre ebenfalls unzulässig. |
| F07 – ADR-Grenze | K:17–21 berechnet korrekt die FAQ-Grundformel mittlerer `H/L−1` über 20 Sitzungen. K:30–37 vergleicht `(Entry−Low)/Entry` mit diesem Prozentwert, statt einen identisch normierten absoluten Tagesrange-Abstand zu vergleichen; ATR-Alternative entfällt. Vorperiodenwahl ist eine PIT-Konvention: K:20 schließt die aktuelle Sitzung aus, Q2 zeigt H0…H19. REF nimmt in L:126 die 20 bereits abgeschlossenen Tage einschließlich Signaltag. V:64 deklariert den Nenner als Ableitung, trägt aber noch `SOURCE_EXACT`. | **Gering je Grenzfall, kumuliert offen.** Bei Low 100 und Entry 105 ist der Abstand 4,762 % statt 5 % relativ zum Low; der Entry-Nenner ist toleranter. Ein breiter Stopp wird korrekt verworfen, **nicht** künstlich auf ADR engergezogen. Slippage wird erst in E:168 ergänzt: Die ADR-Prüfung gilt nicht für den vollständigen tatsächlichen Kaufpreis. |
| F08 – Zeitpunkt/Anteil des Teilverkaufs | REF L:45/57 wählt Tag 3 und 1/3, gültige untere Enden aus Q1. L:132–136 entscheidet erst am Schluss von E+3 (Einstiegstag zählt als 0); E:190–193 verkauft am nächsten ausführbaren Open, normalerweise E+4. Variante Tag 5/Hälfte L:46 verschiebt den tatsächlichen Verkauf normalerweise auf E+6. | **Mittel.** REF E+4 liegt noch innerhalb „nach 3–5 Tagen“; die Behauptung „Verkauf am Tag 3“ wäre aber ungenau. Die Tag-5-Variante überschreitet bei gleicher Zählweise das Fenster. Kleinerer Anteil lässt mehr Gewinnerpotenzial stehen; spätere Ausführung fügt Gap-Risiko hinzu. Keine pauschale Fehlerbehauptung für die erlaubte Drittel-Wahl. |
| F09 – übersprungener Teilverkauf wird nie nachgeholt | L:134–136 setzt `partialDone=true`, **bevor** `c > pos.entry` geprüft wird. Bei Tag-3-Schluss ≤Einstand entfallen Teilverkauf und Break-even dauerhaft, auch bei Gewinn an Tag 4 oder 5. Q1 nennt weder diese Profitbedingung noch diesen einmaligen Verfall. L:139–141 aktiviert trotzdem ab E+3 den MA-Trail, auch ohne erfolgten Teilverkauf. | **Mittel bis hoch.** Späte Erholung erhält keine geplante Gewinnsicherung; die gesamte Position kann bereits am MA aussteigen. Kann spätere Gewinner größer lassen oder mehr Gewinn zurückgeben. Die zusätzliche vollständige MA-Verwaltung ohne Teilverkauf verändert den Ablauf „Rest nach Teilverkauf“. |
| F10 – Break-even | L:136 setzt den Stopp auf `pos.entry`, E:154 macht ihn ab Folgesitzung wirksam. E:176 speichert den ungeslippten Referenz-Fill als `entry`; Kosten stehen in E:168–169 bzw. E:134–136 separat. Q1 verlangt Break-even nach dem Teilverkauf: Diese Sicherung ist also grundsätzlich quellentreu, kein frei erfundener Gewinnkiller. | **Mittel.** Rücksetzer zum Einstieg können den Rest früh beenden, auch wenn der Trend später weiterläuft; das ist Teil dieser Quell-Lesart. Nominaler BE ist nicht Kosten-BE: Bei 100 Referenzpreis und 10 bp Slippage +1 bp Gebühr je Seite verliert die Restaktie bei nominal 100 rund 0,31. Der Stopp steigt bereits mit der Planung des Teilverkaufs; ohne ausführbares nächstes Open erfolgt noch keine Ausführung. |
| F11 – fester MA10 statt geschwindigkeitsabhängiger MA10/20 | L:45/57 setzt immer MA10, L:140–141 verlangt ersten Schluss **unter** dem SMA. MA20 bleibt nur Variante L:47/65. S:48–52 bestätigt einfachen Mittelwert einschließlich aktuellem Schluss. E:156/190–197 führt den geplanten Exit am nächsten Open vor weiteren Stopps aus. | **Hoch für den rechten Gewinnrand.** Ein stetiger Trend mit normalem Rücksetzer unter MA10, aber über MA20 wird vollständig beendet; bei typischem Aufwärtstrend oft früher als mit MA20, aber nicht mathematisch für jeden Pfad. MA10 ist ausdrücklich eine erlaubte Anfängerregel: Einschränkung der Methode, kein pauschaler Verstoß. Die Quelle bindet die Wahl an das Tempo der Aktie. Nächstes Open statt Schlusskurs fügt Gap-/Timing-Abweichung hinzu. |
| F12 – Teilverkauf und Vollausstieg am selben Schluss | L:136 plant zuerst 1/3, L:141 kann sofort danach 100 % planen. E:156 lässt den Vollausstieg gewinnen; E:192 verkauft alle Stücke. Dazu muss der Kurs zugleich über Einstand und unter MA10 liegen, was möglich ist. | **Mittel.** Sichtbar kann ein Gewinner nach wenigen Tagen zu 100 % geschlossen werden. Ursache ist der gleichzeitig ausgelöste MA, kein versteckter 3-Tage-Vollverkauf. Gegenüber „Teilverkauf plus Rest-MA“ bei bereits gebrochenem MA vertretbare Prioritätsregel; gegenüber späterem Trailbeginn/MA20 kürzere Teilnahme. |
| F13 – Risiko, Universum und Kapitalvergabe | L:39/57 fixiert 0,5 % Risiko statt diskretionärer Anpassung. E:45–49 begrenzt auf 25 % Position, Cash-only und 20 Positionen; Quellcap ist 30 % in K:14/25 bzw. L:104. S:97–110 verlangt Kurs ≥5 und durchschnittlich ≥1 Mio. Dollarumsatz. E:53–62 und E:160–167 begrenzen Stückzahlen, nicht die Haltedauer. Keine Aufstockungen; gewachsene Positionen werden nicht auf 25/30 % zurückgeschnitten (E:49). | **Mittel bis hoch für Portfoliorendite.** 25-%-Cap ist innerhalb des 30-%-Maximums, aber eine zusätzliche strengere Modellgrenze. Unterschiedliche Liquiditätsauswahl, Risikogröße, Kapitalpriorität und fehlende Adds verändern Gewinnergewichte. Kein Beleg für automatisches frühes Trimmen großer Gewinner. |
| F14 – technische Zwangsabwicklungen | E:226–237 kann wegen Delisting oder fehlender frischer Preise verkaufen, unabhängig vom MA; `scripts/supertrader/validation/accounting-contract.mjs:30,78–90` setzt die Stale-Grenze auf mehr als fünf Sitzungen. E:266–268 markiert verbleibende Positionen dagegen offen am Datenende. | **Fallabhängig hoch.** Datenlücken können Gewinner vorzeitig beenden; Delisting-Abrechnung ist ein Daten-/Portfolio-Modell, keine Handelsregel Kullamägis. Wichtig für Auswertungen: offene große Gewinner fehlen in reinen Closed-Trade-Statistiken; sie werden hier nicht zwangsweise am Testende verkauft. |

## Modellannahmen, Lesarten und Evidenzstatus

Die wesentlichen Ersatzentscheidungen sind **bereits offengelegt**: L:34–42 benennt Setup-, Timing-, Exit-, Risiko-, Universums- und Kostenannahmen; L:59–70 registriert Alternativen. Das macht die Modellstudie nachvollziehbar, aber nicht automatisch zur Originalmethode.

`scripts/supertrader/source-faithful/certification/READING-DECISIONS-2026-11-04.json:30–36` bestätigt ausdrücklich `CONSOLIDATION_10` und `RESEARCH_WITHOUT_MOMENTUM_SELECTION`, CC-3 bleibt offen. Eine freigegebene Forschungslesart hebt die in F01/F04 beschriebenen Treueabweichungen nicht auf.

Das Evidenzdokument ist überwiegend angemessen vorsichtig:

- `docs/SUPERTRADER_13_METHODS_EVIDENCE.md:194` nennt die Treue **TEILWEISE**, den Setup-Proxy und den Momentum-Split. Der dort noch als offene Owner-Auswahlfrage geführte Momentum-Split ist durch die spätere Lesartenentscheidung für die Forschung beantwortet; der inhaltliche Unterschied zum Produkt bleibt bestehen.
- `:195–198` belegt Parameter-/Ausführungsprüfungen, nennt Einstieg/Ausstieg nur teilweise bzw. Modellannahme und den ORH-Hauptweg blockiert. Golden Cases und Kausalität beweisen korrekte Ausführung **dieses Modells**, nicht die Gleichwertigkeit mit Kullamägis Methode.
- `:312` führt den ADR-Nenner noch als Dokumentationslücke ohne Ableitungstext. V:64 hat den Ableitungstext bereits, lässt aber die Statusfrage `SOURCE_EXACT` offen: Der generierte Bericht ist an dieser Stelle nicht vollständig synchron zum Vertrag.
- `:199–202` nennt Datenintegritäts-, Population-/Survivorship- und OOS-Grenzen. Deshalb folgt aus der vorliegenden Prüfung weder ein Renditeurteil noch die Bestätigung historischer Kennzahlen.

Die tatsächliche SF6-Verkabelung liest REF und den gemeinsamen Lifecycle (`scripts/supertrader/source-faithful/research/sf6-references.mjs:29–32,44`); es wurde also nicht nur eine isolierte Hilfsfunktion geprüft.

## Gegenproben und Validierung

Gezielt ausgeführt unter Node 24.22.1:

```sh
node --test scripts/supertrader/tests/sf-kullamagi.test.mjs \
  scripts/supertrader/tests/sf-sf5-kk-moka-lifecycle.test.mjs \
  scripts/supertrader/tests/sf-cert-prep-top5.test.mjs \
  scripts/supertrader/tests/sf-mc3-causality.test.mjs
```

**76 bestanden, 0 Fehler, 0 übersprungen.** Zusätzlich vier isolierte, erfolgreiche Gegenproben gegen unveränderte Produktionsfunktionen; temporäre Skripte außerhalb des Repos, keine neue Testsuite eingecheckt:

1. `onClose`, Entry 100 an Index 20, Schluss an E+3 =99 und E+4 =102: `partialDone` wird schon an E+3 wahr; auch an E+4 kein Teilverkauf/BE. Bestätigt F09.
2. Gleiche Position, E+3-Schluss 101: ein Drittel wird geplant und Stopp 100 gesetzt; Fill kommt im Engine-Ablauf erst am nächsten Open. Bestätigt F08/F10.
3. 24 Schlüsse: zuerst 14×80, dann 9×110, dann 105; Entry 100 an Index 20. SMA10=109,5, SMA20=94,75. Am Index 23 plant REF den Vollausstieg, die MA20-Variante nur den Teilverkauf. Bestätigt den konkreten Mechanismus in F11/F12; kein historischer Renditenachweis.
4. `fillOrder` mit Open 100, High 104, Low 98, Close 103 und altem Stopp 99: Einstieg plus `sameBarStop=CERTAIN`, Abwicklung zum Stopp, obwohl der Tag höher schließt. Bestätigt F06; kein Beweis, dass ein anderer vorher bekannter Stopp im selben Pfad besser wäre.

Die in `CLAUDE.md` genannten breiten Prüfkommandos wurden zusätzlich mit je 60 Sekunden Laufzeitgrenze versucht. Sie ergeben **keine grüne Gesamtabnahme**: Core, Quant, Discover/Supertrader/Screener und Isolationsprüfung erreichten die Grenze. Technical endete mit 91/99 bestanden, 8 Fehlern; Konten und Python-Quant endeten ebenfalls mit Fehlern (Python: 416 Tests, 4 Failures, 163 Errors, 24 Skips). Der Sparse-Checkout enthält nicht alle Anwendungsdateien, Konfigurationen und generierten Artefakte: unter anderem fehlen `assets/site-navigation.css`, `workers/vu-account/src/validate.mjs` und `quant/config/sec-metric-registry.json`. Diese Läufe sind daher keine belastbare Regressionseinstufung des vollständigen Repos. SQL-/PG-Flows wurden mangels PG_TEST_URL nicht ausgeführt. Keine Produktionsdatei wurde in den PR aufgenommen; die gezielte C08-Prüfung oben ist vollständig abgeschlossen.

## Priorität für Strang B

1. Vor einer Aussage über die Originalmethode Auswahl/Priorisierung der Leader und Marktkontext als getrennte, vorab festgeschriebene Forschungsfragen behandeln. Ein Produkt-P98-Plan darf nicht mit der ungefilterten Referenz begründet werden.
2. Intraday-Ausbruch mit zum Einstieg bekanntem Tagestief gegen die ausdrücklich benannte Folgetages-Proxy-Ausführung abgrenzen. Ohne diese Daten nur die Proxy-Methode beurteilen; ein Schlussdaten-Backtest ersetzt den Hauptweg nicht.
3. Für frühe Gewinnerbeendigung vor allem F06 und F09 prüfen; daneben die bereits registrierten MA10/MA20-, Teilverkaufs- und Trailbeginn-Varianten vollständig vergleichen. Zusätzlich zählen: Ausstiegsgründe, Teilverkäufe, Restpositionen, Wiedererholung nach Exit sowie offene Gewinner am Datenende. Die Hauptkennzahl bleibt das gesamte Portfolio nach Kosten, nicht nur die Trefferquote geschlossener Trades.
4. Die erlaubte Anfängerregel MA10 und den erlaubten BE-Stopp nicht aufgrund einzelner späterer Kursanstiege als Fehler entfernen. Jede geänderte Regel ist eine eigene vorregistrierte Studie; Varianten nicht nach dem besten Gesamtergebnis auswählen.

Dies ist eine Treueprüfung mit qualitativer Wirkungsabschätzung. Es wurde kein neuer historischer Performance-Lauf gestartet und keine Renditedifferenz geschätzt, die nicht aus realen Vergleichsläufen belegt ist.
