# Anwaltsmappe: Vision Universe

Unterlage für die Prüfung durch einen Fachanwalt oder eine Fachanwältin für Bank- und Kapitalmarktrecht. Stand
06.11.2026. Vorbereitet von Claude (KI) im Auftrag des Owners. **Das ist keine Rechtsberatung.** Hier ist zusammengestellt,
was zu prüfen ist. Lesezeit etwa 15 Minuten.

## 1. Wer und was

**Anbieter:** RAM Consulting UG (haftungsbeschränkt), Bahnhofplatz 15, 74189 Weinsberg, HRB 803400 AG Stuttgart,
Geschäftsführer Ralf Andreas Müller. Marke: Vision Universe. Keine BaFin-Erlaubnis, kein Haftungsdach, keine Anzeige nach
§ 86 WpHG erstattet.

**Produkt:** Web-App research.visionuniverse.de, eine statische Seite. Heute schützt sie eine gemeinsame Passwortmaske,
die bewusst kein Zugangsschutz ist; die Daten sind faktisch öffentlich. Konten und Abo laufen über
konto.visionuniverse.de.
- **Free** ist kostenlos.
- **Pro** ist ein freiwilliges Abo, derzeit nur für Tester, mit demselben Umfang wie Free.
- Es gibt keinen öffentlichen Checkout, bevor die Rechtstexte freigegeben sind (technisch erzwungen).

**Owner-Ziel:** „Wir machen keine Anlageempfehlung und wollen mit der BaFin keine Probleme. Wir stellen nur eine Software
zur Analyse von Aktien zur Verfügung.“ Dazu kommt das Ziel, eine Methode zu finden, die den S&P 500 ehrlich schlägt, und
„Signale mit Nachweis“ zu zeigen. **Owner-Linie seit 05.11.2026 (Plan §11):** Analyse-Software ohne Anlageempfehlungen, ohne Signale, ohne Anzeige bei der BaFin, ohne Provisionen und Partnerverträge. Gesellschafter und Mitarbeiter können privat Aktien halten, die die Software zeigt (neutral offengelegt).

## 2. Wie Ergebnisse entstehen

- **Daten:** Kurse von Tiingo und Marketstack, Unternehmenszahlen und Meldungen der SEC (10-K/10-Q, 13F, Form 4) und
  Analystenkonsens von Finnhub und FMP. Es gibt keine weiteren Anbieter.
- **Berechnung:** Erzeuger laufen in GitHub Actions täglich oder wöchentlich, rechnen nach festen, versionierten Regeln
  und veröffentlichen die Ergebnisse als Dateien.
- **Kein Mensch je Aktie:** Kein Mensch wählt oder bewertet einzelne Aktien. Menschen legen Regeln, Schwellen und
  Freigaben fest.
- **Gleich für alle:** Alle Nutzer sehen dasselbe. Es gibt keine Abfrage von Vermögen, Anlagezielen oder Risikoneigung.
  Der Erststart fragt „Ziel“ (z. B. „Ideen finden“) und „Erfahrung“, aber nur für die Darstellung.
- **Ausnahmen mit Redaktion oder KI:**
  - Magazin, Morning und News sind redaktionell.
  - Instagram/TikTok-Reels zu Einzelaktien veröffentlicht der Owner nach eigener Freigabe.
  - Der AI Atlas übersetzt Fragen per KI in Filter; die Zahlen kommen aus den Erzeugern.

## 3. Was die App zeigt (je Funktion)

Ausführlich mit Belegen: [EINORDNUNG.md](EINORDNUNG.md) §3.

