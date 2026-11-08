# E6 – Unabhängige Prüfung des Strategie-Labor-Protokolls

05.11.2026 · Strang E (Codex) · Forschung, nicht zertifiziert. Methodenprüfung, keine öffentliche Renditeaussage.

## Prüfgegenstand und Reichweite

Geprüft: `docs/research/labor/PROTOKOLL.md` auf `claude/strang-g-labor`, exakt Commit
`d1df7d9b09df4967fd86c4c2def3342faf3b3760`.
SHA-256 der unveränderten UTF-8-Datei:
`ddf9e9df9b2f227379727c6634db9252659724941972050991eca427409ae768`.
Der Hash wurde lokal aus dem Git-Blob unabhängig berechnet. Fundstellen unten beziehen sich auf dessen Abschnitte.

Arbeitsregeln: `AGENTS.md`, `CLAUDE.md`, Neustart-Plan und E-Stand auf main gelesen;
Ausgangsstand dieses Review-Branches: `757cce909580633c9280a910bf2ec66fe6fcac97`.
Die referenzierten Adapter und Engines wurden zusätzlich **am Registrierungscommit** gelesen.
Dort enthält `docs/research/labor/` nur das Protokoll; `scripts/research/labor/` existiert nicht.
Deshalb ist dies eine Prüfung der Spezifikation und ihrer referenzierten Grundlagen, keine Bestätigung eines
Labor-Runners oder seiner Ergebnisse. Private R2-, SEC- und Ergebnisartefakte wurden nicht reproduziert.

**Gesamturteil: muss vor dem Lauf geändert werden.** Der Rahmen ist brauchbar, schützt aber noch nicht zuverlässig
gegen Zukunftswissen und selektive Signifikanz. Der angeblich unberührte Holdout überschneidet sich 2012–2015
mit der bereits gerechneten E3-Quant-Entwicklung. Auch die gemeinsame TEST/Holdout-Inferenz ist nach
TEST-basierter Finalistenauswahl nicht wie beschrieben gültig. DSR und Reality Check werden berechnet/berichtet,
sind jedoch keine Bestehenshürden. Das eingefrorene Protokoll bleibt unverändert: Die unten verlangten sachlichen
Korrekturen benötigen gemäß dessen Einleitung eine neue Registrierung vor dem Lauf. Dieser Review ändert keine Regeln.

„Muss“ bezeichnet eine offene Voraussetzung für einen methodisch belastbaren Lauf bzw. das betreffende statistische
Etikett. „Risiko“ bezeichnet eine verbleibende Einschränkung, die transparent untersucht werden muss.

## Einzelbefunde

### 1. Registrierung und Suchraum — in Ordnung

**Beleg:** Einleitung, §§6–7. Die Raster ergeben tatsächlich
`12 + 4 + 4 + 4 + 4 + 8 + 4 + 24 + 4 + 10 = 78`.
Alle Varianten einschließlich blockierter werden berichtet, keine Ersatzvarianten, DEV-Auswahl wird vor TEST committet,
Sensitivitäten dienen nicht der Auswahl. Das erschwert nachträgliches Rosinenpicken erheblich.
Der Protokollhash allein friert allerdings weder Runner noch Eingabedaten ein (siehe Punkt 17).

### 2. Vorwissen und Prüfzeitraum — Risiko

**Beleg:** §§2–3. Der bereits betrachtete Zeitraum 2024–2026 ist ausdrücklich offengelegt; ihn „einmalig“ erneut
zu rechnen macht ihn nicht unabhängig. Auch die Ausschließung der Supertrader-Familie wird mit deren bekannten
Prüfergebnissen begründet: eine nachvollziehbare Ressourcenentscheidung, aber bereits Auswahl nach TEST.
N=78 korrigiert nicht sämtliche früheren Versuche, Familienentscheidungen und menschlichen Reaktionen auf E3.
Urteile auf diesen Daten bleiben explorativ. Der historische Holdout ist ebenfalls nicht pauschal ungenutzt
(siehe Punkt 20); zusätzlich können bekannte Krisen das Design mitgeprägt haben.
Ein anschließend unveränderter Vorwärtstest (§10) ist sinnvoll.

