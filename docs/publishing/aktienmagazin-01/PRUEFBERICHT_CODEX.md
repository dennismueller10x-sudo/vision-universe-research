# Unabhängige Prüfung · Aktienmagazin Nr. 01

Prüfdatum: 08.11.2026. Ausgangspunkt: `main`, Commit `2d1d18348811b2c5a00c8826b40827632735d424`.
Seitenzahlen meinen die **Position im PDF**, nicht das Dateipräfix: `13a-app.html` ist S. 14, `20-chart.html` S. 21, `28-impressum.html` S. 29.

## 1. Kurzurteil

Das Heft hat eine erkennbare visuelle Identität und mit Marktbreite, Kennzahlenvergleich und Screening einen eigenen Nutzen gegenüber einer reinen Nachrichtensammlung.
Als veröffentlichungsreife Vorlage besteht es die Prüfung noch nicht, weil mehrere redaktionelle Aussagen den eigenen Daten widersprechen und Quellen sowie Datenstichtage nicht präzise genug nachvollziehbar sind.
Der Datenbau ist auf dem geprüften Repository-Stand bis auf `generatedAt` exakt reproduzierbar, was jedoch weder die vorgelagerten Modelle noch sämtliche extern recherchierten Angaben unabhängig bestätigt.
Alle 30 Seiten wurden gerendert und visuell geprüft; die größten Satzprobleme sind kleine Schrift, viel ungenutzter Raum und eine für unveränderte Handyansicht ungeeignete A4-Mehrspaltigkeit, nicht abgeschnittene Texte.
Für wenige Stunden Wochenproduktion braucht es zuerst eingefrorene Ausgabedaten, getrennte Inhalte und Vorlagen sowie verbindliche Fakten-, Quellen- und Renderprüfungen, danach eine Kürzung der wiederholten Titel- und Werbeinhalte.

### Prüfverfahren und Grenzen

Gelesen: `AGENTS.md`, `CLAUDE.md`, aktueller Neustartplan, beide Publishing-READMEs, `HANDBUCH.md`, `RECHERCHE.md`, `WORTWAHL.md`, `EINORDNUNG.md`, `assets/legal-notices.json`; sämtliche 30 Seitendateien, `build-data.mjs`, `data.js`, `lib.js`, `charts.js`, `mag.css`, Renderer und Vorschau. Keine Modelle oder Datenartefakte geändert, keine Bildbestellung, keine bezahlten API-Aufrufe.

- `build-data.mjs --out /tmp/rebuilt-data.js` gegen den vollständigen Checkout ausgeführt: **5698 Aktien, 21 Karten, 19 Screeningtreffer, ein ETF (SPY)**. Struktureller Vergleich mit `data.js`, nach Entfernen ausschließlich von `generatedAt`: **identisch**, einschließlich aller Kursreihen, Kennzahlen, Quick-Check-Zeilen, Eigentümer-, Technik- und Regimefelder. Das prüft die Übernahme aus `discover/data/stocks/US_REAL`, `quant/data/market/discover-series`, `discover-series-long`, `technical/data/stock`, `quant/data/product/*` und dem gelesenen Supertrader-Artefakt. Die Rechnung selbst ist damit nicht unabhängig zertifiziert.
- Harte 13F-Handangaben auf S. 09/12/20 zusätzlich gegen `hedgefonds/data/funds/{berkshire,bridgewater,appaloosa,ark,situational-awareness,citadel}.json` geprüft. Beispiele: Appaloosa MU −41,441 %, ARK AMD −47,788 %, Situational Awareness MU 27,536 %, Sandisk 28,029 %, Bridgewater NVDA −17,618 %, AVGO −28,193 % stimmen gerundet. Berkshire Alphabet ist eine Klassenfrage, siehe Tabelle.
- Fremdfakten seitenweise mit `RECHERCHE.md` abgeglichen; zugängliche Primärquellen zusätzlich geprüft (Verzeichnis unten). Nicht vollständig belegte Angaben sind **offen**, nicht automatisch falsch. Ein Faktenblatt mit Mediennamen und Datum ersetzt keinen prüfbaren Artikelbeleg. Insbesondere sämtliche Zitate, Termine und Tagesreaktionen sind damit nicht lückenlos primär bestätigt.
- Original-PDF: 30 A4-Seiten, ca. 12,07 MB, ungetaggt. Neurender vor Korrekturen: 30 A4-Seiten, ca. 12,11 MB. Alle PNGs visuell in Übersichts- und vergrößerten Seitenstreifen geprüft; DOM zusätzlich auf außerhalb der Seite liegende Text-Endelemente und defekte `img` geprüft: keine Treffer. Kein physisches Handy und kein Druckproof; Handyurteil aus Schriftgrößen und verkleinerter Seitenansicht.
- Der angegebene Renderbefehl scheiterte zunächst am fehlenden Playwright-Browserpfad, danach an der lokalen Chromium-Richtlinie für `file://`. Render deshalb mit vorhandenem Chromium und einer temporären, nicht eingecheckten HTTP-Variante des Renderers über `127.0.0.1:8765`; Layout-/PDF-Code sonst unverändert. Der Konsolen-404 betrifft laut HTTP-Serverprotokoll ausschließlich `/favicon.ico`, kein Heftbild. Original-Überlaufcheck meldet nur die bekannte randabfallende Inhaltsspalte auf S. 02. Er entdeckt keine beliebigen Überlappungen und beendet sich auch bei Befunden nicht mit Fehlerstatus.
- **Keine pauschale Freigabe „jede Zahl stimmt“**: Tabellenwerte sind quellartefaktgetreu; bei externen Fakten, Ursache-Wirkungs-Aussagen und Datenfrische bleiben unten benannte Prüfaufträge. Auch ein grüner Code-Testlauf ersetzt diese nicht.

## 2. Inhaltliche Fehler und offene Faktenbefunde

Schwere: **hoch** = Kernaussage irreführend / vor Veröffentlichung klären; **mittel** = relevante Präzision oder Nachvollziehbarkeit fehlt; **niedrig** = begrenzter Detailfehler. „Offen“ bezeichnet eine Beleglücke, keinen bewiesenen Sachfehler. Nur ausdrücklich als korrigiert markierte Stellen wurden verändert.

