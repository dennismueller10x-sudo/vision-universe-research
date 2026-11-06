# Rechtliche Einordnung: Ist Vision Universe „nur Software“?

Stand 05.11.2026 (Fassung 2, nach der Owner-Linie Plan §11), Strang F. **Das hier ist keine Rechtsberatung.** Geschrieben hat es Claude, ohne Anwalt. Es ist
eine sorgfältige Vorarbeit für eine Prüfung durch einen Fachanwalt für Bank- und Kapitalmarktrecht
([ANWALTSMAPPE.md](ANWALTSMAPPE.md)). Gesetzesstellen sind nach bestem Wissen zitiert; den geltenden Wortlaut muss der
Anwalt am Original prüfen (gesetze-im-internet.de, EUR-Lex).

Owner-Ziel: keine Anlageempfehlung, damit wir mit der BaFin keine Probleme bekommen. Wir stellen nur eine Software zur
Analyse von Aktien bereit.

## 0. Owner-Linie vom 05.11.2026 und was sie voraussetzt

Der Owner hat entschieden ([PLAN_NEUSTART_2026-11.md](../PLAN_NEUSTART_2026-11.md) §11):
- Vision Universe ist eine Analyse-Software ohne Anlageempfehlungen.
- Es gibt keine Signale mit Einstieg, Stopp und Ziel; Stufe S3 entfällt.
- Es gibt keine Anzeige bei der BaFin nach § 86 WpHG.
- Es gibt keine Provisionen und keine Partnerverträge.
- Zu privaten Beständen steht ein neutraler Satz auf der Seite „Methodik, Quellen und Interessen“.

Diese Fassung der Einordnung richtet sich danach. Die Seite „Hinweise nach MAR und WpHG“ ist durch „Methodik, Quellen
und Interessen“ ersetzt (`/rechtliches/methodik`). Sie enthält eine kurze Vorsorgeklausel nach Art. 20 MAR, die nichts
kostet und hilft, falls die Aufsicht ein Ergebnis anders einordnet.

**Ehrlich gesagt trägt die Linie „keine Anzeige“ nur, wenn das Produkt wirklich keine Empfehlungen enthält.** Ein Satz
in den Bedingungen reicht dafür nicht (siehe §4); entscheidend ist, was auf den Seiten steht. Damit die Linie hält,
müssen diese Funktionen umgebaut werden, bevor das Produkt öffentlich startet:

| # | Funktion heute | Was sich ändern muss | Wer |
|---|---|---|---|
| L1 | Quant-Setup-Karte: „Interessant ab“, „Ziel 1/2“, „Chance/Risiko“, „Stop“ | Nur noch „Zone laut Methode“ und „Ungültig-Marke laut Methode“. Kein Ziel, kein Chance/Risiko-Verhältnis, keine Handlungssprache. | D2 |
| L2 | Supertrader: „Einstieg bestätigt“, „Vorbereitet · nahe Trigger“, Trigger- und Stop-Kurse je Aktie | Nur „erfüllt die Regel (Stand …)“. Keine handelbaren Kurse als nächster Schritt, keine Nähe-zum-Trigger-Liste als Hervorhebung. | D2 + Supertrader |
| L3 | Musterdepots und Hausstrategie: heutige Bestände und das Protokoll „Rein/Raus“ live | Als Forschung mit Abstand zeigen, z. B. Bestände mit Verzögerung oder nur als Verlauf im Backtest, nicht als heutige Kaufliste. | D2 + Quant |
| L4 | Analysten-Seite und der Analysten-Bereich in Fundamental: Konsens „Kaufen/Verkaufen“, Kursziele Dritter | Auch die Weitergabe fremder Empfehlungen fällt unter Art. 20 MAR und § 86 WpHG. Empfehlung: Labels „Kaufen/Halten/Verkaufen“ und „Kursziel-Potenzial“ entfernen oder die Seite abschalten, bis ein Anwalt das geprüft hat. | Owner-Entscheidung, dann D2 |
| L5 | Reels zu Einzelaktien („🐂 oder 🐻“) | **Entfällt. Owner-Entscheidung 06.11.: Reels bleiben unverändert** (Social Media, nicht Teil der App). | – |
| L6 | AI Atlas | Fragen „soll ich kaufen?“ oder Fragen mit persönlichen Angaben neutral ablehnen; nur Filter und Daten liefern. | vu-ask |
| L7 | Gesamturteil je Aktie („Überwiegend stark“) | Neutral zählen („4 von 7 Faktoren im oberen Drittel“). Kein Gesamturteil als Wort. | D2 |

