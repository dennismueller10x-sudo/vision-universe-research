# Klarheit 2027: Usability-Prüfung und Umbauvorlage

Stand 08.11.2026. Prüfung der ganzen App aus Kundensicht (390 × 844 und Desktop, lokaler Abzug von `main`) mit
Mockup-Präsentation für den Umbau. Baut auf [`../redesign-2027/`](../redesign-2027/README.md) (Design, Bausteine) und
[`../../publishing/konzept-2026-11/`](../../publishing/konzept-2026-11/README.md) (Druckformate) auf und ersetzt keine der beiden.
Nichts hier ändert Daten, Engines, Fachmodelle oder Gates; `docs/` wird nicht ausgeliefert.

Lokal ansehen: `python3 -m http.server 8090` im Repo-Wurzelverzeichnis, dann `http://localhost:8090/docs/design/klarheit-2027/`.

| Datei | Zweck |
|---|---|
| `index.html` | Präsentation (39 Folien): Befund, Prinzip, 12 Mockups, Formate, Lücken, Umbauplan |
| `now/*.jpg` | echte Aufnahmen der App vom 08.11.2026 (390 × 844, 2×) |

## Kernbefund

Das Design ist schlüssig. Die App ist aber nach **Herstellung** sortiert (Quant, Supertrader, Technical, Elliott …),
nicht nach **Kundenfrage**. 23 Einstiege im Menü, vier Stellen für Chart-Regeln, drei Dashboards. Jede Seite ist für
sich gut erklärt; unklar ist, wohin man gehen soll.

**Vorschlag:** fünf Bereiche überall gleich in Leiste und Menü: **Heute · Aktien · Ideen · Vermögen · Wissen**.
Die Produktmarken bleiben als Prüfsiegel auf der Aktienseite („Was andere Checks sagen“) und unter „Alle Werkzeuge“.

Der Satz für jede Erklärung: *Vision Universe ist deine Börsen-Zentrale: Wir prüfen jeden Tag jede Aktie und jeden
ETF und sagen dir in klaren Worten, was du wissen musst, bevor du bei deinem Broker entscheidest.*

## Schritt 1: Sofort-Korrekturen (keine Owner-Freigabe nötig)

| Befund | Wo | Soll |
|---|---|---|
| „Einstiegsmarke“, „Stopp-Marke“, „Zielzone“ (WORTWAHL verbietet alle drei) | Quant-Start, Karte „Setup bestätigt“ (`quant/app/pages.js`) | „Zone laut Methode“, „Ungültig-Marke laut Methode“, kein Ziel |
| „Was dafür spricht, was dagegen“ | Aktienseite (`discover/ui/detail.js`) | „Stärken und Schwächen laut Kennzahlen“ |
| „Signale“ als Leisten- und Listenname | Supertrader, Startseite | „Heute erfüllt“ / „Regel-Ergebnisse“ |
| „Ø Kurspotenzial“ | `/analysten/` | „Abstand zum mittleren Analysten-Kursziel (Angabe Dritter)“ |
| „Sechs Eigenschaften je Aktie“ | Quant-Start | sieben, eine davon derzeit nicht messbar (Erwartungstrend) |
| Rote Minus-Pille, überlappende Kursbeschriftung, Euro ohne Hinweis | Aktienseite Kopf | schwarze Pille, Dollar zuerst mit Euro-Umrechnung |
| Zwei Gewinnbegriffe ohne Namen („64 % … Gewinn“ vs. „Nettomarge 55,6 %“) | Aktienseite | Begriff nennen (operative Marge / Nettomarge) |
| Eigene Zahlenquelle (KGV 28,98, Stand 05.09.) und Entwickler-Status | `/guide/` | aus dem Menü nehmen |
| „Älterer Bereich“, „In Aufbau“ im Menü | `/dashboard/`, `/budget/` | aus dem Menü nehmen |
| Entwicklertexte („data/config.json“, „Concept Registry“, „Phase 1“) | `/macro/`, `/academy/` | entfernen |
| „+88.5%“ | `/etf/` | „+88,5 %“ |
| ETF-Anzahl 7.000+ / 4.065 / 91 | Startseite, Vorsorge, ETF | eine Zahl mit Erklärung |

## Schritte 2 bis 4

2. **Erklären:** Startseite (M01), Wörterbuch, Aktienseite mit „Das Wichtigste in 3 Sätzen“ und 5 Checks (M04),
   Erklär-Blätter aus einer Begriffs-Quelle (M05), Quant-Start mit sieben Fragen (M07), Supertrader-Steckbriefe (M08),
   erster Start mit Startplan (M02).
3. **Umsortieren:** fünf Bereiche (M12), „Heute“ ersetzt Willkommen/Dashboards/Morning/News (M03), „Ideen“ bündelt
   Listen und Methoden (M06), „Wissen“ mit Weekly, Report AMD und Guides 01–03 (M11); alte Adressen leiten weiter.
4. **Ausbauen:** UCITS-ETFs mit ISIN und Broker-Checkliste (M09), Depot-Check lokal per CSV (M10), Alarme,
   Termin-Kalender, EU-Aktien.

## Owner-Entscheidungen (Geld, Recht)

Pro-Wert (was Pro zusätzlich bekommt) · Broker-Links mit oder ohne Vergütung · Presseprivileg für Weekly und Reports
(Anwalt) · Depot-Check als Analyse-Software (Anwalt) · Atlas freischalten (Kosten).

## Nicht bewertet

Screener und Elliott luden im lokalen Abzug keine Daten (Datenzweig). Konto- und Bezahlseiten wurden nur gelesen,
nicht durchlaufen.