### 3. Finalistenauswahl und gemeinsame Signifikanz — muss vor dem Lauf geändert werden

**Beleg:** §§8–9. Bis zu fünf Kandidaten sehen TEST. Nur TEST-Gewinner gelangen (nach DEV-K) unter die höchstens
zwei Finalisten. Danach TEST und Holdout gemeinsam zu bootstrappen und Holm nur über die Finalisten anzuwenden
verwendet die selektiv günstigen TEST-Daten erneut. Holm über zwei statt der zuvor geprüften Kandidaten heilt das nicht.
Auch ist unklar, ob §8 Holm je Fenster oder §9 Holm über eine gemeinsame Serie meint.

**Erforderlich:** Eine einzige primäre Inferenzregel registrieren. Beispielsweise: TEST nur als offengelegten Filter
verwenden und den Nachweis ausschließlich aus dem danach unangetasteten Holdout ziehen, mit vorab festgelegter
Korrekturfamilie der ursprünglichen bis zu fünf Kandidaten. Alternativ ein Verfahren registrieren, das die gesamte
Auswahl wiederholt. Beim Kombinieren getrennter Zeitsegmente dürfen Bootstrap-Blöcke nicht über die künstliche
Grenze 2015/2024 laufen. Ein gemeinsamer positiver Mittelwert belegt zudem nicht positive Erwartungswerte in beiden
Fenstern; dafür wäre ein eigener Test der gemeinsamen Anforderung nötig.

### 4. „Besteht“ ist keine statistische Hürde — muss vor dem Lauf geändert werden

**Beleg:** §§7–9. K ist nur eine Rangfolge ohne Mindest-DSR; für White's Reality Check fehlen Schwelle und
Konsequenz. „Besteht“ fordert lediglich positive realisierte Überrenditen in zwei Fenstern. Zufallstreffer können
dieses Urteil ausdrücklich erhalten. Das widerspricht nicht der genannten Owner-Definition, darf aber nicht als
Bestehen einer DSR-/Reality-Check-Hürde ausgelegt werden.

**Erforderlich:** Wirtschaftliches Urteil und inferenzielle Hürde ausdrücklich trennen. Falls DSR/WRC wirklich
Zulassungshürden sein sollen, Schwellen und Abbruchfolgen vorab registrieren (beispielsweise DSR ≥ 0,95 und
DEV-WRC-p ≤ 0,05, mit separatem unabhängigen Bestätigungstest). Diese Beispielschwellen sind hier keine neue Freigabe.
Ein global signifikanter WRC bestätigt nicht automatisch jeden der fünf Kandidaten.

### 5. Deflated Sharpe, N=78 — muss vor dem Lauf geändert werden

**Beleg:** §7. Versuchszahl, wöchentliche aktive Logrendite und Berücksichtigung von Schiefe/Wölbung sind passende
Bausteine. N=78 ist eine vertretbare nominelle Korrektur für genau diese registrierte Suche; korrelierte Varianten
machen 78 nicht automatisch zu wenig. Es ist aber kein Nachweis für 78 unabhängige Versuche und keine Korrektur des
gesamten Forschungsvorlaufs. Eine nach Ergebnis geschätzte kleinere effektive Versuchszahl wäre eine weitere Freiheit.

**Erforderlich:** Formel und Randfälle festschreiben. Zum Abgleich mit Bailey/López de Prado (2014):

```text
s_j = mean(d_j) / sampleStd(d_j), d_jt = log(V_jt/V_j,t-1) - log(SPY_t/SPY_t-1)
s0 = sqrt(Var_j(s_j)) * [(1-gamma) Phi^-1(1-1/N) + gamma Phi^-1(1-1/(N*e))]
DSR_j = Phi((s_j-s0)*sqrt(T-1) / sqrt(1-skew_j*s_j + (kurt_j-1)*s_j^2/4))
gamma = Euler-Mascheroni-Konstante; kurt = Pearson-Wölbung, nicht Exzesswölbung
```

