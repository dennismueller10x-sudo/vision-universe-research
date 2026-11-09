# Prüfung deutscher Unternehmensprofile – 09.11.2026

## Ergebnis und Grenzen

**200 zufällig ausgewählte US-Profile: 23 redaktionell beanstandet (11,5 %), davon 4 mit konkreter Bedeutungsverschiebung gegenüber dem englischen Ausgangstext (2,0 %).** Die übrigen 19 betreffen sprachliche Präzision oder Informationsqualität. Keine englischen Restsätze, Werbeversprechen oder Anlageaufforderungen in den geprüften deutschen Texten gefunden. Das ist eine Textprüfung, keine rechtliche Freigabe.

**Top 30 nach Marktwert: 18 deutsche Texte vorhanden und gelesen, 12 ohne deutsche Fassung in den geprüften Katalogen (40,0 % Abdeckungslücke).** Unter den 18 vorhandenen Texten kein zusätzlicher bestätigter Textfehler. Vier Unternehmen überschneiden sich mit der Zufallsstichprobe (AAPL, MSFT, META, CSCO). Insgesamt 226 unterschiedliche Unternehmen bzw. 214 vorhandene Texte geprüft. 35/226 (15,5 %) haben mindestens eine Textbeanstandung oder Kataloglücke. Diese gemischte Quote ist **keine Schätzung für das Gesamtuniversum**; dafür dient ausschließlich die Zufallsgruppe mit ihrem unten abgegrenzten Auswahlrahmen. Auch 11,5 % ist keine reine Sachfehlerquote.

**Die Live-Prüfung ist eingeschränkt:** `https://research.visionuniverse.de/company-intelligence/data/index.json` lieferte am 09.11.2026 um 09:37 UTC HTTP 200 mit `state: DISABLED`, leeren `companies` und `tickers`; ein zweiter Abruf mit Cache-Buster ergab dieselben Bytes. `/company-intelligence-delivery.json` lieferte HTTP 404. Deshalb lässt sich hier weder eine aktive Generation noch eine Live-Menge von ca. 2.872 Profilen belegen. Die folgenden Befunde beziehen sich auf die versionierten Erzeuger-Kataloge, **nicht auf nachweislich ausgelieferte Profil-JSONs**. Insbesondere bedeutet P1 „im Katalog nicht gefunden“, nicht „Live-Karte enthält leeren Text“. Kein Gate wurde geöffnet, kein Workflow gestartet, kein Erzeuger ausgeführt.

## Quellen und Auswahl

Basis ist `main` bei Commit `8ae76660b298c36b39a768d09918d8461105603d`. Gelesen: [CLAUDE.md](../../../CLAUDE.md), [AGENTS.md](../../../AGENTS.md), [Neustart-Plan](../../PLAN_NEUSTART_2026-11.md), [FULL_UNIVERSE_ROLLOUT.md](../company-intelligence/FULL_UNIVERSE_ROLLOUT.md) und [WORTWAHL.md](../../legal/WORTWAHL.md). `company-intelligence/README.md` und `company-intelligence/FULL_UNIVERSE_ROLLOUT.md` existieren an dieser Basis nicht; der Rollout-Plan liegt im Archiv. Dessen frühere Zahlen (45 geprüfte deutsche Profile im Oktober) sind keine aktuelle Bestandszählung.

Die drei Textbestände sind `company-intelligence/config/profile-reviewed-de.json` (2.830 Einträge, alle `APPROVED`), `profile-editorial-de.json` (31) und `top46-content-review.json` (14). Ihre Vereinigungsmenge enthält **2.875 unterschiedliche Emittenten**, nicht 2.872. Das ist ein Textinventar, keine durch die privaten Zustands-, Quellen-, Rückzugs- und Veröffentlichungsgates bestätigte Consumer-Menge. Für die Lesefassung wird nach Emittenten-ID vereinigt; beim Überschneiden gewinnt die explizite Top46-Fassung, danach die redaktionelle Fassung. Die Prüfung behauptet damit keine private Import-Reihenfolge oder Consumer-Freigabe.