| Funktion | Beispiel aus der Oberfläche | Unsere vorläufige Einordnung |
|---|---|---|
| Screener | eigene Filter, Trefferliste, Faktoren 0–100 | Werkzeug, unkritisch |
| Quant je Aktie | 7 Faktoren „stark/Mittelfeld/schwach“, Gesamtbild „Überwiegend stark … Überwiegend schwach“ | evtl. Anlageempfehlung (implizite Beurteilung des Werts) |
| Quant-Setup-Karte | „Interessant ab“, „Stop / Ungültig unter“, „Ziel 1/2“, „Chance/Risiko“ | wahrscheinlich Anlageempfehlung |
| Supertrader | 13 Trader-Methoden; Stufen „Kandidat“, „Vorbereitet · nahe Trigger“, „Einstieg bestätigt“, „Modellposition aktiv“; rund 3.400 Kandidaten täglich | wahrscheinlich Anlageempfehlung |
| Musterdepots / Hausstrategie | „Musterdepot heute: 20 Aktien, je 5 %“, Protokoll Rein/Raus, live | implizite Empfehlungen; keine Verwaltung fremden Vermögens |
| Backtests | „Forschung, nicht zertifiziert“; Pilot mit Renditekurve gegen S&P 500 | Werbung mit Wertentwicklung (UWG) |
| ~~Geplant: Signale (Plan §10)~~ | entfällt nach Plan §11 | – |
| Analysten | Konsens „Kaufen/Halten/Verkaufen“, Kursziele Dritter, „Konsens-Ranking“ | Weitergabe von Empfehlungen Dritter |
| Hedgefonds / Insider | 13F-Bestände, Form-4-Käufe, „Gruppen-Kauf“ | Wiedergabe gesetzlicher Meldungen |
| Vorsorge | Rechner mit Alter, Sparrate, Bestandsvertrag; „Riester: behalten oder neu ausrichten?“ (ohne Wechsel-Empfehlung) | persönliche Eingaben; Grenze zu § 34d/§ 34f GewO |
| AI Atlas | Chat, KI übersetzt in Filter; Chartlage je Aktie | Risiko persönlicher Empfehlung im Chat |
| Reels | Einzelaktien, „🐂 oder 🐻 👇“, „Keine Anlageberatung.“ | Anlageempfehlung in sozialen Medien |

## 4. Was bereits vorbereitet ist

- **Texte** (Fassung 4, seit 06.11.2026 online freigeschaltet als `vu-recht-2026-11-06-1`, `LEGAL_STATUS = 'freigegeben'`;
  die offenen Fragen stehen in Abschnitt 7):
  - Nutzungsbedingungen mit Leistung als Analyse-Software,
  - Ausschluss von Anlageberatung, Vermittlung und Vermögensverwaltung,
  - Backtests als Forschung,
  - Haftung,
  - Risikohinweise und Haftungsausschluss,
  - Methodik, Quellen und Interessen (mit Vorsorgeklausel nach Art. 20 MAR, ersetzt „Hinweise nach MAR und WpHG“).

  Quelle: `workers/vu-account/src/legal/texts.mjs`. Seiten: `https://konto.visionuniverse.de/rechtliches/agb`,
  `…/risikohinweise`, `…/methodik`. Die früheren `[[PRÜFEN]]`-Marken sind aus dem Text entfernt und stehen in Abschnitt 7.
- **Pflicht-Hinweise** für die Seiten (`assets/legal-notices.json`) und Wortwahl-Regeln ([WORTWAHL.md](WORTWAHL.md)),
  dazu die Befundliste ([WORTWAHL-BEFUNDE.md](../archiv/legal/WORTWAHL-BEFUNDE.md)).
- **Verbraucherrecht** (Widerruf, Kündigungsbutton, Button-Lösung, Datenschutz): eigene Liste in
  [../accounts/RECHTLICHE_ABNAHME.md](../accounts/RECHTLICHE_ABNAHME.md) (A1–A14).

## 5. Offene Fragen an die Anwältin oder den Anwalt

**Aufsichtsrecht**
1. Reicht die Bauweise (für alle gleich, keine persönlichen Angaben, öffentlich) sicher aus, um Anlageberatung nach § 1
   Abs. 1a Satz 2 Nr. 1a KWG bzw. § 2 Abs. 2 Nr. 4 WpIG auszuschließen? Gilt das auch für einen zahlenden
   Abonnentenkreis (Pro)?
2. Welche Funktionen aus §3 sind Anlageempfehlungen bzw. Informationen mit Empfehlungen zu Anlagestrategien
   (Art. 3 Abs. 1 Nr. 34, 35 MAR)? Gilt das insbesondere für die Faktor-Einstufungen und das Gesamtbild je Aktie?
