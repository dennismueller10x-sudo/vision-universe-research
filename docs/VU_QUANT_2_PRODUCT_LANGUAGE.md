# Vision Universe® Quant 2.0 — Product Language Dictionary

`product-language-1.0.0` · Quelle: `quant/methodology/product-language-v1.json` · Zugriff:
`quant/engines/product-language.js`

> **Diese Datei wird erzeugt.** `node scripts/quant/build-product-language-doc.mjs`.
> Änderungen gehören in die JSON-Quelle; ein Test vergleicht beide und schlägt bei Abweichung fehl.

Ein einziges Wörterbuch für alles, was ein Nutzer in Quant 2.0 liest. Interne Begriffe bleiben in Code, Contracts und Methodik unverändert; sie erscheinen in der Oberfläche nicht als Hauptsprache, sondern erst in der Methodik-Ebene darunter.

Diese Datei ist die Quelle. quant/engines/product-language.js liest sie, die Oberfläche liest die Engine, und docs/VU_QUANT_2_PRODUCT_LANGUAGE.md wird daraus erzeugt. Zwei Module können nicht unterschiedlich sprechen, weil es nur einen Ort gibt, an dem die Worte stehen.

## Die vier Ebenen

| Ebene | Name | Regel |
|---|---|---|
| `MEANING` | Bedeutung | Eine einfache Aussage. Kein Fachwort, keine Zahl ohne Bezug, kein Kürzel. |
| `EXPLANATION` | Warum | Warum diese Aussage entsteht. Ein bis zwei Sätze, in derselben Sprache wie die Bedeutung. |
| `EVIDENCE` | Belege | Die zugrunde liegenden Werte, mit Stichtag und Herkunft. Hier dürfen Zahlen stehen. |
| `METHODOLOGY` | Methodik | Die vollständige fachliche Beschreibung samt interner Begriffe, Versionen und Grenzen. Immer eingeklappt, nie der Einstieg. |

## Sprachregeln

- Nicht mit Fachsprache beginnen. Die erste Zeile einer Sektion ist eine Frage oder eine Aussage, die ein Anfänger versteht.
- Ein interner Begriff darf sichtbar sein, aber nie allein und nie zuerst: er steht in der Methodik-Ebene oder als Beisatz hinter dem Nutzerbegriff.
- Ein Enum-Wert wird nie roh gezeigt. Er wird übersetzt oder gar nicht gezeigt.
- Eine Chance wird nie ohne ihre Kehrseite gezeigt.
- Fehlt ein Wert, steht dort der Grund in Alltagssprache - nicht der Code und nicht eine leere Fläche.
- 'Nicht vorhanden' und 'nicht bewertbar' sind zwei verschiedene Aussagen und bekommen zwei verschiedene Texte.

## Module und Ansichten

### Quant

| Feld | Inhalt |
|---|---|
| Interner Begriff | `Quant 2.0 / quant-v2.0.0` |
| Schlüssel | `quant` |
| **User Label** | **Quant** |
| Als Frage | Was ist Quant? |
| Erklärung für Einsteiger | Quant schaut sich eine Aktie nach festen, immer gleichen Regeln an — Geschäft, Wachstum, Kursverlauf, Bewertung, Risiko — und sagt dir, was daran gerade stark und was schwach ist. |
| Professional Label | Quant 2.0 · Analyse- und Entscheidungsschicht vor dem Broker |
| Tooltip | Dieselben Regeln für jede Aktie, jeden Tag. Keine Meinung, keine Prognose. |
| Negativer Zustand | Nach diesen Regeln sieht dieser Titel derzeit schwach aus. |
| Nicht verfügbar | Für diesen Titel liegen die Daten, die Quant verlangt, derzeit nicht vor. Es werden keine Ersatzwerte gebildet. |

### Was macht diese Aktie stark oder schwach?

| Feld | Inhalt |
|---|---|
| Interner Begriff | `Factor DNA / vu-factor-evidence-1.0.0` |
| Schlüssel | `factorDna` |
| **User Label** | **Was macht diese Aktie stark oder schwach?** |
| Als Frage | Was macht diese Aktie stark oder schwach? |
| Erklärung für Einsteiger | Sieben Eigenschaften, immer dieselben, immer in derselben Reihenfolge. Jede zeigt, wo dieser Titel im Vergleich zu anderen Unternehmen steht. |
| Professional Label | Factor Evidence (quantV2.factorEvidence) |
| Tooltip | Position im Vergleichsuniversum, nicht Schulnote. 100 heißt: stärker als fast alle anderen. |
| Negativer Zustand | Mehr Eigenschaften sprechen dagegen als dafür. |
| Nicht verfügbar | Für diesen Titel liegt keine Faktorevidenz vor. |

### Was verändert sich gerade?

| Feld | Inhalt |
|---|---|
| Interner Begriff | `Change Engine / vu-change-1.0.0` |
| Schlüssel | `changeEngine` |
| **User Label** | **Was verändert sich gerade?** |
| Als Frage | Was verändert sich gerade? |
| Erklärung für Einsteiger | Was sich an diesem Unternehmen zuletzt bewegt hat — nach oben, nach unten oder gar nicht. |
| Professional Label | Change Engine · elf gemessene Positionen |
| Tooltip | Gemessen wird an beobachtbaren Größen, nicht an den Faktorwerten selbst. |
| Negativer Zustand | Mehr verschlechtert sich gerade als sich verbessert. |
| Nicht verfügbar | Veränderungen lassen sich für diesen Titel derzeit nicht messen. |

### Wie weit ist die Aktie im Setup?

| Feld | Inhalt |
|---|---|
| Interner Begriff | `SetupState / setup-mapping-1.0.0` |
| Schlüssel | `setupState` |
| **User Label** | **Wie weit ist die Aktie im Setup?** |
| Als Frage | Wie weit ist die Aktie im Setup? |
| Erklärung für Einsteiger | Ob sich gerade eine Situation aufbaut — und wenn ja, an welcher Stelle sie steht. |
| Professional Label | SetupState · achtstufiger Lebenszyklus |
| Tooltip | Beschreibt, was heute beobachtbar ist. Keine Kaufempfehlung und kein Einstiegssignal. |
| Negativer Zustand | Es baut sich gerade nichts auf. |
| Nicht verfügbar | Für diesen Titel wird kein Setup-Zustand behauptet. |

### Wie sahen ähnliche Situationen früher aus?