**Was danach an Risiko bleibt:**
- **Reels (L5 entfällt):** Beiträge in sozialen Medien zu einer bestimmten Aktie, etwa die Frage „🐂 oder 🐻?“, kann die
  Aufsicht als Anlageempfehlung werten (Art. 3 Abs. 1 Nr. 35 und Art. 20 MAR; ESMA-Hinweis von 2021 zu sozialen Medien),
  auch wenn sie außerhalb der App erscheinen. Für die Einordnung zählt der Inhalt eines Beitrags, nicht der Kanal. Der
  Betreiber ist derselbe, und Anzeigepflicht sowie Offenlegung (§ 86 WpHG, private Bestände) hängen am Betreiber.
  Ohne Umbau bleibt das Risiko bestehen. Der Hinweis „Keine Anlageberatung.“ in den Captions ändert die Einordnung
  nicht. Das ist eine Frage an den Anwalt.
- Kandidatenlisten („erfüllt die Regel“) und Einstufungen je Aktie kann die Aufsicht trotzdem als *implizite*
  Empfehlung sehen. Das gilt besonders, wenn Vision Universe als Person gilt, deren Haupttätigkeit Bewertungen sind
  (Art. 3 Abs. 1 Nr. 34 Ziff. i MAR).
- Neutrale Wortwahl, keine Ziele oder Stopps und eine offene Methodik senken das Risiko deutlich, schließen es aber
  nicht aus.
- Ob die Linie hält, ist die erste Frage an den Anwalt ([ANWALTSMAPPE.md](ANWALTSMAPPE.md), Frage 4).
- Bußgeldrisiko bei Fehleinschätzung: § 120 WpHG.

## 1. Ergebnis in einem Absatz (Stand vor der Owner-Linie, als Begründung)

Die **erlaubnispflichtige Anlageberatung** lässt sich mit der heutigen Bauweise sicher vermeiden. Ergebnisse sind für alle
gleich, es gibt keine Fragen zu Vermögen, Zielen oder Risikoneigung, und nichts wird als „für dich geeignet“ dargestellt.
Die Einordnung „reine Software, also keine Anlageempfehlung“ **trägt aber nicht überall.** Die Marktmissbrauchsverordnung
(MAR) fragt nicht, ob ein Mensch oder ein Algorithmus eine Aussage erzeugt. Sie fragt, ob für die Öffentlichkeit
bestimmte Informationen ausdrücklich oder stillschweigend zu einer Anlageentscheidung über ein bestimmtes
Finanzinstrument raten.

Bei diesen Funktionen ist das wahrscheinlich oder zumindest gut vertretbar der Fall:
- Signale mit Einstieg, Stopp und Ziel,
- Supertrader-Stufen wie „Einstieg bestätigt“,
- Musterdepot-Käufe,
- Einstufungen wie „Überwiegend stark“ je Aktie,
- Reels zu Einzelaktien (Owner-Entscheidung 06.11.: bleiben unverändert, Restrisiko siehe §0).

Das ist **nicht verboten und braucht keine BaFin-Erlaubnis.** Es löst aber Pflichten aus:
- objektive Darstellung,
- Angabe des Erstellers,
- Methodik und Quellen,
- Datum,
- Offenlegung von Interessenkonflikten (Art. 20 MAR, Delegierte VO (EU) 2016/958),
- wahrscheinlich eine **Anzeige bei der BaFin vor Beginn** (§ 86 WpHG).

Verstöße sind Ordnungswidrigkeiten (§ 120 WpHG). Das sichere Vorgehen ist deshalb, diese Pflichten zu erfüllen, statt
sich darauf zu verlassen, „nur Software“ zu sein.

## 2. Prüfmaßstäbe

### 2.1 Anlageberatung (erlaubnispflichtig)