Alle Größen auf Wochenbasis halten; nicht annualisierte s mit wöchentlichem T mischen. Dies ist ein Sharpe-artiger
Test aktiver Renditen (Information-Ratio), nicht der übliche Cash-Excess-Sharpe. Stichprobenmoment-Konventionen,
gemeinsamen Kalender, Nullvarianz, nichtpositiven Radikanden und weniger als zwei gültige Varianten definieren.
Blockierte Varianten behalten N=78, erhalten aber keine erfundenen Sharpe-Werte für die Varianzschätzung.
Wöchentliche Strategierenditen können seriell abhängig sein: Die Standardformel berücksichtigt Schiefe/Wölbung,
aber nicht automatisch Autokorrelation. IID-Näherung kennzeichnen; Abhängigkeit über das korrekt spezifizierte
Blockverfahren absichern, nicht DSR als exakte Signifikanzwahrscheinlichkeit ausgeben.

### 6. White's Reality Check — muss vor dem Lauf geändert werden

**Beleg:** §8. Stationärer Bootstrap mit mittlerer Blocklänge 13, 9.999 Ziehungen und festem Seed ist grundsätzlich
passend. Das genügt noch nicht zur Reproduktion von White (2000).

**Erforderlich:** Für die gemeinsame DEV-Matrix d die beobachtete Statistik
`max_j sqrt(T)*mean(d_j)` und die Nullzentrierung angeben. In jedem Replikat dieselben zufälligen Zeitindizes für
alle Strategien/Benchmark verwenden; die zentrierte Statistik ist etwa
`max_j sqrt(T)*(mean(d_j*)-mean(d_j))`. Beim stationären Bootstrap geometrische Blocklängen mit Neustartwahrscheinlichkeit
1/13 und definierter Randbehandlung verwenden, keine starren 13-Wochen-Blöcke. Einseitige p-Wert-Konvention
(z. B. mit +1-Korrektur), identische Beobachtungsfenster und Ausschluss blockierter Spalten festlegen.
Unzentriert würde die beobachtete Überrendite unter der Nullhypothese mitgeführt; getrenntes Resampling der
Strategien zerstörte ihre Kreuzkorrelation. Studentisierung wäre eine andere, ebenfalls explizit zu benennende Statistik.
Viele schlechte Varianten können den WRC konservativ machen; Nichtverwerfung ist kein Gleichheitsbeweis.

### 7. TEST-/Holdout-Bootstrap — muss vor dem Lauf geändert werden

**Beleg:** §8. Gepaarte Blöcke erhalten den Vergleich gegen SPY; feste Länge, Seed und Holm sind sinnvolle Vorgaben.
Es fehlen jedoch Richtung, Nullzentrierung und genaue Teststatistik. Die Quote positiver unzentrierter Bootstrap-Mittel
ist nicht ohne Weiteres ein gültiger Null-p-Wert. Nullzentrierten einseitigen Test oder explizit invertiertes
Konfidenzverfahren festlegen, gemeinsam gepaarte Zeitindizes und Holm-Familie definieren (siehe Punkt 3).
Eine Blocklänge deckt nicht alle Abhängigkeitsstrukturen ab; weitere Längen können ausschließlich diagnostisch
berichtet werden. Der kurze TEST hat geringe Teststärke, wie bereits offengelegt.

### 8. SEC-Fundamentaldaten — Risiko

**Beleg:** §4; `portfolio-pit-factors.cjs:59–79` und `pit-fundamental-history.js:42–57` am Registrierungscommit.
`filed < t` wird über den Vortag umgesetzt; ORIGINAL statt letzter restatierter Fassung verhindert den naheliegenden
Rückgriff auf spätere Zahlen. Das ist an diesen Lesestellen in Ordnung, aber keine Garantie für vorgelagerte Ableitungen.
Jede zusammengesetzte Größe muss das späteste Verfügbarkeitsdatum aller Eingaben tragen; keine später restatierten
Vergleichswerte oder heute splitbereinigten Aktienzahlen mit historischen Rohkursen vermischen.
Accession, Periodenende, Einheit, Tag, Originalwert und Ableitung je verwendeter Beobachtung auditierbar halten.
Spätere Quelldaten dürfen hinzugefügt werden, ohne frühere Signale zu verändern (Trunkierungs-/Mutationstest).

