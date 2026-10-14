# Vision Universe · Coming soon

Isolierte Coming-soon-Seite für **https://www.visionuniverse.de/**. PR #543 übernimmt jetzt das tatsächliche Design der Research-Startseite: Original-Header/Logo, Inter, dunkler Hero mit grünem Raster und Glow, identische Schriftgrößen, Buttons, Gerätebühne, Original-Icons und responsive Regeln. Die Geräte zeigen eine zeitlose Modulübersicht mit Überschrift, ohne NVIDIA, Kurse, Charts oder Kennzahlen. Keine Änderung an Research, dessen `CNAME`, Pages-Workflow, API, DNS oder Shopify. Der Owner hat den Merge des getesteten Vorbereitungscodes und die spätere getrennte Cloudflare-Veröffentlichung autorisiert.

## Aktuelle Hosting-Vorgabe: Cloudflare Pages

Tatsächlich eingerichtet und am 10.10.2026 geprüft: Projekt **vision-universe**, GitHub dieses Repository, Produktion main, Root landing, Build node scripts/build.mjs, Ausgabe dist. [Öffentliche Seite](https://www.visionuniverse.de/) · [Pages-Adresse](https://vision-universe.pages.dev/). Research bleibt auf GitHub Pages. [Nachweise, API-Rechte und offene Punkte](deployment/README.md). Öffentlich steht noch ein Preview-Build mit noindex und vorläufigem Datenschutz; die früher fehlerhaften globalen Navigationsreferenzen sind in PR #577 entfernt. Keine finale Datenschutz- oder vollständige Browserfreigabe behaupten. Kein weiteres Projekt/Repository anlegen.

## Vorschau und Abnahme

- [Tatsächliche Live-Abnahme vom 10.10.2026](deployment/README.md#live-abnahme-layout-bestanden-ressourcenfehler-offen): [Desktop](deployment/verification-2026-10-10/desktop.png), [iPhone](deployment/verification-2026-10-10/iphone.png). Die ältere private Review-Kopie ist kein Betriebsziel und wird nicht neu veröffentlicht.
- [Desktop-Gegenüberstellung](review/comparison-desktop.png), [iPhone-Gegenüberstellung](review/comparison-iphone.png): links der originale Header/Hero aus dem Repository, rechts Coming soon, jeweils gleicher Viewport.
- Ganze Landingpage: [Desktop](review/desktop.png), [iPhone](review/iphone.png).
- [Gemessene Designwerte und Herkunft](review/design-comparison.json), [Layout-/Zugänglichkeitswerte](review/metrics.json), [knappe Abweichungen](review/README.md).

Die öffentliche Research-Auslieferung zeigt derzeit einen Passwortdialog. Für den Vergleich wird deshalb das tatsächliche Startseiten-Markup aus dem geprüften Research-Commit verwendet. Der Referenz-Header/Hero liegt ausschließlich unter `reference/` und wird **nicht** veröffentlicht. Die Landingpage lädt weder Passwortdialog, PWA-/Account-Skripte noch geschützte Funktionen. Die dargestellten Produktbereiche sind inert.

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

Die ursprünglichen Designregeln liegen in `assets/home/home.css`. Nur deren Font-URL wurde relativ gemacht, damit auch ein Pages-Projektpfad funktioniert. `styles.css` ergänzt die Modulübersicht innerhalb der unveränderten Gerätehüllen, Formularzustände, Reflow/Fokus und die kompakte Newsletter-/Footer-Komposition. `hero-intro.js` ist die unveränderte Original-Animation; `presentation.js` übernimmt nur Bewegungspräferenz und Scroll-Header. Neue Research-Snapshots erfolgen ausschließlich mit explizitem Commit:

```sh
node scripts/sync-research.mjs RESEARCH_COMMIT_MIT_40_ZEICHEN
```

Das Skript liest fertiges `index.html`, Logo, Font, CSS und Hero-Animation aus Git. `module-preview.mjs` ersetzt dabei beide Geräteinhalte durch vorhandene Modul-Icons und Namen und entfernt Chart-Symbole; auch bei erneuter Übernahme gelangen keine Finanzwerte in die Veröffentlichung. Es verändert keine Research-Datei. Referenzcommit und CSS-Hash stehen in `reference/source.json`. `node scripts/social-preview.mjs` nimmt den tatsächlichen Coming-soon-Hero als Social-Bild auf.

## Brevo: dauerhafter Vision-Universe-Newsletter

PR #659 bereitet ein **natives, von Brevo gehostetes Newsletter-Anmeldeformular** als Iframe vor. Es verwendet ausschließlich **VU | Newsletter (ID 4)**. Der Newsletter informiert über Vision Universe, neue Research-Inhalte und Produkte einschließlich des App-Starts. App-Themen ändern weder Namen noch Einwilligungszweck des Systems.

Die 135 vorhandenen Newsletter-Kontakte werden nicht erneut angemeldet, ihre Einwilligungen nicht umgedeutet und keine rückwirkenden DOI-Nachweise gesetzt. **VU | App-Warteliste (5)** und **VU | Newsletter-Test (6)** bleiben unverändert und werden vom Formular nicht verwendet; 13 Nicht-Abonnenten bleiben ausgeschlossen. Brevo übernimmt den neuen Anmelde-/DOI-/Abmeldeweg. Die Landingpage bleibt statisch, ohne D1, eigenen DOI-Endpunkt oder API-Schlüssel im Browser/Build.

Die bisherigen App-Vorlagen **1, 2 und 3** werden auf belegbare Nutzung geprüft und nicht überschrieben oder gelöscht. Die separate deutsche [Newsletter-DOI-Vorlage](mail/newsletter-doi.html) verwendet `{{ doubleoptin }}`. API-Rücklesen beweist nicht ihre Auswahl im Formular oder einen funktionierenden Mail-Link. [Aktueller Nutzungsnachweis, exakter Brevo-Klickweg und Abnahme](NEWSLETTER.md).

**Öffentlich weiterhin gesperrt:** tatsächliche Anmelde-/Abmelde-URLs, kontrollierter echter DOI-/Abmeldetest und Freigabe des konkreten Datenschutztextes fehlen. `newsletter.config.example.json` bleibt gesperrt; ein Merge öffnet die Anmeldung nicht. Keine weitere Cloudflare-D1- oder API-Token-Einrichtung.

## Historische GitHub-Pages-Vorbereitung

Der ausschließlich manuelle Workflow landing-pages-publish.yml und seine Staging-Prüfungen stammen aus der überholten Planung eines zweiten Ziel-Repositories. Für die Landingpage **nicht verwenden**: kein Ziel-Repository und keinen Deploy-Key anlegen, keine GitHub-Pages-Domain setzen. Die tatsächliche Landing-Auslieferung nutzt das bestehende Cloudflare-Projekt vision-universe; maßgeblich ist die [Deployment-Dokumentation](deployment/README.md). research.visionuniverse.de bleibt allein an das vorhandene GitHub-Pages-Deployment gebunden.

## Rechtstext-Stand 12.10.2026

Alle fünf Original-Shoptexte sind vollständig gesichert. Die künftige App/Web-App mit Free/Paid-Abos erfordert eine inhaltliche Anpassung gegenüber dem PDF-Shop. [Coming-soon-Rechtsseiten, vollständige Quellen, Änderungstabelle und Abo-Entwürfe](legal-drafts/README.md). Kein erfundener Tarif, keine automatische Verlängerungsregel und keine Zahlungsanbindung angenommen. Beide Rechtsseiten sind Entwürfe; Abo-Texte und Originalquellen bleiben außerhalb des Builds. Produktionsprüfung und Brevo-Sperre bleiben unverändert.