- **§ 1 Abs. 1a Satz 2 Nr. 1a KWG** (gleichlautend § 2 Abs. 2 Nr. 4 WpIG, § 2 Abs. 8 Satz 1 Nr. 10 WpHG): „die Abgabe von
  persönlichen Empfehlungen an Kunden oder deren Vertreter, die sich auf Geschäfte mit bestimmten Finanzinstrumenten
  beziehen, sofern die Empfehlung auf eine Prüfung der persönlichen Umstände des Anlegers gestützt oder als für ihn geeignet
  dargestellt wird und nicht ausschließlich über Informationsverbreitungskanäle oder für die Öffentlichkeit bekannt gegeben
  wird.“
- **Art. 9 Delegierte VO (EU) 2017/565** konkretisiert die „persönliche Empfehlung“ (an eine Person in ihrer Eigenschaft als
  Anleger, gestützt auf ihre Umstände oder als geeignet dargestellt).
- **Erlaubnis:** § 32 KWG bzw. für Wertpapierinstitute seit 26.06.2021 § 15 WpIG. Ohne Erlaubnis drohen Strafbarkeit
  (§ 54 KWG, § 82 WpIG) und Einschreiten der BaFin (§ 37 KWG).
- **BaFin-Verwaltungspraxis:** Merkblatt „Hinweise zum Tatbestand der Anlageberatung“ (BaFin/Bundesbank, jeweils aktuelle
  Fassung). Danach sind Empfehlungen über Informationsverbreitungskanäle, etwa Börsenbriefe, Zeitschriften, Fernsehen oder
  Internetseiten für einen unbestimmten Personenkreis, keine Anlageberatung. Eine Empfehlung wird aber persönlich, wenn sie an
  persönliche Angaben anknüpft. Die BaFin hat das auch für automatisierte Angebote bestätigt (Fachartikel zu „Robo-Advice“,
  BaFinJournal 2017). Ein Werkzeug, das Risikoneigung oder Anlageziele abfragt und daraus konkrete Titel vorschlägt, kann
  Anlageberatung oder Finanzportfolioverwaltung sein.
- **Nachbartatbestände:**
  - Anlagevermittlung (§ 1 Abs. 1a Satz 2 Nr. 1 KWG): Vermittlung von Geschäften, z. B. ein Broker-Link mit Provision.
  - Abschlussvermittlung (Nr. 2).
  - Finanzportfolioverwaltung (Nr. 3): Verwaltung fremden Vermögens mit Entscheidungsspielraum, z. B. automatische
    Ausführung von Signalen in Kundendepots oder Copy-Trading.
  - Für Fonds/ETF und Versicherungen: § 34f, § 34h GewO (Finanzanlagenvermittlung, Honorar-Finanzanlagenberatung) und
    § 34d GewO (Versicherungsvermittlung und -beratung).

### 2.2 Anlageempfehlung und Anlagestrategieempfehlung (keine Erlaubnis, aber Pflichten)

- **Art. 3 Abs. 1 Nr. 35 MAR**, „Anlageempfehlung“: Informationen mit einer ausdrücklichen oder impliziten Empfehlung oder
  einem Vorschlag zu einer Anlagestrategie zu einem oder mehreren Finanzinstrumenten oder Emittenten, einschließlich einer
  Beurteilung des aktuellen oder künftigen Wertes oder Kurses, die für Verbreitungskanäle oder die Öffentlichkeit
  vorgesehen sind.
- **Art. 3 Abs. 1 Nr. 34 MAR**, „Informationen mit Empfehlungen oder Vorschlägen zu Anlagestrategien“:
  - Ziff. i: Informationen, die eine Wertpapierfirma, ein Kreditinstitut, ein unabhängiger Analyst oder eine Person
    erstellt, **deren Haupttätigkeit in der Erstellung von Anlageempfehlungen besteht**. Hier genügt ein **indirekter**
    Anlagevorschlag zu einem bestimmten Finanzinstrument oder Emittenten.
  - Ziff. ii: Informationen von anderen Personen, die **direkt** eine bestimmte Anlageentscheidung vorschlagen.
- **Art. 20 Abs. 1 MAR:** Wer solche Informationen erstellt oder verbreitet, sorgt in angemessener Weise dafür, dass sie
  objektiv dargestellt und Interessen oder Interessenkonflikte offengelegt werden.
