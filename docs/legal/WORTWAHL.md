# Wortwahl im ganzen Produkt

Stand 05.11.2026 (Fassung 2, Owner-Linie Plan §11: keine Empfehlungen, keine Signale), Strang F. **Keine Rechtsberatung.** Diese Regeln senken das Risiko, dass eine Seite wie eine persönliche
Empfehlung oder eine Kaufaufforderung wirkt. Sie ändern nicht, dass konkrete Regelereignisse zu einzelnen Aktien
Anlageempfehlungen im Sinne der MAR sein können. Dafür gelten die Pflichtangaben aus
[EINORDNUNG.md](EINORDNUNG.md) §3. Ein Hinweistext unter einer Kaufaufforderung heilt nichts. Der Text selbst muss
beschreiben statt auffordern.

Maschinenlesbar mit denselben Regeln: `assets/legal-notices.json`, Feld `wording`.

## Grundsätze

1. **Beschreiben, was die Regel tut, nicht, was die Nutzerin tun soll.** Subjekt ist die Methode oder das Musterdepot,
   nie „du“. Also „Die Regel ist erfüllt“, nicht „Jetzt einsteigen“.
2. **Kein „für dich“.** Nichts als passend für die Person darstellen. „Passt zu deinem Filter“ ist erlaubt, denn das
   ist ihre eigene Einstellung. „Passt zu dir“ oder „zu deinem Depot“ ist nicht erlaubt.
3. **Keine Handelsanweisung.** Es gibt keine Einstiegs-, Stopp- oder Zielmarken als Handlungsvorschlag. Zonen
   erscheinen nur als „Zone laut Methode“ bzw. „Ungültig-Marke laut Methode“, nie als Kursziel oder Prognose.
4. **Vergangenheit bleibt Vergangenheit.** Backtests heißen „Forschung, nicht zertifiziert“ und nennen Zeitraum, Kosten
   und Vergleich. Kein Futur bei Renditen.
5. **Fremdes als fremd kennzeichnen.** „Kaufen/Halten/Verkaufen“ von Analysten nur mit „Angabe Dritter“, Quelle und
   Datum.
6. **Keine Versprechen.** Nicht verwenden: garantiert, sicher, risikolos, todsicher. Erlaubt ist „sicher“ nur im
   technischen Sinn (z. B. „sichere Verbindung“).

## Tabelle: nicht verwenden → stattdessen

| Nicht verwenden | Stattdessen | Warum |
|---|---|---|
| Kaufempfehlung, Kaufsignal, Verkaufssignal | erfüllt die Regel; Regelereignis der Methode „…“ | Empfehlungsbegriff |
| kaufen / verkaufen (als Aufforderung oder Urteil über eine Aktie) | erfüllt die Einstiegsregel / Ausstiegsregel der Methode; im Musterdepot: „Das Musterdepot nimmt X auf / gibt X ab“ | Aufforderung |
| Kauf / Verkauf (Musterdepot-Protokoll) | Aufnahme / Abgabe (Musterdepot), Rein / Raus | Wirkt wie Order an die Nutzerin |
| Empfehlung, wir empfehlen, empfohlen | Ergebnis der Methode, Treffer | Empfehlungsbegriff (erlaubt nur verneint: „keine Empfehlung“) |
| Kursziel, Zielkurs, Kurspotenzial, Ziel 1/2 (eigene Werte) | weglassen; höchstens „Zone laut Methode“ ohne Kursziel-Charakter | Beurteilung des künftigen Kurses |
| Kursziel, Kurspotenzial (Werte Dritter) | „Kursziel (Angabe Dritter, Quelle, Datum)“, „Abstand zum mittleren Analysten-Kursziel“ | Weitergabe Dritter erkennbar machen |
| Kaufzone, Einstiegszone, Einstiegsmarke, Einstiegschance, Kaufgelegenheit | Zone laut Methode | Handlungsvorschlag |
| „Interessant ab“ | „Zone laut Methode“ | Wertung „interessant“ |
| Chance/Risiko | weglassen | „Chance“ wirbt; Verhältnis zu einem Ziel ist ein Handelsvorschlag |
| Stop-Loss, „Stopp“, Stopp-Marke | Ungültig-Marke laut Methode (wo die Regel nicht mehr erfüllt ist) | Anweisung |
| Einstieg bestätigt, Vorbereitet · nahe Trigger | erfüllt die Regel (Stand …) | Handelsvorschlag |
| garantiert, sicher, risikolos | historisch, unter den genannten Annahmen | UWG, Irreführung |
| schlägt den Markt, Outperformer, Mehrrendite | im Backtest (Forschung) über / unter dem Vergleichsmaßstab (S&P 500 Gesamtrendite), Zeitraum | Renditeversprechen |
| Gewinner-Aktie, Top-Pick, Geheimtipp | stärkste Kursveränderung heute (Tagesbewegung); Rang nach Regel | Wertung |
| „Stärkste Gewinner/Verlierer“ (Tagesbewegung) | „Größte Anstiege/Rückgänge heute“ | wertet die Aktie statt den Kurs |
| unterbewertet, Schnäppchen, zu billig | niedrige Bewertung im Vergleich (Kennzahl nennen, z. B. KGV) | Beurteilung des Werts |
| spricht dafür / spricht dagegen | Stärken / Schwächen laut Kennzahlen | wirkt wie Abwägung zum Kauf |
| passt zu dir, für dein Depot, geeignet für dich | passt zu deinem Filter; erfüllt deine eingestellten Bedingungen | persönliche Empfehlung |
| Signal, Live-Signal, Push „Signal“ | Regel-Ergebnis der Methode „…“ (Regelversion, Stand) – keine Push-Meldungen als Signal | Plan §11: keine Signale |
| Konsens-Ranking (Analysten) | Übersicht der Analysten-Einstufungen (Angabe Dritter) | Bestenliste |
| „Was Profis kaufen“ | „Was große Fonds gemeldet haben (13F)“ | lädt zum Nachmachen ein |
| „🐂 oder 🐻?“, Meinung zu einer Einzelaktie (Reels) | Owner-Entscheidung 06.11.: Reels bleiben unverändert (Restrisiko: EINORDNUNG.md §0) | Social Media zählt (ESMA) |