Die englischen Originalauszüge stammen aus `company-intelligence/config/company-profiles.json`. Für die 200 ausgewählten Profile stimmen sämtliche vorhandenen `sourceDescriptionHash`-Pins mit SHA-256 der verglichenen englischen `description` überein. Geprüft wird die inhaltliche Treue zu diesem gespeicherten Original, nicht die vollständige Aktualität jedes Geschäftsmodells am Prüfungstag. Für GOOG und JPM ist der Katalogauszug zu schwach für den umfangreicheren manuellen Text; zusätzlich wurden deren im Top46-Eintrag genannten englischen 10-Ks gelesen: [Alphabet, 05.02.2026](https://www.sec.gov/Archives/edgar/data/1652044/000165204426000018/goog-20251231.htm) (Google Services, Google Cloud, Other Bets) und [JPMorgan, 13.02.2026](https://www.sec.gov/Archives/edgar/data/19617/000162828026008131/jpm-20251231.htm) (Privatkunden-, Firmen-/Investmentbank- und Vermögensverwaltungsgeschäft). Keine zusätzliche deutsche Behauptung wurde allein aus allgemeinem Firmenwissen als bestätigt behandelt.

### Reproduzierbare Zufallsauswahl

- Seed: `vision-universe-profile-de-pruefung-20261109-v1`.
- Einheit: **Emittent/CIK**, nicht Aktie. Mehrere Aktiengattungen zählen einmal.
- Auswahlrahmen: deutsche Katalogfassung vorhanden, Zuordnung über `quant/data/market/security-master/company-names.json` zu mindestens einem `inProductUniverse`-Ticker und englischer Originalauszug mit mindestens einer SEC-Quelle vom Typ `10-K`. **2.424 Emittenten vor Sitzprüfung.** Ausländische 20-F-Berichterstatter sind damit nicht Teil dieses Auswahlrahmens; ebenso fehlen Profile ohne passenden englischen Originalauszug oder aktuelle Produktzuordnung.
- Alle IDs aufsteigend nach `SHA256(seed + ':' + companyId)` sortieren. In dieser Reihenfolge SEC-Geschäftssitz prüfen und die ersten 200 mit US-Bundesstaat bzw. DC übernehmen. Abfrage: `https://data.sec.gov/submissions/CIK<zehnstellige CIK>.json`, Feld `addresses.business.stateOrCountry`, Abruf 09.11.2026. Keine eigene Ticker-Identität erzeugt; CIKs stammen aus dem vorhandenen Master.
- „US“ bedeutet hier **gemeldeter Geschäftssitz in einem US-Bundesstaat/DC**, nicht bloß US-Listing und nicht zwingend US-Gründungsrecht. Diese Definition umfasst z. B. ausländisch inkorporierte Gesellschaften mit US-Geschäftssitz. Fehlende Sitzangaben werden ausgeschlossen, nicht als US geraten.
- Bis zum 200. US-Treffer sind 210 Kandidaten nötig. Die zehn ausgesonderten Fälle stehen unten. Für diesen Ablauf wurden vorsorglich die ersten 300 SEC-Metadatensätze gelesen; spätere Fälle beeinflussen die Auswahl nicht. Die globale Anzahl der US-Sitze innerhalb der 2.424 wurde nicht vollständig erhoben.
- Die vollständige Auswahl einschließlich CIK, gemeldetem US-Staat und Prüfergebnis steht in Anhang A. Damit bleibt die Auswahl auch dann nachvollziehbar, wenn die SEC später ihre Stammdaten ändert.

Bei dieser Definition ist die Stichprobe eine zufällige Auswahl aus dem **zuordenbaren, US-ansässigen 10-K-Teilbestand mit deutschem Text und englischem Vergleich**, keine ungeprüfte Gleichsetzung mit sämtlichen ca. 2.872 Live-Profilen. Profile ohne deutsche Fassung gehören absichtlich nicht in den Nenner der Übersetzungsquote; dafür existiert die zusätzliche Top30-Abdeckungsprüfung.

### Bewertungsmaßstab je Profil

Jeder deutsche `description`-Text wurde mit dem zugehörigen englischen Text auf Restsätze, Bedeutungswechsel, Produkt-/Branchenbegriffe, ungedeckte Sachbehauptungen, Substanz/Länge, Werbung und Anlage-Wortwahl verglichen. P5–P8 sind konkrete Bedeutungsverschiebungen; P2/P3/P4/P9/P10 sind redaktionelle Beanstandungen mit unterschiedlicher Dringlichkeit. Ein Text zählt in der Profilquote höchstens einmal. Kürzen, Zahlen weglassen und Marken unverändert lassen sind allein keine Fehler.

Der Projektor in `scripts/company_intelligence/reviewed_profiles.py#approved_copy` bzw. `editorial.py#german_profile` setzt `primaryBusinessActivity = description` und die optionalen Felder `businessActivities`, `productsServices`, `customerMarkets`, `majorSegments` auf `[]`. Diese absichtlich leeren Listen sind **kein Übersetzungsfehler** und wurden nicht vierfach je Profil gezählt. Für manuelle Top46-Texte wurde die vorhandene Feldstruktur ebenfalls gelesen. Die Live-Feldbelegung kann wegen des deaktivierten Index nicht geprüft werden. Metadaten, Quellen-URLs und englische Eigennamen sind keine englischen Restsätze.

## Die zehn beobachteten Fehlermuster

Sortiert nach Zahl betroffener Unternehmen in der Vereinigungsmenge; bei Gleichstand nach Muster-ID. Die zwei größten Gruppen sind Katalogabdeckung und redaktionelle Redundanz, keine falschen Übersetzungen. „Soll“ beschreibt einen Korrekturvorschlag für den Erzeuger, keine hier vorgenommene Datenänderung.

| Rang / Muster | Anzahl (Zufall / Top30; Überlappung einmal) | Ticker · Feld | Ist (wörtlicher Ausschnitt) | Soll / Begründung |
|---|---:|---|---|---|
| 1 · P1: Deutsche Fassung fehlt im Katalog | 12 (0 / 12) | BRK-B · `description` | kein deutscher Eintrag; EN: „is a holding company owning subsidiaries engaged in numerous diverse business activities.“ | Quellenprüfung und sachliche deutsche Fassung beschaffen; eine solche Holding-Floskel allein genügt nicht als fertiges Firmenprofil. Fehlende Fassung sichtbar als nicht verfügbar behandeln. |
| 2 · P2: Aufblähung ohne neue Information | 11 (11 / 0) | BOTJ · `description` | „Diese Darlehen gehören zum beschriebenen Bank- und Finanzierungsgeschäft der Gruppe.“ | Satz streichen. Der vorangehende Satz nennt bereits die besicherten Kredite. Für Mindestlängen keine inhaltsleeren Wiederholungen ergänzen. Niedrige Priorität, kein belegter Sachfehler. |
| 3 · P3: Geschäftskern bleibt unklar | 3 (3 / 0) | DPZ · `description` | „Domino’s bietet zubereitete Speisen über seine Geschäfte an.“ | Nach Prüfung des vollständigen Geschäftsberichts den Geschäftskern konkret nennen, etwa Pizzarestaurants/Liefergeschäft. Der gespeicherte EN-Auszug enthält nur „menu“/„delivery and carryout“; **Quellen-/Extraktionslücke**, keine nachgewiesene Fehlübersetzung. Ebenfalls AMT (Standortvermietung ohne Art der Infrastruktur) und CVNA (nur Finanzierung/Logistik statt klarer Erklärung des Handelsgeschäfts). Neue Tatsachen erst mit zusätzlichem Quellenbeleg aufnehmen. |
| 4 · P4: Wörtliche, unidiomatische Fachsprache / Grammatik | 3 (3 / 0) | CHPT · `description` | „Erweiterte Teile- und Arbeitsgarantien“ | „Erweiterte Garantien für Teile und Arbeitsleistungen“; EN: „extended parts and labor warranties“. |
| 5 · P5: Erwartung wird zum feststehenden Vorgang | 1 (1 / 0) | MGRX · `description` | „für die Ärzte patientenbezogene Verordnungen ausstellen“ | „für die das Unternehmen eine ärztliche Verordnung abhängig vom Bedarf und der Krankengeschichte erwartet“; EN sagt zweimal „anticipate doctors prescribing“. Tatsächliche Verordnung nicht aus einer Erwartung ableiten. |
| 6 · P6: Technischer Anschluss-Endpunkt verschoben | 1 (1 / 0) | AAOI · `description` | „Glasfaseranschlüsse bis ins Gebäude“ | „Glasfaseranschlüsse bis in die Wohnung bzw. ins Haus (FTTH)“; EN nennt ausdrücklich „fiber-to-the-home (FTTH)“. „Bis ins Gebäude“ kann FTTB meinen. |
| 7 · P7: Segmentname semantisch falsch aufgelöst | 1 (1 / 0) | RWT · `description` | „aktuelle und bestehende Investmentbestände“ | „die Segmente Redwood Investments und Legacy Investments“; EN benennt vier Segmente. „Legacy“ bedeutet hier Altbestand, nicht einfach „bestehend“; „aktuell“ ist keine Übersetzung des Namens Redwood. |
| 8 · P8: Zielmarkt unzulässig verengt | 1 (1 / 0) | SWIM · `description` | „eingelassene Schwimmbecken für private Wohnanlagen“ | „in den Boden eingelassene Schwimmbecken für private Wohnimmobilien“; EN: „in-ground residential swimming pools“. „Wohnanlagen“ verengt den Markt gegenüber allgemeiner Wohnnutzung. |
| 9 · P9: Prozessbegriff wird zur Zeitangabe | 1 (1 / 0) | RGEN · `description` | „sowohl frühe als auch nachgelagerte Prozessschritte“ | „Upstream- und Downstream-Prozesse bei der Herstellung biologischer Arzneimittel“, bei Bedarf erläutert als vorgelagerte Produktion und nachgelagerte Aufreinigung. EN: „upstream and downstream processes“. „Frühe“ kann als Entwicklungsphase statt Produktionsabschnitt gelesen werden. |
| 10 · P10: Redaktions-Metasatz im Verbrauchertext | 1 (1 / 0) | RARE · `description` | „Die Quelle unterscheidet bestehende Therapien von Kandidaten in der Entwicklung.“ | Satz streichen oder sachlich auf das Portfolio beziehen. Der Satz beschreibt die redaktionelle Quellenarbeit statt das Unternehmen; der vorherige Satz unterscheidet zugelassene Therapien und Kandidaten bereits. |

Weitere Beispiele zu P4: **AMPG**, `description`, Ist „rauscharme, mittlere Leistungs- und kryogene Verstärker“ → Soll „rauscharme Verstärker, Verstärker mittlerer Leistung und kryogene Verstärker“ (EN: „low noise amplifiers, medium power amplifiers, cryogenic amplifiers“). **CHEF**, Ist „weitere Hauptgerichtprodukte“ → Soll z. B. „weitere zentrale Komponenten von Hauptgerichten“ (EN: „center-of-the-plate products“). Hier geht es um verständliches Fachdeutsch, nicht einen belegten Produktwechsel.

Weitere P2-Fälle sind in Anhang A einzeln gekennzeichnet. Beispiele: **VGZ** „Das Unternehmen befindet sich in einer Entwicklungsphase und konzentriert sich auf diesen Rohstoffmarkt.“ wiederholt weitgehend den vorangehenden Satz über die Entwicklung von Goldbergbauprojekten; **PB** „Diese operative Tätigkeit bildet den Kern der Gruppe.“ wiederholt den unmittelbar genannten dominierenden Bankbetrieb; **QMCO** „Diese Daten werden mit einem umfassenden Angebot an Datenmanagementlösungen betreut.“ wiederholt die bereits genannte Datenverwaltung. Solche Sätze nicht durch vermeintlich präzisere, unbelegte Fakten ersetzen.

### Nicht festgestellte Fehler und wichtige Abgrenzungen

- **Englische Restsätze: 0/200; 0/18 vorhandene Top30-Texte.** Markennamen, „Master Limited Partnership“, REIT, Cloud, Mixed-Signal und Ähnliches sind nicht automatisch Fehler.
- **Leere deutsche Beschreibungen oder mechanisch zu kurze Texte: 0/200; 0/18.** Alle 214 vorhandenen Beschreibungen haben mindestens 146 Zeichen und 16 Wörter und liegen innerhalb der vorhandenen Erzeugergrenzen (40–900 Zeichen, 15–95 Wörter). P2/P3 betreffen Substanz, nicht einen unterschrittenen Zeichenwert.
- **Werbesprache/Renditeversprechen: 0/200; 0/18.** Im EN häufig vorhandene „leading“, „superior“, „unmatched“ oder Qualitätsurteile wurden in den deutschen Fassungen überwiegend entfernt. Neutrale Produktbeschreibungen und die Nennung von KI gelten nicht als Werbung.
- **Anlage-Wortwahl entgegen WORTWAHL.md: 0/200; 0/18.** Die Tätigkeit einer Investmentgesellschaft („investiert“, „Anlagestrategien“) ist eine Beschreibung Dritter. Sie ist keine Aufforderung, deren Aktien zu kaufen. „Garantien“ bei CHPT betrifft Produktleistungen, keine sichere Rendite. Die juristische Kontextregel darf nicht durch eine reine Wortsuche ersetzt werden.
- **Keine nachgewiesene falsche Zulassungsbehauptung in der Stichprobe.** RNXT unterscheidet FDA-Gerätefreigabe ausdrücklich von Arzneimittelzulassung; PHIO, ACET, NKTX und FATE nennen Kandidaten bzw. Entwicklungsziele. Aus „commercial-stage“ allein wurde kein zugelassenes Arzneimittel abgeleitet.

## Vorschlag für automatische Verhinderung beim Erzeuger

Kein neuer Übersetzungsweg zur Laufzeit. Die vorhandenen Quellen-, Identitäts-, Hash-, Sprach- und Widerrufsgates bleiben erhalten. Die heutige `approved_copy`-Prüfung sichert bereits u. a. Quellpins, Namen, Textlänge, einen deutschen Tätigkeitsausdruck, eine begrenzte Werbewortliste und bestimmte klinische Kandidatenformulierungen. Ein einzelnes deutsches Verb beweist aber keinen vollständig deutschen oder inhaltlich treuen Text.

1. **Vor der Formulierung Fakten strukturiert erfassen:** Tätigkeit, konkrete Produkte, Kundengruppe/Markt, Segmentnamen, Entwicklungs-/Zulassungsstand und Modalität; jedes Element mit Originalsatz und Quellhash. „anticipate“, „intend“, „designed to“ dürfen nur als Erwartung/Ziel wiedergegeben werden (P5). Fehlt der Geschäftskern im Auszug, größere passende Business-Passage extrahieren oder Review anfordern (P3/P1).
2. **Branchenglossar mit geschützten Unterscheidungen:** FTTH/FTTB, Upstream/Downstream, „residential“, „parts and labor warranties“, „center-of-the-plate“ und Verstärker-Leistungsklassen. Segmentnamen als Eigennamen erhalten; keine freie Bedeutungserfindung für Redwood/Legacy (P4/P6–P9).
3. **Nach der Formulierung jeden deutschen Tatsachensatz gegen die Faktenliste prüfen.** Nicht belegte Produkte, Geografien, tatsächliche Handlungen statt Erwartungen und verschobene Zielmärkte blockieren die Freigabe. Automatisierte Sprach-/Entailment-Prüfung nur als zusätzliche Prüfstufe mit Fundstelle und unabhängiger redaktioneller Entscheidung bei Unsicherheit; kein selbstvergebenes Qualitätszertifikat durch denselben Formulierer.
4. **Substanzprüfung statt Mindestlängen-Füllung:** semantische Dubletten, Sätze ohne neue belegte Tatsache und Metasätze wie „die Quelle“ markieren. Texte dürfen bei vollständig erklärtem Geschäftskern kurz bleiben; fehlende Substanz niemals mit generischen Sätzen kaschieren (P2/P10).
5. **Sprache und Wortwahl satzweise prüfen:** Sprachdetektor plus Eigennamen-/Fachwort-Ausnahmen; Regelbestand aus `assets/legal-notices.json.wording` statt unabhängiger, kleiner Regex-Liste verwenden. Kontext unterscheiden: Produktgarantie, technisches „sicher“ und Käufe/Investitionen des Unternehmens versus Versprechen oder Handlungsvorschläge an Leser. Verdachtsfälle mit Satzkontext in die Review-Warteschlange geben.
6. **Abdeckung getrennt überwachen:** zufällige sprachliche Stichprobe und datierte, emittentenbereinigte Marktwert-Top30-Liste. Fehlender sicherer Quelltext oder fehlendes Deutsch ist eine sichtbare Abdeckungslücke, keine Aufforderung zum ungeprüften Übersetzen. Sprachfehlerquote und Abdeckung nie in einem globalen „PASS“ verstecken (P1).
7. **Regressionen aus den konkreten Fällen bauen:** Erwartung→Tatsache (MGRX), FTTH→FTTB (AAOI), erfundener Segmentname (RWT), verengter Wohnmarkt (SWIM) müssen scheitern; neutrale Geschäftsbeschreibungen von Fonds/Banken und Produktgarantien müssen bestehen. Testausgaben nur in temporäre `--out`-Pfade. Erst der Erzeuger setzt spätere Datenkorrekturen um.

## Anhang A – 200 geprüfte US-Profile

`OK` = bei dieser Prüfung keine Beanstandung; keine Garantie vollständiger Fehlerfreiheit. Codes entsprechen der Tabelle oben. Je Zeile wurden alle sieben Prüfdimensionen geprüft, nicht nur die aufgeführte Beanstandung. Die CIK-Ziffern bilden zusammen mit dem bestehenden Präfix `iss_cik_` die Emittenten-ID. US-Staat stammt aus der am Prüftag abgerufenen SEC-Geschäftsadresse. Reihenfolge ist die endgültige Seed-Reihenfolge.

| Nr. | Ticker (weitere Listings in Klammern) | CIK | US-Staat | Ergebnis |
|---:|---|---|---|---|
| 1 | BFC | 0001746109 | WI | OK |
| 2 | KRG | 0001286043 | IN | OK |
| 3 | XRN | 0001533615 | MD | OK |
| 4 | ECL | 0000031462 | MN | OK |
| 5 | FND | 0001507079 | GA | OK |
| 6 | FFIV | 0001048695 | WA | OK |
| 7 | PRPO | 0001043961 | CT | OK |
| 8 | ICFI | 0001362004 | VA | OK |
| 9 | CNSP | 0001729427 | TX | P2 |
| 10 | NXST | 0001142417 | TX | OK |
| 11 | AIT | 0000109563 | OH | OK |
| 12 | MGRX | 0001938046 | TX | P5 |
| 13 | UCTT | 0001275014 | CA | OK |
| 14 | MSAI | 0001863990 | TX | OK |
| 15 | VTSI | 0001085243 | AZ | OK |
| 16 | NAVN | 0001639723 | CA | OK |
| 17 | DAIC | 0002033770 | NV | OK |
| 18 | SMG | 0000825542 | OH | OK |
| 19 | SOTK | 0000806172 | NY | OK |
| 20 | CBAN | 0000711669 | GA | OK |
| 21 | AMCI | 0001937891 | NY | OK |
| 22 | GXO | 0001852244 | CT | OK |
| 23 | NTRS (NTRSO) | 0000073124 | IL | OK |
| 24 | LFT | 0001547546 | NY | P2 |
| 25 | BOTJ | 0001275101 | VA | P2 |
| 26 | IESC | 0001048268 | TX | OK |
| 27 | MLYS | 0001933414 | PA | OK |
| 28 | CMC | 0000022444 | TX | OK |
| 29 | MAR | 0001048286 | MD | OK |
| 30 | CSW | 0001624794 | TX | OK |
| 31 | ORMP | 0001176309 | NY | OK |
| 32 | OLN | 0000074303 | MO | OK |
| 33 | ACRS | 0001557746 | PA | OK |
| 34 | HESM | 0001789832 | TX | OK |
| 35 | KVYO | 0001835830 | MA | OK |
| 36 | TDS | 0001051512 | IL | OK |
| 37 | AAOI | 0001158114 | TX | P6 |
| 38 | WEST | 0001806347 | AR | OK |
| 39 | RH | 0001528849 | CA | OK |
| 40 | TRC | 0000096869 | CA | OK |
| 41 | NWS (NWSA) | 0001564708 | NY | OK |
| 42 | DERM | 0001867066 | AZ | OK |
| 43 | CLPT | 0001285550 | CA | OK |
| 44 | SNX | 0001177394 | FL | OK |
| 45 | ZWS | 0001439288 | WI | OK |
| 46 | SM | 0000893538 | CO | OK |
| 47 | NEXT | 0001612720 | TX | OK |
| 48 | CINF | 0000020286 | OH | OK |
| 49 | MPLX | 0001552000 | OH | OK |
| 50 | CDXS | 0001200375 | CA | OK |
| 51 | CHPT | 0001777393 | CA | P4 |
| 52 | MYPS | 0001823878 | NV | OK |
| 53 | CVNA | 0001690820 | AZ | P3 |
| 54 | FCPT | 0001650132 | CA | OK |
| 55 | TTMI | 0001116942 | CA | OK |
| 56 | VSAT | 0000797721 | CA | OK |
| 57 | CASS | 0000708781 | MO | OK |
| 58 | CORT | 0001088856 | CA | OK |
| 59 | LIEN | 0001843162 | NY | OK |
| 60 | RILY (RILYL, RILYN, RILYP) | 0001464790 | CA | OK |
| 61 | KLC | 0001873529 | OR | OK |
| 62 | SBH | 0001368458 | TX | OK |
| 63 | SWIM | 0001833197 | NY | P8 |
| 64 | BLNE | 0001534708 | RI | OK |
| 65 | ANGX | 0001865200 | UT | OK |
| 66 | OWL | 0001823945 | NY | OK |
| 67 | HURA | 0001498382 | FL | OK |
| 68 | EE | 0001888447 | TX | OK |
| 69 | CFFI | 0000913341 | VA | P2 |
| 70 | CODX | 0001692415 | UT | OK |
| 71 | WDC | 0000106040 | CA | OK |
| 72 | CRK | 0000023194 | TX | OK |
| 73 | WSFS | 0000828944 | DE | OK |
| 74 | PUMP | 0001680247 | TX | OK |
| 75 | DPZ | 0001286681 | MI | P3 |
| 76 | BTBT | 0001710350 | NY | OK |
| 77 | NXDR | 0001846069 | CA | OK |
| 78 | IKT | 0001750149 | DE | P2 |
| 79 | ALMU | 0001828805 | CA | OK |
| 80 | UTI | 0001261654 | AZ | OK |
| 81 | ARHS | 0001875444 | OH | OK |
| 82 | NSPR | 0001433607 | FL | OK |
| 83 | AIFF | 0000803578 | NY | OK |
| 84 | TECH | 0000842023 | MN | OK |
| 85 | PHIO | 0001533040 | PA | OK |
| 86 | RSG | 0001060391 | AZ | OK |
| 87 | PCVX | 0001649094 | CA | OK |
| 88 | MTNB | 0001582554 | NJ | OK |
| 89 | TTWO | 0000946581 | NY | OK |
| 90 | BNED | 0001634117 | NJ | OK |
| 91 | AMPG (AMPGZ) | 0001518461 | NY | P4 |
| 92 | RWT | 0000930236 | CA | P7 |
| 93 | AVAH | 0001832332 | GA | OK |
| 94 | CASY | 0000726958 | IA | OK |
| 95 | PBFS | 0001769663 | NY | OK |
| 96 | SN | 0001957132 | MA | OK |
| 97 | BCC | 0001328581 | ID | OK |
| 98 | VMC | 0001396009 | AL | OK |
| 99 | PPC | 0000802481 | CO | OK |
| 100 | MIDD | 0000769520 | IL | OK |
| 101 | BCHT | 0000728385 | TX | OK |
| 102 | CRL | 0001100682 | MA | OK |
| 103 | ADI | 0000006281 | MA | OK |
| 104 | XOS | 0001819493 | CA | OK |
| 105 | RBC | 0001324948 | CT | OK |
| 106 | PRSU | 0000884219 | CO | P2 |
| 107 | IONQ | 0001824920 | MD | OK |
| 108 | MATV | 0001000623 | GA | OK |
| 109 | BBSI | 0000902791 | WA | OK |
| 110 | CSWC | 0000017313 | TX | OK |
| 111 | RCKY | 0000895456 | OH | OK |
| 112 | CPBI | 0001979332 | NE | OK |
| 113 | BZFD | 0001828972 | NY | OK |
| 114 | SLGN | 0000849869 | CT | OK |
| 115 | RPC | 0001841968 | TX | OK |
| 116 | RUN | 0001469367 | CA | OK |
| 117 | CLFD | 0000796505 | MN | OK |
| 118 | CR | 0001944013 | CT | OK |
| 119 | VISN | 0001517228 | TX | OK |
| 120 | ALGM | 0000866291 | NH | OK |
| 121 | TUSK | 0001679268 | OK | OK |
| 122 | PB | 0001068851 | TX | P2 |
| 123 | U | 0001810806 | CA | OK |
| 124 | MSFT | 0000789019 | WA | OK |
| 125 | SLVM | 0001856485 | TN | OK |
| 126 | RARE | 0001515673 | CA | P10 |
| 127 | A | 0001090872 | CA | OK |
| 128 | CSCO | 0000858877 | CA | OK |
| 129 | ZBH | 0001136869 | IN | OK |
| 130 | SNGX | 0000812796 | NJ | OK |
| 131 | META | 0001326801 | CA | OK |
| 132 | BLND | 0001855747 | CA | OK |
| 133 | HRL | 0000048465 | MN | OK |
| 134 | UFCS | 0000101199 | IA | OK |
| 135 | CWT | 0001035201 | CA | OK |
| 136 | RFIL | 0000740664 | CA | OK |
| 137 | PXLW | 0001040161 | OR | OK |
| 138 | BMRA | 0000073290 | CA | OK |
| 139 | ACNT | 0000095953 | IL | OK |
| 140 | SNFCA | 0000318673 | UT | OK |
| 141 | JBHT | 0000728535 | AR | OK |
| 142 | NKTX | 0001787400 | CA | P2 |
| 143 | BNKK | 0001760903 | FL | OK |
| 144 | TOPP | 0001960847 | PA | OK |
| 145 | AZZ | 0000008947 | TX | OK |
| 146 | VEEA | 0001840317 | NY | OK |
| 147 | OSUR | 0001116463 | PA | OK |
| 148 | EVER | 0001640428 | MA | OK |
| 149 | PEP | 0000077476 | NY | OK |
| 150 | HNVR | 0001828588 | NY | OK |
| 151 | AAPL | 0000320193 | CA | OK |
| 152 | DXCM | 0001093557 | CA | OK |
| 153 | PHR | 0001412408 | DE | OK |
| 154 | CHD | 0000313927 | NJ | OK |
| 155 | SHOO | 0000913241 | NY | OK |
| 156 | ITGR | 0001114483 | TX | OK |
| 157 | DIOD | 0000029002 | TX | P2 |
| 158 | RNXT | 0001574094 | CA | OK |
| 159 | ATLC (ATLCP) | 0001464343 | GA | OK |
| 160 | ACET | 0001720580 | MA | OK |
| 161 | CHEF | 0001517175 | CT | P4 |
| 162 | QTRX | 0001503274 | MA | OK |
| 163 | AA | 0001675149 | PA | OK |
| 164 | ASTI | 0001350102 | CO | OK |
| 165 | AREN (PAAI) | 0000894871 | NY | OK |
| 166 | WHG | 0001165002 | TX | OK |
| 167 | ATI | 0001018963 | TX | OK |
| 168 | AVT | 0000008858 | AZ | OK |
| 169 | HCAT | 0001636422 | UT | OK |
| 170 | ORN | 0001402829 | TX | OK |
| 171 | ELOX | 0001035354 | MA | OK |
| 172 | CCK | 0001219601 | FL | OK |
| 173 | EIG | 0001379041 | NV | OK |
| 174 | SVCO | 0001943289 | CA | OK |
| 175 | AMT | 0001053507 | MA | P3 |
| 176 | BRBS | 0000842717 | VA | OK |
| 177 | RGEN | 0000730272 | MA | P9 |
| 178 | PACB | 0001299130 | CA | OK |
| 179 | LEGH | 0001436208 | TX | OK |
| 180 | IRON | 0001816736 | MA | OK |
| 181 | TGEN | 0001537435 | MA | OK |
| 182 | PETS | 0001040130 | FL | OK |
| 183 | ULH | 0001308208 | MI | OK |
| 184 | RPD | 0001560327 | MA | OK |
| 185 | MATX | 0000003453 | HI | OK |
| 186 | CPF | 0000701347 | HI | OK |
| 187 | AIR | 0000001750 | IL | OK |
| 188 | QMCO | 0000709283 | CO | P2 |
| 189 | BKTI | 0000002186 | FL | OK |
| 190 | DGII | 0000854775 | MN | OK |
| 191 | TMCI | 0001630627 | FL | OK |
| 192 | SPRY | 0001671858 | CA | OK |
| 193 | FTHM | 0001753162 | NC | OK |
| 194 | CIEN | 0000936395 | MD | OK |
| 195 | BBT | 0001108134 | MA | OK |
| 196 | INLX | 0001081745 | OH | OK |
| 197 | VGZ | 0000783324 | CO | P2 |
| 198 | RELL | 0000355948 | IL | OK |
| 199 | FATE | 0001434316 | CA | OK |
| 200 | LUNR | 0001844452 | TX | OK |

Aus der Seed-Reihenfolge bis zum 200. US-Treffer ausgeschlossen:

| Ticker | CIK | SEC-Geschäftssitz / Grund |
|---|---|---|
| GURE | 0000885462 | China (F4) |
| PRGO | 0001585364 | Ireland (L2) |
| HIVE | 0001720424 | British Columbia, Canada (A1) |
| MREO | 0001719714 | keine Geschäftsadresse im abgerufenen Datensatz (kein Code) |
| STE | 0001757898 | Ireland (L2) |
| DBVT | 0001613780 | keine Geschäftsadresse im abgerufenen Datensatz (kein Code) |
| AMRX | 0001723128 | keine Geschäftsadresse im abgerufenen Datensatz (kein Code) |
| LIN | 0001707925 | United Kingdom (X0) |
| OSW | 0001758488 | Bahamas (C5) |
| ALLE | 0001579241 | keine Geschäftsadresse im abgerufenen Datensatz (kein Code) |

## Anhang B – Top 30 nach Marktwert

Quelle: [CompaniesMarketCap, US-Rangliste](https://companiesmarketcap.com/usa/largest-companies-in-the-usa-by-market-cap/), abgerufen 09.11.2026 09:38 UTC. Dies sind die beim Abruf ausgewiesenen Marktwerte, keine selbst berechneten Werte und kein Ranking aus dem teilweise lückenhaften internen Marktwertfeld. Die Quelle liefert keinen einheitlichen Bewertungszeitpunkt aller Zeilen; deshalb wird keine exakte gemeinsame Börsenschlussbewertung behauptet. Die Liste ist hier vollständig eingefroren, einschließlich SPCX. Bei GOOG/GOOGL und BRK-A/BRK-B wird der Emittent nur einmal geprüft. Fehlende deutsche Katalogtexte werden auch bei den größten Unternehmen nicht still durch kleinere Firmen ersetzt.

| Rang | Ticker | CIK laut vorhandenem Master | Marktwert, Mrd. USD | Textprüfung / Katalogabdeckung |
|---:|---|---|---:|---|
| 1 | AAPL | 0000320193 | 4,975.00 | OK (auch Zufallsgruppe) |
| 2 | NVDA | 0001045810 | 4,506.00 | OK |
| 3 | MSFT | 0000789019 | 3,940.00 | OK (auch Zufallsgruppe) |
| 4 | GOOG | 0001652044 | 3,490.00 | OK |
| 5 | AMZN | 0001018724 | 2,803.00 | OK |
| 6 | SPCX | 0001181412 | 1,823.00 | P1: kein deutscher Katalogtext |
| 7 | META | 0001326801 | 1,560.00 | OK (auch Zufallsgruppe) |
| 8 | TSLA | 0001318605 | 1,415.00 | OK |
| 9 | AVGO | 0001730168 | 1,401.00 | OK |
| 10 | BRK-B | 0001067983 | 1,222.00 | P1: kein deutscher Katalogtext |
| 11 | LLY | 0000059478 | 1,206.00 | P1: kein deutscher Katalogtext |
| 12 | WMT | 0000104169 | 995.84 | P1: kein deutscher Katalogtext |
| 13 | JPM | 0000019617 | 888.27 | OK |
| 14 | V | 0001403161 | 788.58 | P1: kein deutscher Katalogtext |
| 15 | MU | 0000723125 | 780.68 | OK |
| 16 | AMD | 0000002488 | 736.46 | OK |
| 17 | XOM | 0002115436 | 676.62 | P1: kein deutscher Katalogtext |
| 18 | JNJ | 0000200406 | 664.94 | P1: kein deutscher Katalogtext |
| 19 | MA | 0001141391 | 568.61 | OK |
| 20 | ABBV | 0001551152 | 514.92 | OK |
| 21 | COST | 0000909832 | 466.86 | P1: kein deutscher Katalogtext |
| 22 | CVX | 0000093410 | 414.85 | P1: kein deutscher Katalogtext |
| 23 | KO | 0000021344 | 411.56 | P1: kein deutscher Katalogtext |
| 24 | PLTR | 0001321655 | 386.43 | OK |
| 25 | PG | 0000080424 | 383.36 | P1: kein deutscher Katalogtext |
| 26 | CSCO | 0000858877 | 370.01 | OK (auch Zufallsgruppe) |
| 27 | ORCL | 0001341439 | 361.96 | OK |
| 28 | MRK | 0000310158 | 361.72 | OK |
| 29 | UNH | 0000731766 | 353.16 | P1: kein deutscher Katalogtext |
| 30 | HD | 0000354950 | 342.67 | OK |

P1 umfasst SPCX, BRK-B, LLY, WMT, V, XOM, JNJ, COST, CVX, KO, PG und UNH. Bei SPCX, XOM, COST, CVX und UNH fehlt unter der aktuellen Master-CIK auch der englische Katalogauszug; es wurde kein anderes Unternehmen oder historischer CIK still als Ersatz verwendet. Die Quelle-/Identitätszuordnung muss der Erzeuger vor einem neuen Text klären. Für die übrigen sieben gibt es zwar englische Auszüge, aber keine deutsche Fassung in den drei Textkatalogen. Dieser Bericht schließt daraus keine aktive Consumer-Leerkarte.

## Anhang C – Integrität und Verifikation

SHA-256 der gelesenen Quellen am Basis-Commit:

| Datei | SHA-256 |
|---|---|
| `company-intelligence/config/profile-reviewed-de.json` | `b2f3a46f56fde4a7afd1024a506ae777e1abec5f807fbf904f3a46517dcc58c9` |
| `company-intelligence/config/profile-editorial-de.json` | `8ca86fa259ff59992778005039c1702c68d75b33cb9272c2c5349634a016f58e` |
| `company-intelligence/config/top46-content-review.json` | `eaf1af81cd0ffd8425db4ba68fc3f9031c3ccb2bbef77dc1238c3131d72d6010` |
| `company-intelligence/config/company-profiles.json` | `c8d4e210a1871a32a9396778cc68fed462db0bd3f2d6f50eeb046cdb0fd72b2c` |
| `quant/data/market/security-master/company-names.json` | `73dd97aae3ab8f081414a5c157a3279f2b19a686e9959a4407285704881a7af6` |

Auswahl-Rezept (Python-Standardbibliothek; `read` lädt JSON am oben genannten Commit, `sec_business_code` liest das genannte SEC-Feld bzw. die in Anhang A eingefrorenen Beobachtungen):

```python
seed = "vision-universe-profile-de-pruefung-20261109-v1"
texts = {**reviewed_de["profiles"], **editorial_de["profiles"],
         **{r["companyId"]: r["profile"] for r in top46["profiles"]}}
ticker_map = {}
for r in company_names["rows"]:
    if r.get("cik") and r.get("inProductUniverse"):
        ticker_map.setdefault("iss_cik_" + r["cik"].zfill(10), []).append(r["ticker"])
pool = [cid for cid in texts if cid in ticker_map and
        any(s.get("form") == "10-K"
            for s in english["profiles"].get(cid, {}).get("sources", []))]
order = sorted(pool, key=lambda cid: sha256((seed + ":" + cid).encode()).hexdigest())
us_states = set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI "
                "MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT "
                "VT VA WA WV WI WY".split())
sample = []
for cid in order:
    if sec_business_code(cid) in us_states:
        sample.append(cid)
    if len(sample) == 200:
        break
```

Die Auswertung hat Anzahl, eindeutige CIKs, vier Überschneidungen, sämtliche Quelltext-Pins der Zufallsgruppe, Mindestlängen und die Summen der Befundcodes maschinell gegengeprüft. Arbeitsdateien und Downloads liegen außerhalb des Repositories. Der PR enthält ausschließlich diesen Bericht; unter `company-intelligence/` und in sämtlichen Datenpfaden wurde nichts geändert.

**Ablage:** Der Bericht liegt als Beleg im Archiv (`docs/archiv/reports/`), damit der Doku-Vertrag DOC-3 (höchstens 25 lebende Seiten) erfüllt bleibt.