- **Delegierte VO (EU) 2016/958:**
  - Art. 2: Identität des Erstellers.
  - Art. 3: objektive Darstellung. Tatsachen werden von Auslegungen, Schätzungen und Meinungen getrennt; Quellen werden
    genannt; Prognosen und Annahmen sind als solche gekennzeichnet; Datum und Uhrzeit werden angegeben.
  - Art. 4: zusätzliche Anforderungen für Personen nach Nr. 34 Ziff. i und für „Sachverständige“. Dazu gehören u. a.
    Bewertungsgrundlage und Methodik, die Bedeutung der Empfehlung, der Zeithorizont und nach unserem Verständnis eine
    Übersicht der Empfehlungen der vergangenen zwölf Monate. Den Wortlaut muss der Anwalt prüfen.
  - Art. 5 und 6: Offenlegung von Interessen und Interessenkonflikten. Bei Personen nach Ziff. i und Sachverständigen sind
    das u. a. Netto-Positionen über 0,5 % des Grundkapitals.
  - Kapitel III: Weitergabe von Empfehlungen Dritter.
- **§ 85 WpHG:** Wer Empfehlungen erstellt oder verbreitet, muss so organisiert sein, dass Interessenkonflikte möglichst
  gering sind; dazu gehören angemessene Kontrollverfahren.
- **§ 86 WpHG:** Anzeigepflicht gegenüber der BaFin. Sie betrifft Personen, die kein Wertpapierdienstleistungsunternehmen
  sind und in Ausübung ihres Berufs oder im Rahmen ihrer Geschäftstätigkeit Anlageempfehlungen erstellen oder weitergeben.
  Die Anzeige muss **vor** der Erstellung oder Weitergabe erfolgen. Anzugeben sind u. a. Firma, Rechtsform,
  Vertretungsorgan und bei Verbreitung die geplanten Verbreitungswege; Änderungen sind binnen vier Wochen mitzuteilen.
- **Social Media:** Die ESMA hat 2021 klargestellt, dass Art. 20 MAR auch für Beiträge in sozialen Medien gilt
  (Warnung/Statement zu Anlageempfehlungen in sozialen Medien). Die BaFin hat das für Finanz-Influencer aufgegriffen.
- **Journalisten:** Art. 21 MAR (Selbstregulierung der Presse) kann für Magazin und Morning in Betracht kommen. Ob das für
  ein Produktunternehmen greift, ist offen.

### 2.3 Werbung mit Renditen und Backtests

- **UWG:**
  - § 5: Irreführung, z. B. durch geschönte oder ausgewählte Backtests, fehlende Kosten oder Überlebensverzerrung.
  - § 5a: Irreführung durch Unterlassen wesentlicher Angaben (Zeitraum, Kosten, Annahmen).
  - § 3 Abs. 3 mit Anhang: z. B. falsche Behauptung, ein Produkt verringere Risiken oder garantiere Gewinne.
- **Maßstab aus dem Aufsichtsrecht:** Art. 44 Abs. 4 bis 7 Delegierte VO (EU) 2017/565 gilt direkt nur für
  Wertpapierfirmen (über § 63 Abs. 6 WpHG). Er beschreibt aber anerkannte Standards für faire Darstellung:
  - Zeitraum von möglichst fünf Jahren in Zwölfmonatsabschnitten,
  - Bezugsquelle der Daten,
  - Hinweis „frühere Wertentwicklungen sind kein verlässlicher Indikator für künftige Ergebnisse“,
  - simulierte Wertentwicklung nur auf Grundlage tatsächlicher früherer Ergebnisse vergleichbarer Instrumente bzw. klar
    gekennzeichnet,
  - Bruttowerte mit Angabe der Kosten.

  Wir übernehmen diesen Standard freiwillig, weil ein Gericht ihn bei § 5 UWG als Orientierung heranziehen dürfte.
- **Owner-Regel (CLAUDE.md):** Öffentliche Aussagen über Rendite oder Performance brauchen eine Owner-Freigabe.

### 2.4 Weitere Punkte am Rand

- **AGB-Recht:** §§ 307, 309 Nr. 7 BGB (Haftungsbegrenzung) und §§ 327 ff. BGB (digitale Produkte). Ein vollständiger
  Gewährleistungsausschluss für Daten im entgeltlichen Pro-Vertrag ist angreifbar.