| Feld | Inhalt |
|---|---|
| Interner Begriff | `Pattern Research / pattern-research-1.0.0` |
| Schlüssel | `patternEngine` |
| **User Label** | **Wie sahen ähnliche Situationen früher aus?** |
| Als Frage | Wie sahen ähnliche Situationen früher aus? |
| Erklärung für Einsteiger | Wenn eine Aktie früher so aussah wie diese heute — was ist dann in den zwei Jahren danach passiert? Gezählt über hunderttausende Fälle, nicht über ein berühmtes Beispiel. |
| Professional Label | Pattern Research · bedingte Häufigkeiten |
| Tooltip | Häufigkeiten aus der Vergangenheit. Keine Wahrscheinlichkeit für diesen Titel. |
| Negativer Zustand | Historisch war diese Konstellation eher riskant. |
| Nicht verfügbar | Für diesen Titel reicht die Kurshistorie für einen Vergleich nicht aus. |

### Welche Strategie passt?

| Feld | Inhalt |
|---|---|
| Interner Begriff | `Strategy Match / strategy-profiles-1.0.0` |
| Schlüssel | `strategyMatch` |
| **User Label** | **Welche Strategie passt?** |
| Als Frage | Welche Strategie passt? |
| Erklärung für Einsteiger | Zu welchem Anlagestil dieser Titel gerade passt — und welche Bedingungen dafür noch fehlen. |
| Professional Label | Strategy Match · gezählte Profilbedingungen |
| Tooltip | Anteil der messbaren Profilbedingungen, die dieser Titel erfüllt. Kein Rang, keine Renditeaussage. |
| Negativer Zustand | Zu keinem der Anlagestile passt dieser Titel derzeit gut. |
| Nicht verfügbar | Für diesen Titel lässt sich derzeit kein Anlagestil prüfen. |

### Wie hätte sich diese Strategie historisch geschlagen?

| Feld | Inhalt |
|---|---|
| Interner Begriff | `Backtest Engine` |
| Schlüssel | `backtest` |
| **User Label** | **Wie hätte sich diese Strategie historisch geschlagen?** |
| Als Frage | Wie hätte sich diese Strategie historisch geschlagen? |
| Erklärung für Einsteiger | Was aus der Strategie in der Vergangenheit geworden wäre — und wie weh es zwischendurch getan hätte. |
| Professional Label | Backtest · PIT-Universum, Kapitalmaßnahmen, Ausführungsmethodik |
| Tooltip | Ein Backtest verlangt ein zeitpunktgenaues Universum, Kapitalmaßnahmen und eine Ausführungsmethodik. Fehlt eines davon, gibt es keine Zahl. |
| Negativer Zustand | Historisch hätte diese Strategie den Markt nicht geschlagen. |
| Nicht verfügbar | Es wird keine historische Strategierendite gezeigt, solange Universum, Kapitalmaßnahmen und Ausführung nicht zertifiziert sind. |

### Wie belastbar ist die historische Evidenz?

| Feld | Inhalt |
|---|---|
| Interner Begriff | `Backtest Trust Score` |
| Schlüssel | `backtestTrustScore` |
| **User Label** | **Wie belastbar ist die historische Evidenz?** |
| Als Frage | Wie belastbar ist die historische Evidenz? |
| Erklärung für Einsteiger | Wie viel man auf die historischen Zahlen geben kann: wie viele Fälle dahinterstehen, ob sie auch in ungesehenen Jahren hielten, und was an den Daten schiefliegt. |
| Professional Label | Backtest Trust Score |
| Tooltip | Belastbarkeit ist keine Rendite. Eine hohe Zahl macht eine Strategie nicht gut, sondern ihre Messung glaubwürdig. |
| Negativer Zustand | Diese historische Evidenz ist dünn. |
| Nicht verfügbar | Ohne zertifizierten Backtest gibt es keine Belastbarkeitsnote. |

### Wie gut ist das Marktumfeld?

| Feld | Inhalt |
|---|---|
| Interner Begriff | `Market Regime` |
| Schlüssel | `marketRegime` |
| **User Label** | **Wie gut ist das Marktumfeld?** |
| Als Frage | Wie gut ist das Marktumfeld? |
| Erklärung für Einsteiger | Ob der Gesamtmarkt gerade Rückenwind oder Gegenwind gibt. |
| Professional Label | Market Regime |
| Tooltip | Ein Marktumfeld braucht feste Schwellen, eine Mindestbreite und Regeln für Zustandswechsel. Solange die nicht freigegeben sind, wird keines behauptet. |
| Negativer Zustand | Das Marktumfeld gibt derzeit Gegenwind. |
| Nicht verfügbar | Das Marktumfeld wird nicht bewertet: die Methodik dafür ist noch nicht freigegeben. |

### Gesamtnote

| Feld | Inhalt |
|---|---|
| Interner Begriff | `quantV2 composite` |
| Schlüssel | `compositeScore` |
| **User Label** | **Gesamtnote** |
| Als Frage | Gibt es eine Gesamtnote? |
| Erklärung für Einsteiger | Eine einzelne Zahl für die ganze Aktie. |
| Professional Label | Composite Score (WITHHELD) |
| Tooltip | Eine Gesamtnote aus unvollständigen Faktoren wäre genauer, als die Daten hergeben. |
| Negativer Zustand | Die Gesamtnote fiele niedrig aus. |
| Nicht verfügbar | Es wird bewusst keine Gesamtnote gebildet, solange nicht alle sieben Eigenschaften bewertbar sind. |

### Was hat sich zuletzt bewegt?

| Feld | Inhalt |
|---|---|
| Interner Begriff | `Radar / Signals` |
| Schlüssel | `radar` |
| **User Label** | **Was hat sich zuletzt bewegt?** |
| Als Frage | Was hat sich zuletzt bewegt? |
| Erklärung für Einsteiger | Titel, bei denen sich in den letzten Handelstagen nachweislich etwas geändert hat. |
| Professional Label | Radar · retrospektive EOD-Zustandswechsel |
| Tooltip | Rückblickende Tagesschluss-Wechsel. Kein Echtzeitsignal und keine Rangliste. |
| Negativer Zustand | In diesem Ausschnitt hat sich nichts Belegbares bewegt. |
| Nicht verfügbar | Ohne geprüfte Signale werden keine Ersatzlisten erzeugt. |

### Deine Unternehmen im Blick

