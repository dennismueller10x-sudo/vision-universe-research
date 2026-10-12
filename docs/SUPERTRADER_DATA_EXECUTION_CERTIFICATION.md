# Supertrader: Daten- und Execution-Certification vor der erneuten Messung

Die Zertifizierung ergibt **keine vollständig zertifizierte, ELIGIBLE Methode**. Von zehn vorhandenen Research-Engines bleiben sechs Methoden für einen ausdrücklich begrenzten Rerun auf dem beobachteten Panel PARTIAL. Vier Fundamental-Engines bleiben BLOCKED. Industry Momentum und Residual Momentum sind zwei weitere gesperrte Kandidaten ohne Engine. Zusammen bestehen sechs Kandidaten mit offenen Daten- oder Regelverträgen; diese werden nicht als gemessene Methoden gezählt.

Diese Disposition wurde vor Rerun-Ergebnissen festgelegt. Sie ersetzt kein Performance-Tiering und keine Bewertung von Alpha. Originale Methodendefinitionen, Rankinggewichte, Schwellen, Portfolio-Regeln und Kosten bleiben unverändert. Der Lead bindet die vorliegende Eligibility-Datei und die geprüften Versionen vor dem Rerun an einen separaten Freeze. Die abschließende Integrationsprüfung bleibt erforderlich.

| Zählbereich | Anzahl | Bedeutung |
|---|---:|---|
| Implementierte Research-Engines | 10 | Enthält vier Fundamental-Engines mit Datenblockern |
| Im ursprünglichen #589 gemessene Methoden | 6 | Keine Aussage über Ergebnisse des neuen Reruns |
| PARTIAL Methoden | 6 | Beobachtetes Panel, unvollständige historische Daten-/Execution-Zertifizierung |
| BLOCKED Engines | 4 | Kein vollständiger zugelassener Fundamental-Inputsatz |
| BLOCKED Kandidaten ohne Engine | 2 | Industry Momentum und Residual Momentum |
| Vollständig zertifizierte ELIGIBLE Methoden | 0 | Kein qualifiziertes Methoden- oder starkes Consensus-Set |

Die Zahl null bezeichnet hier fehlende **vollständige Zertifikate**. Sie bezeichnet weder null verfügbare Quelldaten noch null Signale oder null Rendite. Die Coverage-Quote eines vollständigen historischen Marktuniversums ist unbekannt; ein unabhängiger Nenner wurde nicht hergestellt.

| Methode | Vorab-Eligibility | Daten | Execution | Offener Hauptvertrag |
|---|---|---|---|---|
| Cross-sectional Momentum | PARTIAL | MEDIUM | LOW | Historische Marktpopulation, Identität und tatsächliche Terminal-Outcomes |
| 52-week-high Effect | PARTIAL | MEDIUM | LOW | Dieselben Grenzen des beobachteten Panels |
| Low Volatility | PARTIAL | MEDIUM | LOW | Dieselben Grenzen des beobachteten Panels |
| Turtle S2 Equity Daily | PARTIAL | MEDIUM | LOW | Dieselben Datengrenzen; VU-Adaption des Originals |
| Weinstein Stage Daily | PARTIAL | MEDIUM | LOW | Dieselben Datengrenzen; VU-Adaption des Originals |
| Kullamägi Daily Adaptation | PARTIAL | MEDIUM | LOW | Dieselben Datengrenzen; eigenständiger Daily-/Next-open-Pfad |
| Gross Profitability | BLOCKED | LOW | LOW | Breite Annual-PIT-Daten, historische Security-/Issuer-/Klassenbindung, SIC und exakte Market Equity |
| Piotroski Value F-score | BLOCKED | LOW | LOW | Vollständige Source-FY-Ketten, F-score-Operanden, Common Equity, Issuance und fiskalische Market Equity |
| Greenblatt Magic Formula | BLOCKED | LOW | LOW | Source-kompatibles EBIT, vollständige Debt-Scope und historische Market Equity |
| Value + Momentum | BLOCKED | LOW | LOW | Breite historische Common Equity und Market Equity mit kausaler Source-Bindung |
| Industry Momentum, ohne Engine | BLOCKED | LOW | LOW | Historische breite Gruppenmitglieder, Source-Taxonomie-/PIT-Zuordnung und prior-month Market Equity |
| Residual Momentum, ohne Engine | BLOCKED_RULE_VARIANT_UNSELECTED | MEDIUM | LOW | Holding-Variante fehlt; revidierter Faktor-Snapshot ist kein as-known-Vintage |