- **Stillschweigender Auskunftsvertrag:** Nach der BGH-Rechtsprechung (Bond-Urteil, BGH XI ZR 12/93) kann ein Auskunftsvertrag
  stillschweigend entstehen, wenn jemand erkennbar auf eine Auskunft vertraut. Bei einer Software für alle mit klarer
  Leistungsbeschreibung ist das Risiko gering. Es wird durch die neue AGB-Ziffer 3 weiter gesenkt.
- **KI-Verordnung (EU) 2024/1689, Art. 50:** Transparenzpflichten für KI-Systeme, die mit Menschen interagieren, und für
  KI-erzeugte Texte, gültig ab 02.08.2026. Der AI Atlas muss erkennbar als KI arbeiten; das ist heute schon so.

## 3. Bewertung je Produktfunktion

Legende:
- **unkritisch:** reine Information oder Werkzeug; Hinweise genügen.
- **kritisch:** wahrscheinlich Anlageempfehlung nach MAR; zulässig, wenn die genannten Pflichten erfüllt sind.
- **zu vermeiden:** würde in die Erlaubnispflicht führen oder ist nicht sauber darstellbar.

### Screener (`/screener/`) – unkritisch

Was es ist:
- Die Nutzerin setzt die Filter selbst.
- Die Trefferliste zeigt, was ihre Bedingungen erfüllt.
- Es gibt keine eigene Wertung.
- Ein gespeicherter Screen ist eine Einstellung, keine Kenntnis persönlicher Umstände.

Pflichten: Hinweis „ranking“. Vorlagen (Presets) mit wertenden Namen meiden.

Gilt nicht mehr, wenn: Das Feld „Kursziel-Potenzial“ (Daten Dritter) freigeschaltet wird. Dann gilt die Zeile
„Analysten“.

### Quant: Faktorwerte 0–100, Wort stark/Mittelfeld/schwach – kritisch (niedrig)

Was es ist:
- Eine relative Lage im Universum, für alle gleich, mit Methode und Datenstand.
- Für sich genommen eher Information als Empfehlung.

Pflichten:
- Art. 3 DelVO: Fakten getrennt von Rechenergebnissen, Quelle, Datum.
- Link zu den MAR-Hinweisen.

Gilt nicht mehr, wenn: Werte als Qualitätsurteil („gute Aktie“) formuliert werden.

### Quant-Gesamturteil je Aktie („Überwiegend stark“ … „Überwiegend schwach“) – kritisch

Was es ist:
- Eine Gesamtbeurteilung einer bestimmten Aktie.
- Kann als implizite Beurteilung des Werts im Sinne von Nr. 35 gelesen werden.
- Vision Universe könnte als Person gelten, „deren Haupttätigkeit“ die Erstellung solcher Beurteilungen ist (Nr. 34
  Ziff. i).

Pflichten: Art. 20 MAR, Art. 2 bis 5 DelVO, Methodik je Aktie verlinkt, § 86 WpHG prüfen.

Gilt nicht mehr, wenn: Ein „Gesamtscore“ und eine Rangliste „beste Aktien“ dazukommen (heute bewusst gesperrt). Das
wäre stärker empfehlungsnah.

### Quant-Setup-Karte („Interessant ab“, „Stop / Ungültig unter“, „Ziel 1/2“, „Chance/Risiko“) – kritisch (hoch)

Was es ist:
- Konkrete Handelsmarken je Aktie.
- „Interessant ab“ und „Chance/Risiko“ wirken wie ein direkter Vorschlag.

Pflichten:
- wie bei der Zeile „Signale“,
- Wortwahl ändern („Einstiegsmarke der Methode“, „Zielzone der Methode“).

Gilt nicht mehr, wenn: „Interessant ab“ bleibt. Das ist die Formulierung mit dem höchsten Risiko auf den heutigen
Seiten.

### Discover-Einordnung („WACHSTUM SEHR STARK, BEWERTUNG HOCH“, „spricht dafür/dagegen“), Fundamental-Urteile – kritisch (niedrig)

Was es ist:
- Beschreibende Einordnung von Kennzahlen.
- Sie sagt ausdrücklich nicht, ob man kaufen soll.
- Die Waage „spricht dafür“ ist am Rand.

Pflichten: Art. 3 DelVO (Quellen, Datum). Formulierung „spricht dafür“ meiden, stattdessen „Stärken / Schwächen
laut Kennzahlen“.

Gilt nicht mehr, wenn: Ein „Fazit: attraktiv“ hinzukommt.