**Erlaubt und erwünscht:** „keine Empfehlung“, „keine Anlageberatung“, „kein Kursziel“, „Rechenmodell“, „Musterdepot ohne
echtes Geld“, „Forschung, nicht zertifiziert“, „Datenstand“, „Regelversion“, „erfüllt die Regel“.

**Unbedenklich als Fachbegriff:** Wenn „Kauf“ oder „Verkauf“ ein Ereignis Dritter beschreibt, ist das in Ordnung, z. B.
„Insider-Kauf (Form 4)“, „Fonds hat verkauft (13F)“, „die Firma kauft eigene Aktien zurück“. Dasselbe gilt für
Erklärungen wie „KGV: wie viele Jahresgewinne du beim Kauf bezahlst“ und für „sicher“ im technischen Sinn.

## Pflicht-Hinweise (zentrale Datei)

`assets/legal-notices.json`: Das Frontend liest die Texte dort und kopiert sie nicht. Schlüssel:

| Schlüssel | Wo |
|---|---|
| `footer` | Seitenfuß jeder Seite |
| `stock` | Aktienseiten (Quant, Fundamental, Discover, Technical, Supertrader-Aktie) |
| `ranking` | Ranglisten, Screener-Treffer, Kandidatenlisten |
| `backtest` | jede Backtest-, Trefferquoten- oder Renditekurven-Ansicht; Label `labels.research`; Pflichtangaben `required` |
| `modelPortfolio` | Musterdepots, Hausstrategie, Modellpositionen |
| `setup` | Regel-Ergebnisse mit Zonen (Quant-Setup-Karte, Supertrader-Stufen, Technical-Zonen); `forbidden` listet, was dort nicht stehen darf |
| `thirdParty` | Analysten-Konsens, Kursziele Dritter, 13F, Form 4 |
| `ai` | AI Atlas und KI-Texte |
| `editorial` | Magazin, Morning, News, Social-Beiträge |

Jeder Hinweis nennt in `links` die Rechtsseiten (`risikohinweise`, `methodik`, …). Die Adressen stehen in `links`.
Status `entwurf`, `legalApproved: false`. Die Texte sind Entwürfe bis zur Prüfung durch einen Anwalt.

## Pflicht-Verlinkungen in der App

Rechtstexte liegen auf der Webseite (`konto.visionuniverse.de/rechtliches/…`). Die App (Web-App, Android, iOS) enthält
keine eigenen Rechtstexte, nur Links. Maschinenlesbar: `assets/legal-notices.json` → `appLinks`.

| Link | Wann | Warum |
|---|---|---|
| Impressum | immer | § 5 DDG: leicht erkennbar, unmittelbar erreichbar, ständig verfügbar. In der App aus jedem Bereich mit höchstens zwei Schritten erreichbar (z. B. Menü → Rechtliches). |
| Datenschutz | immer | Art. 12, 13 DSGVO. Apple (App Store Review Guideline 5.1.1) und Google Play (Richtlinie „User Data“) verlangen den Link in der App und im Store-Eintrag. |
| Nutzungsbedingungen | immer; zusätzlich an der Zustimmung bei der Registrierung | Einbeziehung nach § 305 Abs. 2 BGB |
| Risikohinweise | immer (Seitenfuß und Menü) | Owner-Linie Plan §11 |
| Verträge hier kündigen | sobald ein Abo in der App abgeschlossen werden kann | § 312k BGB |
| Vertrag widerrufen | sobald ein Abo in der App abgeschlossen werden kann | § 356a BGB |
| Methodik, Quellen und Interessen | optional, aus Ergebnisansichten | Offenlegung, Vorsorge nach Art. 20 MAR |

Store-Pflichten, die keine Rechtstexte sind:
- „Konto löschen“ muss in der App erreichbar sein, wenn ein Konto in der App angelegt werden kann (Apple 5.1.1(v),
  Google Play).
- Datenschutz-URL und Anbieterangaben gehören auch in den Store-Eintrag.

Heute verkauft die Android-Testversion nichts (`app/www/index.html`); Registrierung und Abo laufen im Web. Die Links
„Kündigen“ und „Widerrufen“ sind in der App deshalb erst nötig, wenn dort gekauft werden kann.