Die Confidence-Angaben bewerten Daten und Execution, keine historische Rendite. Die niedrigste Dimension begrenzt die Gesamtkonfidenz. Insbesondere bleibt die geerbte Source-Fidelity von Magic Formula LOW; neue Accounting-Normalisierung repariert keine ursprüngliche Method-Fidelity. Bei PARTIAL Daten oder Execution liegt die **Qualifizierungsobergrenze bei C**. Das originale Performance-Tier darf später getrennt berichtet werden und wird hier weder berechnet noch geändert. BLOCKED Methoden bleiben ungerankt und erhalten keine erfundenen Nullmetriken.

## Verfügbare Quellen und die Grenzen ihrer Aussage

Der vorhandene private History-/SEC-Store und die offiziellen [SEC Companyfacts-Bulkdaten](https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip) sowie [Submissions-Bulkdaten](https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip) sind erreichbar. Rohinputs, Fund-Core-Indizes und Legacy-Zuordnungen sind Quellen für weitere Zertifizierung. Ihre Verfügbarkeit beweist weder vollständige historische Marktmitgliedschaft noch eine zeitlich gültige Security-/Issuer-Bindung. Heutige CIK-/Ticker-Zuordnungen und frühere Namensähnlichkeit werden nicht rückwirkend als historische Identität akzeptiert.

Originale SEC-Einreichungen wurden als begrenzter Source-Pilot geprüft. Drei authentische vollständige Charter-/Amendment-Bodies sind im historischen Original-Annual ausdrücklich einbezogen und wurden unabhängig mit Issuer-, URL-, Zeit- und Body-Hash-Bindung gelesen. Akzeptiert ist ein historischer Full-Class-Roster mit einem fiskalischen Kontextpunkt, jeweils MEDIUM/PIT_PARTIAL. Originale Instant-Share-Fakten sind als Source-Inputs verfügbar. Dieser einzelne geprüfte Source-Punkt stellt weder kontinuierliche Exchange-Admission noch eine breite historische Marktpopulation her. Breite zertifizierte Security-/Issuer-Links bleiben null; zertifizierte Market Equity ist nicht etabliert. Eine Aktie zum passenden fiskalischen Stichtag ersetzt keine Preis-, Split- und Known-at-Brücke für alle historischen Stichtage.

Für Revenue, COGS und Assets stimmen sechs gezielte Vergleiche aus zwei Originaljahresberichten zwischen Primär-XBRL und accessiongebundenen Companyfacts überein. Der unabhängige Reviewer hat Werte, Einheiten, Perioden, Accessions und die konservativen Zeitgrenzen privat nachgeprüft. Damit ist ein kostenloser Source-Kanal praktisch belegt. Es besteht weiterhin **keine breite, vollständig zertifizierte Annual-/Fundamental-Datenpopulation**.

Der strikte Annual-Kanal prüft Originalbytes und Hashes, tatsächliche Namespace-/Context-/Unit-Scope, DEI-Jahresfokus und den archivierten SEC-Header. Die API-Zeit kann von `ACCEPTANCE-DATETIME` abweichen. Der Originalheader wird mit der IANA-Zeitzone `America/New_York` nach UTC umgesetzt; Konflikte bleiben MEDIUM/PIT_PARTIAL. Comparative- und Amendment-Werte werden nicht auf den ursprünglichen Geschäftsjahreszeitpunkt zurückdatiert.