### Supertrader-Kandidaten (Stufen „Kandidat“, „Vorbereitet · nahe Trigger“, „Einstieg bestätigt“) – kritisch

Was es ist:
- Die Regeln bekannter Trader, angewendet auf jede Aktie.
- Ein Kandidat erfüllt die Regel.
- „Einstieg bestätigt“ mit Trigger und Stop ist nah an einem direkten Vorschlag.

Pflichten:
- Art. 20 MAR, DelVO,
- Datum/Uhrzeit je Stufe,
- Protokoll früherer Ergebnisse (gibt es schon),
- Interessenkonflikte.

Gilt nicht mehr, wenn: Eine Positionsgröße für die Nutzerin berechnet wird („kaufe 37 Stück“).

### Musterdepots, Hausstrategie (Rein/Raus je Monat, live) – kritisch

Was es ist:
- Ein öffentliches Modelldepot wie in Börsenbriefen.
- Keine Vermögensverwaltung, weil kein Kundengeld verwaltet wird.
- Jede Umschichtung ist eine implizite Empfehlung.
- Renditen fallen unter UWG und die Owner-Freigabe.

Pflichten:
- Hinweis „modelPortfolio“,
- Datum je Umschichtung,
- Renditen nur mit Backtest-Standard (2.3) und Owner-Freigabe.

Zu vermeiden:
- automatisches Nachbilden (Copy-Trading),
- Verknüpfung mit einem Broker,
- „Depot kopieren“.

### Backtests („Forschung, nicht zertifiziert“, Backtest Lab, Piloten mit Renditekurve) – kritisch (UWG)

Was es ist: Keine Empfehlung, aber Werbung mit Wertentwicklung.

Pflichten:
- Pflichtangaben aus `notices.backtest.required`,
- alle Varianten berichten, auch die schlechten (gibt es schon im Plan E3),
- keine Rosinen,
- Vergleich mit SPY-Gesamtrendite.

Zu vermeiden:
- Renditezahlen in Werbung oder Reels ohne diese Angaben,
- „schlägt den Markt“ als Schlagzeile.

### Geplante Signale mit Einstieg, Stopp und Ziel (Plan §10, S3) – entfällt nach Owner-Linie §11

Bewertung zur Erinnerung, falls die Idee zurückkommt:

Was es ist:
- Eindeutig eine Anlageempfehlung (direkter Vorschlag einer Anlageentscheidung).
- Für alle gleich, also keine Anlageberatung.

Pflichten vor dem Start:
- § 86-Anzeige,
- Art. 2 bis 6 DelVO vollständig,
- Zeitstempel,
- unveränderbare Vorwärtsbilanz (im Plan vorgesehen),
- Interessenkonflikt-Regel mit Handelssperre für Mitwirkende,
- Hinweis „signal“.

Zu vermeiden:
- Push nur an ausgewählte Nutzer nach deren Depot,
- „Signal passt zu deinem Risiko“,
- Positionsgröße je Nutzer,
- automatische Ausführung.

### AI Atlas (`/ask/`, KI übersetzt Fragen in Filter) – kritisch

Was es ist:
- Ein Chat lädt zu persönlichen Fragen ein („Ich bin 30 und habe 5.000 €, was soll ich kaufen?“).
- Wenn die Antwort an diese Umstände anknüpft, entsteht eine **persönliche Empfehlung**, die auf persönliche Umstände
  gestützt ist. Das wäre Anlageberatung.

Pflichten:
- Die KI muss persönliche Umstände ignorieren und Kauf-/Verkaufsfragen in neutrale Filter umwandeln. Das ist teilweise
  schon so umgesetzt.
- Der Hinweis „ai“ steht sichtbar.
- KI-VO Art. 50.

Zu vermeiden: jede Antwort im Stil „für dich geeignet“ und jede Abfrage von Alter, Vermögen oder Risikoneigung im
Atlas.

### Analysten (`/analysten/`, Fundamental-Bereich): Kaufen/Halten/Verkaufen, Kursziele Dritter – kritisch

Was es ist:
- Weitergabe von Empfehlungen Dritter in zusammengefasster Form.
- Die Labels „Kaufen/Verkaufen“ und „Kursziel-Potenzial“ sind Empfehlungsbegriffe, wenn auch fremde.

