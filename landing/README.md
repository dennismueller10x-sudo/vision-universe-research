# Vision Universe · Coming soon

Isolierte Coming-soon-Seite für **https://www.visionuniverse.de/**. PR #543 übernimmt jetzt das tatsächliche Design der Research-Startseite: Original-Header/Logo, Inter, dunkler Hero mit grünem Raster und Glow, identische Schriftgrößen, Buttons, Gerätebühne, Original-Icons und responsive Regeln. Die Geräte zeigen eine zeitlose Modulübersicht mit Überschrift, ohne NVIDIA, Kurse, Charts oder Kennzahlen. Keine Änderung an Research, dessen `CNAME`, Pages-Workflow, API, DNS oder Shopify. Der Owner hat den Merge des getesteten Vorbereitungscodes und die spätere getrennte Cloudflare-Veröffentlichung autorisiert.

## Aktuelle Hosting-Vorgabe: Cloudflare Pages

Tatsächlich eingerichtet und am 10.10.2026 geprüft: Projekt **vision-universe**, GitHub dieses Repository, Produktion main, Root landing, Build node scripts/build.mjs, Ausgabe dist. [Öffentliche Seite](https://www.visionuniverse.de/) · [Pages-Adresse](https://vision-universe.pages.dev/). Research bleibt auf GitHub Pages. [Nachweise, API-Rechte und offene Punkte](deployment/README.md). Öffentlich steht noch ein Preview-Build mit noindex und vorläufigem Datenschutz; zwei globale Navigations-Assets liefern HTML statt CSS/JS. Keine finale Datenschutz- oder vollständige Browserfreigabe behaupten. Kein weiteres Projekt/Repository anlegen.

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

## Brevo: Schnittstelle erhalten, Einrichtung ausschließlich in PR #544

[PR #544](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/544) verwaltet Brevo separat. **Keine zusätzliche Liste, kein zusätzliches Formular, kein API-Aufruf, Import oder Versand durch diesen PR.** Wiederverwendet werden seine geplante Liste **`VU | App-Warteliste`** und das Textattribut **`VU_SOURCE`**. Die Landingpage sendet künftig die Quelle **`Coming-soon-Landingpage`**. IDs und Accountzustand sind noch live ungeprüft; Bestandskontakte werden nicht automatisch Wartelistenkontakte.

Die vorhandene Schnittstelle bleibt ein nativer HTTPS-POST an den einfachen Brevo-HTML-Formularexport, ohne Backend und privaten API-Schlüssel. Aktuell ist das Fieldset deaktiviert und es gibt keine Formularaktion, auch ohne JavaScript. Keine Adresse wird entgegengenommen oder gespeichert, keine erfolgreiche Anmeldung erfunden.

Vom bestehenden Brevo-Prozess noch zu liefern:

1. Den tatsächlich eingerichteten einfachen Formular-Export und dessen vollständige `action`-URL `https://<anbieter>.sibforms.com/serve/<signierter-pfad>`. Eine Formular-ID allein genügt nicht. **Ein vorhandenes für diese App-Anmeldung geeignetes Formular verwenden; kein paralleles Formular anlegen.**
2. Zuordnung zur aus PR #544 vorhandenen `VU | App-Warteliste`, `EMAIL`, anfangs leere verpflichtende Einwilligung `OPT_IN` und vom Formular akzeptiertes `VU_SOURCE`. Abweichende Export-Feldnamen konkret prüfen, statt zu raten. Der vorhandene Brevo-Honeypot `email_address_check` bleibt erhalten; ein accountseitig nötiges CAPTCHA nicht entfernen.
3. Verifiziertes Double-Opt-in, deutsche DOI-Mail, Abmeldelink und tatsächliche Anbieterbestätigung: zunächst zur E-Mail-Bestätigung auffordern. Vor DOI keinen bestätigten Status setzen. Die Einwilligungsattribute aus PR #544 erst nach echtem Nachweis setzen; bestehende Abmeldungen/Sperren berücksichtigen. Keine automatische Übernahme von Shopify-Bestandskontakten.
4. Neue kontrollierte Adresse live testen: Validierung/Einwilligung, Empfang der DOI-Mail, unbestätigter Status vor dem Klick, richtige Liste/Quelle nach dem Klick, erneute Anmeldung, Abmeldung, Anbieterfehler. Keine Testadressen oder DOI-Daten in Git, Logs oder Artefakten.
5. Passende geprüfte Datenschutzhinweise für das tatsächlich freigegebene Hosting und Brevo bereitstellen. Der vorhandene Shopify-/Shopify-Email-Text genügt hierfür nicht; die Vorschau ist ausdrücklich vorläufig. Unternehmensangaben stammen aus dem am 09.10.2026 geprüften [aktuellen Impressum](https://www.visionuniverse.de/policies/legal-notice).

`newsletter.config.example.json` nach `newsletter.config.json` kopieren (ignoriert), die tatsächliche Formularaktion eintragen, `doubleOptInVerified` erst nach Live-Test und `privacyReviewed` erst mit passendem geprüftem Rechtstext setzen. `sourceAttribute` ist standardmäßig `VU_SOURCE`; `privacyHtmlPath` verweist auf ein vollständiges deutsches freigegebenes HTML-Dokument. Ein mit `data-policy-status="draft"` markierter Text wird abgelehnt.

```sh
node scripts/build.mjs --config=newsletter.config.json
# Erst für die spätere freigegebene öffentliche Veröffentlichung:
node scripts/build.mjs --config=newsletter.config.json --production
```

Alternativ **öffentliche** Build-Variablen: `BREVO_FORM_ACTION`, `BREVO_DOUBLE_OPT_IN_VERIFIED=true`, `BREVO_SOURCE_ATTRIBUTE=VU_SOURCE`, `LANDING_PRIVACY_REVIEWED=true`, `LANDING_PRIVACY_HTML_PATH`. Kein `BREVO_API_KEY` in dieser Anwendung. Unbekannte Konfigurationsfelder werden abgelehnt. Ohne freigegebene Datenschutzhinweise blockiert der Produktionsbuild; Vorbereitungsbuilds bleiben `noindex`.

## Historische GitHub-Pages-Vorbereitung

Der ausschließlich manuelle Workflow landing-pages-publish.yml und seine Staging-Prüfungen stammen aus der überholten Planung eines zweiten Ziel-Repositories. Für die Landingpage **nicht verwenden**: kein Ziel-Repository und keinen Deploy-Key anlegen, keine GitHub-Pages-Domain setzen. Die tatsächliche Landing-Auslieferung nutzt das bestehende Cloudflare-Projekt vision-universe; maßgeblich ist die [Deployment-Dokumentation](deployment/README.md). research.visionuniverse.de bleibt allein an das vorhandene GitHub-Pages-Deployment gebunden.
