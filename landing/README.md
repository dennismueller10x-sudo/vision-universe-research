# Vision Universe · Coming soon

Newsletter öffentlich seit 16.10.2026: konkrete Datenschutzfassung freigegeben, DOI und deutsche Abmeldung tatsächlich abgenommen. [Erfolgreiche öffentliche Freischaltung](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38903721680), anschließend Hauptdomain ohne Testlink geprüft. Tracking **Ja / unbekannte Zustimmung Nein**; Aufbewahrung und Vorschauenspeicherung ohne erfundene Zusagen dokumentiert. Kein Newsletter an den Bestand.

Isolierte Coming-soon-Seite für **https://www.visionuniverse.de/**. Die Gestaltung folgt der freigegebenen Bildvorlage: zentriertes Original-Logo, „App bald verfügbar“, wortgleicher Claim **„Investieren mit Weitblick. Alles in einer App.“** (ausschließlich „Weitblick.“ limegrün), darunter ein einzelnes kompaktes iPhone und direkt anschließend die Anmeldekarte **„App-Start nicht verpassen.“ / „News zur App und neue Research-Inhalte per E-Mail.“**. Desktop verwendet ebenfalls dieses eine zentrierte iPhone. Kein zweites Produktmotiv, Slider, Desktop-Gerät oder sichtbare Konzeptkennzeichnung.

Zehn Produkte in zwei Spalten: Discover, Quant, Screener, Supertrader, Elliott Wave, Technische Analyse, Fundamentaldaten, Vorsorge, Hedgefonds und AI Atlas. Neun Icons stammen bytegleich aus dem bestehenden zentralen [Original-Sprite](assets/product-icons.svg), mit [Commit und SHA-256](reference/product-icons-source.json). AI Atlas verwendet das unveränderte ursprüngliche `h-atlas`-Symbol. Original-Logo, lokale Inter-Datei und Research-Basis-CSS bleiben erhalten. Keine erfundenen Kurse, Kennzahlen oder fertigen App-Funktionen. Das Motiv ist statisch und benötigt weder App-Runtime noch Discover-Swipe-Skript.

**Ausschließlich Darstellung und Marketing:** Die sichtbare Zustimmung ist verkürzt; „Details zur Einwilligung“ öffnet den vollständigen unveränderten `vu-newsletter-v1`-Text. Feldnamen, Vorgaben, API-Ziel und Freischaltung werden weiterhin mit der Basis verglichen; nur die ausdrücklich geänderte Darstellung und der kurze Standardhinweis werden dafür normalisiert. Fehlerrückmeldungen bleiben vollständig sichtbar. Backend, Brevo, DOI, Abmeldung, Tracking, API-Aufrufe, Listen, Secrets und Laufzeitfreigaben bleiben unverändert. Die fünf Rechts-/Bestätigungsseiten werden auf wortgleichen sichtbaren Inhalt und identische Linkziele geprüft; nur ihr bereits vorbereitetes dunkles Styling gehört zum Design. Kein echter Mailtest und kein Versand.

Die Browserprüfungen ersetzen die überholten Galerie-Annahmen durch Anforderungen der freigegebenen Bildvorlage: genau ein zentriertes iPhone, zehn vollständige Namen, zwei Spalten, keine Geräte-/Textüberdeckung, Formular direkt darunter, keine horizontalen Überläufe und 44-px-Touchflächen im Formular. Alle Sicherheits-, Einwilligungs- und WCAG-Prüfungen bleiben bestehen. Die Höhenbudgets sind wieder die ursprünglichen Grenzen (Desktop 1800 px, iPhone 1688 px); keine zusätzliche Galeriehöhe.

Der Build versieht eigene Styles und Präsentationsdateien mit inhaltsabhängigen URLs gegen veraltete Browser-Caches. Formularzustände, Mobilansicht, echte 200-%-Textvergrößerung sowie öffentliche Anmeldung mit und ohne JavaScript werden ausschließlich mit synthetischen Antworten geprüft. Chromium/WebKit in CI; keine Prüfung auf einem physischen iPhone. Der vorhandene echte DOI-/Abmeldenachweis wird für diese rein visuelle Änderung nicht wiederholt. Die Produktionsfreigaben werden nicht neu gesetzt; Veröffentlichung nutzt die normale Git-Integration.