Pflichten:
- DelVO Kapitel III (Identität des Weitergebenden, Quelle, Datum, Hinweis, dass es nicht unsere Einschätzung ist),
- Hinweis „thirdParty“,
- Lizenz der Daten prüfen.

Zu vermeiden: „Konsens-Ranking“ als Bestenliste. Die Kennzeichnung muss so stark sein, dass niemand die Werte für unsere
eigenen hält.

### Hedgefonds, Insider (13F, Form 4) – unkritisch

Was es ist:
- Wiedergabe gesetzlicher Meldungen.
- Labels „Gruppen-Kauf“ (Badge „strong“) leicht wertend.

Pflichten: Quelle, Meldedatum, Verzögerung (13F bis 45 Tage).

Gilt nicht mehr, wenn: Daraus wird „Was Profis kaufen – jetzt nachkaufen“.

### Technical-Welt (S/R-Zonen, Indikator-Ereignisse, „Bullisch/Bärisch“) – unkritisch bis kritisch

Was es ist:
- Beschreibung von Chartlagen.
- Die Ereignistabelle sagt ausdrücklich, dass sie keine Signale ist.

Pflichten: Art. 3 DelVO, Hinweis „stock“.

### Vorsorge (`/vorsorge/`, Planer mit Alter, Sparrate, Bestandsvertrag, „Riester: behalten oder neu ausrichten?“) – kritisch

Was es ist:
- Rechner mit **persönlichen Eingaben**.
- Unbedenklich, solange nur gerechnet und kein bestimmtes Produkt als passend ausgegeben wird. Der Text „keine
  Wechsel-Empfehlung“ steht schon da.

Pflichten: Keine Produktauswahl aus persönlichen Daten; ETF-Beispiele ohne Bezug zur Eingabe.

Zu vermeiden: „Für dein Profil passt ETF X“ oder „Wechsle deinen Riester-Vertrag“. Das berührt § 34f/§ 34d GewO und die
Anlageberatung.

### Erststart (`/willkommen/start/`: Ziel, Erfahrung) – unkritisch

Was es ist:
- Steuert nur Darstellung und Startpfad.
- Keine Geeignetheitsprüfung.

Gilt nicht mehr, wenn: Daraus konkrete Titel abgeleitet werden.

### Magazin, Morning, News – kritisch (niedrig)

Was es ist: Redaktionelle Texte zu Einzelaktien mit „Chance:“.

Pflichten: Art. 20 MAR oder Art. 21 (Presseprivileg) prüfen, Autor nennen, Interessenkonflikte.

### Reels, Instagram/TikTok zu Einzelaktien („🐂 oder 🐻“) – kritisch

Was es ist: Die ESMA ordnet solche Beiträge ausdrücklich ein.

Pflichten:
- Ersteller im Profil,
- Link zu den MAR-Hinweisen,
- **Positionen des Owners offenlegen**,
- Handelssperre.

Zu vermeiden: Positionen der Mitwirkenden verschweigen und kurz nach einem Reel handeln. Das kann Marktmanipulation
sein (Scalping, Art. 12 Abs. 2 lit. d MAR).

### Watchlist, persönliches Dashboard – unkritisch

Was es ist:
- Zeigt dieselben Ergebnisse wie für alle, gefiltert nach eigener Wahl.

Gilt nicht mehr, wenn:
- Meldungen nach Depotbestand und Risikoprofil verschickt werden,
- Hinweise im Stil „verkaufe X“ an die Watchlist gehen.

### Broker-Links, Affiliate (heute keine) – zu vermeiden

Was es ist: Ein Link mit Vergütung zu einer Order wäre Anlagevermittlung bzw. Tippgeber und ein Interessenkonflikt.

Pflichten: Nur nach Anwaltsprüfung.

## 4. Wo „reine Software“ nicht trägt

1. **Algorithmus statt Mensch ändert nichts.** Die MAR stellt auf die Information und ihren Empfängerkreis ab. Eine
   Regel, die täglich „Einstieg bestätigt“ für eine bestimmte Aktie veröffentlicht, ist eine Empfehlung des Betreibers.
2. **Haupttätigkeit.** Wenn Vision Universe im Kern davon lebt, Aktien zu bewerten, kann es Nr. 34 Ziff. i fallen. Dann
   genügen schon indirekte Vorschläge, und es gelten die strengeren Pflichten aus Art. 4 bis 6 DelVO.
