# Produkte 2027: zehn Produkte, jedes mit einem Auftrag

Stand 08.11.2026. Zweite Fassung der Usability-Prüfung nach Owner-Rückmeldung: **Die Produkte bleiben.** Statt sie in
Bereichen aufzulösen (erste Fassung `../klarheit-2027/`), bekommt jedes Produkt einen klaren Auftrag, Doppelungen
bekommen einen Besitzer, und die Produkte reichen sich den Kunden weiter. Nichts hier ändert Daten, Engines,
Fachmodelle oder Gates; `docs/` wird nicht ausgeliefert.

Ansehen: `python3 -m http.server 8090` im Repo-Wurzelverzeichnis, dann `http://localhost:8090/docs/design/produkte-2027/`.
Bauen nach Änderungen an `body.html`, `slides.js` oder `extra.css`: `python3 docs/design/produkte-2027/build.py`
(übernimmt Stil und Symbole aus `../klarheit-2027/index.html` und `assets/product-icons.svg`).

## Kern

**Was kann ich mit der App machen?** Zehn Tätigkeiten, je ein Produkt:

| Schritt | Produkt | Tätigkeit (Zeile im Menü und auf der Produkt-Startseite) |
|---|---|---|
| Finden | Discover | Aktien zu einem Thema entdecken |
| Finden | Screener | Eigene Kriterien kombinieren |
| Finden | Hedgefonds | Buffett & Co. ins Depot schauen |
| Prüfen | Fundamental | Prüfen, ob die Firma Geld verdient |
| Prüfen | Quant | Aktien in 7 Eigenschaften vergleichen |
| Prüfen | Technical | Den Chart in Worten lesen |
| Prüfen | Elliott | Wellen lesen, mit klarer Grenze |
| Verfolgen | Supertrader | Regeln berühmter Trader verfolgen |
| Verfolgen | Portfolios | Musterdepots ohne echtes Geld ansehen |
| Vorsorgen | Vorsorge | Sparplan und Rente ausrechnen |

**Gerüst jeder Produkt-Startseite:** ein Satz · „Hier kannst du“ mit drei Tätigkeiten · das Kernstück · „Weiter mit“.

## Besitzer (gegen Doppelungen)

| Sache | Heute | Besitzer |
|---|---|---|
| Jahreshochs | Discover 245, Quant 123, Technical 59 | Technical |
| Marktbreite | Quant 35 %, Technical 34 % | Technical |
| Chart-Setups mit Zonen | Quant, Technical, Supertrader | Technical (Muster), Supertrader (Methoden) |
| Screener | Screener, Quant, Technical | Screener (andere öffnen ihn vorbelegt) |
| Fertige Listen | Discover 23, Quant, Technical 13, Fundamental 6 | nach Datenart; Discover zeigt als Schaufenster |
| Musterdepots | Quant, Supertrader, Portfolios | Portfolios |
| ETFs | Vorsorge 4.065, ETF-Dashboard 91 | Vorsorge |
| Analysten (Angabe Dritter) | eigene Seite | Hedgefonds (Reiter) |

„Weitere Produkte“ von 11 auf 3: News (mit Morning), Bibliothek (Magazin, Reports, Guides, Academy), Macro.
Dashboard (alt) und Guide entfallen, Budget bleibt ausgeblendet bis fertig.

## Reihenfolge (je ein PR, grüne CI genügt)

1. Sofort-Korrekturen (Liste in `../klarheit-2027/README.md`)
2. Menü und Startseite (vier Schritte, Tätigkeit je Produkt)
3. Gerüst „Hier kannst du“ als Baustein, dann je Produkt
4. Besitzer festlegen (ein Artefakt je Sache, Schnittstellen in `core/registry/product-contracts.json`)
5. Ein Screener
6. Brücken zwischen Produkten (Screener-Übergabe, Eigenschaften in jeder Liste)
7. „Weitere“ aufräumen

Owner-Entscheidung nur für Geld und Recht: welche Produkte oder Formate Pro werden, Presseprivileg für Magazin und Reports.
