# Website 2 (Vorschau)

Die vom Owner am 14.11.2026 freigegebene Gestaltung „Website-Mock-up 3“ als echte Seiten: hell, app-artig, bewegt (Kopfbild mit kreisenden Modul-Symbolen, Kennzeichen-Grafik je Modul, Menü als Fläche, Leiste unten auf dem iPhone). Vorschau im geschützten Bereich: **https://research.visionuniverse.de/website2/** (Passwortmaske beim Ausrollen, `noindex`, nicht im App-Menü). Der Umzug auf www.visionuniverse.de ist ein eigener Schritt nach der Durchsicht durch den Owner. `/website/` (Gestaltung „Bühne und Beweis“) bleibt daneben unverändert bestehen.

## Seiten

`/website2/` Start · `/website2/app/` · `/website2/module/<id>/` für die zwölf Module (discover, screener, atlas, fundamental, quant, technical, elliott, supertrader, hedgefonds, portfolios, vorsorge, insights) · `/website2/news/` · `/website2/magazin/` · `/website2/faq/`. Zusammen 17 Seiten, verbunden durch gewöhnliche Links; alle Seiten sind ohne JavaScript bedienbar.

## Regeln

Es gelten die Regeln von `/website/` (`products/website/README.md`). Was hier anders gelöst ist:

- **Aufruf „Zum Start benachrichtigen“:** wie auf `/website/` ein Link zur bestehenden Anmeldung `https://www.visionuniverse.de/#newsletter` (Brevo nimmt nur Anfragen von der eigenen Domain an). Das E-Mail-Feld aus dem Mock-up ist deshalb ein Knopf mit dem Hinweis „Anmeldung auf www.visionuniverse.de“. Nach dem Umzug auf www kommt das Feld direkt in die Seite (Test W2-4).
- **Rechtliches:** Pflichtsatz und Rechtslinks aus `assets/legal-notices.json` stehen wie auf ganz research nur im Menü unter „Rechtliches & Infos“ (Owner 10.11.2026, `core/tests/legal-notices-frontend.test.mjs`), hier unten im Menü „Module“. Der Fuß verlinkt `/infos/`. Der Rechtsfuß aus dem Mock-up entfällt dafür (Test W2-6).
- **Store-Knöpfe:** die Originaldateien von `/website/img/` in Farbe, ohne Link, mit „Bald verfügbar“ daneben, im Kopfbild und im Abschluss jeder Seite (Test W2-8).
- **Insights aktualisiert sich selbst:** `site.js` liest bei jedem Aufruf `/insights/artikel.json`, wie `/website/`. Die News-Seite zeigt daraus den neuesten Artikel groß und fünf weitere, den neuesten Aktienreport und das neueste Aktienmagazin; die Startseite den neuesten Artikel und das Titelbild. Lässt sich die Liste nicht laden, bleibt der feste Text stehen und führt zu `/insights/` (Test W2-9).
- **Aktienmagazin:** Die Seite zeigt fest Heft Nr. 01 (`HEFT` in `build.mjs`, Titelbild und Seiten aus `/insights/magazin/nr-01/`) und führt zur echten Ausgabe und zum PDF. Steht in `/insights/artikel.json` ein neueres Heft, setzt `site.js` dessen Nummer, Titel, Titelbild, Seiten und Links ein (Dateinamen nach `products/insights/build.mjs`).
- **Aktienreports:** Im Mock-up stand „Der erste Aktienreport ist in Arbeit“. Der erste Report ist seit 12.11.2026 erschienen; die Seiten nennen deshalb den neuesten Report aus der Liste und sonst nur „Ausführliche Analysen einzelner Firmen“.
- **Fuß:** Aus dem Mock-up fehlen „Videos“ und „Über uns“, weil es dafür in dieser Vorschau keine Seiten gibt.
- Sammelwort im Menü ist hier „Module“ (Mock-up), in Überschriften weiter „Bereiche“.

## Bauen

```bash
node products/website2/build.mjs          # schreibt website2/<seite>/index.html
node --test "products/website2/tests/*.test.mjs"
```

Die HTML-Seiten entstehen nur aus `build.mjs`, nie von Hand ändern. Handarbeit sind `website2/site.css`, `website2/site.js`, `website2/img/` (Ansichten des freigegebenen App-Konzepts, noch nicht die laufende App; Standbilder der Modul-Filme) und `website2/vid/app.mp4` (App-Konzept in Bewegung, ohne Ton). Alles andere wird mitbenutzt statt kopiert: Modul-Filme `/assets/stories/<id>-v1.mp4`, Symbole `/assets/product-icons.svg`, Schrift `/assets/fonts/inter-latin.woff2`, Store-Knöpfe `/website/img/`, Heft `/insights/magazin/`.

Bewegung: Wer im Gerät „Bewegung reduzieren“ eingestellt hat, sieht alles ohne Animation; der Film im Kopf bleibt dann als Standbild stehen.
