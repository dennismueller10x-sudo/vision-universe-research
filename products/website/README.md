# Website (Vorschau)

Neue öffentliche Produktseite von Vision Universe, Variante „Kino K1“ (Owner 12.11.2026). Vorschau zuerst im geschützten Bereich: **https://research.visionuniverse.de/website/** (Passwortmaske beim Ausrollen, `noindex`, nicht im App-Menü). Der Umzug auf www.visionuniverse.de ist ein eigener Schritt.

## Seiten

`/website/` Start · `/website/funktionen/` und je Modul `/website/funktionen/<modul>/` (11 Module) · `/website/insights/` (neueste Artikel live aus `/insights/artikel.json`, Aktienmagazin, Aktienreports) · `/website/fuer-wen/` · `/website/videos/` · `/website/app/` · `/website/daten/` · `/website/ueber-uns/` · `/website/kontakt/` · `/website/faq/`.

## Regeln

- App noch nicht verfügbar: nirgends ein Link in die App oder in einen Store, überall „App bald verfügbar“. Der einzige Aufruf ist der Newsletter. Er führt zur bestehenden Anmeldung auf `https://www.visionuniverse.de/#newsletter`, weil die Brevo-Anmeldung nur Anfragen von der eigenen Domain annimmt. Nach dem Umzug auf www kommt das E-Mail-Feld direkt in die Seite.
- Social Media nur Instagram und TikTok (`@app.visionuniverse`, laut `docs/publishing/HANDBUCH.md`).
- Preise ausgeblendet. Wortwahl nach `docs/legal/WORTWAHL.md`. Pflichtsatz und Rechtslinks aus `assets/legal-notices.json` stehen wie auf ganz research nur im Menü unter „Rechtliches & Infos“ (Owner 10.11.2026, Test `core/tests/legal-notices-frontend.test.mjs`), der Fuß verlinkt `/infos/`. Auf www kann ein eigener Rechtsfuß dazukommen.
- Die Startseite zeigt die Unterseiten prominent: Schnellzugriff unter dem Helden und der Abschnitt „Alles über Vision Universe“.

## Bauen

```bash
node products/website/build.mjs          # schreibt website/<seite>/index.html
node --test "products/website/tests/*.test.mjs"
```

Die HTML-Seiten entstehen nur aus `build.mjs`, nie von Hand ändern. `website/site.css`, `website/site.js` und `website/img/` (echte App-Screens vom 11.11.2026, Kino-Bilder aus `brand-media/werbetrailer/keyframes/`, verkleinert) sind Handarbeit. Videos kommen aus `landing/partner/media/`.