| Seite | Stelle | Ist | Soll / Befund | Quelle | Schwere |
|---|---|---|---|---|---|
| 01, 02, 05, 08–12 | Titelanriss und Aktienzählung | Sechs Aktien; S. 10 zählt Vertiv und Lumentum als 3/4, S. 11 Oracle **und** CoreWeave als 5, AMD als 6 | Tatsächlich sieben behandelte Aktien (NVDA, MU, VRT, LITE, ORCL, CRWV, AMD), zusätzlich MRVL. Entweder sieben nennen oder „sechs Analyseschwerpunkte“ konsistent definieren; Opener enthält LITE nicht | Seitentexte, `cards` | mittel |
| 01 | Vier Kurspillen | Zeitraum fehlt | „Woche 30.10.–06.11.“ ergänzen; −8,8/−22/−21/+71 stimmen gerundet mit Wochenwerten | `data.js/cards` | mittel |
| 02, 04 | Mehr als die Hälfte der S&P-Aktien im Plus | Unbeschränkte Indexaussage | 259/495 = 52,3 % **der auswertbaren Titel**. Abdeckung und fehlende Indexmitglieder angeben; Preisbewegung ist keine Gesamtrendite | `sp500.up/count`, Builder filtert auf beide Schlusskurse | mittel |
| 03, 04 | SOX −12,3 % | Uneingeschränkte Zahl | Faktenblatt nennt auch rund −9 %. Definition/Originalquelle auflösen oder Quellenabweichung kenntlich machen; −12,3 % nicht unabhängig primär bestätigt | `RECHERCHE.md`, Markt/SOX | hoch |
| 02, 04 | S&P verlor 3 Bio. $ | Indexumfang als gesichert dargestellt | Faktenblatt nennt Yahoo rund 3 Bio., NBC 2,8 Bio.; prüfen, ob S&P oder gesamter US-Markt gemeint, Berechnungsbasis nennen. „Rund“/Spanne und Datum | `RECHERCHE.md`, Markt/Börsenwert | hoch |
| 03, 11 | Oracle Montag, 20 Mrd. $ | Ankündigungsdatum nur indirekt abgesichert | Faktenblatt nennt Artikel vom 03.11. (Dienstag), nicht das Ereignisdatum. Montag 02.11. durch Oracle-Originalmeldung bestätigen | `RECHERCHE.md` Oracle; TechStartups 03.11. | mittel |
| 04, 09 | Micron größtes Minus eines großen KI-Werts | Unbestimmte Vergleichsgruppe | Im eigenen Titelthema LITE −35,94 %, MRVL −28,11 % gegenüber MU −22,01 %. „Unter den sechs Werten des Openers“ oder exakte Größen-/Branchenabgrenzung; kein unbeschränkter Superlativ | `cards`, S. 07/10 | mittel |
| 06 | Politische Kausalität | Lokale Entscheidungen erscheinen als unmittelbare bundesweite Bremse | Rechtliche Zuständigkeit, Januar-Amtsantritt und vorläufige Investitionswirkung trennen; Preisreaktion und gesicherte Bauabsagen sind verschiedene Aussagen | Seitentext; `RECHERCHE.md` | mittel |
| 06 | Trump-Freitag-Unterstützung | Nicht im Faktenblatt belegt | Konkrete Primäräußerung mit Datum/URL hinzufügen oder weglassen | Fehlender Eintrag in `RECHERCHE.md` | mittel |
| 07 | „jeweils fast 1.000“ neue Fonds | Intel 1.074 | „Rund 1.000“ statt „fast“; 13F-Melder nicht mit Hedgefonds gleichsetzen, es sind auch andere Institutionen | `ownership.mostNew` = 1074/981/928 | niedrig |
| 08, 21 | Nvidia niedrigstes KGV großer KI-Aktien | 23,6, als niedrigstes bezeichnet | MU 9,29 und ORCL 18,2 sind niedriger; NVDA nur niedriger als AMD/Broadcom in diesem Vergleich. Kernaussage eingrenzen | `cards.*.pe`, Grafik S. 07 | hoch |
| 08 | Terminbox | „Zahlen … 23 Uhr MEZ“ | **Korrigiert:** Ergebnisse ca. 22:20 Uhr MEZ, Telefonkonferenz 23 Uhr. IR nennt 13:20 bzw. 14:00 PT am 17.11. | [Nvidia IR, 28.10.](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Sets-Conference-Call-for-Third-Quarter-Financial-Results/default.aspx) | niedrig |
| 09 | Historischer Kurs | Vor einem Jahr unter 200 $ | **Korrigiert:** am 06.11.2025 238,33 $. 52-Wochen-Tief 192,59 $ belegt nicht den Kurs genau ein Jahr zuvor | `quant/data/market/discover-series/ref_MU.json`, Punkt 2025-11-06 | mittel |
| 10 | Lumentum-Text vs. Wochenkasten | „in fünf Tagen fast 45 %“, Kasten −35,9 % in der Woche | Eigenes Wochenfenster 30.10.–06.11. ergibt −35,9355 %. Fremdes Fünftagesfenster exakt belegen oder Wochenzahl verwenden; aktuell Widerspruch ohne Erklärung | `cards.LITE.week`, `RECHERCHE.md` Trefis −44,6 % | hoch |
| 10 | Vertiv-Mittwoch | „als in Texas … abgestimmt wurde“ | Abstimmungsdatum gegen Wahltag 03.11. und Auszählung am 04.11. prüfen; Ergebnisreaktion nicht als Abstimmung am Mittwoch ausgeben | S. 10, Wochenchronik | mittel |
| 11 | CoreWeave Monatsrückgang | −49,9 % ausdrücklich 06.10.–06.11. | Repository-Schlüsse 91,72 → 46,40 ergeben **−49,41 %**. Fremdzahl/anderen Schlusszeitpunkt kennzeichnen oder −49,4 % verwenden; Monatsmetrik `r1m` −43,12 % hat wiederum anderes Fenster | `discover-series/ref_CRWV.json`, `cards.CRWV.r1m`, Recherche | mittel |
| 11 | Oracle-Schulden | 125–167 Mrd. $ „je nach Rechnung“ | Unterschied erklären: Bruttoschulden, Leasing, Netto-/sonstige Verpflichtungen, Bilanzdatum. Keine unvergleichbaren Größen als statistische Spanne | `RECHERCHE.md` ohne Definition | mittel |
| 12 | „schwankt etwa dreimal so stark“ | Beta und Volatilität sprachlich vermischt | Beta 3,3768 als historische Marktsensitivität mit Schätzfenster benennen. Es ist kein direktes Verhältnis der Schwankungsbreiten | `cards.AMD.beta/vol`, `rawValues.beta252d` | mittel |
| 12, 15, 17, 18, 28 | Quartalsaktualität der Datenkästen | „letzte vier Quartale“ ohne Ende; neue Quartale im Artikel | AMD/APP/ABNB/FISV/AXON/FIS/DKNG vielfach noch TTM bis Q2, Artikel Q3. Je Aktie `ttmThrough` ausgeben, sonst wirkt KGV auf Basis der gerade gemeldeten Zahlen berechnet. Keine Quelldaten manuell erneuern | `cards.*.ttmThrough`, Quellartefakte | hoch |
| 13 | Dalio-Anleihenzahl | 220 Mrd. $ als „seine Zählung“ | Faktenblatt ordnet Zahl TheStreet 04.11. zu, Dalio-Zitat Konferenz 07.10.; Autorenschaft der Rechnung separat belegen | `RECHERCHE.md`, Hedgefonds/Dalio | mittel |
| 15 | Rückkäufe 1,4 Mrd. $ | Ausschließlich Käufe eigener Aktien suggeriert | IR-Summe umfasst auch Einbehalte bei Aktienvergütungen und Steuerzahlungen; als kombinierte Größe kennzeichnen oder reinen Rückkaufbetrag aus Tabelle nutzen | [AppLovin IR, Fußnote 1](https://investors.applovin.com/news/news-details/2026/AppLovin-Announces-Third-Quarter-2026-Financial-Results/default.aspx) | mittel |
| 16 | Unterzeile | Erstmalig mehr Geschäft mit Firmen als Staat, ohne Region | Nur **US**-Unternehmensumsatz über **US**-Regierung; Artikeltext korrekt, Unterzeile global missverständlich | [Palantir 8-K, Q3](https://www.sec.gov/Archives/edgar/data/1321655/000132165526000045/a2026q3ex991pressrelease.htm) | mittel |
| 16 | Vertragswert +49/+6, +153/+11 | Wachstumsbasis fehlt | Vorjahreswachstum des jeweiligen Quartals nennen, nicht Veränderung Q3 gegen Q2 suggerieren; TCV ist nicht garantierter künftiger Umsatz | Palantir 8-K: Q3 TCV +6 % Y/Y, US +11 % Y/Y; Recherche für Q2 | mittel |
| 17 | Mosaic „Das ist der Tiefpunkt“ | Anführungszeichen, obwohl Zukunftsquartal gemeint | Primärwortlaut belegen; Prognose zum Q4 von Bericht über Q3-Verlust trennen. Kein bestätigtes wörtliches Zitat im Faktenblatt | `RECHERCHE.md` Mosaic | mittel |
| 18 | Unterzeile | Alle vier hätten ein Viertel verloren und solide Quartale | Wochenwerte AXON −26,83 %, FIS −25,47 %, DKNG **−11,48 %**, TEAM **−19,84 %**. „Deutliche Rückgänge“ plus genaue Zeiträume; DraftKings berichtete einen Verlust, „solide“ begründen | `cards`, DraftKings IR | hoch |
| 18 | DraftKings | 175–275 Mio. „Gewinn“, 875–925 Mio. „operativer Gewinn“ | Jeweils **bereinigtes EBITDA** / entsprechendes Kerngeschäftsmaß nennen; kein GAAP-Gewinn/EBIT | [DraftKings IR, 05.11.](https://ir.aboutdraftkings.com/news/news-details/2026/DraftKings-Reports-Third-Quarter-Revenue-Growth-of-16/default.aspx), Recherche | hoch |
| 19 | Versprechen nächste Ausgabe | Q3-13F-Auswertung „in der nächsten Ausgabe“ | Nächste Montagsausgabe 16.11. mit Redaktionsschluss 15.11. liegt **vor** Fristende 16.11. Nur bis Schluss eingegangene Meldungen oder Gesamtauswertung am 23.11. versprechen | Frist in Recherche, Wochenrhythmus Handbuch | mittel |
| 19 | Fonds-Monatsliste | Dymon −1,8 %, ExodusPoint −2,4 % | Nicht im Faktenblatt. Exakte Fonds-/Anteilsklasse und Fundstelle nachtragen; auch behaupteter schlechtester Monat seit Jahren ist nicht für alle belegt | `18-hedgefonds.html`, Recherche | mittel |
| 20 | Berkshire Alphabet +45 % | Unternehmen ohne Aktienklasse | +45,238 % betrifft **GOOGL Klasse A**; Klasse C/GOOG +658,349 %. Klasse angeben oder beide Stückzahländerungen sauber aggregieren | `hedgefonds/data/funds/berkshire.json`, holdings | mittel |
| 20 | Q2-Überschrift | Pershing-Zeile 30.09. darunter | Eigenen Q3-Brief-Block bilden; Gewichte sind nicht aus derselben Q2-13F-Grundlage | S. 20; Recherche/Pershing | mittel |
| 20, 27 | „alle 119 Fonds“ | Als gesamter App-Umfang behauptet | Aktuelle Grundgesamtheit prüfen: `hedgefonds.json` nennt 920 Einträge / 788 Hedgefonds, nicht 119. Nur definierte kuratierte Teilmenge mit Zahl beschreiben | `hedgefonds/data/hedgefonds.json`: universeCount/hedgefondsCount | mittel |
| 20 | Huang verkauft 2026 nicht | Aus aggregierten Daten nicht personenbezogen beweisbar | Original-Form-4-Abfrage nach Person, Transaktionscode und Zeitraum dokumentieren. Kein Widerspruch zu anderen NVDA-Insidern, aber offene Beleglücke | `ownership.insider.NVDA` enthält nur aggregierte 90/180 Tage | mittel |
| 21 | Relative Stärke | Technik 43/100, S. 08 und Quick-Check 34. Perzentil | Beide sind quellgetreu (42,6 vs. 34,02841), aber verschiedene Methoden. Unterschied und jeweilige Basis erklären | `cards.NVDA.tech.rs` vs. `.rs` | mittel |
| 22 | Tabelle | 19 Treffer, 12 Zeilen, keine Auswahlkennzeichnung | „12 von 19, absteigend nach RS“ plus alle Treffer digital zugänglich; alternativ zweite Tabelle. Vier Goldtitel im Kommentar stimmen für Gesamtmenge, sichtbar ist nur RGLD | `screen.rows`, `.slice(0,12)` | mittel |
| 22 | Schlussfolgerung | Treffer bewiesen Umschichtung statt Flucht aus Aktien | Sechsfach gefilterte Gewinnerauswahl beweist keine Kapitalströme. Nur gefundene Kurs-/Branchenmuster beschreiben | Screeningregel / Selektionsmechanik | hoch |
| 23 | Sektorenbild | „Sektoren der Woche“ wie flächiger Marktvergleich | Nur **94 von 495** S&P-Titeln in acht gezeigten Gruppen; drei Sektoren fehlen, pro Gruppe 8–18 Titel. Abdeckung prominent nennen, Gesamtsektorschluss vermeiden | Summe `sp500.sectors[*].n`, Builder Mindestzahl 8 | hoch |
| 24 | FedWatch 68–77 % | Spanne ohne Erhebungszeit oder Ereignisdefinition | Zeitpunkt/Zeitzone und Wahrscheinlichkeit genau einer Erhöhung vs. mindestens einer Erhöhung; Fremdquellen datieren, nicht nur „nach Arbeitsmarktbericht“ | Recherche markiert unsicher | mittel |
| 25 | DAX-Freitag | 25.820 gegen zweite Quelle 25.778 | Abweichung ist schon sichtbar, positiv. Cash-/Indikationskurs, Börse und Uhrzeit klären; Wochenurteil braucht außerdem Schluss vom 30.10., nicht Montag | Recherche, DAX-Kasten | mittel |
| 26 | US-Haushalt | 11.12. als feststehend | Im Faktenblatt ausdrücklich „Datum bestätigen“. Bis Gesetz/amtlicher Beschluss belegt ist, als offen behandeln und nicht veröffentlichen | `RECHERCHE.md` letzter Punkt | hoch |
| 26 | Terminvollständigkeit | Viele Unternehmen und Makrotermine aus Sammelvorschau | Je kritischem Termin IR-/Behördenlink und Datum aufnehmen; CPI und EU-Treffen primär bestätigt, restliche komplette Tagesliste nicht einzeln bestätigt | Recherche/Primärquellenliste unten | mittel |
| 27 | Datenherkunft | „Jede Zahl … stammt aus Vision Universe“ | Auf automatisch berechnete VU-Kennzahlen begrenzen; Nachrichten- und Makrowerte kommen erkennbar von anderen Quellen | Quellenverzeichnis S. 29 | hoch |
| 28 | Überschrift | 22 Aktien, tatsächlich 21 (BRK.B fällt aus) | **Korrigiert auf 21**; künftig Länge dynamisch. BRK.B-Identität separat lösen, keinen fehlenden Wert erfinden | `quick.length = 21`, Builder QC/Filter | mittel |

### Weitere belegte und offene Seiteninhalte

Die wesentlichen Quartalszahlen zu AMD (S. 12: Umsatz, Segmententwicklung, Cashflow und Ausblick), AppLovin (S. 15), Palantir (S. 16), Airbnb/Fiserv (S. 17) und Axon/DraftKings (S. 18) sind in den unten genannten Primärquellen auffindbar. Die Übernahmeparameter Marvell/Lumentum (S. 03/04/10), der Nvidia-Termin (S. 08/13/21/26), der US-CPI-Termin sowie der EU-Termin sind ebenfalls primär belegt. Das bestätigt nicht automatisch sämtliche Analystenerwartungen, Tageskurse und Zitate auf denselben Seiten.

Offen bleiben insbesondere: S. 03/06 Wahl-/Umfrage- und Abstimmungsdetails samt politischem Originalwortlaut; S. 08 Megaspeed-Brief, Forbes-Vermögenszahl und Jahresanfangsvergleich; S. 09 Citigroup-Angebots-/Nachfrageprognose und Rajkumar-Zitat; S. 10 Ende der Auftragsveröffentlichung, Forward-KGV 55/22; S. 11 konkrete Oracle-Finanzierung/Vertragsmeldung und Schuldendefinition; S. 13 Burry-/Hood-/Privorotsky-Zitatwortlaut und Dalio-Zurechnung; S. 15 beide übersetzten Managementzitate und +54 Mrd. $; S. 17 sämtliche IDXX-/Mosaic-Detailaussagen; S. 18 alle Atlassian-Details sowie FIS-Finanzchef und Analystenherabstufungen; S. 19 Fondsmonatsdaten, Walleye-Rückzahlung und Goldman-Exposuredaten; S. 20 Intel-Original-Form-4 und Huang; S. 24 Rohstoff-/Krypto-Kurse mit Uhrzeit und Instrument, Iran-Katar-Begründung; S. 25 Rheinmetall-/Einzelwerte- und EZB-/Industrieproduktionsdetails; S. 26 gesamte übrige Terminliste und Anthropic-Prognosemarkt. Sie sind teils im Faktenblatt aufgeführt, aber dort häufig ohne URL, Auszug oder archivierten Beleg. Vor Freigabe diese Lücken schließen, keine zusätzliche Genauigkeit vortäuschen.

### Nachvollziehbare Primärbelege (Abruf 08.11.2026)

| Beleg | Bestätigter Prüfbereich |
|---|---|
| [AMD EX-99.1, 03.11.](https://www.sec.gov/Archives/edgar/data/0000002488/000000248826000188/q32026991.htm) | S. 12: Quartals- und Segmentwerte, Helios-Kunden, FCF, Ausblick |
| [Nvidia IR, 28.10.](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Sets-Conference-Call-for-Third-Quarter-Financial-Results/default.aspx) | Veröffentlichungs- und Konferenzzeit, Quartalsende |
| [Marvell SEC, 02.11.](https://www.sec.gov/Archives/edgar/data/1633978/000119312526442758/d163169dex991.htm) | Übernahmeankündigung / Wertansatz; zusätzlicher IR-Filingbeleg [EX-99.1](https://investor.marvell.com/sec-filings/all-sec-filings/content/0001193125-26-442714/d81187dex991.htm) |
| [AppLovin IR, 04.11.](https://investors.applovin.com/news/news-details/2026/AppLovin-Announces-Third-Quarter-2026-Financial-Results/default.aspx) | Quartalszahlen und Definition Rückkauf-/Einbehaltssumme |
| [Palantir SEC, 02.11.](https://www.sec.gov/Archives/edgar/data/1321655/000132165526000045/a2026q3ex991pressrelease.htm) | Umsatz, US-Segmente, TCV-Vorjahreswachstum |
| [Airbnb, 05.11.](https://news.airbnb.com/airbnb-q3-2026-financial-results) | Q3-Mitteilung, zusätzlicher Rückkaufrahmen |
| [Fiserv SEC, 03.11.](https://www.sec.gov/Archives/edgar/data/798354/000079835426000039/fisvq326earningsrelease.htm) | Umsatz und Wertberichtigung |
| [Axon SEC, 05.11.](https://www.sec.gov/Archives/edgar/data/1069183/000162828026071086/axon-20261105xex991.htm) | Umsatzwachstum und verschobene Bundesaufträge |
| [DraftKings IR, 05.11.](https://ir.aboutdraftkings.com/news/news-details/2026/DraftKings-Reports-Third-Quarter-Revenue-Growth-of-16/default.aspx) | EBITDA-Ausblick und MUP-Wachstum |
| [BLS Arbeitsmarkt](https://www.bls.gov/news.release/empsit.htm), [BLS CPI](https://www.bls.gov/news.release/CPI.htm), [Novemberkalender](https://blsmon1.bls.gov/schedule/2026/11_sched_list.htm) | Oktoberbericht / CPI-Veröffentlichung 10.11., 8:30 ET = 14:30 MEZ; laufende Seiten für künftige Prüfung datiert archivieren |
| [EU-Ratspräsidentschaft](https://irish-presidency.consilium.europa.eu/en/events/informal-meeting-of-eu-heads-of-state-or-government/) | Informelles Treffen Dublin 13.11. |

### Direkt vorgenommene Korrekturen

Nur drei eindeutige Stellen in `pages/` wurden geändert: S. 08 Ergebnis-/Telefonkonferenzzeit getrennt; S. 09 historischer MU-Kurs durch datierten Schlusskurs ersetzt; S. 28 angekündigte Aktienzahl auf tatsächlich vorhandene 21 gesetzt. Alle anderen Tabellenzeilen sind Vorschläge bzw. offene Prüfpunkte. Keine Neuberechnung von Modellen, keine manuellen Dateneingriffe. PDF und Vorschau bleiben die geprüften Originalartefakte; sie müssen nach redaktioneller Bearbeitung bewusst neu ausgegeben werden und enthalten die drei Korrekturen noch nicht.

## 3. Wortwahl- und Rechtsbefunde

### Empfehlungsnähe und unzulässige Verallgemeinerung

Im eigentlichen redaktionellen Text keine direkte Kaufaufforderung, kein eigenes Kursziel und keine konkrete Handelsanweisung gefunden. Die folgenden Fundstellen sind trotzdem zu überarbeiten oder redaktionell einzugrenzen; technische oder historische Verwendung ist jeweils von einer echten Aufforderung zu unterscheiden.

| Seite | Fundstelle | Einordnung / Vorschlag |
|---|---|---|
| 02 | „Entscheiden müssen Sie selbst“ nach positivem Bewertungsvergleich | Kein eigenständiger Regelverstoß, aber kein Schutz vor impliziter Empfehlung. Sachliche Vergleichsbasis und Grenzen wichtiger als Verantwortungssatz |
| 02, 07, 09 | Micron niedriger bewertet als Supermärkte | Kennzahlenvergleich grundsätzlich zulässig; Zyklik, TTM-Ende und Sondererträge sichtbar machen, nicht als günstigen Einstieg inszenieren |
| 02 | Inhaltsanriss „Sieger der Woche“ | „Größter Wochenanstieg“; beschreibt Kurs statt Aktienqualität |
| 07 | „Vorher wollten alle rein“ | Verallgemeinert 13F-Neumeldungen zu Handelsabsicht; „Viele neue institutionelle Halter im Q2“ |
| 08, 21 | Nvidia niedrigste Bewertung großer KI-Werte | Sachlich falsch, zugleich positiver Bewertungs-Superlativ; konkrete Vergleichstitel nennen |
| 12 | „Das beste Quartal, der schlechteste Tag“ | Umsatzrekord und Kurstag konkretisieren; ohne Gesamtzeitraum nicht belegbarer Superlativ |
| 13 | Zitat „KI kaufen, Anleihen verkaufen“ | Historische Fremdpositionierung, keine Aufforderung der Redaktion. Vergangenheitskontext beibehalten und Beleg direkt zuordnen |
| 14 | App-Screenshot „Was Profis kaufen“ | WORTWAHL verbietet genau diese Nachahmungsrahmung. Neutralen echten Screen verwenden („Was große Fonds gemeldet haben“), keine Bildretusche als angeblich echter Screen |
| 17, 18; 02 Inhaltsübersicht | „Die Gewinner“, „Die Verlierer“ | Laut Wortwahltabelle „Größte Kursanstiege/-rückgänge“ mit Zeitraum. „Gewinner“ nicht als Qualitätsurteil |
| 17, 18 | „Das wussten die wenigsten“, S. 17 „über die gerade niemand spricht“ | Nicht belegte Exklusivitätsbehauptungen; „Das Detail“ und konkrete Einsicht verwenden |
| 19, 20, 27 | „Profis“, „was … Fonds kaufen und verkaufen“ | Historische Meldungen mit Berichts-/Meldedatum nennen; 13F-Differenzen sind keine vollständigen zeitnahen Orderprotokolle |
| 22 | „Standhaft“, „Aufwärtstrend“ aus Kurs über SMA200 | Wertender Presetname und zu starke Trendbehauptung; „Sechs Bedingungen am Stichtag“ / „über 200-Tage-Linie“ |
| 22 | „Umschichtung, keine Flucht“ | Kausalschluss aus selektierter Trefferliste; keine Evidenz für Mittelströme |
| 27 | Screenshot „Finde Aktien, die zu dir passen“ | Nach WORTWAHL explizit persönliche Empfehlungsnähe; echten Screen mit „zu deinem Filter“ verwenden |

„Keine Empfehlung“, „kein Kursziel“, „Keine Anlageberatung“, Insiderkäufe und Unternehmensrückkäufe sind keine verbotenen Treffer. Die Werbung „Newsletter abonnieren“ ist eine Marketingaufforderung, keine Handelsaufforderung. Eine bloße Regex-Suche darf diese Unterschiede nicht entscheiden.

### Rechtliche Hinweise (Prüfhinweise, keine Rechtsberatung)

1. **Impressum substanziell vorhanden:** Verlag/Firma, ladungsfähige Anschrift, Vertreter, Register, USt-ID, Inhaltsverantwortlicher und E-Mail sind auf S. 29 angegeben. Die tatsächlichen Register-/Adressangaben wurden nicht anhand eines aktuellen Registerauszugs authentifiziert. Für die derzeitige PDF-Musterausgabe keine Druckerei erfinden; für eine gedruckte Ausgabe fehlt der nach [§ 8 PresseG BW](https://www.landesrecht-bw.de/bsbw/document/jlr-NNLBW00008B5ANN00000000011) zu prüfende Drucker mit Anschrift. Zuständigkeit des Landesrechts anhand Verlags-/Herstellungsort bestätigen lassen.
2. **Pflichthinweise nicht auf jeder Seite:** S. 01, 02, 05, 14 und 30 ohne Hinweisfuß; S. 29 hat einen individuellen Fuß ohne „Keine Anlageberatung“. Das widerspricht Handbuch/README („jede Seite“), ist damit aber nicht automatisch ein eigener Gesetzesverstoß. Entweder Hausregel mit lesbarer Kurzfassung umsetzen oder Ausnahmen für Cover/Anzeigen ausdrücklich beschließen. Nicht zusätzliche Kleinstschrift als scheinbare Lösung aufbringen.
3. **Zentrale Rechtstexte werden nicht eingebunden:** S. 29 ist eigener Handtext, `render.mjs`/`lib.js` lesen `legal-notices.json` nicht. Redaktioneller Hinweis aus `notices.editorial` nicht wortgleich übernommen. Zentrale Version und ausgabespezifischen Abdruck zusammenführen; Rechtsänderung/Veröffentlichung nach CLAUDE gesondert freigeben. Für diesen Prüf-PR wurden Rechtstexte nicht geändert.
4. **Quellenapparat zu grob:** Medienname + Tag ohne Titel, Autor, URL, Dokument-ID erschwert Überprüfung. S. 01/02/05 ohne `data-foot` werden gar nicht ins Verzeichnis aufgenommen. S. 27 trägt statt Quelle einen Disclaimer ein, der als „Quelle“ erscheint. Register sollte konkrete Quellen-IDs sammeln und auflösen, keine freien Fußtexte. Zitate benötigen identifizierbare Herkunft, nicht zwingend eine platzraubende Lang-URL direkt im Layout.
5. **Zitate lokal unvollständig:** S. 06 Überschrift Sanders sowie Yardeni/Jefferies im Fließtext ohne eindeutige lokale Zuordnung; S. 11 Privorotsky nennt Sprecher/Goldman, kein Medium; S. 13 Hood und Privorotsky ohne lokalem Fundort; S. 15 Foroughi und Stumpf ohne direkten Dokument-/Medienbeleg; S. 16 Karp ohne direktes Dokument; S. 17 Mosaic als Zitat ohne Sprecher/Original. S. 19 JPMorgan und S. 13 Yardeni sind laut Recherche nur sinngemäß, aber stehen in Anführungszeichen: als Paraphrase ohne Zitatzeichen führen. Quellenangabe allein begründet auch noch kein Zitatrecht; Umfang und Belegfunktion nach [§§ 51, 63 UrhG](https://www.gesetze-im-internet.de/urhg/BJNR012730965.html) prüfen. Vollständiges Zitatregister mit Original, Übersetzung, Sprecher, Datum, URL und Kontext anlegen.
6. **KI-Kennzeichnung lückenhaft:** Cover und Inhaltsspalten-Thumbnails S. 02 ohne individuelle Kennzeichnung, große redaktionelle Motive sonst überwiegend markiert. `KI-Bild` ist mit 5 pt zu klein für Handyansicht. Pro Bildgruppe klarer, lesbarer Hinweis „KI-Illustrationen, keine Ereignisfotos“; Herkunft/Lizenz der Vorratsbilder mitführen. Die pauschale Handbuchaussage, jedes KI-Bild brauche allein wegen Art. 50 denselben Vermerk, ist rechtlich zu grob: Bildtyp/Deepfake und Text mit redaktioneller Kontrolle unterscheiden, aktuellen [Art. 50 und Fassungsstand](https://eur-lex.europa.eu/eli/reg/2024/1689/oj) prüfen. Keine Gesetzesgarantie aus dem kleinen Label ableiten.
7. **Eigenwerbung:** S. 14/27/30 erkennbar als App-Promotion, aber drei volle Seiten plus Newsletterkasten. Die README-Behauptung „Eigenwerbung braucht keine Kennzeichnung“ nicht als allgemeine rechtliche Regel weitertragen. Redaktionelle Trennung/kommerziellen Zweck prüfen; sichtbares „Eigenwerbung“ wäre transparent. App-Startstatus, echte Funktionen und Screens müssen zur Veröffentlichung stimmen.
8. **Interessen/Autor:** S. 29 benennt Verantwortlichen und Methodikadresse, aber keine artikelbezogene Urheberschaft oder konkrete Prüfung privater Interessen. Für Marktanalysen/Screenings Art. 20/21 MAR und Weitergabe fremder Bewertungen anwaltlich einordnen lassen, wie `EINORDNUNG.md` selbst vorsieht. „Keine Empfehlung“ ist keine verbindliche Klassifikation. Nicht aus 13F oder Insider-Nettoverkäufen auf aktuelle Positionen einzelner Personen schließen.
9. **Zu viel pauschaler Haftungstext:** „Für die Richtigkeit fremder Angaben übernehmen wir keine Gewähr“ ersetzt keine redaktionelle Prüfung. „Alle Rechte vorbehalten“ plus Erlaubnis zur PDF-Weitergabe ist verständlich, umfasst aber keine ungeklärten Rechte von Daten-/Logolieferanten. Weiterverbreitungslizenzen von Tiingo, Logos, Bildern und Screens getrennt prüfen.
10. **Nutzbarkeit der Hinweise:** Methodik-/Risikoadressen als Plaintext sind keine verlässlich anklickbaren HTML-Links. Echte `a`-Links, PDF-Lesezeichen, Dokumenttitel, Sprache und Tags vorsehen; der aktuelle Export ist ungetaggt. Keine Abo-/Kündigungslinks bloß wegen der App-Pflichten ins PDF kopieren, solange dort kein Vertrag geschlossen wird.

## 4. Design-Befunde je Seite

Alle Befunde beziehen sich auf den Neurender und den Ausgangsstand; die drei Textkorrekturen wurden anschließend auf ihren Seiten nachgerendert. **Kein sichtbarer Textbeschnitt, keine unbeabsichtigte Textüberlappung und kein fehlendes Motiv auf den 30 Seiten gefunden.** Die systematische Text-Grenzprüfung ist ergänzende Evidenz, keine Garantie gegen jede Kollision. Die Bildhelligkeit ist überwiegend ausreichend; Probleme sind lokal und die geringe Handy-Schriftgröße ist systemisch.

| PDF-Seite / Datei | Visueller Befund und konkrete Verbesserung | Anlass / Mehrwert |
|---|---|---|
| 01 `01-cover` | Starke Titelhierarchie, Motiv im oberen/mittleren Bereich sehr dunkel; Anrisse/Pillen und Datumsblock sehr klein. Wochenfenster und KI-Hinweis fehlen. Quellen-/Seitenanker für vier Anrisse ergänzen | Klarer Wochenanlass; Zählung und Quellenabdeckung korrigieren |
| 02 `02-editorial` | Inhaltsspalte absichtlich bis Rand, kein tatsächlicher Textbeschnitt; Überlaufalarm ist hier falsch positiv. Kleine Anrisstexte, keine Fußzeile. Kurzes Editorial schafft größere Schrift | Wiederholt Titelchronik; auf zwei konkrete Erkenntnisse und Änderungen zur Vorwoche kürzen |
| 03 `03-das-war` | Acht Meldungen sauber getrennt; untere Hälfte/Seitenende relativ luftig, 8,2-pt-Meldungstext könnte größer sein. Zeitfolge springt Mi/Do/Mo | Gute Wochenübersicht; chronologische oder thematische Ordnung wählen |
| 04 `04-zahlen` | Konsistente 3×4-Kacheln, genügend Kontrast; graue 7,8-pt-Erklärungen und 6,5-pt-Legende klein. Mehr Platz unter Grid als nötig | Gute Verdichtung; gegenüber S. 03 weniger doppelte Zahlen, Unsicherheiten nicht unsichtbar machen |
| 05 `05-titel-opener` | Starkes Bild, große lesbare Headline, viel reine Motivfläche; keine Fußzeile | Zweiter Titel nach Cover; für kürzeres Wochenheft mit S. 06 zusammenlegen |
| 06 `06-titel-story` | Drei Textspalten durch zweispaltigen Text im linken Gridfeld sehr schmal; großes Loch über unteren Zitaten. Bild dunkel, nicht unkenntlich | Wochenpolitik relevant; mehr belastbare Zuständigkeits-/CapEx-Einordnung statt Zitatwiederholung |
| 07 `07-titel-daten` | Datencharts gut vergleichbar, Mitte zwischen Charts und unterem Block weitgehend leer. Text/Grafik größer statt weiterer Inhalte. Firmennamen im 13F-Block umbrechen | Stärkster eigener Mehrwert; Nenner, Q2-Lag und KGV-Basis erklären |
| 08 `08-nvidia` | 86-mm-Hero, schmale Textspalten, Datenkasten gut ausgerichtet. Größere vertikale Lücke vor Schlusskarten; keine Kollision | Wochencrash/Brief und kommende Zahlen klar; keine falsche KGV-Spitzenstellung |
| 09 `09-micron` | Gleiches Raster konsistent; große Lücke unten, 6,5-pt-Datenquelle klein. Historischer Kurs nach Korrektur passt | Zyklik erklärt Bewertung, sinnvoll; Absatz bleibt vom Q2-Fondsstand abhängig |
| 10 `10-vertiv` | Hero relativ dunkel, Überschrift trotzdem klar; nur Vertiv-Datenkasten trotz Lumentum-Hauptgeschichte, große freie Mitte | Gute Übernahmearithmetik; LITE/MRVL-Schlusskurse und identisches Wochenfenster sichtbarer |
| 11 `11-oracle` | Gleiches Raster; offene Fläche zwischen Text und Zitat, Datenkasten nur Oracle, CoreWeave klein unten | Finanzierungsunterschiede stärker erklären, Schuldendefinition nachreichen |
| 12 `12-amd` | Text kürzer als auf Nachbarseiten, dadurch besonders viel Weißraum; Kopf/Headline lesbar | Starker aktueller Quartalsanlass; Q3 im Text gegen Q2 im Datenkasten offenlegen |
| 13 `13-titel-fazit` | Große schwarze Leerfläche zwischen sechs Stimmen und Terminzeile; winzige Quellen/Terminkarten. Kontrast der Hauptzitate gut | Wiederholt Yardeni/Burry/Goldman; stattdessen 3 überprüfbare Szenarien mit Beobachtungsgrößen, keine Kursprognosen |
| 14 `13a-app` | Gute echte Screens und klare Werbung, Überlagerung der Telefone beabsichtigt, kein Textbeschnitt. Tooltitel und Screenshot-Text klein | Generische Produktseite ohne Wochenanlass; als Werbung akzeptabel, Umfang reduzieren |
| 15 `14-applovin` | Konsistentes Aktienraster, Hero klar; viel Weißraum oberhalb Schlusskästen | Quartalszahlen und Rückkäufe erklären Sprung; Definition/Zeitraum nachziehen |
| 16 `15-palantir` | Gute TCV-Gegenüberstellung, viel freie Fläche unten, kleine Fußquellen | Hoher Analysemehrwert; Unterzeile auf USA begrenzen und TCV-Wachstumsbasis benennen |
| 17 `16-gewinner` | Vier Karten gut lesbar am großen Bildschirm, kleine Texte auf Handy; unten großer freier Streifen. Illustrationen nehmen mehr Platz als Kennzahlen ein | Vier aktuelle Ereignisse; „wenigste“ nicht als Exklusivwissen behaupten |
| 18 `17-verlierer` | Schwarzes Gegenstück konsistent; 8-pt-Grautext im Handyzoom nötig. Karten- und Seitenende luftig | Anlass vorhanden, aber Unterzeile und Gewinnbegriffe korrigieren |
| 19 `18-hedgefonds` | Klarer Tabellenkasten, lange schmale Spalten; Lücke vor unterem Zitat. Kleine Fonds-/Quellenlabels | Oktoberzahlen aktuell, Q2-Daten/alte Oktoberpositionierung separat als Hintergrund markieren |
| 20 `19-profis` | Obere drei Karten kompakt, Balkengrafik und Q2-Liste gut getrennt; unteres Viertel weitgehend leer. Texte 7,9 pt/Quellen 6,5 pt | Wochenmix sinnvoll; alte Bestände nicht als aktuelle Profihandlung verkaufen |
| 21 `20-chart` | Gut verständlicher Chart, Markierungen passen zu Wochenpunkten. Untere große Fläche leer, würde größere Grafik/Schrift erlauben | Wochenbruch relevant; Formationsregel/Datum/RS-Unterschied erläutern |
| 22 `21-screening` | Nur zwölf Zeilen, dazwischen Platz und zwei Kästen unten; Auswahlkennzeichnung fehlt. Tabelle/Regellegende sehr klein | Eigenständige Woche; vollständige 19 oder sichtbare Auswahl plus Zugang zur Gesamtliste |
| 23 `22-radar` | Viel schwarze Fläche unter Balken, gute Gegensatzfarben. Teilweise lange Zeilenlabels; Nenner zu klein. Median ohne Abdeckung leicht missverständlich | Wöchentliche Breite nützlich; Veränderung gegen Vorwoche fehlt |
| 24 `23-konjunktur` | Hoher Hero, kleine schmale Spalten, großer freier Bereich vor drei kleinen Motiven; diese sind dunkel, Beschriftung kontrastreich | Jobs/Inflation aktuell; weniger Symbolbilder, mehr zeitlich datierte Zins-/Öl-Einordnung |
| 25 `24-deutschland` | Ähnliches Raster, DAX-Kasten klar; großer Weißraum vor untenliegendem Bull/Bär. Kein Beschnitt | Wochenanlass; Europa im Rubriktitel kaum eingelöst, Detailbelege fehlen |
| 26 `25-das-wird` | Fünf sehr schmale Kalenderspalten, kleine Labels/Trennungen; wenig Text je Termin, darunter Leerraum vor Karten | Praktisch, aber auf 8–12 Kerntermine priorisieren; restliche Liste digital, Zeitzone/Status dazu |
| 27 `26-app` | Telefone rechts beabsichtigt überlagert; Überschrift und Produkttext berühren sie nicht. Viel Raum im unteren Bereich | Zweite generische Produktseite plus Werberückseite zu viel; besser ein aktueller Workflow mit genau einem Heftbeispiel |
| 28 `27-quickcheck` | 21 Zeilen vollständig sichtbar, gute Spaltenausrichtung; 8-pt-Text, 6,5-pt-Legende und KGV-Kappung brauchen Zoom. Newsletter groß | Nützliches Nachschlagen, Umfang dynamisch; Beschränkung auf bekannte Großtitel begründen |
| 29 `28-impressum` | Alles passt; Quellen in zwei Spalten winzig, ohne klickbare Titel/URLs. Große oberste Textblöcke lassen keinen zusätzlichen Quellenapparat komfortabel zu | Kein Wochenanlass nötig; Quellen online je Ausgabe, kurze präzise Referenz-IDs im Heft |
| 30 `29-rueckseite` | Saubere Werberückseite, viel gestalteter Negativraum; Screen zeigt alten NVDA-Kurs 204,64 $ statt 186,64 $, kein klarer Demostand | Werbung zulässig; „Beispielansicht / anderer Datenstand“ lesbar machen; Smartphone auf Handy als Bild kaum nutzbar |

### Design-System als Vorlage

Farben, Inter, Pillen, Überschriften, Datenkästen und Charts wirken als Familie. Die vielen Inline-Styles, nachträglichen CSS-Overrides (`.body` zunächst 9,2, dann 8,7 pt, in `.imgtop` 9,25 pt), fixen Hero-Höhen und absolut unten verankerten Kästen verhindern jedoch einen robusten Textfluss. Kleine Inhaltsänderungen können große Lücken oder spätere Kollisionen erzeugen. Aktienvorlage mit Inhaltsbudget, `minmax`-Grid und drei ausdrücklich getesteten Textlängen anbieten; nicht jede Woche Text durch kleinere Schrift passend machen.

Im 390-Pixel-breiten Handyfenster wird eine 210-mm-Seite auf rund 49 % der üblichen CSS-Breite skaliert: 9,25 pt entsprechen dann ungefähr 6 Bildschirmpixeln. Höhere PNG-Auflösung behebt diese physische Kleinheit nicht. A4 für Druck/PDF behalten, daneben einspaltige HTML-Leseansicht aus denselben Inhalten ausgeben. Für das PDF größere Schrift mit weniger Spalten, sichtbare Links und Lesezeichen. Quellen und KI-Hinweise nicht als kaum erkennbare Mikrotypografie behandeln.

`charts.js` hat keine robuste Behandlung leerer/einpunktiger/konstanter Reihen und fehlender/ungültiger Marker (`findIndex` kann −1 liefern), `vbars` kann bei nur negativen Werten schlecht skalieren. Im geprüften Heft kein solcher Defekt, für weitere Ausgaben jedoch Fehler vor Rendern abfangen. Nullwerte nicht als Nullrendite formatieren. Monatliche Achsenbeschriftung, Einheiten, Perioden und Kursbereinigung im Chartvertrag festschreiben. KGV-Grafik auf S. 07 ist entgegen Handbuch nicht über `charts.js`, sondern eigenes HTML; zentralisieren.

## 5. Konzept, Zielstruktur und Wochenproduktion

### Priorität P0 · vor der nächsten Ausgabe

1. **Ausgabe einfrieren und Herkunft belegen.** Manifest mit Code-Commit, Quellartefakt-Hashes, Datenständen je Produkt, Handelskalender und Redaktionsschluss. Kein „asOf = W1“ als Ersatz für tatsächlich geprüfte Zeitstempel. Der Builder liest teils aktuelle Kurse, Kennzahlen und Regime, aber historische W0/W1: nach einem späteren Datenlauf kann ein Neubau alte Wochenrenditen mit neuen Bewertungen mischen. Je Ausgabe unveränderlicher Snapshot mit `ttmThrough`, Preisdatum, Ownership-asOf, Technikdatum; bei abweichendem Stichtag sichtbar warnen bzw. Ausgabe blockieren. Geschützte Quelldaten nicht kopieren/ändern im Datenprodukt, sondern auf Ausgabeseite versioniert referenzieren/festhalten.
2. **Faktenregister statt freiem Faktenblatt allein.** Pro Aussage ID, exakter Wert/Einheit/Periode, Quelle mit Titel/URL/Veröffentlichungs- und Abrufdatum, Originalauszug, Prüferstatus, Unsicherheit; bei Zitaten zusätzlich Original und freigegebene Übersetzung. Zahlen-/Kursfenster nicht über mehrere Handtexte duplizieren. Für Kernaussagen mindestens Primärbeleg oder klar identifizierte Sekundärquelle, Abweichungen aktiv auflösen. Ein Medienname ohne auffindbare Stelle ist kein grüner Status.
3. **Hohe Befunde zuerst schließen.** Falsche Superlative, LITE-Zeitfenster, DraftKings-Ergebnisart, Teilsektor-Stichprobe, Datenherkunft, Haushalt und Micro-/TTM-Stichtage. Erst danach freigeben; diese Punkte nicht in einem „alle Zahlen aus Daten“ verschwinden lassen.
4. **Renderer als echtes Gate.** Ressourcen-/JS-Fehler und unbeabsichtigter Overflow müssen Exit ≠ 0 erzeugen, nicht nur `console.log`. Bekannten Anschnitt S. 02 mit lokalem, begründetem Attribut erlauben, nicht globale Checks abschalten. Zusätzlich Text in eigenen Karten, Kollisionen mit Fußzeilen, doppelte Seiten-IDs, fehlende Quellen, Referenzen und Datumsfelder prüfen. Visuelle Endkontrolle aller 30 Seiten bleibt nötig.

### Priorität P1 · feste Vorlagen und klare Heftökonomie

**Bewertung der vier offenen Punkte in HANDBUCH §6:**

| Offener Punkt | Bewertung | Konkrete Abhilfe / Abnahmekriterium |
|---|---|---|
| Ausgabedaten von Hand | Kritisch, mehr als ein kosmetischer Aufwand | Eine `ausgabe.json`; Datum/Nummer/ISO-KW und Schlusszeit kommen ausschließlich daraus. Titel, Footer, Cover, PDF-Name und Vorschau stimmen ohne Suchen/Ersetzen |
| Gemischter Inhalt und Vorlagen | Kritisch, derzeit jedes Heft ein HTML-Editierprojekt | Layout in gemeinsamen Templates, Text/Fakten/Bilder in Ausgabe-Inhalten. Eine neue Ausgabe verändert keine Vorlage und keine Inline-CSS-Werte |
| Seitenverweise | Kritisch, Dateinamen stimmen schon heute nicht mit PDF-Seiten überein | Stabile semantische Seiten-/Artikel-IDs; Reihenfolge im Manifest; Renderer erzeugt Nummern, Inhaltsverzeichnis, Querverweise und Quellenposition. Referenz auf unbekannte ID ist Buildfehler |
| Wochendaten W0/W1 | Kritisch, spätere Reproduktion sonst inhaltlich gemischt | Börsenkalender bestimmt letzte gemeinsame Schlusssitzung und Vorwochenschluss (Feiertage!), Manifest hält beide fest. Jede Rendite und Chartannotation nennt genau dieses Fenster; Referenzdaten nie still durch jüngste Werte ersetzen |

Vorgeschlagene Struktur (Vorschlag, hier nicht implementiert):

```text
docs/publishing/
  system/
    templates/{cover,editorial,stock,briefs,chart,screen,calendar,legal}.html
    mag.css  lib.js  charts.js  build.mjs  validate.mjs  render.mjs
    schemas/{ausgabe,inhalt,fakten}.json
  ausgaben/2026-11-09/
    ausgabe.json
    inhalt/{editorial,titel-politik,nvidia,micron,...}.md
    fakten.json
    daten/snapshot.json
    daten/provenienz.json
    bilder/manifest.json
    img/
    freigabe.json
    dist/{magazin.html,aktienmagazin-01.pdf,vorschau/}
```

`ausgabe.json` z. B. `id`, `nummer`, `erscheinungsdatum`, `redaktionsschluss` mit Zeitzone, `handelsfenster.from/to`, `codeCommit`, `snapshot`, `seiten:[{id,template,inhalt,bilder}]`. Text referenziert `{{fact:amd.q3.revenue}}`, `{{metric:NVDA.pe}}`, `{{page:nvidia-chart}}`, keine handgeschriebenen Seitenzahlen. Redaktionelle Bilder erhalten Quelle/Lizenz/KI-Status/Bildunterschrift; Screens zusätzlich echten Aufnahmestichtag. `provenienz.json` hält pro Feld Pfad, Hash, Stand und Transformation fest. `freigabe.json` dokumentiert abgeschlossene Fakten-/Layoutprüfung und ggf. Owner-Freigaben; keine automatisch behauptete Rechtsfreigabe.

**Heftaufbau:** Die Folge Überblick → Titel → Einzelanalysen → Markt → Ausblick ist nachvollziehbar. Neun Titelseiten plus Cover/Editorial/Wochenmeldungen wiederholen dieselbe KI-Geschichte; App-Seiten 14/27/30 plus Newsletter nehmen viel Raum. Für einen wöchentlichen Ein-Personen-Betrieb besser **24 Seiten** als Standard und maximal 30 bei außergewöhnlicher Nachrichtenlage: 1 Cover, 2 Editorial/Inhalt, 3–4 Wochenbild/Zahlen, 5–10 Titel, 11–12 Einzelanalysen, 13–14 Berichtssaison, 15–16 Eigentümer/Chart, 17 Screening, 18 Markt, 19 Makro, 20 Deutschland/Europa, 21 Termine, 22 Quick-Check, 23 Impressum/Quellen, 24 Werberückseite. Keine Pflicht, schwache Wochen auf 30 Seiten zu füllen. Für Druckheft später Umfang/Bindung mit Druckerei abstimmen.

Im Vergleich zu den typischen Servicefunktionen von **Der Aktionär** und **Focus Money** (konzeptioneller Vergleich, keine Untersuchung einer konkreten aktuellen Konkurrenz-Ausgabe) fehlen hier vor allem: verlässliche Entwicklung seit der Vorwoche, ein ausgewogeneres Deutschland-/Europaangebot, Begriffs-/Methodikservice für Einsteiger, transparente Nachverfolgung früherer Themen und breitere Anlageklassen-Einordnung. Keine fremden Kaufempfehlungen, Kursziele oder Musterdepot-Trades als notwendige Magazinbestandteile kopieren. Ein kurzer Rückblick „Was wurde aus unserem Thema?“ mit datierter Aussage und tatsächlicher Entwicklung passt besser zur Analysepositionierung. ETF-/Anleihen-/Währungsservice nur mit eigenem belastbaren Datenprozess; nicht für Vollständigkeit noch mehr manuelle Quellenstränge hinzufügen.

Markt-Radar um **Veränderung zur Vorwoche** und Abdeckung ergänzen. Screening mit wechselnder begründeter Frage, stabiler Regeldokumentation und vollständigem Ergebniszugang. Einzelanalyse immer: Wochenanlass → neue Information → Bedeutung → Unsicherheit → nächster überprüfbarer Termin. Die besten bestehenden Ansätze sind Marktbreite, Palantir-TCV und Micron-Zyklik. Zitatcollage und identische Symbolbilder liefern den geringsten zusätzlichen Erkenntniswert.

### Priorität P2 · wirtschaftlicher Produktionsablauf

Der heutige Ablauf ist für wenige Stunden pro Woche **nicht belastbar**: vier Recherchebereiche, 30 Handlayouts, verteilte Datums-/Querverweise, Bildaufträge ausschließlich von `main`, manuelles Herunterladen/Konvertieren/Aufhellen, vollständige Faktenprüfung und finale PDF-QA konkurrieren um dieselbe Zeit. „KI schreibt schneller“ löst weder Quellenlücken noch Stichtagsmischung. Arbeitsannahme bis Automatisierung: **8–14 Arbeitsstunden**, bei strittigen Nachrichten mehr; keine gemessene Produktionszeit.

Nach Umsetzung P0/P1 erscheint **4–6 Stunden** für 24 Seiten als Planungsziel plausibel, sofern Quellen schon unter der Woche gesammelt werden und keine Bildnachbestellung nötig ist:

| Schritt | Menschlicher Zeitrahmen | Engpass / Entlastung |
|---|---|---|
| Themenentscheid, Update seit Vorwoche | 30–45 Min. | Priorisierte Themenliste aus vorhandenem Snapshot; feste Ressortgrenzen |
| Recherche ergänzen und Fakten freigeben | 90–120 Min. | Primärquellenlinks während der Woche sammeln; KI liefert Belegpakete, Mensch prüft strittige Kernaussagen |
| Texte redigieren, Datenreferenzen einsetzen | 60–90 Min. | Längenbudget pro Template, keine HTML-Handarbeit |
| Bilder auswählen | 15–30 Min. | Wiederverwendbarer kuratierter Vorrat und zwei Leitmotive; Hauptbild und Screens statt neues Bild für jede Kurzmeldung |
| Automatischer Build, gesamte Sichtprüfung, Export | 45–60 Min. | Unveränderlicher Snapshot, Rendergate, Kontaktbogen plus PDF auf Handygröße, Quellenstatusbericht |
| PR/CI und Übergabe | 15 Min. aktiv | CI-Laufzeit und externe Freigabe-/Renderwartezeiten separat planen |

Bild-Workflow vom Arbeitszweig unterstützen zu lassen ist sinnvoll, aber ein eigener Infrastrukturauftrag; keine neue Workflowdatei in diesem PR. Mehrere `main`-Commits für Bildrunden widersprechen der gewünschten schlanken Ausgabeproduktion. Bezahlte Bildaufträge bleiben explizit budgetierte Owner-Entscheidung. Layoutverbesserung, Rechtsänderung und wöchentlicher Inhalt sollten verschiedene Release-Anlässe sein; eine Ausgabe soll das stabile System nur benutzen.

**Definition „fertig“:** Snapshot vollständig und datiert; alle hohen Befunde geschlossen; jede veröffentlichte Kernzahl/Übersetzung belegbar; alle Verweise auflösbar; Render ohne echte Fehler; sämtliche Seiten sichtbar geprüft; PDF/Vorschau exakt aus demselben freigegebenen Stand; erforderliche Freigaben dokumentiert; PR-CI grün. Das ist ein prüfbarer Wochenprozess statt einer bloßen Kopieranleitung.

### Technische Validierung dieses PR

`node --test "core/tests/*.test.mjs"` auf demselben Ausgangscommit im vollständigen Checkout: 435 Tests, 432 bestanden, 3 übersprungen, 0 Fehler (146,7 s). Datenbau nur nach `/tmp`, struktureller Gleichheitsvergleich bestanden. Alle drei korrigierten Seiten nachgerendert, kein neuer Überlauf; `git diff --check` bestanden. Temporäre Renderdatei und erzeugtes `magazin.html` sind nicht Teil des PR. GitHub-CI wird am PR geprüft; ihr aktueller Status ist dort maßgeblich.