| Feld | Inhalt |
|---|---|
| Interner Begriff | `Watchlist Workspace` |
| Schlüssel | `watchlist` |
| **User Label** | **Deine Unternehmen im Blick** |
| Als Frage | Was macht das, was du beobachtest? |
| Erklärung für Einsteiger | Deine ausgewählten Titel mit ihrem aktuellen Stand. |
| Professional Label | Watchlist Workspace |
| Tooltip | Nur in diesem Browser gespeichert. Keine automatische Überwachung und keine Benachrichtigung. |
| Negativer Zustand | Bei deinen Titeln sieht es derzeit überwiegend schwach aus. |
| Nicht verfügbar | Deine Auswahl lässt sich derzeit nicht auswerten. Die Einträge bleiben erhalten. |

### Aktien nach Regeln finden

| Feld | Inhalt |
|---|---|
| Interner Begriff | `Screener Workspace / Rule Contract` |
| Schlüssel | `screener` |
| **User Label** | **Aktien nach Regeln finden** |
| Als Frage | Welche Titel erfüllen eine Regel? |
| Erklärung für Einsteiger | Du stellst Bedingungen, und du bekommst die Titel, die sie erfüllen. |
| Professional Label | Screener · kanonisches Regelprädikat |
| Tooltip | Dieselbe Regel, die eine Eigenschaft beschreibt, sucht auch danach. |
| Negativer Zustand | Kein Titel erfüllt diese Regel. |
| Nicht verfügbar | Diese Regel lässt sich derzeit nicht auswerten. |

### Aktien in dieser Lage

| Feld | Inhalt |
|---|---|
| Interner Begriff | `SetupEngine.screenIndex / setup-screen-index-1.0.0` |
| Schlüssel | `setupScreen` |
| **User Label** | **Aktien in dieser Lage** |
| Als Frage | Welche Aktien stehen gerade an derselben Stelle? |
| Erklärung für Einsteiger | Dieselbe Regel, die den Zustand einer Aktie beschreibt, sucht auch alle anderen Aktien, auf die sie zutrifft. |
| Professional Label | Zustandsindex · kanonisches Regelprädikat der Kaskade |
| Tooltip | Die Liste kommt aus der Zuordnung der Kaskade, nicht aus der Regel allein. Eine Aktie steht in genau einem Zustand. |
| Negativer Zustand | Zurzeit steht kein Titel in dieser Lage. |
| Nicht verfügbar | Für diese Lage wird derzeit keine Liste veröffentlicht. |

### So viele Titel stehen hier

| Feld | Inhalt |
|---|---|
| Interner Begriff | `screenIndex.states[].count` |
| Schlüssel | `setupStateCount` |
| **User Label** | **So viele Titel stehen hier** |
| Als Frage | Wie viele Aktien stehen gerade an dieser Stelle? |
| Erklärung für Einsteiger | Die Anzahl der Titel, denen die Auswertung heute genau diesen Zustand zuordnet. |
| Professional Label | Zustandsbesetzung zum Stichtag |
| Tooltip | Eine Zahl zum Stichtag, keine Aussage darüber, wie sich die Besetzung entwickelt hat. |
| Negativer Zustand | Kein Titel steht heute an dieser Stelle. |
| Nicht verfügbar | Es wird keine Anzahl genannt, solange dieser Zustand nicht veröffentlicht wird. |

## Die sieben Eigenschaften

### Unternehmensqualität

| Feld | Inhalt |
|---|---|
| Interner Begriff | `quality / qualityScore` |
| Schlüssel | `quality` |
| **User Label** | **Unternehmensqualität** |
| Als Frage | Steht das Unternehmen solide da? |
| Erklärung für Einsteiger | Wie solide das Unternehmen finanziert ist und wie verlässlich es verdient. |
| Professional Label | Quality (quantV2.factorEvidence.quality) |
| Tooltip | Bilanz, Verschuldung, Stabilität der Erträge — im Vergleich zu anderen Unternehmen. |
| Negativer Zustand | Die Finanzlage ist schwächer als bei den meisten anderen. |
| Nicht verfügbar | Zur Unternehmensqualität liegen nicht genug geprüfte Geschäftszahlen vor. |

### Wachstum

| Feld | Inhalt |
|---|---|
| Interner Begriff | `growth / growthScore` |
| Schlüssel | `growth` |
| **User Label** | **Wachstum** |
| Als Frage | Wächst das Geschäft? |
| Erklärung für Einsteiger | Ob Umsatz, Gewinn und Cashflow zulegen — und ob das Tempo zunimmt oder nachlässt. |
| Professional Label | Growth (quantV2.factorEvidence.growth) |
| Tooltip | Mehrjähriges Wachstum und seine Beschleunigung, nicht ein einzelnes gutes Quartal. |
| Negativer Zustand | Das Geschäft wächst langsamer als bei den meisten anderen. |
| Nicht verfügbar | Zum Wachstum fehlt die nötige Mehrjahresreihe. |

### Kursstärke

| Feld | Inhalt |
|---|---|
| Interner Begriff | `momentum / momentumScore` |
| Schlüssel | `momentum` |
| **User Label** | **Kursstärke** |
| Als Frage | Läuft der Kurs besser als der Rest? |
| Erklärung für Einsteiger | Wie sich der Kurs zuletzt entwickelt hat — auch im Vergleich zum Gesamtmarkt. |
| Professional Label | Momentum (quantV2.factorEvidence.momentum) |
| Tooltip | Kursentwicklung über mehrere Zeiträume und der Abstand zum Jahreshoch. |
| Negativer Zustand | Der Kurs läuft schwächer als bei den meisten anderen. |
| Nicht verfügbar | Zur Kursstärke reicht die Kurshistorie nicht aus. |

### Bewertung

| Feld | Inhalt |
|---|---|
| Interner Begriff | `value / valueScore` |
| Schlüssel | `value` |
| **User Label** | **Bewertung** |
| Als Frage | Ist der Preis im Verhältnis zum Geschäft hoch oder niedrig? |
| Erklärung für Einsteiger | Was du für das bezahlst, was das Unternehmen tatsächlich verdient und umsetzt. |
| Professional Label | Value (quantV2.factorEvidence.value) |
| Tooltip | Gewinn, Cashflow und Umsatz im Verhältnis zum Börsenwert. Günstig heißt nicht gut. |
| Negativer Zustand | Gemessen am Geschäft ist dieser Titel teurer als die meisten anderen. |
| Nicht verfügbar | Zur Bewertung fehlen Börsenwert oder Geschäftszahlen. |

### Profitabilität

