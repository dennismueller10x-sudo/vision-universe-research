# Website (www.visionuniverse.de und Vorschau /website2/)

Die vom Owner am 14.11.2026 freigegebene Gestaltung „Website-Mock-up 3“ als echte Seiten: hell, app-artig, bewegt (Kopfbild mit kreisenden Modul-Symbolen, Kennzeichen-Grafik je Modul, Menü als Fläche, Leiste unten auf dem iPhone). Ein Erzeuger (`build.mjs`), zwei Ziele:

- **www:** die öffentliche Seite **https://www.visionuniverse.de/** (Owner 14.11.2026: „umsetzen, live nehmen“). Cloudflare Pages baut nur aus `landing/`; der Erzeuger schreibt deshalb die Seiten und alle nötigen Dateien als committete Dateien dorthin (`landing/index.html`, `landing/app/`, `landing/module/`, `landing/news/`, `landing/magazin/`, `landing/faq/`, `landing/site/`). `landing/scripts/build.mjs` setzt beim Bau Content-Security-Policy, Versionsmarken und den Zustand des Anmeldeformulars. Impressum, Datenschutz, Newsletter-Seiten, `/instagram/` und `/partner/` bleiben unverändert unter ihren Adressen.
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
- **News (Owner 14.11.2026: „Aktienreport und Magazin gehen noch unter“):** `news/` beginnt mit zwei Bühnen nebeneinander, schwarz das Aktienmagazin, grün der Aktienreport, je mit großem Titelbild, Nummer, Titel, Seitenzahl und Knopf; darunter die Artikel (neuester groß, fünf weitere als Raster) und ein Blick in den Report. Die Startseite zeigt im Block „Insights“ neuesten Artikel, Heft und Report nebeneinander (Test W2-15).
- **Aktienreport:** Fest eingebaut ist Nr. 01 „Take-Two Interactive: Alles auf Vice City“ (`REPORT` in `build.mjs`; Angaben aus `products/insights/reports.json`, Bilder und PDF unter `/insights/reports/take-two-gta-6/`). Die Seiten nennen nur, was der Report selbst trägt: Titel, Datum, Titelbild, Seitenzahl. Erscheint ein neuerer Report, rückt er in der Vorschau von selbst nach (`site.js`, erster Eintrag `reports` in `/insights/artikel.json`); für www kommt er mit dem nächsten Auszug. `REPORT` und `bilder.py` dann nachziehen, damit auch der feste Stand und die kleinen Bildfassungen stimmen.
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

## Ladezeit

Regeln, die Test W2-16 festhält (gemessen mit Playwright, Telefonprofil 4× CPU, 150 ms, 1,6 Mbit/s):

- **Film im Kopf:** Im HTML steht nur das Standbild (`preload="none"`, kein `autoplay`). `site.js` startet den Film erst, wenn die Seite geladen und der Browser frei ist, und nur solange er zu sehen ist; nicht bei „Bewegung reduzieren“, im Datensparmodus oder auf 2G. Modul-Filme laden erst beim Antippen.
- **Bilder:** App-Ansichten, Titelbilder und Heftseiten kommen als kleine WebP-Fassung über `<picture>`, das JPEG bleibt Rückfall. `python3 products/website2/bilder.py` erzeugt die Fassungen nach `website2/img/` (Pillow, läuft nicht in der CI; der Erzeuger nimmt eine Fassung nur, wenn die Datei da ist). Jedes Bild trägt Breite und Höhe; nur das größte Bild im ersten Fenster lädt sofort und mit Vorrang (`fetchpriority="high"`), alle anderen `loading="lazy"`.
- **Bewegung:** Kreisende Symbole, Laufband und Kennzeichen-Grafiken ruhen, solange sie außerhalb des Fensters liegen (`.idle`).
- **Liste der Artikel (nur Vorschau):** `news/` fordert `/insights/artikel.json` vorab an (`<link rel="preload">`), weil der Aufmacher davon abhängt. Alle anderen Seiten holen die Liste erst nach dem Laden. Steht das fest eingebaute Heft oder der fest eingebaute Report noch vorn, tauscht `site.js` keine Bilder.
- Die Passwortmaske von research kostet je Aufruf zwei zusätzliche Abrufe nacheinander (`access.js`, dann der Inhalt); www hat sie nicht.