### 9. EPS/SUE und PEAD — muss vor dem Lauf geändert werden

**Beleg:** §§4,6. Erstfassung, Einreichungsdatum und Quartalsdauer 80–100 Tage sind konservativ gegenüber der
oft früheren Gewinnmitteilung. Die Implementation bleibt trotzdem mehrdeutig: fiscal `fy/fp` allein identifiziert
in companyfacts nicht sicher das berichtete Quartal. Später eingereichte Vergleichsquartale können revidierte oder
splitangepasste EPS enthalten. Basic/Diluted-Wechsel erzeugen künstliche Überraschungen; Q4 steht oft nur als
Jahreswert abzüglich neun Monaten zur Verfügung und würde bei bloßem Dauerfilter fehlen.

**Erforderlich:** Vierteljahreszuordnung über start/end und Geschäftskalender, deterministische Tag-/Einheiten-
und Accession-Priorität, konsistente EPS-Basis des Vorjahresvergleichs sowie PIT-Splitbehandlung registrieren.
Festlegen, ob Q4 ausgeschlossen oder aus damals verfügbaren Zahlen abgeleitet wird (mit spätestem Eingangsdatum).
SUE-Nenner: aktuelle Differenz enthalten oder nur vorherige, sample/population, Nullvarianz, Lücken und Mehrfachmeldungen
festlegen. Keine fehlenden Quartale durch spätere Meldungen rückwirkend auffüllen.
Der berechnete saisonale EPS-Anstieg ist eine SUE-Proxystrategie, keine Analystenkonsens-Überraschung.

### 10. Insiderdaten — muss vor dem Lauf geändert werden

**Beleg:** §§4,6. Form 4, Code P, Officer/Director und Einreichung vor t sind ein sinnvoller Start. Quartalsarchive
können nachträgliche Informationen enthalten; ihr Downloadzeitpunkt ist nicht das historische Ereignisdatum.
Historische Rekonstruktion ist zulässig, wenn der verwendete Inhalt tatsächlich zum Original-Filing gehörte.
„Ohne Änderungen“ muss heißen: nur Original-Form-4-Zeilen verwenden, nicht rückblickend alle später berichtigten
Originale entfernen. Letzteres wäre selbst Zukunftswissen.

**Erforderlich:** Fenster L nach Transaktions- oder Einreichungsdatum, Umgang mit verspäteter Meldung, stabile
Insider-ID, Dedup über Accession/Transaktionszeile und Mehrfachmeldungen, Preis-/Mengenvalidität sowie Verhältnis
Officer/Director zum damaligen Filing fixieren. Emittenten-CIK ist keine eindeutige historische Aktiengattung:
effektive Listing-/Klassenintervalle und Dedup heutiger/delisteter IDs sind nötig; Käufe einer anderen Gattung dürfen
nicht auf jede Security des Emittenten fallen. Kaufwert/Marktkap. muss zeitlich konsistent sein. Nicht zuordenbare
Fälle gesondert ausweisen statt still als „kein Insiderkauf“ zu behandeln.

### 11. Ridge-Ranking — muss vor dem Lauf geändert werden

**Beleg:** §§3,6. Zwei λ, feste Features, nur ausgereifte 13-Wochen-Labels und Mindesthistorie begrenzen die Suche.
Das sind tatsächlich vier vorregistrierte Modellvarianten, **wenn** der Algorithmus vollständig fixiert ist;
die Zahl geschätzter Koeffizienten ist nicht einfach als zusätzliche Versuchszahl zu addieren.