| Feld | Inhalt |
|---|---|
| Interner Begriff | `profitability / profitability` |
| Schlüssel | `profitability` |
| **User Label** | **Profitabilität** |
| Als Frage | Wie gut verdient das Unternehmen an dem, was es tut? |
| Erklärung für Einsteiger | Wie viel vom Umsatz am Ende wirklich hängen bleibt und wie gut das eingesetzte Kapital arbeitet. |
| Professional Label | Profitability (quantV2.factorEvidence.profitability) |
| Tooltip | Margen und Kapitalrendite, im Vergleich zu anderen Unternehmen. |
| Negativer Zustand | Es bleibt weniger hängen als bei den meisten anderen. |
| Nicht verfügbar | Zur Profitabilität fehlen Ergebnis- oder Bilanzpositionen. |

### Erwartungstrend

| Feld | Inhalt |
|---|---|
| Interner Begriff | `revisions / revisions` |
| Schlüssel | `revisions` |
| **User Label** | **Erwartungstrend** |
| Als Frage | Werden die Erwartungen angehoben oder gesenkt? |
| Erklärung für Einsteiger | Ob Analysten ihre Schätzungen für dieses Unternehmen zuletzt nach oben oder nach unten geschraubt haben. |
| Professional Label | Revisions (quantV2.factorEvidence.revisions) |
| Tooltip | Verlangt eine lizenzierte, zeitpunktgenaue Schätzhistorie. Ohne sie gibt es keinen Wert. |
| Negativer Zustand | Die Erwartungen werden gesenkt. |
| Nicht verfügbar | Es liegt keine lizenzierte, zeitpunktgenaue Schätzquelle vor. Ein Ersatz wäre erfunden und wird nicht gebildet. |

### Risiko

| Feld | Inhalt |
|---|---|
| Interner Begriff | `risk / riskScore` |
| Schlüssel | `risk` |
| **User Label** | **Risiko** |
| Als Frage | Wie ruhig oder wie wild läuft dieser Titel? |
| Erklärung für Einsteiger | Wie stark der Kurs schwankt und wie tief er in schlechten Phasen gefallen ist. |
| Professional Label | Risk (quantV2.factorEvidence.risk) |
| Tooltip | Ein hoher Wert bedeutet weniger Schwankung als bei anderen, nicht mehr. |
| Negativer Zustand | Dieser Titel schwankt stärker als die meisten anderen. |
| Nicht verfügbar | Zum Risiko reicht die Kurshistorie nicht aus. |

## Setup-Zustände

### Kein Setup

| Feld | Inhalt |
|---|---|
| Interner Begriff | `NO_SETUP` |
| Schlüssel | `NO_SETUP` |
| **User Label** | **Kein Setup** |
| Erklärung für Einsteiger | Es baut sich gerade nichts auf. |
| Professional Label | NO_SETUP |
| Tooltip | Eine vollwertige Antwort, keine Lücke. |
| Negativer Zustand | Es baut sich gerade nichts auf. |
| Nicht verfügbar | Ob sich etwas aufbaut, lässt sich hier nicht sagen. |

### Beobachten

| Feld | Inhalt |
|---|---|
| Interner Begriff | `WATCH` |
| Schlüssel | `WATCH` |
| **User Label** | **Beobachten** |
| Erklärung für Einsteiger | Die Rahmenlage trägt, eine konkrete Situation gibt es noch nicht. |
| Professional Label | WATCH |
| Tooltip | Trend oder bestätigte Struktur laufen aufwärts, ein Setup ist daraus noch nicht geworden. |
| Negativer Zustand | Die Rahmenlage trägt nicht mehr. |
| Nicht verfügbar | Die Rahmenlage lässt sich hier nicht beurteilen. |

### Setup entsteht

| Feld | Inhalt |
|---|---|
| Interner Begriff | `SETUP_FORMING` |
| Schlüssel | `SETUP_FORMING` |
| **User Label** | **Setup entsteht** |
| Erklärung für Einsteiger | Eine Situation ist vollständig da, der Auslöser steht noch aus. |
| Professional Label | SETUP_FORMING |
| Tooltip | Alle Teile liegen vor, der Kurs hat den Auslösepunkt noch nicht erreicht. |
| Negativer Zustand | Die entstehende Situation hat sich wieder aufgelöst. |
| Nicht verfügbar | Ob eine Situation entsteht, lässt sich hier nicht sagen. |

### Setup bestätigt

| Feld | Inhalt |
|---|---|
| Interner Begriff | `CONFIRMED` |
| Schlüssel | `CONFIRMED` |
| **User Label** | **Setup bestätigt** |
| Erklärung für Einsteiger | Struktur, Trend und Handelsvolumen zeigen am selben Tag in dieselbe Richtung. |
| Professional Label | CONFIRMED |
| Tooltip | Mehrere voneinander unabhängige Messungen stimmen überein. Selten — das ist Absicht. |
| Negativer Zustand | Die Bestätigung ist weggefallen. |
| Nicht verfügbar | Eine Bestätigung lässt sich hier nicht prüfen. |

### Trend läuft

| Feld | Inhalt |
|---|---|
| Interner Begriff | `ACTIVE` |
| Schlüssel | `ACTIVE` |
| **User Label** | **Trend läuft** |
| Erklärung für Einsteiger | Die bestätigte Situation läuft; der Kurs steht in der dokumentierten Zone. |
| Professional Label | ACTIVE |
| Tooltip | Setzt voraus, dass die Bestätigung früher tatsächlich beobachtet wurde. |
| Negativer Zustand | Der Trend läuft nicht mehr. |
| Nicht verfügbar | Ob etwas läuft, ist eine Aussage über einen Verlauf und braucht frühere Beobachtungen. |

### Risiko steigt

| Feld | Inhalt |
|---|---|
| Interner Begriff | `RISK_RISING` |
| Schlüssel | `RISK_RISING` |
| **User Label** | **Risiko steigt** |
| Erklärung für Einsteiger | Eine laufende Situation verschlechtert sich messbar. |
| Professional Label | RISK_RISING |
| Tooltip | Schwankung nimmt zu oder das Momentum dreht, während die Lage noch nicht gebrochen ist. |
| Negativer Zustand | Eine laufende Situation verschlechtert sich messbar. |
| Nicht verfügbar | Eine Verschlechterung ist eine Aussage über einen Verlauf und braucht frühere Beobachtungen. |

### Setup nicht mehr gültig

