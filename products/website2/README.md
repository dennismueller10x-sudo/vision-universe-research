# Website (www.visionuniverse.de und Vorschau /website2/)

Die vom Owner am 14.11.2026 freigegebene Gestaltung „Website-Mock-up 3“ als echte Seiten: hell, app-artig, bewegt (Kopfbild mit kreisenden Modul-Symbolen, Kennzeichen-Grafik je Modul, Menü als Fläche, Leiste unten auf dem iPhone). Ein Erzeuger (`build.mjs`), zwei Ziele:

- **www (vorbereitet, noch nicht ausgeliefert):** Owner 14.11.2026: erst die Vorschau auf research ansehen, danach der Umzug auf **https://www.visionuniverse.de/**. Bis dahin ändert sich unter `landing/` nichts; die www-Dateien und ihre Prüfungen kommen mit dem Umzug dazu. Der Erzeuger kann das Ziel schon: Cloudflare Pages baut nur aus `landing/`; er schreibt deshalb die Seiten und alle nötigen Dateien als committete Dateien dorthin (`landing/index.html`, `landing/app/`, `landing/module/`, `landing/news/`, `landing/magazin/`, `landing/faq/`, `landing/site/`). `landing/scripts/build.mjs` setzt beim Bau Content-Security-Policy, Versionsmarken und den Zustand des Anmeldeformulars. Impressum, Datenschutz, Newsletter-Seiten, `/instagram/` und `/partner/` bleiben unverändert unter ihren Adressen.
- **research:** die Vorschau **https://research.visionuniverse.de/website2/** (Passwortmaske, `noindex`, nicht im App-Menü). `/website/` (Gestaltung „Bühne und Beweis“) bleibt daneben unverändert bestehen.

## Seiten

Start · `app/` · `module/<id>/` für die zwölf Module (discover, screener, atlas, fundamental, quant, technical, elliott, supertrader, hedgefonds, portfolios, vorsorge, insights) · `news/` · `magazin/` · `faq/`. Je Ziel 17 Seiten, verbunden durch gewöhnliche Links; alle Seiten sind ohne JavaScript bedienbar. Die Startseite führt im Inhalt zu jeder Unterseite, jede Unterseite zurück und weiter (Test W2-13).

## Regeln

- **Farben (Owner 14.11.2026):** nur Schwarz, Weiß, Grau und das eine Neongrün `#c8f531` (blass `#eef9cc` als Fläche). Kein Dunkel- oder Olivgrün. Grün ist Fläche hinter schwarzer Schrift (Marke, Balken, Punkt), als Schriftfarbe nur auf Schwarz (Tests W2-11, `landing/tests/site.test.mjs`, `landing/scripts/compare-research.mjs`).
- **App noch nicht verfügbar:** nirgends ein Link in die App oder in einen Store. Store-Knöpfe als Originaldateien in Farbe, ohne Link, mit „Bald verfügbar“. Keine Preise, keine Aussagen über Rendite. Wortwahl nach `docs/legal/WORTWAHL.md`.
- **Aufruf „Zum Start benachrichtigen“:** Auf www führt er zum Anmeldeformular der Startseite (`/#newsletter`). Das Formular ist wörtlich das freigegebene (`landing/newsletter-form.html`: Felder, Einwilligung `vu-newsletter-v1`, Zustände); der Erzeuger setzt es nur ein, `landing/scripts/build.mjs` schaltet es je nach Freigabe (`landing/NEWSLETTER.md`). In der Vorschau führt der Aufruf zur Anmeldung auf www, weil Brevo nur Anfragen von der eigenen Domain annimmt.
- **Rechtliches:** Der Fuß trägt wie die bisherige Startseite von www Impressum, Datenschutz, Kontaktformular und E-Mail. Der Pflichtsatz aus `assets/legal-notices.json` steht wie im ganzen Repository nur im Menü unter „Rechtliches & Infos“ (`core/tests/legal-notices-frontend.test.mjs`). Rechtstexte werden nie hier geändert.
- **Social Media:** nur Instagram und TikTok (`@app.visionuniverse`), als schlichte Links mit eigenem Symbol im Fuß und im Menü jeder Seite. Keine Einbettung.
- **Keine Anfrage an eine andere Adresse (www):** keine fremden Schriften, Einbettungen oder Laufzeit-Abrufe; Filme liegen auf www selbst (`landing/partner/media/`). Deshalb stehen Artikel, Heft und Report auf www fest in der Seite, aus dem Auszug `landing/site/insights.json`. Sie verlinken die öffentlich lesbaren Insights-Seiten auf research (`/insights/` ist ohne Passwortmaske, `scripts/access-gate/build.mjs`). In der Vorschau liest `site.js` weiter bei jedem Aufruf `/insights/artikel.json`.
- **Aktienreports:** Im Mock-up stand „Der erste Aktienreport ist in Arbeit“. Der erste Report ist seit 12.11.2026 erschienen; die Seiten nennen deshalb den neuesten Report.
- **Fuß:** Aus dem Mock-up fehlen „Videos“ und „Über uns“, weil es dafür keine Seiten gibt.
- Sammelwort im Menü ist „Module“ (Mock-up), in Überschriften weiter „Bereiche“.

## Bauen

```bash
node products/website2/build.mjs                 # Vorschau: schreibt website2/<seite>/index.html
node products/website2/build.mjs --target www    # www: frischt landing/site/ (Auszug, Bilder, CSS, JS) auf und schreibt landing/<seite>/index.html
node --test "products/website2/tests/*.test.mjs"
cd landing && npm test && npm run test:browser && npm run test:design   # Formular, Sicherheit, Browser (siehe landing/README.md)
```

Die HTML-Seiten entstehen nur aus `build.mjs`, nie von Hand ändern. Handarbeit sind `website2/site.css`, `website2/site.js`, `website2/img/` (Ansichten des freigegebenen App-Konzepts, noch nicht die laufende App; Standbilder der Modul-Filme) und `website2/vid/app.mp4` (App-Konzept in Bewegung, ohne Ton). `landing/site/` ist deren Kopie für www und gehört dem Erzeuger (Test W2-14).

**Neue Artikel auf www:** Nach jedem neuen Artikel, Heft oder Report `node products/website2/build.mjs --target www` ausführen und mit committen; der Insights-Tageslauf tut das noch nicht von selbst (offene Entscheidung). Ist der Auszug älter als `/insights/`, meldet Test W2-14 das als Hinweis, ohne zu blockieren.

Bewegung: Wer im Gerät „Bewegung reduzieren“ eingestellt hat, sieht alles ohne Animation; der Film im Kopf bleibt dann als Standbild stehen.