3. Ist Vision Universe eine Person, „deren Haupttätigkeit in der Erstellung von Anlageempfehlungen besteht“ (Nr. 34
   Ziff. i), oder „Sachverständiger“ nach der Delegierten VO (EU) 2016/958? Welche Angaben aus Art. 4 bis 6 sind dann
   je Ergebnis Pflicht, z. B. die Übersicht der Empfehlungen der letzten zwölf Monate bei rund 3.400 täglichen
   Kandidaten?
4. **Kernfrage:** Der Owner will keine Anzeige nach § 86 WpHG. Trägt die Linie „Analyse-Software ohne Empfehlungen“,
   wenn die Umbauten L1–L7 ([EINORDNUNG.md](EINORDNUNG.md) §0) umgesetzt sind? Welche Funktionen müssten zusätzlich
   wegfallen oder sich ändern (Kandidatenlisten, Einstufungen je Aktie, Analysten-Konsens, Reels)?
5. Genügt die Seite „Methodik, Quellen und Interessen“ mit ihrer Vorsorgeklausel als zentrale Offenlegung mit Link je Ergebnis, oder müssen Angaben an
   jedem Ergebnis selbst stehen?
6. Analysten-Konsens: Ist die Darstellung eine Weitergabe von Empfehlungen Dritter (Kapitel III DelVO)? Was ist zu tun,
   und ist ein „Konsens-Ranking“ zulässig?
7. Musterdepots und künftige Signale: Wo liegt die Grenze zur Finanzportfolioverwaltung oder Anlagevermittlung (z. B.
   bei Benachrichtigungen, Broker-Links, „Depot nachbilden“)?
8. AI Atlas: Wie muss die KI auf persönliche Fragen („Ich habe 5.000 €, was soll ich kaufen?“) reagieren, damit keine
   persönliche Empfehlung entsteht? Ist ein Hinweis plus Ablehnung ausreichend?
9. Vorsorge: Wo liegt bei Rechnern mit persönlichen Eingaben, besonders der Riester-Analyse, die Grenze zu § 34d, § 34f
   und § 34h GewO und zur Anlageberatung?
10. Reels des Owners zu Einzelaktien: Welche Offenlegungen sind Pflicht (Positionen, Interessen)? Welche Handelssperre
    für Mitwirkende ist angemessen (Scalping, Art. 12 Abs. 2 lit. d MAR)?
11. Gilt für Magazin, Morning und News das Presseprivileg (Art. 21 MAR)?

**Werbung und Verbraucherrecht**

12. Unter welchen Voraussetzungen dürfen Backtest-Ergebnisse (auch „schlägt den S&P 500“) im Produkt und in der
    Werbung stehen (§§ 5, 5a UWG; Orientierung an Art. 44 DelVO 2017/565)? Reicht das Label „Forschung, nicht
    zertifiziert“ mit Zeitraum, Kosten, Vergleich und allen Varianten?
13. Nutzungsbedingungen Ziffer 3 und 12: Sind der Ausschluss eines stillschweigenden Auskunfts- oder Beratungsvertrags
    und die Haftungsbegrenzung für Daten Dritter und Anlageverluste im entgeltlichen Pro-Vertrag wirksam
    (§§ 307, 309 Nr. 7, 327 ff. BGB)?
14. Gibt es aus Sicht der KI-Verordnung (Art. 50) weitere Pflichten für den AI Atlas?

**Owner-Angaben, die vor der Freigabe fehlen** (nicht erfinden):
- die Punkte A1 und A8 aus der Rechtlichen Abnahme.

Beantwortet am 05.11.2026:
- Die Gesellschaft hält keine Beteiligungen; Gesellschafter halten privat Aktien (neutraler Hinweis auf der Seite Methodik).
- Keine Provisionen, keine Partnerverträge.
- Keine Anzeige nach § 86 WpHG gewollt (Frage 4).

## 6. Was wir vom Anwalt brauchen

1. Schriftliche Einordnung je Funktion (unkritisch / Pflichten / unzulässig).
2. Freigabe oder Änderung der Texte: Nutzungsbedingungen, Risikohinweise, Methodik/Quellen/Interessen, Pflicht-Hinweise und Pflicht-Links im Frontend.
3. Falls die Linie ohne Anzeige nicht trägt: welche Funktionen dann wegfallen müssen. Die Alternative wäre die Anzeige, die der Owner nicht will.
4. Die Texte sind seit 06.11.2026 auf Owner-Entscheidung freigeschaltet. Änderungen nach der Prüfung kommen als neue
   Fassung (`LEGAL_VERSION` hochzählen) in einem eigenen PR; das bleibt eine Owner-Entscheidung.

