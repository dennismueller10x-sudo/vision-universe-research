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

## Brevo: App-Warteliste mit nativem Formular

PR #659 verwendet ein **von Brevo gehostetes Formular** als Iframe. Brevo übernimmt Eingabeprüfung, CAPTCHA, Double Opt In, Aufnahme in **VU | App-Warteliste (5)** und die Abmeldung. Die Landingpage bleibt statisch: keine D1-Datenbank, kein Worker, keine eigenen DOI-/Abmelde-Endpunkte oder Berechtigungstoken. Der Browser erhält keinen Brevo-API-Schlüssel. Liste 4 mit 135 Kontakten und Liste 6 mit zwei internen Testkontakten werden nicht verändert; die 13 ausgeschlossenen Nicht-Abonnenten bleiben ausgeschlossen.

Die bisher angelegten API-Vorlagen 1/2 sind **nicht als native Formularvorlagen geprüft**. Die deutsche [Formular-DOI-Vorlage](mail/app-doi.html) verwendet den nativen Platzhalter `{{ doubleoptin }}`. Ob sie im tatsächlichen Formular auswählbar ist und den gültigen Link versendet, muss in Brevo und im echten Postfach getestet werden.

**Öffentlich gesperrt; echter DOI-/Abmeldetest fehlt.** Ein tatsächlich gespeichertes Brevo-Formular samt Anmelde- und Abmelde-URL, eine neue kontrollierte Testadresse mit Postfachzugriff und die Freigabe des konkreten Datenschutztextes fehlen. [Genauer Brevo-Klickweg, Betriebsnachweise und Abnahme](WAITLIST.md). Keine weitere Cloudflare-D1- oder API-Token-Einrichtung. Ein Merge aktiviert das Formular nicht. `newsletter.config.example.json` und der Standardbuild bleiben gesperrt.

## Historische GitHub-Pages-Vorbereitung

Der ausschließlich manuelle Workflow landing-pages-publish.yml und seine Staging-Prüfungen stammen aus der überholten Planung eines zweiten Ziel-Repositories. Für die Landingpage **nicht verwenden**: kein Ziel-Repository und keinen Deploy-Key anlegen, keine GitHub-Pages-Domain setzen. Die tatsächliche Landing-Auslieferung nutzt das bestehende Cloudflare-Projekt vision-universe; maßgeblich ist die [Deployment-Dokumentation](deployment/README.md). research.visionuniverse.de bleibt allein an das vorhandene GitHub-Pages-Deployment gebunden.

## Rechtstext-Stand 12.10.2026

Alle fünf Original-Shoptexte sind vollständig gesichert. Die künftige App/Web-App mit Free/Paid-Abos erfordert eine inhaltliche Anpassung gegenüber dem PDF-Shop. [Coming-soon-Rechtsseiten, vollständige Quellen, Änderungstabelle und Abo-Entwürfe](legal-drafts/README.md). Kein erfundener Tarif, keine automatische Verlängerungsregel und keine Zahlungsanbindung angenommen. Beide Rechtsseiten sind Entwürfe; Abo-Texte und Originalquellen bleiben außerhalb des Builds. Produktionsprüfung und Brevo-Sperre bleiben unverändert.