| Feld | Inhalt |
|---|---|
| Interner Begriff | `INVALIDATED` |
| Schlüssel | `INVALIDATED` |
| **User Label** | **Setup nicht mehr gültig** |
| Erklärung für Einsteiger | Die Grenze, die damals festgehalten wurde, ist unterschritten. |
| Professional Label | INVALIDATED |
| Tooltip | Gemessen an der Grenze aus der früheren Beobachtung, nicht an einer heute neu gerechneten. |
| Negativer Zustand | Die Grenze, die damals festgehalten wurde, ist unterschritten. |
| Nicht verfügbar | Ob etwas gebrochen ist, braucht die frühere Beobachtung. |

### Ausstiegsbedingung erreicht

| Feld | Inhalt |
|---|---|
| Interner Begriff | `EXIT` |
| Schlüssel | `EXIT` |
| **User Label** | **Ausstiegsbedingung erreicht** |
| Erklärung für Einsteiger | Die damals dokumentierte Zielzone ist erreicht. |
| Professional Label | EXIT |
| Tooltip | Die Feststellung, dass eine damals dokumentierte Bedingung eingetreten ist. Kein Erfolgsurteil. |
| Negativer Zustand | Die Zielzone wurde erreicht und die Situation ist damit abgeschlossen. |
| Nicht verfügbar | Ohne festgehaltene Zielzone gibt es diesen Zustand nicht. |

## Richtung einer Veränderung

### Verbessert sich

| Feld | Inhalt |
|---|---|
| Interner Begriff | `IMPROVING` |
| Schlüssel | `IMPROVING` |
| **User Label** | **Verbessert sich** |
| Erklärung für Einsteiger | Dieser Bereich hat sich zuletzt in die günstige Richtung bewegt. |
| Professional Label | IMPROVING |
| Tooltip | Gemessen an beobachtbaren Größen, nicht an den Faktorwerten selbst. |
| Negativer Zustand | Dieser Bereich verbessert sich nicht mehr. |
| Nicht verfügbar | Für diesen Bereich lässt sich keine Richtung messen. |

### Verschlechtert sich

| Feld | Inhalt |
|---|---|
| Interner Begriff | `DETERIORATING` |
| Schlüssel | `DETERIORATING` |
| **User Label** | **Verschlechtert sich** |
| Erklärung für Einsteiger | Dieser Bereich hat sich zuletzt in die ungünstige Richtung bewegt. |
| Professional Label | DETERIORATING |
| Tooltip | Gemessen an beobachtbaren Größen, nicht an den Faktorwerten selbst. |
| Negativer Zustand | Dieser Bereich hat sich zuletzt in die ungünstige Richtung bewegt. |
| Nicht verfügbar | Für diesen Bereich lässt sich keine Richtung messen. |

### Weitgehend unverändert

| Feld | Inhalt |
|---|---|
| Interner Begriff | `STABLE` |
| Schlüssel | `STABLE` |
| **User Label** | **Weitgehend unverändert** |
| Erklärung für Einsteiger | Hier hat sich zuletzt nichts Nennenswertes bewegt. |
| Professional Label | STABLE |
| Tooltip | Die Bewegung liegt unterhalb der Schwelle, ab der sie als Veränderung gilt. |
| Negativer Zustand | Hier bewegt sich nichts. |
| Nicht verfügbar | Für diesen Bereich lässt sich keine Richtung messen. |

## Ähnliche Situationen in der Vergangenheit

### Chance vs. Risiko

| Feld | Inhalt |
|---|---|
| Interner Begriff | `asymmetry (lift / lossLift)` |
| Schlüssel | `asymmetry` |
| **User Label** | **Chance vs. Risiko** |
| Als Frage | Stand die Chance im Verhältnis zum Verlustrisiko? |
| Erklärung für Einsteiger | Ob starke Anstiege häufiger waren als starke Verluste — oder ob beides gleichzeitig häufiger wurde. |
| Professional Label | Asymmetrie (Lift ÷ Verlust-Lift) |
| Tooltip | Über 1 heißt: die Chance war stärker erhöht als das Verlustrisiko. Unter 1 heißt das Gegenteil. |
| Negativer Zustand | Historisch war dieses Muster eher riskant: starke Anstiege und starke Verluste traten gleichzeitig häufiger auf. |
| Nicht verfügbar | Chance und Risiko lassen sich für dieses Muster nicht gegeneinander stellen. |

### Häufiger als üblich

| Feld | Inhalt |
|---|---|
| Interner Begriff | `lift` |
| Schlüssel | `lift` |
| **User Label** | **Häufiger als üblich** |
| Erklärung für Einsteiger | Wie viel häufiger ein starker Anstieg vorkam, wenn es so aussah — verglichen mit allen Titeln. |
| Professional Label | Lift (bedingte Quote ÷ Basisquote) |
| Tooltip | 1,5× heißt: anderthalbmal so häufig wie im Durchschnitt aller Fälle. |
| Negativer Zustand | Ein starker Anstieg kam seltener vor als im Durchschnitt. |
| Nicht verfügbar | Zu wenige Fälle, um eine Häufigkeit anzugeben. |

### Verlustseite

| Feld | Inhalt |
|---|---|
| Interner Begriff | `lossLift` |
| Schlüssel | `lossLift` |
| **User Label** | **Verlustseite** |
| Erklärung für Einsteiger | Wie viel häufiger ein starker Verlust vorkam, wenn es so aussah. |
| Professional Label | Verlust-Lift (bedingte Verlustquote ÷ Basisverlustquote) |
| Tooltip | Steht immer neben der Chance. Eine Quote ohne ihre Kehrseite wäre die halbe Wahrheit. |
| Negativer Zustand | Ein starker Verlust kam deutlich häufiger vor als im Durchschnitt. |
| Nicht verfügbar | Zu wenige Fälle, um eine Verlustquote anzugeben. |

### Übliche Häufigkeit

| Feld | Inhalt |
|---|---|
| Interner Begriff | `baseRate` |
| Schlüssel | `baseRate` |
| **User Label** | **Übliche Häufigkeit** |
| Erklärung für Einsteiger | Wie oft das über alle Titel hinweg vorkam — der Vergleichsmaßstab. |
| Professional Label | Basisquote der Grundgesamtheit |
| Tooltip | Der Bezugspunkt für jede Aussage darüber, dass etwas häufiger war. |
| Negativer Zustand | Auch im Durchschnitt kam das selten vor. |
| Nicht verfügbar | Ohne Grundgesamtheit gibt es keinen Vergleichsmaßstab. |

### Test an ungesehenen Jahren