Der skalierbare zusätzliche Companyfacts-Kanal ist ausdrücklich MEDIUM/PIT_PARTIAL. Er bindet aktuelle Jahreswerte eines Original-10-K an dessen Report-Ende, volle gemeldete Jahresdauer und offizielle Unit-/Tag-/Accession-Receipts. Ohne Primärbytes behauptet er keine ursprüngliche XBRL-Context-Zertifizierung, keinen DEI-zertifizierten Fiscal Year und keine tatsächliche Acceptance-Uhrzeit. Seine Verfügbarkeitsgrenze liegt konservativ nach dem New-York-Filingtag. Historische SIC stammt nur aus Originalheadern; heutige API-SIC wird nicht zurückgeschrieben. Ein zwingender Receiver-Filter behandelt tatsächlichen Input-Knowledge-Cutoff und sichtbare Konflikte, statt ältere widersprüchliche Werte still weiterzubenutzen.

Die unabhängige Annual-Source-Prüfung ist `PASS_WITH_DATA_LIMITS`. Drei bedingte Normalisierungen sind vor der Messung freigegeben: parent Net Income nach der belegten [FASB-ASU-2015-01-Grenze](https://storage.fasb.org/ASU%202015-01.pdf), parent permanent Common Equity bei **explizitem** Zero-Preferred-Outstanding-Nachweis und eine nicht überlappende Total-Debt-Ableitung mit **vollständiger** Finance-Lease-Abdeckung. Fehlende Preferred-/Issuance-/Lease-Felder sind keine Nullen. Unbeschränktes PBT plus Gross Interest wird nicht als Greenblatt Operating EBIT freigegeben; die alternative Preferred-Carrying-Ableitung bleibt ebenfalls gesperrt. Eine Freigabe des Feldvertrags ist keine Aussage über vorhandene breite historische Operanden.

Market Equity wird nur mit exakter Scope-, Unit-, Share-Date-, Price-Date-, Known-at- und Split-Bindung als VERIFIED oder DERIVED angenommen. APPROXIMATE, Weighted-average-Shares, gegenwärtige Shares ohne historische Bindung und unreconciled ADR-/Mehrklassenfälle werden nicht als Standardersatz zugelassen. Die registrierten Daten-Freshness-Grenzen sind offengelegte Datenpolicy und ändern keine Strategie-Ranks oder Trade-Regeln.

PR #481 bleibt OPEN/BLOCKED. #504, #505 und #510 wurden als Research-/Contract-Referenzen geprüft; keine Coremigration und kein Merge auf main erfolgten.

## Industry und Residual: Quellenverfügbarkeit reicht nicht für Admission

Die Original-Table-I-Taxonomie aus [Moskowitz–Grinblatt](https://spinup-000d1a-wp-offload-media.s3.amazonaws.com/faculty/wp-content/uploads/sites/3/2019/09/DoIndustriesExplainMomentum.pdf) ist dokumentiert. Die tatsächliche historische Source-Taxonomie-/PIT-Zuordnung und breite Gruppenmitgliedschaft sind dagegen unzertifiziert. SEC-Header-SIC ist nicht automatisch dieselbe historische CRSP-SIC-Reihe. Gegenwärtige Sektoren, Sector-ETFs oder French-Industry-Proxies schließen diesen Vertrag nicht. Industry Momentum bleibt BLOCKED.

Für [Residual Momentum](https://repub.eur.nl/pub/22252/ResidualMomentum-2011.pdf) ist ein offizieller [French-Faktor-Snapshot](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_CSV.zip) verfügbar. Von 130 vorab definierten Faktorfenstern sind 129 vollständig. Das ist ein Source-Window-Check, kein Backtest. Der revidierte Snapshot unterstützt ausdrücklich nur EX_POST_SCIENTIFIC_PARTIAL; historische monatliche Publication-Vintages wurden nicht zertifiziert. Vor allem wurde in #589 keine Holding-Variante gewählt. Daher bleibt die Methode **BLOCKED_RULE_VARIANT_UNSELECTED**, auch bei weitgehend vorhandenen Faktoren. Es wird weder eine Engine hinzugefügt noch eine Variante nach Ergebnissen ausgewählt.

## Execution und unveränderte Methoden

Die isolierte Execution-Prüfung bestätigt einen Legacy-Lookahead: Ein späteres Execution-Day-Low kann den vorherigen Entry-Stop und das Risk-Sizing des Legacy Momentum Breakout verändern. Dieser Legacy-Pfad gehörte nicht zu den sechs gemessenen Tournament-Methoden. Die separate Kullamägi-Daily-Adaption verwendet den bereits abgeschlossenen Signal-Day-Low und den folgenden Open. Der Befund darf nicht pauschal auf diesen anderen Pfad übertragen werden.

Ordentliche Orders behalten Next-session-open, ursprüngliche Kosten, Missing-open-Rejection und die ursprünglichen Regeln zur Zustandsänderung. Die isolierte Cash-Event-Primitive trennt eine belegte rechtliche Forderung von tatsächlicher spendbarer Auszahlung. Eine automatische dokumentierte Distribution ist kein Marktverkauf mit erfundener Slippage. Es wurde jedoch **kein vollständiges tatsächliches Terminal-Cash-/Settlement-Ledger** zugelassen. Klassifikationshinweise, erwartete oder ungefähre Beträge, fehlende Entitlement-/Split-Basis und Datenquarantäne sind keine Auszahlungsmessung.

Post-terminal, undatierte oder unzureichend datierte Klassenhinweise werden vor der Messung kausal gefiltert. Unbekannte Proceeds behalten die ursprünglichen expliziten Szenarien. Diese Szenarien werden nicht zu realisierten Delisting-Outcomes erklärt. Deshalb bleibt die Execution-Zertifizierung der sechs beobachteten Methoden begrenzt, auch wenn die Primitive synthetische Invarianten besteht.

Die isolierte Piotroski-Bugfix-Version löst echte 52/53-week-/Leap-Year-Vorperioden über originale Source-Links auf. Sie ändert keine F-score-Formel, keinen Value-Filter, kein Ranking und keine Originalperiodendaten. Der ursprüngliche Evaluator bleibt unverändert. Ein erfolgreicher Versionsvergleich certifiziert weder alle zugelieferten Accounting-Fakten noch das historische Marktuniversum.

## Abgrenzung zur nächsten Messung

Die vorliegende Eligibility ist von Rerun-Ergebnissen unabhängig und bleibt als Vorabentscheidung hashgebunden. Ein Rerun der sechs PARTIAL Methoden kann Diagnostik zum beobachteten Panel liefern. Er darf keine voll qualifizierte A/B-Methode, kein ELIGIBLE-Consensus-Set und keinen Alpha-Nachweis allein durch gute Messwerte erzeugen. Die vier Fundamental-Engines sowie die beiden zusätzlichen Kandidaten bleiben außerhalb der Admission, solange ihre tatsächlichen Daten-/Regelverträge offen sind.

Performancewerte, aktuelle Security-/Signal-Identitäten, Fact-Werte und Source-Receipts bleiben privat oder owner-verschlüsselt. Dieser Report enthält Quellen, Regeln der Zertifizierung, Enums und Counts. Der Lead erstellt den Rerun-Bericht separat.

Die maschinenlesbaren Vorabentscheidungen stehen in [SUPERTRADER-DATA-CONTRACTS.json](../scripts/supertrader/research/certification/SUPERTRADER-DATA-CONTRACTS.json), [SUPERTRADER-METHOD-ELIGIBILITY.json](../scripts/supertrader/research/certification/SUPERTRADER-METHOD-ELIGIBILITY.json) und [SUPERTRADER-PIT-COVERAGE.json](../scripts/supertrader/research/certification/SUPERTRADER-PIT-COVERAGE.json). Die [registrierte Datenpolicy](../scripts/supertrader/research/certification/CERTIFICATION-POLICIES.json), [Annual-Source-Prüfung](../scripts/supertrader/research/certification/reviews/ANNUAL-SOURCE-POLICY-INDEPENDENT-REVIEW.json) und [Execution-Contract](../scripts/supertrader/research/certification/EXECUTION-CERTIFICATION-CONTRACT.json) begrenzen ihre Aussage ausdrücklich.
