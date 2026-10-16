# Vision Universe · Coming soon

Newsletter öffentlich seit 16.10.2026: konkrete Datenschutzfassung freigegeben, DOI und deutsche Abmeldung tatsächlich abgenommen. [Erfolgreiche öffentliche Freischaltung](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38903721680), anschließend Hauptdomain ohne Testlink geprüft. Tracking **Ja / unbekannte Zustimmung Nein**; Aufbewahrung und Vorschauenspeicherung ohne erfundene Zusagen dokumentiert. Kein Newsletter an den Bestand.

Isolierte Coming-soon-Seite für **https://www.visionuniverse.de/**. Die aktuelle Designüberarbeitung ist ausschließlich zur PR-Abnahme vorbereitet, **nicht veröffentlicht**. Original-Logo, Inter-Datei, Modul-Icons und Research-Basis-CSS bleiben erhalten. Landing-eigene Regeln entwickeln Typografie, Gerätekomposition und Karten weiter; Research selbst wird nicht verändert. Der Claim lautet exakt „Investieren mit Weitblick. Alles in einer App.“ mit grünem „Weitblick.“. Desktop-Modulübersicht und iPhone mit bestehender Discover-Bedienvorschau stehen getrennt und ohne Überdeckung: am Desktop nebeneinander, mobil untereinander. Beide sind als **Konzeptansicht** gekennzeichnet. Keine Kurse, Renditen oder erfundenen Kennzahlen.

Mobil folgen auf den Hero zuerst die Modulübersicht und dann die Swipe-Vorschau; Newsletter-Nutzen und Formular stehen danach. Der Hero-CTA führt weiterhin direkt zum Formular. Footer, Impressum, freigegebener Datenschutz und eigene Bestätigungs-/Fehlerseiten verwenden dieselbe dunkle Gestaltung. Rechtstexte, Linkziele, Einwilligung, Backend und Laufzeitfreigaben werden nicht geändert. Kein Mailtest und kein Versand durch diesen PR.
## Discover-Swipe-Vorschau

Der Build erzeugt für die eigene `styles.css`, `legal.css` auf allen Rechts-/Bestätigungsseiten, `presentation.js` und das Swipe-Skript automatisch eine inhaltsabhängige Versionskennung in der URL. So laden auch wiederkehrende Besucher die zum neuen HTML passenden Dateien. Der Browsertest primt bewusst eine alte, lange gecachte Styles-Datei und prüft anschließend die neue mobile Ansicht ohne deaktivierten HTTP-Cache in Chromium/WebKit. Die Touch-Richtung wird auch direkt an den scrollbaren Karten gesetzt: horizontal selbst swipen, vertikal normal scrollen, Pinch-Zoom zulassen. Ein zusätzlicher Chromium-Fall erzeugt vertrauenswürdige Touch-Ereignisse über das Browserprotokoll und prüft beide Wischrichtungen sowie vertikales Scrollen ohne Merken. Keine Cloudflare-Cache- oder DNS-Einstellung geändert.

Das vorhandene Karten-Design aus Research **„Swipen statt suchen“** steckt in der ursprünglichen Hero-Handyhülle. Kein zusätzlicher langer Seitenabschnitt. [Herkunft und Abgrenzung](reference/discover-swipe-source.json): Originalklassen `.deck`, `.card`, `.deck-actions`, bestehende lokale Research-CSS und eine isolierte Anpassung der dortigen Pointer-Bedienung. AMD, Apple und Microsoft samt Kurzbeschreibung stammen aus dem geprüften Repository-Markup; keine finanziellen Momentaufnahmen oder Live-Kennzeichnung übernommen.

Links weiter, rechts merken; Buttons und Pfeiltasten ebenfalls möglich. Keine automatische Auswahl. Der Merkzähler zählt jedes Beispielunternehmen höchstens einmal und bleibt ausschließlich im Arbeitsspeicher bis zum Neuladen; **Zurücksetzen** leert ihn. Abgebrochene Gesten und vertikales Scrollen merken nichts. Keine Netzwerkanfragen, Speicherung, Cookies oder Analyse durch das Modul. Ohne JavaScript bleibt die originale Modulübersicht sichtbar. Orbit, schwebende Zusatzkarten und die lange Intro-Animation werden auf der kompakten Landingpage nicht mehr verwendet. Die Geräte bleiben während der Bedienung ruhig.

`module-preview.mjs` erhält die Vorschau bei einer erneuten Research-Übernahme. Seitenlängen-, Reflow-, Formular- und Barrierefreiheitsgrenzen bleiben erhalten. Die frühere Prüfung auf pixelgleiche Research-Hero-Geometrie wird entsprechend dem neuen Gestaltungsauftrag durch konkrete Design-Verträge ersetzt: Originaldateien unverändert, wortgleicher Claim, grüner Akzent, CTA im ersten Viewport, getrennte Vorschauen ohne Überdeckung und Newsletter danach, dunkle Rechtsseiten und unveränderte Rechtstexte/Linkziele. Ergänzte Browserfälle prüfen Button/Geste/Tastatur, Abbruch, Duplikate, Zurücksetzen, Neuladen und anschließende öffentliche Formularübermittlung mit ausschließlich synthetischen Daten in Chromium/WebKit. Der echte DOI-/Abmeldeablauf ist nicht geändert; keine neue Mailabnahme nötig. Der strenge öffentliche Operator-Quellvergleich wird nicht geändert: Ein späterer erneuter `public`-Operatorstart erkennt den veränderten Marketing-HTML-/CSS-Stand weiterhin als andere Quelle. Diese normale Git-Veröffentlichung benötigt keine erneute Konto- oder Freigabeeinstellung.