3. **Ein Disclaimer heilt nichts.** „Keine Anlageempfehlung“ unter einem Text mit „Interessant ab 41,20 $, Ziel 48 $“
   ändert die Einordnung nicht. Die Aufsicht schaut auf den Inhalt. Disclaimer helfen bei Haftung und Irreführung, nicht
   bei der MAR-Einordnung.
4. **Personalisierung kippt alles.** Sobald irgendein Teil, vor allem AI Atlas, Vorsorge oder künftige Benachrichtigungen,
   Ergebnisse an persönliche Umstände knüpft, droht die erlaubnispflichtige Anlageberatung.
5. **Die Passwortmaske ändert nichts.** Wer sie hat, kann die Seite nutzen; die Daten sind faktisch öffentlich. Für die
   MAR ist ein zahlender Abonnentenkreis ebenfalls ein Verbreitungskanal.

## 5. Was daraus folgt (nach der Owner-Linie, ohne Anwalt)

1. **Anlageberatung vermeiden:**
   - keine Fragen zu persönlichen Umständen,
   - keine „passt zu dir“-Texte,
   - AI Atlas und Vorsorge entsprechend absichern.

   Das ist in den Bedingungen festgeschrieben und in [WORTWAHL.md](WORTWAHL.md) geregelt.
2. **Keine Empfehlungen:** die Umbauten L1–L7 aus §0 vor dem öffentlichen Start. Erst dann ist die Linie „keine Anzeige
   nach § 86 WpHG“ vertretbar.
3. **Offenlegung trotzdem:** Die Seite „Methodik, Quellen und Interessen“ wird aus jeder Ergebnisansicht verlinkt
   (`assets/legal-notices.json`). Sie nennt Methode, Datenstand und Regelversion an jedem Ergebnis; das gibt es
   weitgehend schon.
4. **Wortwahl umsetzen** (Befunde in [WORTWAHL-BEFUNDE.md](WORTWAHL-BEFUNDE.md), Umsetzung durch Strang D2).
5. **Renditen** nur mit dem Backtest-Standard (2.3) und Owner-Freigabe.
6. **Pflicht-Links in der App:**
   - immer: Impressum, Datenschutz, Nutzungsbedingungen, Risikohinweise;
   - sobald in der App gekauft werden kann: zusätzlich „Verträge hier kündigen“ und „Vertrag widerrufen“.

   Liste mit Begründung: `assets/legal-notices.json` → `appLinks`, erklärt in [WORTWAHL.md](WORTWAHL.md).

## Quellen

- KWG § 1 Abs. 1a, § 32, § 37, § 54: https://www.gesetze-im-internet.de/kredwg/
- WpIG § 2 Abs. 2, § 15: https://www.gesetze-im-internet.de/wpig/
- WpHG § 2 Abs. 8, § 63, §§ 85, 86, § 120: https://www.gesetze-im-internet.de/wphg_1994/ (§ 86 vgl. https://lexetius.com/WpHG/86, § 85 https://lexetius.com/WpHG/85)
- MAR, VO (EU) Nr. 596/2014, Art. 3, 12, 20, 21: https://eur-lex.europa.eu/eli/reg/2014/596/oj
- Delegierte VO (EU) 2016/958: https://eur-lex.europa.eu/eli/reg_del/2016/958/oj (deutsch z. B. https://gesetze.legal/eu/vo_eu_2016_958)
- Delegierte VO (EU) 2017/565, Art. 9, Art. 44: https://eur-lex.europa.eu/eli/reg_del/2017/565/oj
- BaFin, Merkblatt „Hinweise zum Tatbestand der Anlageberatung“; BaFinJournal-Fachartikel zu Robo-Advice (2017); BaFin-Hinweise zu Finanz-Influencern: https://www.bafin.de
- ESMA, Statement zu Anlageempfehlungen in sozialen Medien (Oktober 2021): https://www.esma.europa.eu
- UWG §§ 3, 5, 5a mit Anhang: https://www.gesetze-im-internet.de/uwg_2004/
- BGB §§ 307, 309, 327 ff.; BGH, Urteil vom 06.07.1993, XI ZR 12/93 („Bond“)
- KI-Verordnung (EU) 2024/1689, Art. 50: https://eur-lex.europa.eu/eli/reg/2024/1689/oj