**Erforderlich:** Expanding/rolling Training, Refit-Takt, Intercept, Standardisierung, Zentrierung, Zielfolgerang
(Universum und einfache/Gesamtrendite), Tie-Regel, Verlustfunktion (`sum` oder `mean` plus λ), Datums-/Titelgewichtung
und numerischen Solver festlegen. λ=0,01 bedeutet bei Summe der Fehler etwas anderes als bei deren Mittel.
Alle Vorverarbeitung nur mit zum jeweiligen Training verfügbaren Daten; historische Features nicht mit heutigen
Querschnittsmitgliedern neu normalisieren. Label mit Delisting-Erlös und damaliger Population bilden, statt nur
13 Wochen überlebende Titel zuzulassen. Die Reifegrenze muss inklusive Ausführungslag eindeutig sein.
Überlappende 13-Wochen-Labels alle vier Wochen sind keine unabhängigen Beobachtungen.

Fehlend=0,5 ist fixiert; außerdem zwischen „keine Aktivität“ und „Quelle fehlt“ unterscheiden.
Der Holdout-Neustart des Trainings ab 2008 vermeidet direktes Trainieren auf 2016+, verändert aber die Lernhistorie:
die lange Gleichgewichtsphase bis 52 ausgereifte Stichtage vorliegen muss separat erkennbar sein.
Online-Refits in TEST/Holdout sind zulässig, solange ausschließlich die vorab fixierte Lernregel vergangene Labels liest.

### 12. Weitere Signal-/Auswahldetails — muss vor dem Lauf geändert werden

**Beleg:** §§6–7. Bei KOMBI bleibt „MOM“ (12-1, 6-1 oder deren Mittel) offen. HI52-„Kurs“ kann Rohkurs,
splitbereinigten Kurs oder Gesamtrenditelevel meinen; Dividenden verändern die Nähe zum Kurshoch.
ETF-„52-W.-Rendite > BIL“ muss BIL über dieselbe Dauer vergleichen, nicht eine Wochenrendite.
Gleichstände, ETF-Gewichte und Halten/Rebalancieren der sektoralen Top 3 sind zu fixieren; „wöchentlich geprüft“
gegenüber W=4/13 darf keine zusätzliche taktische Umschichtung eröffnen.
Beim Ersatzweg „weniger Verlust“ sind Gesamtkandidatenlimit, bereits belegte Familien und Reihenfolge gegenüber
den normalen Kandidaten eindeutig festzulegen. Die einfache Walk-forward-Regel ohne Zulassungsregeln (§3) testet
nur die K-Auswahl, nicht die vollständige spätere Auswahlprozedur; entsprechend bezeichnen.

### 13. Population, SIC und Survivorship — Risiko

**Beleg:** §4; `model-portfolios.cjs:146–226`. Heutige Kursdateien plus qualifizierte V13-Ketten sind besser als
nur heutige Überlebende, beweisen aber keine vollständige damalige Population. Fehlende SIC, Gesamtrenditen oder
Rohkurse schließen Titel aus; heutiger SIC beeinflusst rückwirkend Auswahl und Branchenlimits. V13-Qualifikation
kann vom späteren Verlauf abhängen. Ein Protokollhash beseitigt diese Verzerrung nicht.
Abdeckung und Ausschlüsse je Zeitfenster, Grund und Lifecycle-Klasse veröffentlichungsneutral dokumentieren;
Overlap heutiger/delisteter Ketten prüfen. Kein Anspruch „survivorship-frei“. Für eine solche Aussage wären ein
historisches Populationverzeichnis und datierte Klassifikation nötig. Unbekannte Sektoren nicht nach Ergebnis reparieren.

### 14. Früher Holdout und Datenlücken — muss vor dem Lauf geändert werden

**Beleg:** §§3–4. Moderne SEC-XBRL-Historie deckt 2008 nicht flächendeckend ab; spätere Vergleichsangaben sind erst
ab ihrem tatsächlichen Filing sichtbar. Die Insider-Datensätze decken ebenfalls nicht automatisch das ganze
Fenster ab. Weder 104 Wochen Kursvorlauf noch eine Datei aus 2026 schaffen historische Verfügbarkeit.
Vor DEV eine datierte Coverage-Matrix der Quellen registrieren: strukturelle Lücke versus tatsächlich kein Signal,
familienabhängiges Blockieren einschließlich KOMBI und LERN, und minimale brauchbare Abdeckung festlegen.
Nicht erst nach dem Ergebnis entscheiden, ob „meist Cash“/0,5 trotz fehlender Quelle als gültiger Lauf zählt.
Kein späteres Wissen für 2008 zurückdatieren; Fenster nicht passend verkürzen.