## 7. Offen nach Freischaltung 06.11.

Der Owner hat die Texte am 06.11.2026 online freigeschaltet (`vu-recht-2026-11-06-1`). Die folgenden Prüffragen standen bis
dahin als `[[PRÜFEN: …]]` im Text. Sie sind unverändert übernommen; die Textstellen selbst sind inhaltlich unverändert.

| # | Text, Stelle | Frage (wörtlich aus der Prüfmarke) |
|---|---|---|
| P1 | Impressum, Verbraucherstreitbeilegung | Erklärung bestätigen (§ 36 VSBG) |
| P2 | Nutzungsbedingungen 1 (Kundenkreis) | Kundenkreis und Mindestalter bestätigen |
| P3 | Nutzungsbedingungen 3 (kein Beratungsvertrag) | Ausschluss eines stillschweigenden Auskunfts- oder Beratungsvertrags, Wirksamkeit gegenüber Verbrauchern |
| P4 | Nutzungsbedingungen 6 (Bestellung Pro) | Beschriftung der letzten Schaltfläche bei Stripe („Abonnieren“) und ergänzender Hinweistext nach § 312j Abs. 3 BGB |
| P5 | Nutzungsbedingungen 7 (Preis) | Preisangabe über Bestellübersicht und Vertragsbestätigung statt eines festen Betrags in den Bedingungen |
| P6 | Nutzungsbedingungen 10 (Sperre) | Sanktionsregel verhältnismäßig ausgestalten |
| P7 | Nutzungsbedingungen 11 (Änderungen) | Änderungsklausel |
| P8 | Nutzungsbedingungen 12 (Haftung) | Haftungsbegrenzung für Daten Dritter und Anlageverluste im entgeltlichen Pro-Vertrag (§ 307, § 309 Nr. 7 BGB, §§ 327 ff. BGB) |
| P9 | Widerrufsbelehrung, Einordnung | Einordnung digitale Dienstleistung vs. digitale Inhalte (§ 356 Abs. 4/5 BGB in der seit 19.06.2026 geltenden Fassung) und Übereinstimmung mit der aktuellen Muster-Widerrufsbelehrung (Anlage 1 zu Art. 246a § 1 Abs. 2 EGBGB) |
| P10 | Datenschutz 3 (Hosting) | Auftragsverarbeitungsverträge, Datenschutzrahmen (EU-US Data Privacy Framework/Standardvertragsklauseln) und Protokollfristen der Anbieter bestätigen |
| P11 | Datenschutz 6 (Brevo-Kontaktliste) | Rechtsgrundlage Art. 6 Abs. 1 lit. b bzw. f DSGVO für die Kontaktliste |
| P12 | Datenschutz 9 (Speicherdauer) | Fristen festlegen |
| P13 | Datenschutz 10 (Drittländer) | Je Anbieter Zertifizierung bzw. Klauseln bestätigen |
| P14 | Risikohinweise 7 | Risikohinweise und Haftungsausschluss insgesamt; Verhältnis zu den Nutzungsbedingungen |
| P15 | Methodik 5 (Angaben Dritter) | Darstellung von Analysten-Einstufungen und Kurszielen Dritter (Seite Analysten, Fundamental): Weitergabe von Empfehlungen Dritter; siehe docs/legal/EINORDNUNG.md |
| P16 | Methodik 6 (Vorsorgeklausel) | Vorsorgeklausel; Haltbarkeit der Linie „keine Anlageempfehlungen, keine Anzeige nach § 86 WpHG“ für die einzelnen Funktionen |

Neu mit der Freischaltung (zur Mitprüfung):