## Aktuelle Hosting-Vorgabe: Cloudflare Pages

Tatsächlich eingerichtet und am 10.10.2026 geprüft: Projekt **vision-universe**, GitHub dieses Repository, Produktion main, Root landing, Build node scripts/build.mjs, Ausgabe dist. [Öffentliche Seite](https://www.visionuniverse.de/) · [Pages-Adresse](https://vision-universe.pages.dev/). Research bleibt auf GitHub Pages. [Nachweise, API-Rechte und offene Punkte](deployment/README.md). Die öffentliche Produktionsanmeldung und die konkrete Datenschutzfassung sind freigegeben und live geprüft. Die früher fehlerhaften globalen Navigationsreferenzen sind entfernt; das Impressum wurde in PR #747 ohne Entwurfskennzeichnung veröffentlicht. Kein weiteres Projekt/Repository anlegen.

## Vorschau und Abnahme

- Neue Landingpage: [Desktop vorher](review/redesign/before-desktop.png) / [nachher](review/redesign/after-desktop.png), [iPhone vorher](review/redesign/before-iphone.png) / [nachher](review/redesign/after-iphone.png).
- Schmaler iPhone-SE-Viewport (375 × 667): [ganze Seite](review/redesign/after-iphone-se.png).
- Dunkle Rechtsseiten: [Impressum Desktop](review/redesign/after-impressum-desktop.png), [Impressum iPhone](review/redesign/after-impressum-iphone.png), [Datenschutz iPhone](review/redesign/after-datenschutz-iphone.png).
- Formularfolge: [Bestätigungshinweis iPhone](review/redesign/after-newsletter-iphone.png).
- [Reproduzierbare Nachweise und genaue Grenzen](review/redesign/README.md), [Messwerte](review/redesign/checks.json). Die Bilder sind lokale Builds mit unveränderter freigegebener Datenschutzdatei und ohne Backend-Schlüssel. Sie belegen keine neue Live-Veröffentlichung.

Die öffentliche Research-Auslieferung zeigt derzeit einen Passwortdialog. Für den Vergleich wird deshalb das tatsächliche Startseiten-Markup aus dem geprüften Research-Commit verwendet. Der Referenz-Header/Hero liegt ausschließlich unter `reference/` und wird **nicht** veröffentlicht. Die Landingpage lädt weder Passwortdialog, PWA-/Account-Skripte noch geschützte Funktionen. Die Modulübersicht bleibt eine Vorschau. Die statische iPhone-Ansicht lädt keine Research-Anwendung.

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

Die ursprünglichen Designregeln liegen in `assets/home/home.css`. Nur deren Font-URL wurde relativ gemacht, damit auch ein Pages-Projektpfad funktioniert. `styles.css` enthält die eigenständige Landing-Komposition, Gerätehüllen, Modulübersicht, Formularzustände und Reflow/Fokus. `legal.css` gestaltet ausschließlich die Rechts- und Bestätigungsseiten. `hero-intro.js` bleibt als unveränderte Quelldatei erhalten, wird aber nicht geladen; `presentation.js` übernimmt den Scroll-Header und die lokale Galeriebedienung. Neue Research-Snapshots erfolgen ausschließlich mit explizitem Commit:

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

## Instagram-Seiten (`/instagram/`)

Ziel des ManyChat-Aufrufs „Kommentiere AKTIE“. `instagram/index.html` übernimmt Aufbau, Videos und Stil der Partnerseite (`../partner/partner.css`, `../partner/partner.js`, `../partner/media/`), ohne App-Links: überall „App bald verfügbar“, der einzige Aufruf führt zur Newsletter-Anmeldung `../#newsletter`. Ganz unten verlinkt die Folie „Unsere Aktienlisten“ die Unterseiten, die neueste zuerst. Ergänzungen in `instagram/instagram.css`.

Neue Liste: `instagram/<thema>/index.html` nach dem Muster von `instagram/robotaxi/` anlegen, in `scripts/build.mjs` (Dateiliste und Instagram-Schleife) eintragen und in `instagram/index.html` als oberste Karte verlinken. Keine Kurse oder Renditen auf den Seiten, damit sie nicht veralten; jede Liste trägt „keine Kauf- oder Verkaufsempfehlung“. `noindex`, wie die Partnerseite.