### 15. Handelskosten und Liquidität — Risiko

**Beleg:** §5; `portfolio-construction.cjs:12–35,49–57`. 20 bp plus halber Spread je Seite, ETFs 22 bp, sind keine
offensichtlich optimistischen Standardkosten. Niedrigere Engine-Kosten als nicht auswählende Sensitivität sind zulässig.
Eine pauschale Slippage deckt jedoch nicht Marktimpact, Krisenspreads, illiquide Schlussauktionen oder nicht handelbare
Delistings ab. Der Marktkapitalisierungsersatz beweist keine ausführbare Liquidität.
Kapitalgröße und ADV-Teilnahmegrenze einfrieren: die Engine nimmt standardmäßig 10 Mio. USD und 5 % ADV an.
Ein höherer Kostenschock/engere Ausführbarkeit wäre diagnostisch sinnvoll; ein nur bei niedrigen Kosten positiver
Befund wäre kein belastbarer Vorteil für Anleger.

### 16. Terminalwerte und Ausführung — muss vor dem Lauf geändert werden

**Beleg:** §5; E3-Adapter `quant-e3.cjs:126–133,163–181,202–212`.
MERGER/SERIES_END=100 % bzw. UNKNOWN=70 % des letzten Schlusses sind Modellwerte, keine nachgewiesenen Erlöse.
Besonders SERIES_END darf nicht bereits wegen fehlender weiterer Daten einen sofortigen, kostenlosen 100-%-Exit
erzeugen; am Adapter wird dafür der gesamte spätere Preisverlauf betrachtet. Unternehmensereignis, Datenlücke,
Aussetzung und administratives Fensterende müssen getrennt sein. Bei unbekanntem Erlös/Zahlungsdatum Unsicherheit
ausweisen oder blockieren; eine 30-%-UNKNOWN-Sensitivität erfasst den optimistischen SERIES_END-Fall nicht.

Der Ausführungslag t→t+1 ist in Ordnung. Ein Folgewoche-Fill darf aber die auf t datierte Zielmitgliedschaft nicht
rückwirkend verändern: E3 prüft `s.adj[e]` vor dem Membership-Hash. Geplante Zielgewichte und tatsächliche Fills
getrennt protokollieren, ausgefallene Käufe als Cash, ausgefallene Verkäufe als gehaltene Position behandeln.
Spread wird im E3-Adapter nachträglich multiplikativ von Equity abgezogen; Cashverzinsung und die neuen Kosten
müssen tatsächlich auf den korrekten Beständen/Notionalen laufen. Ein bloßer Aufschlag auf Endkennzahlen genügt nicht.
Cash-BIL darf weder rückwirkend die Rendite der Ausführungswoche noch mehrfach BIL-Rendite bei ETF-BIL-Allokation erhalten.

### 17. Reproduzierbarkeit und bekannte Adapter-Defaults — muss vor dem Lauf geändert werden

**Beleg:** Einleitung, §§3–5; E3-Adapter und `model-portfolios.cjs:146–153,183–194`.
Ein Verweis auf E3 übernimmt nicht automatisch die Laborregeln. Der Panel-Builder kann ohne workDir auf
PRICE_RETURN und heutige Kohorte fallen, der E3-Adapter startet mit unverzinstem Cash und Engine-Kosten und besitzt
einen anderen Fensteranker. Diese Defaults sind **kein belegter Laborfehler**, da der Runner noch fehlt, aber konkrete
Integrationsfallen. TOTAL_RETURN, ORIGINAL, Rohdaten, Wochenvollständigkeit, neue Kosten, Cashrendite und Neustartanker
müssen vor jedem Lauf fail-closed geprüft werden.
Runnercommit, Featuredefinitionen, Variantenmanifest, Rohdaten-/Mapping-/Kalenderhashes, Ausschlusslisten, Pakete,
Seeds und Freigabestufen zusammen fixieren. Manipulierte Zukunftszeilen dürfen vergangene Signale/Ziele nicht ändern.
Fehlerbehebung nach TEST-Einsicht nicht heimlich erneut auf demselben TEST optimieren; Sichtungen und Wiederholung
als zusätzliche Forschung dokumentieren. Keine Rechnungen mit privaten Rohdaten wurden für dieses Review ausgeführt.