| # | Stelle | Frage |
|---|---|---|
| N1 | Impressum, Kontaktweg | Kein Telefon; E-Mail plus Kontaktformular `/kontakt` mit der Zusage „in der Regel innerhalb von 1–2 Werktagen“. Genügt das § 5 Abs. 1 Nr. 2 DDG? Der EuGH (C-298/07) lässt eine elektronische Anfragemaske genügen, wenn sie schnell beantwortet wird (im Urteil: 30–60 Minuten); ob 1–2 Werktage reichen, ist offen. |
| N2 | Datenschutz 1 | Kein Datenschutzbeauftragter, weil weniger als 20 Personen ständig mit der automatisierten Verarbeitung beschäftigt sind (§ 38 Abs. 1 BDSG). Gibt es eine Pflicht nach Art. 37 DSGVO oder § 38 Abs. 1 Satz 2 BDSG? |
| N3 | Datenschutz 6 (neuer Absatz) | Kontaktformular: Weiterleitung über Brevo per E-Mail, keine Speicherung im Konto-Dienst; Rechtsgrundlage und Aufbewahrung. |
| N4 | Widerrufsbelehrung, Verbraucherinformationen (Art. 246a EGBGB) | Telefon nur, sofern vorhanden; derzeit keine Nummer. Eine geschäftliche Telefonnummer muss nachgetragen werden, sobald sie existiert. |
| N5 | App: Rechtliches im Menü statt Seitenfuß (Owner-Entscheidung 07.11.2026) | In der App (iOS/Android, User-Agent `VUApp/1` oder Capacitor) gibt es keinen Rechts-Seitenfuß mehr. Impressum, Kontakt, Datenschutz, Nutzungsbedingungen, Risikohinweise, der Satz „Vision Universe ist eine Software zur Analyse von Aktien … Totalverlust …“ und „Datenquellen & Methodik“ stehen unter Menü → „Rechtliches & Infos“ (aus jedem Bereich zwei Tipps). Im Browser bleibt der Seitenfuß. Genügt das für § 5 DDG („unmittelbar erreichbar, ständig verfügbar“) und für die Risikodarstellung (§ 5 UWG, Art. 20 MAR)? Kontext-Hinweise direkt an Modellergebnissen (Musterdepot, Backtest, Setup) bleiben auf den Seiten. Nachweis: `core/tests/legal-notices-frontend.test.mjs` (jeder Fuß-Link und der Satz stehen im Menü). |
| N6 | Quellenangaben zentral (Owner-Entscheidung 07.11.2026) | Anbieternamen (Tiingo/IEX, SEC, Marketstack, FRED, EZB, ESMA) und Fachquellen (z. B. TraderFox bei Supertrader-Regeln) stehen nicht mehr auf den Produktseiten, sondern auf `/infos/#quellen` („Datenquellen & Methodik“); Supertrader-Methodenseiten sagen neutral „Drittanbieter/Drittvariante“, die Seite „Quellen der Regeln“ nennt die Namen. Behalten am Ort: ESMA-Quellenangabe (Vorsorge Europa, Lizenz verlangt Nennung), FRED (Makro, „Citation required“), Logo-Urheber (CC-Lizenzen, Aktienseite unter „Daten & Methodik“), Anbieter von Angaben Dritter (Analysten-Konsens). Fragen: (a) Reicht die zentrale Nennung für Tiingo/IEX vertraglich? (b) Verlangt Art. 3 DelVO 2016/958 (Quellen nennen) bei Ergebnissen, die als Empfehlung gelten könnten, die Nennung am Ergebnis? |
| N7 | Fundamentaldaten Europa aus ESEF-Jahresfinanzberichten (Strang M5, 08.11.2026) | Für deutsche Emittenten (zuerst DAX) laden wir das ESEF-Paket des Jahresfinanzberichts von der Website des Emittenten (gesetzliche Pflichtveröffentlichung nach § 114 WpHG/§ 328 HGB) und übernehmen nur drei Konzern-Kennzahlen (Umsatz, Konzernergebnis, operativer Cashflow) mit Vorjahr. Keine Dokumente, keine Texte, keine Grafiken; das Paket bleibt im Abruflauf und wird verworfen; die Aktienseite verlinkt das Original. Fragen: (a) Ist die Übernahme einzelner Zahlen aus Pflichtveröffentlichungen urheber- und datenbankrechtlich (§§ 87a ff. UrhG) unbedenklich, auch bei 40 bis 130 Emittenten jährlich? (b) Stehen Nutzungsbedingungen einzelner IR-Websites dem automatisierten Abruf genau einer Datei je Jahr entgegen? |