## Aktuelle Hosting-Vorgabe: Cloudflare Pages

Tatsächlich eingerichtet und am 10.10.2026 geprüft: Projekt **vision-universe**, GitHub dieses Repository, Produktion main, Root landing, Build node scripts/build.mjs, Ausgabe dist. [Öffentliche Seite](https://www.visionuniverse.de/) · [Pages-Adresse](https://vision-universe.pages.dev/). Research bleibt auf GitHub Pages. [Nachweise, API-Rechte und offene Punkte](deployment/README.md). Die öffentliche Produktionsanmeldung und die konkrete Datenschutzfassung sind freigegeben und live geprüft. Die früher fehlerhaften globalen Navigationsreferenzen sind entfernt; das Impressum wurde in PR #747 ohne Entwurfskennzeichnung veröffentlicht. Kein weiteres Projekt/Repository anlegen.

## Vorschau und Abnahme

- Neue Landingpage: [Desktop vorher](review/redesign/before-desktop.png) / [nachher](review/redesign/after-desktop.png), [iPhone vorher](review/redesign/before-iphone.png) / [nachher](review/redesign/after-iphone.png).
- Dunkle Rechtsseiten: [Impressum Desktop](review/redesign/after-impressum-desktop.png), [Impressum iPhone](review/redesign/after-impressum-iphone.png), [Datenschutz iPhone](review/redesign/after-datenschutz-iphone.png).
- Formularfolge: [Bestätigungshinweis iPhone](review/redesign/after-newsletter-iphone.png).
- [Reproduzierbare Nachweise und genaue Grenzen](review/redesign/README.md), [Messwerte](review/redesign/checks.json). Die Bilder sind lokale Builds mit unveränderter freigegebener Datenschutzdatei und ohne Backend-Schlüssel. Sie belegen keine neue Live-Veröffentlichung.

Die öffentliche Research-Auslieferung zeigt derzeit einen Passwortdialog. Für den Vergleich wird deshalb das tatsächliche Startseiten-Markup aus dem geprüften Research-Commit verwendet. Der Referenz-Header/Hero liegt ausschließlich unter `reference/` und wird **nicht** veröffentlicht. Die Landingpage lädt weder Passwortdialog, PWA-/Account-Skripte noch geschützte Funktionen. Die Modulübersicht bleibt eine Vorschau. Der Discover-Kartenstapel ist lokal bedienbar und hat keine Verbindung zur Research-Plattform.

```sh
cd landing
npm ci --ignore-scripts
node node_modules/playwright/cli.js install --with-deps chromium
npm test
npm run test:browser
npm run test:design
npm run build
python3 -m http.server 8787 --directory dist
```

Node 22+, keine Laufzeitabhängigkeiten, kein Tracking. Playwright/axe nur für Entwicklung. Browserprüfungen: Chromium mit 1440 × 900, iPhone-Viewport 390 × 844 und 320 px; keine Prüfung auf einem physischen iPhone. Echte 200-%-Textvergrößerung verdoppelt die berechneten Textgrößen, nicht nur eine wirkungslose Root-Schriftgröße. Anbieterantworten werden abgefangen; kein Live-Brevo-Versand behauptet.

Die ursprünglichen Designregeln liegen in `assets/home/home.css`. Nur deren Font-URL wurde relativ gemacht, damit auch ein Pages-Projektpfad funktioniert. `styles.css` enthält die eigenständige Landing-Komposition, Gerätehüllen, Modulübersicht, Formularzustände und Reflow/Fokus. `legal.css` gestaltet ausschließlich die Rechts- und Bestätigungsseiten. `hero-intro.js` bleibt als unveränderte Quelldatei erhalten, wird aber nicht geladen; `presentation.js` übernimmt nur den Scroll-Header. Neue Research-Snapshots erfolgen ausschließlich mit explizitem Commit:

```sh
node scripts/sync-research.mjs RESEARCH_COMMIT_MIT_40_ZEICHEN
```

Das Skript liest fertiges `index.html`, Logo, Font, CSS und Hero-Animation aus Git. `module-preview.mjs` ersetzt dabei beide Geräteinhalte durch vorhandene Modul-Icons und Namen und entfernt Chart-Symbole; auch bei erneuter Übernahme gelangen keine Finanzwerte in die Veröffentlichung. Es verändert keine Research-Datei. Referenzcommit und CSS-Hash stehen in `reference/source.json`. `node scripts/social-preview.mjs` nimmt den tatsächlichen Coming-soon-Hero als Social-Bild auf.

## Brevo: Newsletter mit eigener Oberfläche und offizieller DOI-API

Das E-Mail-Feld, die Einwilligung, der Button und Rückmeldungen bleiben im Vision-Universe-Design. Kein Brevo-Formular oder Iframe. Ein schlanker Cloudflare-Pages-Endpunkt prüft die Anfrage und ruft ausschließlich Brevos offizielle DOI-API mit **Liste 4 – VU | Newsletter** auf. Brevo übernimmt Mail, Linkbestätigung, Kontaktverwaltung und die spätere Standardabmeldung. Kein D1 und keine eigene Abmeldedatenbank.

**Korrektur vom 15. Oktober:** Vorlage 8 war aktiv, wurde von Brevo aber nicht als DOI erkannt; echte Aufrufe wurden mit HTTP 400 abgelehnt. Nur ihr Tag wurde auf `optin` korrigiert; der API-Leseabgleich bestätigt `doiTemplate:true` bei unverändertem Inhalt und unveränderten Bestandsobjekten. Runtime und Operator prüfen dieses Merkmal jetzt ausdrücklich. [Nachweis, Reservierungsschutz und tatsächlicher Teststand](NEWSLETTER.md). Eine API-Annahme ist weiterhin kein Postfachnachweis; die allgemeine Anmeldung bleibt geschlossen.

Jeder vorhandene Kontakt wird übersprungen – auch Abmeldungen, Sperren, interne Empfänger und ungeklärte Bestandswerte. Die 135 Altobjekte werden nicht verändert; Listen 5/6 und 13 Nicht-Abonnenten bleiben unberührt. Keine normalen Kontaktanlagen oder Entsperrungen als DOI-Ersatz. Neue deutsche [API-DOI-Vorlage **8**](mail/newsletter-api-doi.html) mit **`{{ params.DOIurl }}`** wurde angelegt und zurückgelesen; die native Formularvorlage 4 mit `{{ doubleoptin }}` bleibt unverändert erhalten und wird nicht dafür benutzt. Setup und unabhängiger API-Leseaudit bestätigen verschlüsselte Pages-Secrets, geschlossene Freigaben und unveränderte Kontakte **135 / 0 / 2**; keine Mails versendet.

**Öffentlich geschlossen.** Drei Runtime-Gates und der Build-Gate verlangen echten DOI-/Marketing-Abmeldetest und Freigabe des konkreten Datenschutztextes. Der kontrollierte Hauptdomain-Test benötigt einen privaten zeitlich begrenzten Zugang und den konkret freigegebenen Datenschutz; du gibst deine neue kontrollierte Adresse selbst ein. Eine neue Adressübergabe per GitHub-Secret ist dafür nicht nötig. Schlüssel liegen nur in verschlüsselten Runtime-Secrets und werden weder vom Build gelesen noch an Browser/Logs ausgegeben. [Zugriffsbelege, tatsächlicher Stand, genau ein nötiger Kontoschritt und Testablauf](NEWSLETTER.md).

Missbrauchsschutz: gleiche Herkunft, Eingabe-/Größenprüfung, Honeypot, HMAC-Zähler und Reservierung im Edge-Cache, Brevo-Sperr-/Versandabgleich und anfängliches DOI-Budget. Die Cache-Sperren wirken pro Rechenzentrum und sind nicht global atomar; Brevo-Statistiken können verzögert sein. WAF-Regeln sind mit den vorhandenen Tokens nicht lesbar und werden nicht als eingerichtet behauptet. Keine zusätzliche WAF-/Turnstile-/D1-/Token-Einrichtung verlangt.

## Historische GitHub-Pages-Vorbereitung

Der ausschließlich manuelle Workflow landing-pages-publish.yml und seine Staging-Prüfungen stammen aus der überholten Planung eines zweiten Ziel-Repositories. Für die Landingpage **nicht verwenden**: kein Ziel-Repository und keinen Deploy-Key anlegen, keine GitHub-Pages-Domain setzen. Die tatsächliche Landing-Auslieferung nutzt das bestehende Cloudflare-Projekt vision-universe; maßgeblich ist die [Deployment-Dokumentation](deployment/README.md). research.visionuniverse.de bleibt allein an das vorhandene GitHub-Pages-Deployment gebunden.

## Rechtstext-Stand 12.10.2026

Alle fünf Original-Shoptexte sind vollständig gesichert. Die künftige App/Web-App mit Free/Paid-Abos erfordert eine inhaltliche Anpassung gegenüber dem PDF-Shop. [Coming-soon-Rechtsseiten, vollständige Quellen, Änderungstabelle und Abo-Entwürfe](legal-drafts/README.md). Kein erfundener Tarif, keine automatische Verlängerungsregel und keine Zahlungsanbindung angenommen. Beide Rechtsseiten sind Entwürfe; Abo-Texte und Originalquellen bleiben außerhalb des Builds. Produktionsprüfung und Brevo-Sperre bleiben unverändert.
