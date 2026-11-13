# Website (Vorschau)

Neue öffentliche Produktseite von Vision Universe. Startseite „Das Plakat“ (Dirigenten als Standbild, kein Film im Kopf) und Gestaltung „Bühne und Beweis“ für alle Seiten (Owner 13.11.2026): Schwarz ist die Bühne (Auftritt), Weiß der Beweis (helle App, Zahlen, Texte), Neongrün der eine Knopf. Vorschau zuerst im geschützten Bereich: **https://research.visionuniverse.de/website/** (Passwortmaske beim Ausrollen, `noindex`, nicht im App-Menü). Der Umzug auf www.visionuniverse.de ist ein eigener Schritt.

## Seiten

`/website/` Start · `/website/funktionen/` („Produkt“, elf Bereiche in vier Absichten) und je Bereich `/website/funktionen/<bereich>/` · `/website/insights/` · `/website/fuer-wen/` · `/website/videos/` · `/website/app/` · `/website/daten/` · `/website/ueber-uns/` · `/website/kontakt/` · `/website/faq/`.

## Regeln

- App noch nicht verfügbar: nirgends ein Link in die App oder in einen Store. Der eine Aufruf heißt „Zum Start benachrichtigen“ und führt zur bestehenden Anmeldung auf `https://www.visionuniverse.de/#newsletter`, weil die Brevo-Anmeldung nur Anfragen von der eigenen Domain annimmt. Nach dem Umzug auf www kommt das E-Mail-Feld direkt in die Seite.
- Store-Knöpfe (Owner 13.11.2026): die Originaldateien von Apple und Google in der deutschen Fassung (`website/img/badge-apple.svg`, `badge-google.png`), unverändert, auf jeder Seite. Bis zum Start ohne Link und mit „Bald verfügbar“ daneben (Test WEB-8). Vor dem Umzug auf www prüfen, ob beide Stores die Knöpfe vor dem Start erlauben; sauber ist eine Vorbestellung im App Store und eine Vorregistrierung bei Google Play.
- Insights aktualisiert sich selbst (Owner 13.11.2026): Startseite und `/website/insights/` lesen bei jedem Aufruf `/insights/artikel.json` und zeigen den neuesten Artikel, das neueste Aktienmagazin (`magazin[0]`) und den neuesten Aktienreport (`reports[0]`). `products/insights/build.mjs` schreibt Heft und Reports dafür mit in die Liste. Ohne Report steht dort „Der erste Aktienreport ist in Arbeit.“ (Test WEB-9).
- Social Media nur Instagram und TikTok (`@app.visionuniverse`, laut `docs/publishing/HANDBUCH.md`).
- Preise ausgeblendet. Wortwahl nach `docs/legal/WORTWAHL.md`. Pflichtsatz und Rechtslinks aus `assets/legal-notices.json` stehen wie auf ganz research nur im Menü unter „Rechtliches & Infos“ (Owner 10.11.2026, Test `core/tests/legal-notices-frontend.test.mjs`), der Fuß verlinkt `/infos/`. Auf www kann ein eigener Rechtsfuß dazukommen.
- Die Startseite führt zu jedem Bereich („Was willst du wissen?“) und zu den Unterseiten. Sammelwort ist „Bereiche“, nicht „Module“.

## Bauen

```bash
node products/website/build.mjs          # schreibt website/<seite>/index.html
node --test "products/website/tests/*.test.mjs"
```

Die HTML-Seiten entstehen nur aus `build.mjs`, nie von Hand ändern. `website/site.css`, `website/site.js` und `website/img/` (echte App-Screens vom 11.11.2026, Desktop-Aufnahme von Quant vom 12.11.2026, Kino-Bilder aus `brand-media/werbetrailer/keyframes/`, verkleinert) sind Handarbeit. Videos kommen aus `landing/partner/media/`.