| Feld | Inhalt |
|---|---|
| Interner Begriff | `outOfSample lift` |
| Schlüssel | `outOfSample` |
| **User Label** | **Test an ungesehenen Jahren** |
| Erklärung für Einsteiger | Ob das Muster auch in Jahren hielt, die bei seiner Prüfung nicht mitgezählt wurden. |
| Professional Label | Out-of-Sample-Lift im gesperrten Testblock |
| Tooltip | Der eigentliche Test. Ein Muster, das nur im Rückblick hält, wird nicht gezeigt. |
| Negativer Zustand | In ungesehenen Jahren hielt dieses Muster nicht. |
| Nicht verfügbar | Es gibt zu wenig Historie für einen getrennten Test. |

### Typischer Fall

| Feld | Inhalt |
|---|---|
| Interner Begriff | `medianForwardReturn` |
| Schlüssel | `medianOutcome` |
| **User Label** | **Typischer Fall** |
| Erklärung für Einsteiger | Was in der Mitte aller Fälle herauskam — nicht der beste und nicht der schlechteste. |
| Professional Label | Median der Vorwärtsrendite |
| Tooltip | Die Mitte, nicht der Durchschnitt: einzelne Extremfälle verzerren sie nicht. |
| Negativer Zustand | Im typischen Fall stand am Ende ein Minus. |
| Nicht verfügbar | Ohne genügend Fälle gibt es keinen typischen Fall. |

### Tiefster Rücksetzer unterwegs

| Feld | Inhalt |
|---|---|
| Interner Begriff | `medianMaxDrawdownWithinHorizon` |
| Schlüssel | `medianDrawdown` |
| **User Label** | **Tiefster Rücksetzer unterwegs** |
| Erklärung für Einsteiger | Wie weit es zwischendurch nach unten ging, bevor am Ende das Ergebnis stand. |
| Professional Label | Median des maximalen Rücksetzers im Horizont |
| Tooltip | Was man ausgehalten hätte. Das Endergebnis sagt nichts über den Weg dorthin. |
| Negativer Zustand | Zwischendurch ging es sehr weit nach unten. |
| Nicht verfügbar | Ohne genügend Fälle lässt sich der Weg nicht beschreiben. |

### Überlebende-Verzerrung

| Feld | Inhalt |
|---|---|
| Interner Begriff | `survivorshipBias` |
| Schlüssel | `survivorship` |
| **User Label** | **Überlebende-Verzerrung** |
| Erklärung für Einsteiger | Die Vergleichsgruppe enthält nur Unternehmen, die es heute noch gibt. Das lässt alle Quoten günstiger aussehen, als sie waren. |
| Professional Label | Survivorship Bias · wirkt nach oben auf absolute Quoten |
| Tooltip | Im Verhältnis von Chance zu Risiko hebt sich der Effekt weitgehend auf, in den absoluten Quoten nicht. |
| Negativer Zustand | Die absoluten Quoten sind zu günstig dargestellt. |
| Nicht verfügbar | Das Ausmaß dieser Verzerrung lässt sich aus den vorhandenen Daten nicht beziffern. |

### Historisch belastbar

| Feld | Inhalt |
|---|---|
| Interner Begriff | `ROBUST` |
| Schlüssel | `ROBUST` |
| **User Label** | **Historisch belastbar** |
| Erklärung für Einsteiger | Genug Fälle, in ungesehenen Jahren bestätigt, und nicht von einer einzelnen Schwelle abhängig. |
| Professional Label | ROBUST |
| Tooltip | Das einzige Urteil, das neben einem Titel gezeigt wird. |
| Negativer Zustand | Auch ein belastbares Muster kann nach unten kippen. |
| Nicht verfügbar | Für dieses Muster liegen nicht genug vergleichbare Situationen vor, um es überhaupt zu beurteilen. |

### Hielt im Test nicht stand

| Feld | Inhalt |
|---|---|
| Interner Begriff | `IN_SAMPLE_ONLY` |
| Schlüssel | `IN_SAMPLE_ONLY` |
| **User Label** | **Hielt im Test nicht stand** |
| Erklärung für Einsteiger | Im Rückblick auffällig, in ungesehenen Jahren nicht mehr. |
| Professional Label | IN_SAMPLE_ONLY |
| Tooltip | Wird nicht neben einem Titel gezeigt. |
| Negativer Zustand | Im Rückblick auffällig, in ungesehenen Jahren nicht mehr. |
| Nicht verfügbar | Für dieses Muster liegen nicht genug vergleichbare Situationen vor, um es überhaupt zu beurteilen. |

### Hängt zu stark an der Schwelle

| Feld | Inhalt |
|---|---|
| Interner Begriff | `PARAMETER_SENSITIVE` |
| Schlüssel | `PARAMETER_SENSITIVE` |
| **User Label** | **Hängt zu stark an der Schwelle** |
| Erklärung für Einsteiger | Verschiebt man die Grenze ein wenig, verschwindet der Effekt. |
| Professional Label | PARAMETER_SENSITIVE |
| Tooltip | Ein Hinweis auf Anpassung an den Datensatz statt auf einen Zusammenhang. |
| Negativer Zustand | Verschiebt man die Grenze ein wenig, verschwindet der Effekt. |
| Nicht verfügbar | Für dieses Muster liegen nicht genug vergleichbare Situationen vor, um es überhaupt zu beurteilen. |

### Nicht klar genug vom Zufall zu trennen

| Feld | Inhalt |
|---|---|
| Interner Begriff | `NOT_SIGNIFICANT` |
| Schlüssel | `NOT_SIGNIFICANT` |
| **User Label** | **Nicht klar genug vom Zufall zu trennen** |
| Erklärung für Einsteiger | Der Unterschied ist zu klein, um ihn vom Zufall zu unterscheiden. |
| Professional Label | NOT_SIGNIFICANT |
| Tooltip | Geprüft mit einer Korrektur dafür, dass viele Muster gleichzeitig getestet wurden. |
| Negativer Zustand | Der Unterschied ist zu klein, um ihn vom Zufall zu unterscheiden. |
| Nicht verfügbar | Für dieses Muster liegen nicht genug vergleichbare Situationen vor, um es überhaupt zu beurteilen. |

### Zu wenige Fälle

