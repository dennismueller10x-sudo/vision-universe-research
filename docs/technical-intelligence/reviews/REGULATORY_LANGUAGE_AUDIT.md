# Regulatorisches Sprachaudit (Mission IV)

**Status: LEGAL REVIEW REQUIRED.** Dieses Audit ist eine technische Wortprüfung, keine juristische Bewertung. Eine Prüfung durch einen Juristen (MAR Art. 20 / Anlageempfehlung, MiFID II Anlageberatung, WpHG) hat nicht stattgefunden.

## Geprüft (03.10.2026)

Dateien: `quant/app/page-chartbild.js`, `quant/app/pages.js`, `quant/app/page-stock.js`, `quant/app/page-method.js`, `quant/app/view-model.js`, `quant/app/app.js`, `quant/engines/technical/ti/explain.js`, `quant/engines/technical/ti/ai-tools.js`, `ask/app.js`, `ask/engine.js`, `discover/ui/detail.js`, Screener-Feldtexte (`screener/engine/fields.js`).

Gesucht: kaufen/verkaufen, Kauf-/Verkaufssignal, Empfehlung, garantiert, sicherer Gewinn, „wird steigen/fallen“, Prognose, Wahrscheinlichkeit, Kursziel, Einstieg, Stop-Loss.

## Befund

| Begriff | Fundstellen | Verwendung | Bewertung |
|---|---|---|---|
| Kaufsignal / Kaufempfehlung / Empfehlung | Chartbild, Ask, Methodik | ausschließlich verneinend („keine Empfehlung“, „Kein Filter ist ein Kaufsignal“) | unkritisch |
| Prognose / Wahrscheinlichkeit | Chartbild, Ask, ai-tools | verneinend oder erklärend („keine Wahrscheinlichkeit“, „Einigkeit der Verfahren, nicht wie wahrscheinlich“) | unkritisch |
| Kursziel | app.js, page-stock.js, pages.js, view-model.js | nur verneinend („kein Kursziel“) | unkritisch |
| **Einstiegszone, Ziel 1/2, Invalidation, Bestätigung** | Chartbild-Szenarien, Alerts, Ask-Werkzeug | szenariobezogene Kursniveaus mit Bedingung („wenn … dann“), Disclaimer auf jeder Szenario-Ansicht | **juristisch zu prüfen**: Die Begriffe „Einstiegszone“ und „Ziel“ können als handlungsbezogene Anlageempfehlung gelesen werden (MAR Art. 3 Abs. 1 Nr. 35: Empfehlung oder Vorschlag einer Anlagestrategie). Alternativen zur Prüfung: „Reaktionszone“, „Projektionszone“ |
| Watchlist-Ereignisse | Quant-Startseite | „Kurs hat die Einstiegszone des Hauptszenarios erreicht“ | wie oben; zusätzlich zu prüfen, ob personalisierte Ereignisse eine Anlageberatung nahelegen |
| VU Ask | Ask | Fragen „soll ich kaufen“, „wird sie steigen“ werden als Prognosefrage abgelehnt; das Chartbild-Werkzeug liefert strukturierte Werte mit Status „experimentell“ und Haftungshinweis | unkritisch in der Formulierung; juristische Einordnung offen |

Keine Formulierung verspricht Ertrag, Sicherheit oder Treffer. Die Elliott-Schicht wird überall als experimentell und nicht expert-validiert bezeichnet; die Methodikseite nennt das nicht bestandene Qualitäts-Gate. Vision Universe behauptet nicht, Elliott automatisiert zu haben.

## Offen

* Juristische Prüfung der Szenario-Begriffe und der personalisierten Watchlist-Ereignisse vor einem öffentlichen Start — **LEGAL REVIEW REQUIRED** (externe Abhängigkeit).