### 18. Benchmark — in Ordnung

**Beleg:** §§1,4–5. SPY-Gesamtrendite mit reinvestierten Dividenden in USD ist für die ausdrücklich gestellte Frage
der richtige primäre Vergleich. Fondsgebühren sind im ETF enthalten; sie nochmals abzuziehen wäre falsch.
Ein passiver Benchmark ohne Transaktionskosten ist eher eine strengere Hürde für aktive Strategien.
Identischer Kalender, Anfangs-/Endbewertung und dieselbe Total-Return-Basis sind zwingend; Filter verwenden eine
andere SPY-Datei und benötigen einen Konsistenzabgleich. Einstiegskosten/-zeitpunkt von SPY und Strategie ausweisen.
RSP/IWM, Sektor-/Stil- und Beta-Kontrollen wären sinnvolle sekundäre Diagnostik für Größen-, Tech- und Branchenwetten,
dürfen den primären Benchmark nicht nach Kenntnis der Ergebnisse ersetzen. SPY-Outperformance allein ist kein Alpha-Beweis.

### 19. Strategiefamilien und wirtschaftliche Vollständigkeit — Risiko

**Beleg:** §6. Momentum, Value, Qualität, Low-Vol, Insider, EPS-Drift und ETF-Trend sind ein breiter, wirtschaftlich
begründeter Kern. Eine erschöpfende Suche „aller Wege“ ist es nicht. Naheliegende Ergänzungen wären:

| Familie | Wirtschaftlicher Mechanismus | Daten-/Abgrenzungsbedarf |
|---|---|---|
| Konservative Investition / Asset Growth | Überinvestition, niedrige erwartete Rendite aggressiver Expansion | PIT-Bilanzsummen über vergleichbare Jahre; keine bloße Gewinnwachstumsstrategie |
| Accruals / Cashflow-Qualität | Übergewichtung buchhalterischer Gewinne gegenüber persistentem Cashflow | Ergebnis und operativer Cashflow derselben Periode; bestehende Margen erfassen das nicht vollständig |
| Net Payout / Nettoemissionen | Ausschüttung und Rückkäufe versus Verwässerung, Kapitaldisziplin | Dividenden, Rückkäufe, Emissionen; Änderungen der Aktienzahl PIT und splitkonsistent |
| Langfristige Reversal / robuste Value-Mischung | Überreaktion über mehrere Jahre | lange vollständige Kursketten, getrennt von kurzfristigem Momentum; hohe Distress-/Kostenrisiken |
| Breitere defensive ETF-Allokation | Diversifikation von Aktien- und Zinsrisiken | vorab festes Aktien-/Treasury-Mischportfolio als einfache Kontrolle der taktischen ETF-Regeln |

Keine dieser Familien muss vor diesem Lauf ergänzt werden: Nachträgliches Erweitern würde die Registrierung brechen.
Für eine Folgestudie vorab begrenzen, wirtschaftliche Überschneidungen offenlegen und Versuchszahl neu festlegen.
13F wegen fehlender historischer CUSIP-Zuordnung zurückzustellen ist **in Ordnung**; ohne diese Daten kein PIT-Signal
erfinden. „Kein Kandidat besteht“ darf ausschließlich für den registrierten Suchraum gelten.

### 20. Holdout ist bereits teilweise verwendet — muss vor dem Lauf geändert werden