| Feld | Inhalt |
|---|---|
| Interner Begriff | `INSUFFICIENT_SUPPORT` |
| Schlüssel | `INSUFFICIENT_SUPPORT` |
| **User Label** | **Zu wenige Fälle** |
| Erklärung für Einsteiger | Es gab nicht genug vergleichbare Situationen, um etwas zu zählen. |
| Professional Label | INSUFFICIENT_SUPPORT |
| Tooltip | Unterhalb der Mindestzahl an Fällen und Treffern wird nichts berichtet. |
| Negativer Zustand | Es gab nicht genug vergleichbare Situationen. |
| Nicht verfügbar | Für dieses Muster liegen nicht genug vergleichbare Situationen vor, um es überhaupt zu beurteilen. |

## Backtest · Einsteigeransicht und Fachschicht

### Rendite

| Feld | Inhalt |
|---|---|
| Interner Begriff | `CAGR` |
| Schlüssel | `totalReturn` |
| **User Label** | **Rendite** |
| Erklärung für Einsteiger | Was aus dem eingesetzten Geld geworden wäre. |
| Professional Label | CAGR (annualisierte Rendite) |
| Tooltip | Historisch, nach Kosten. Keine Aussage über die Zukunft. |
| Negativer Zustand | Am Ende stand weniger als am Anfang. |
| Nicht verfügbar | Ohne zertifizierten Backtest wird keine Rendite gezeigt. |

### Größter Rückgang

| Feld | Inhalt |
|---|---|
| Interner Begriff | `maxDrawdown` |
| Schlüssel | `maxDrawdown` |
| **User Label** | **Größter Rückgang** |
| Erklärung für Einsteiger | Wie weit es vom höchsten Stand nach unten ging, bevor es wieder hoch ging. |
| Professional Label | Maximum Drawdown |
| Tooltip | Die Zahl, die darüber entscheidet, ob man dabeigeblieben wäre. |
| Negativer Zustand | Zwischendurch ging es sehr weit nach unten. |
| Nicht verfügbar | Ohne zertifizierten Backtest wird kein Rückgang gezeigt. |

### Trefferquote

| Feld | Inhalt |
|---|---|
| Interner Begriff | `hitRate` |
| Schlüssel | `hitRate` |
| **User Label** | **Trefferquote** |
| Erklärung für Einsteiger | Wie oft es aufging. |
| Professional Label | Hit Rate |
| Tooltip | Eine hohe Trefferquote ist wertlos, wenn die wenigen Fehlschläge groß sind. |
| Negativer Zustand | Es ging selten auf. |
| Nicht verfügbar | Ohne zertifizierten Backtest wird keine Trefferquote gezeigt. |

### Anzahl Situationen

| Feld | Inhalt |
|---|---|
| Interner Begriff | `tradeCount` |
| Schlüssel | `situationCount` |
| **User Label** | **Anzahl Situationen** |
| Erklärung für Einsteiger | Wie viele Fälle hinter der Zahl stehen. |
| Professional Label | Trade Count |
| Tooltip | Wenige Fälle heißt: die Zahlen daneben sind wenig belastbar. |
| Negativer Zustand | Es stehen sehr wenige Fälle dahinter. |
| Nicht verfügbar | Ohne zertifizierten Backtest gibt es keine Fälle zu zählen. |

### Vergleich zum Markt

| Feld | Inhalt |
|---|---|
| Interner Begriff | `benchmarkDelta` |
| Schlüssel | `benchmarkDelta` |
| **User Label** | **Vergleich zum Markt** |
| Erklärung für Einsteiger | Ob es besser gelaufen wäre als einfach den Markt zu kaufen. |
| Professional Label | Aktivrendite gegen Benchmark |
| Tooltip | Ohne diesen Vergleich sagt eine Rendite wenig. |
| Negativer Zustand | Es wäre schlechter gelaufen als der Markt. |
| Nicht verfügbar | Ohne zertifizierten Backtest gibt es keinen Marktvergleich. |

### Rendite je Schwankung

| Feld | Inhalt |
|---|---|
| Interner Begriff | `sharpe` |
| Schlüssel | `sharpe` |
| **User Label** | **Rendite je Schwankung** |
| Erklärung für Einsteiger | Wie viel Ertrag pro Einheit Schwankung herauskam. |
| Professional Label | Sharpe Ratio |
| Tooltip | Fachschicht. Bestraft Schwankung nach oben genauso wie nach unten. |
| Negativer Zustand | Der Ertrag stand in einem schlechten Verhältnis zur Schwankung. |
| Nicht verfügbar | Ohne zertifizierten Backtest nicht berechenbar. |

### Rendite je Verlustschwankung

| Feld | Inhalt |
|---|---|
| Interner Begriff | `sortino` |
| Schlüssel | `sortino` |
| **User Label** | **Rendite je Verlustschwankung** |
| Erklärung für Einsteiger | Wie viel Ertrag pro Einheit Schwankung nach unten herauskam. |
| Professional Label | Sortino Ratio |
| Tooltip | Fachschicht. Zählt nur die Schwankung nach unten. |
| Negativer Zustand | Der Ertrag stand in einem schlechten Verhältnis zur Abwärtsschwankung. |
| Nicht verfügbar | Ohne zertifizierten Backtest nicht berechenbar. |

### Zeit im Markt

| Feld | Inhalt |
|---|---|
| Interner Begriff | `exposure` |
| Schlüssel | `exposure` |
| **User Label** | **Zeit im Markt** |
| Erklärung für Einsteiger | Wie viel der Zeit überhaupt investiert war. |
| Professional Label | Exposure |
| Tooltip | Fachschicht. Eine Rendite bei 20 % Marktzeit ist etwas anderes als bei 100 %. |
| Negativer Zustand | Es war kaum Zeit im Markt. |
| Nicht verfügbar | Ohne zertifizierten Backtest nicht berechenbar. |

### Umschlag

| Feld | Inhalt |
|---|---|
| Interner Begriff | `turnover` |
| Schlüssel | `turnover` |
| **User Label** | **Umschlag** |
| Erklärung für Einsteiger | Wie oft umgeschichtet worden wäre. |
| Professional Label | Turnover |
| Tooltip | Fachschicht. Hoher Umschlag frisst die Rendite über Kosten auf. |
| Negativer Zustand | Es wäre sehr häufig umgeschichtet worden. |
| Nicht verfügbar | Ohne zertifizierten Backtest nicht berechenbar. |

### Ausführungsabschlag

