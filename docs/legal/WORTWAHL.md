# Wortwahl im ganzen Produkt

Stand 05.11.2026, Strang F. **Keine Rechtsberatung.** Diese Regeln senken das Risiko, dass eine Seite wie eine persönliche
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
3. **Marken sind Rechenpunkte.** Einstiegsmarke, Stopp-Marke und Zielzone immer mit „der Methode“ und nie als Kursziel
   oder Prognose.
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
| Kursziel, Zielkurs, Kurspotenzial (eigene Werte) | Zielzone der Methode; Abstand zur Zielzone | Beurteilung des künftigen Kurses |
| Kursziel, Kurspotenzial (Werte Dritter) | „Kursziel (Angabe Dritter, Quelle, Datum)“, „Abstand zum mittleren Analysten-Kursziel“ | Weitergabe Dritter erkennbar machen |
| Kaufzone, Einstiegszone, Einstiegschance, Kaufgelegenheit | Einstiegsmarke der Methode; Zone der Methode | Chance-Wort wirkt auffordernd |
| „Interessant ab“ | „Einstiegsmarke der Methode“ | Wertung „interessant“ |
| Chance/Risiko | Abstand Zielzone / Abstand Stopp-Marke (Verhältnis der Methode) | „Chance“ wirbt |
| Stop-Loss setzen, „Stopp“ als Anweisung | Stopp-Marke der Methode; Ungültig-Marke | Anweisung |
| Einstieg bestätigt | Einstiegsregel erfüllt (Stand …) | Bestätigung an wen? |
| garantiert, sicher, risikolos | historisch, unter den genannten Annahmen | UWG, Irreführung |
| schlägt den Markt, Outperformer, Mehrrendite | im Backtest (Forschung) über / unter dem Vergleichsmaßstab (S&P 500 Gesamtrendite), Zeitraum | Renditeversprechen |
| Gewinner-Aktie, Top-Pick, Geheimtipp | stärkste Kursveränderung heute (Tagesbewegung); Rang nach Regel | Wertung |
| „Stärkste Gewinner/Verlierer“ (Tagesbewegung) | „Größte Anstiege/Rückgänge heute“ | wertet die Aktie statt den Kurs |
| unterbewertet, Schnäppchen, zu billig | niedrige Bewertung im Vergleich (Kennzahl nennen, z. B. KGV) | Beurteilung des Werts |
| spricht dafür / spricht dagegen | Stärken / Schwächen laut Kennzahlen | wirkt wie Abwägung zum Kauf |
| passt zu dir, für dein Depot, geeignet für dich | passt zu deinem Filter; erfüllt deine eingestellten Bedingungen | persönliche Empfehlung |
| Signal (allein) | Regelereignis der Methode „…“ (Regelversion) | Methode muss erkennbar sein |
| Konsens-Ranking (Analysten) | Übersicht der Analysten-Einstufungen (Angabe Dritter) | Bestenliste |
| „Was Profis kaufen“ | „Was große Fonds gemeldet haben (13F)“ | lädt zum Nachmachen ein |
| „🐂 oder 🐻?“ zu einer Einzelaktie (Reels) | nur mit Ersteller, Positionen und Link zu den MAR-Hinweisen | Social Media zählt (ESMA) |

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
| `signal` | Einstieg/Stopp/Ziel-Ansichten; Pflichtangaben `required` |
| `thirdParty` | Analysten-Konsens, Kursziele Dritter, 13F, Form 4 |
| `ai` | AI Atlas und KI-Texte |
| `editorial` | Magazin, Morning, News, Social-Beiträge |

Jeder Hinweis nennt in `links` die Rechtsseiten (`risikohinweise`, `marHinweise`, …). Die Adressen stehen in `links`.
Status `entwurf`, `legalApproved: false`. Die Texte sind Entwürfe bis zur Prüfung durch einen Anwalt.