**Beleg:** §§2–3 behaupten „Unberührt ist nur der Holdout 2008–2015“.
Am selben Registrierungscommit nennt `docs/research/edge/PROTOKOLL.md:9` jedoch Quant-DEV **2012–2019**;
`docs/research/edge/BERICHT.md:16,30` bestätigt den gerechneten Quant-Lauf über diese Jahre.
Die Jahre **2012–2015 sind damit bereits in E3 zur Entwicklung verwendet**. Dass dessen Bericht den Holdout
zugleich als reserviert bezeichnet (`:261`), beseitigt diese Kalenderüberschneidung nicht.
Das betrifft gerade die verwandten Quant-/Kombinationsfamilien des Labors. Ein Hash oder eine schriftliche Freigabe
macht diese Daten nicht nachträglich unabhängig.

**Erforderlich:** Behauptung der Unberührtheit und Bestätigungslogik in einer neuen Registrierung korrigieren.
2008–2015 kann noch eine historische Robustheitsprüfung sein; ein unabhängig bestätigtes Siegeretikett braucht
nachweislich ungenutzte Daten oder neue Vorwärtsdaten. Den Abschnitt nicht nach Sichtung günstiger Teiljahre
auf ein vermeintlich sauberes Restfenster zuschneiden. Auch die in Punkt 3 beispielhaft vorgeschlagene reine
Holdout-Inferenz setzt eine tatsächlich ungenutzte Bestätigungsstichprobe voraus und ist hier nicht allein durch
Weglassen von TEST geheilt.

Zusätzlich sieht der Neustart-Plan §10/S2 dasselbe Fenster für Signalstudien vor.
Ein gemeinsames Zugriffs-/Versuchsregister muss festhalten, wer welche Jahre gesehen hat und welche Regeln danach
geändert wurden. Keine Resultate anderer Studien verwenden, um G-Finalisten, Familien oder Schwellen zu wählen.

## Vor einem belastbaren Lauf nachzuweisen

1. Neue Registrierung mit vollständigen Signal-, Ridge-, Datenlücken- und Ausführungsregeln; Original nicht überschreiben.
2. Eindeutige DSR-/WRC-Formeln und Rolle im Urteil; nullzentrierte, gepaarte Tests und korrekte Korrekturfamilie.
3. Bereits verwendete Holdout-Jahre offenlegen; echte unabhängige Bestätigung fixieren, keine naive gemeinsame
   TEST/Holdout-Signifikanz nach TEST-Auswahl.
4. PIT- und Zukunftsmutationstests, Coverage-Prüfung, Listing-Zuordnung, Terminal-/Fill- und Kosten/Cash-Fixtures.
5. Vollständiges reproduzierbares Laufmanifest und strikte Trennung DEV-Auswahl → TEST → freigegebener Holdout.

Diese Punkte sind Prüfkriterien für Strang G, keine hier ausgeführten Änderungen oder behaupteten Testergebnisse.

## Validierung dieses Reviews

Quellenhash aus dem Git-Blob berechnet und mit dem Branch-Blob abgeglichen; 20 nummerierte Befunde mit jeweils
einem der drei verlangten Urteile geprüft. Referenzcode und E3-Zeitfenster stammen vom Registrierungscommit.
Der Änderungsumfang umfasst ausschließlich diese neue Review-Datei; keine Änderungen am Protokoll, an Engines,
Produktdaten oder Workflows. Bestandstests validieren gegebenenfalls den unveränderten main-Unterbau, nicht die
hier noch fehlende Laborimplementierung; ihr Laufstatus steht im zugehörigen PR.

## Methodische Referenzen

- Bailey / López de Prado (2014), *The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting,
  and Non-Normality*, Journal of Portfolio Management 40(5), 94–107, DOI: 10.3905/jpm.2014.40.5.094.
- White (2000), *A Reality Check for Data Snooping*, Econometrica 68(5), 1097–1126,
  DOI: 10.1111/1468-0262.00152.
- Politis / Romano (1994), *The Stationary Bootstrap*, JASA 89(428), 1303–1313,
  DOI: 10.1080/01621459.1994.10476870.