| Feld | Inhalt |
|---|---|
| Interner Begriff | `slippage` |
| Schlüssel | `slippage` |
| **User Label** | **Ausführungsabschlag** |
| Erklärung für Einsteiger | Was zwischen dem gedachten und dem tatsächlichen Preis verloren geht. |
| Professional Label | Slippage |
| Tooltip | Fachschicht. Ohne Annahme dazu ist jede Backtest-Rendite zu hoch. |
| Negativer Zustand | Der Abschlag ist groß genug, um das Ergebnis zu drehen. |
| Nicht verfügbar | Ohne zertifizierten Backtest nicht berechenbar. |

## Allgemeine Zustände

### Nicht bewertbar

| Feld | Inhalt |
|---|---|
| Interner Begriff | `UNAVAILABLE` |
| Schlüssel | `UNAVAILABLE` |
| **User Label** | **Nicht bewertbar** |
| Erklärung für Einsteiger | Die Daten, die dafür nötig sind, liegen nicht vor. |
| Professional Label | UNAVAILABLE |
| Tooltip | Nicht dasselbe wie ein schlechter Wert: hier gibt es überhaupt keinen. |
| Negativer Zustand | Die Daten, die dafür nötig sind, liegen nicht vor. |
| Nicht verfügbar | Die Daten, die dafür nötig sind, liegen nicht vor. |

### Bewusst nicht gezeigt

| Feld | Inhalt |
|---|---|
| Interner Begriff | `WITHHELD` |
| Schlüssel | `WITHHELD` |
| **User Label** | **Bewusst nicht gezeigt** |
| Erklärung für Einsteiger | Der Wert ließe sich rechnen, wäre aber genauer, als die Daten hergeben. |
| Professional Label | WITHHELD |
| Tooltip | Zurückgehalten, nicht fehlend. Der Unterschied steht jeweils dabei. |
| Negativer Zustand | Der Wert wird zurückgehalten. |
| Nicht verfügbar | Der Wert wird zurückgehalten. |

### Noch nicht freigegeben

| Feld | Inhalt |
|---|---|
| Interner Begriff | `NOT_CERTIFIED` |
| Schlüssel | `NOT_CERTIFIED` |
| **User Label** | **Noch nicht freigegeben** |
| Erklärung für Einsteiger | Die Methodik dafür ist geschrieben, aber noch nicht abgenommen. |
| Professional Label | NOT_CERTIFIED |
| Tooltip | Bis zur Abnahme wird nichts behauptet. |
| Negativer Zustand | Noch nicht freigegeben. |
| Nicht verfügbar | Noch nicht freigegeben. |

### Für diesen Titel nicht messbar

| Feld | Inhalt |
|---|---|
| Interner Begriff | `NOT_MEASURABLE` |
| Schlüssel | `NOT_MEASURABLE` |
| **User Label** | **Für diesen Titel nicht messbar** |
| Erklärung für Einsteiger | Diese Bedingung lässt sich hier nicht prüfen — sie gilt weder als erfüllt noch als verletzt. |
| Professional Label | NOT_MEASURABLE |
| Tooltip | Verlässt den Nenner, statt als Fehlschlag gezählt zu werden. |
| Negativer Zustand | Diese Bedingung lässt sich hier nicht prüfen. |
| Nicht verfügbar | Diese Bedingung lässt sich hier nicht prüfen. |

### Verlauf noch nicht freigeschaltet

| Feld | Inhalt |
|---|---|
| Interner Begriff | `PATH_DEPENDENT_STATES_NOT_ACTIVATED` |
| Schlüssel | `PATH_DEPENDENT_STATES_NOT_ACTIVATED` |
| **User Label** | **Verlauf noch nicht freigeschaltet** |
| Erklärung für Einsteiger | Ob eine Situation läuft, sich verschlechtert, gebrochen ist oder ihr Ziel erreicht hat, wird noch nicht gezeigt. Dafür braucht es eine Reihe echter Beobachtungen über Zeit, und die wird gerade erst aufgebaut. |
| Professional Label | PATH_DEPENDENT_STATES_NOT_ACTIVATED |
| Tooltip | Die Methodik ist freigegeben. Die vier Verlaufszustände haben ein eigenes Gate, das erst öffnet, wenn geordnete Historie vorliegt und sich darin wie beschrieben verhält. |
| Negativer Zustand | Ob eine Situation gebrochen ist, lässt sich derzeit nicht sagen. |
| Nicht verfügbar | Ob eine Situation gebrochen ist, lässt sich derzeit nicht sagen. Dafür braucht es eine geordnete Reihe echter Beobachtungen über Zeit. |

### Wartet auf Historie

| Feld | Inhalt |
|---|---|
| Interner Begriff | `PENDING_HISTORY` |
| Schlüssel | `PENDING_HISTORY` |
| **User Label** | **Wartet auf Historie** |
| Erklärung für Einsteiger | Alles ist gebaut und geprüft; was fehlt, ist schlicht Zeit. Mit jeder weiteren Beobachtung wächst die Reihe, die dafür nötig ist. |
| Professional Label | PENDING_HISTORY |
| Tooltip | Ein Zustand, der sich von selbst auflöst — nicht durch eine Entscheidung, sondern durch Beobachtungen. |
| Negativer Zustand | Es fehlt noch Historie. |
| Nicht verfügbar | Es fehlt noch Historie. Das ist kein Fehler, sondern der normale Verlauf beim Aufbau einer Beobachtungsreihe. |

## Begriffe, die nicht an den Anfang gehören

Diese Begriffe dürfen nicht in einer Überschrift, einem Eyebrow, einem Chip oder einem Badge stehen. In einer eingeklappten Methodik-Ebene oder als Beisatz hinter dem Nutzerbegriff sind sie erlaubt und erwünscht - ein Profi soll den internen Namen finden können.

- `Change Engine`
- `SetupState`
- `Setup State`
- `Pattern Engine`
- `Asymmetry Engine`
- `Historical Similarity Model`
- `Strategy Match`
- `Factor DNA`
- `Market Regime`
- `Backtest Trust Score`
- `Composite Score`
- `Lift`
- `Out-of-Sample`
- `CAGR`
- `Sharpe`
- `Sortino`
- `Exposure`
- `Turnover`
- `Slippage`
- `NO_SETUP`
- `SETUP_FORMING`
- `CONFIRMED`
- `RISK_RISING`
- `INVALIDATED`
- `IMPROVING`
- `DETERIORATING`
- `ROBUST`
- `quantV2`
- `predicateHash`

Ein Test prüft `vu2/experience.js` gegen diese Liste: keiner dieser Begriffe darf in einer
Überschrift, einem Eyebrow, einem Chip oder einem Badge stehen.
