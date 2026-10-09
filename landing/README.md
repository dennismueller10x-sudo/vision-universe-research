# Vision Universe · Coming soon

Isolierte Coming-soon-Seite für **https://www.visionuniverse.de/**. PR #543 übernimmt jetzt das tatsächliche Design der Research-Startseite: Original-Header/Logo, Inter, dunkler Hero mit grünem Raster und Glow, identische Schriftgrößen, Buttons, Gerätebühne, Original-Icons und responsive Regeln. Die Geräte zeigen eine zeitlose Modulübersicht mit Überschrift, ohne NVIDIA, Kurse, Charts oder Kennzahlen. Keine Änderung an Research, dessen `CNAME`, Pages-Workflow, API, DNS oder Shopify; kein Merge.

## Vorschau und Abnahme

- [Private Review-Vorschau](https://vision-universe-coming-soon-review.dennis91-mueller.chatgpt.site)
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

## Hosting wie Research: separates GitHub-Pages-Ziel

Tatsächlich geprüft über GitHub API am 09.10.2026: Das bestehende Repository nutzt Pages **`build_type: workflow`**, Quelle `main`, Domain **`research.visionuniverse.de`**. `pages-release.yml` bleibt unverändert. Ein Repository hat eine Pages-Veröffentlichung; zwei verschiedene Seiten mit getrennten Domains benötigen deshalb ein zweites Ziel. united-domains bleibt Domain-/DNS-Verwalter, ohne Nameserverwechsel.

### Konkrete Architektur – Ziel noch nicht angelegt

```text
vision-universe-research/landing (maßgeblicher Quellcode)
    → separater manueller landing-pages-publish.yml
    → nur statischer dist-Build, über zielgebundenen SSH-Deploy-Key
vision-universe-landing-pages (neues kleines öffentliches Veröffentlichungsziel)
    → Branch gh-pages, Pages /, später eigene Domain www.visionuniverse.de
```

Der neue Workflow ist ausschließlich manuell, nur auf `main`, mit lesendem `GITHUB_TOKEN`. Er hat keine Verbindung zum Research-Pages-Deployment und löst sich weder bei Daten-Commits noch bei PRs aus. Der Ziel-Deploy-Key ist das einzige Schreibrecht. `stage-pages.mjs` prüft Owner, exakten Zielnamen, Branch, sauberen Checkout, Produktionsbuild und vorhandene CNAME vor jeder Mutation. Keine Quell-CNAME wird übertragen; eine später bereits gesetzte Ziel-CNAME `www.visionuniverse.de` bleibt unverändert. Push erfolgt ohne Force über den vorhandenen Retry-Helfer. Der Workflow wird erst nach separat autorisiertem Merge auf dem Standardbranch verfügbar.

### GitHub-Bedingungen und Kosten – öffentliche Nutzung noch ungeklärt

[GitHub Pages Limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), am 09.10.2026 geprüft: „GitHub Pages is not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site, or any other website that is primarily directed at either facilitating commercial transactions or providing commercial software as a service (SaaS).“ Diese Seite bietet keine Käufe oder laufende SaaS-Funktion, kündigt aber ein geschäftliches Produkt an und sammelt künftig Leads. Daher wird **keine bestätigte Zulässigkeit behauptet**. Vor öffentlicher Veröffentlichung muss dieser konkrete Nutzungszweck mit GitHub geklärt sein. `LANDING_PAGES_USAGE_CONFIRMED` bleibt bis dahin ungesetzt. Falls unzulässig, ist eine separate Hosting-Entscheidung erforderlich; Cloudflare ist **nicht** die Standardlösung und wurde nicht verbunden.

Für öffentliche Repositories ist Pages mit [GitHub Free verfügbar](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). Keine privaten Pages-/Pro- oder sonstigen kostenpflichtigen Dienste buchen. Die technischen Limits (1 GB Site, 100 GB/Monat weiche Bandbreitengrenze) liegen weit über diesem statischen Build. Der öffentliche Ziel-Repository-Name unten ist ein Vorschlag, keine angelegte Ressource.

### Exakte einmalige Schritte und Berechtigungen

1. Zuerst den geschäftlichen Nutzungszweck anhand der oben genannten GitHub-Bedingungen klären. Bis dahin die private Review-Vorschau nutzen.
2. **Vor Anlegen bekannt:** Ziel `dennismueller10x-sudo/vision-universe-landing-pages`, öffentlich, ausschließlich Build-Ausgabe. Der Owner braucht Repository-Erstellungsrecht sowie Administratorrechte am neuen Ziel für Deploy-Key und Pages-Einstellungen; für Konfiguration per Fine-grained-Token wären Administration `write`, Pages `write` und für eine erste Branch-Erstellung Contents `write` nötig. Diese Rechte werden nicht dem Quell-Workflow gegeben. Ein Quell-`GITHUB_TOKEN` kann keine fremden Repository-Schreibrechte ersetzen.
3. Nach separater Freigabe das öffentliche Ziel mit initialem README anlegen, Branch `gh-pages` erstellen. Im **neuen Ziel** Settings → Pages → Deploy from a branch → `gh-pages` → `/`. Noch keine Custom Domain setzen. Research-Einstellungen nicht öffnen oder ändern.
4. Ein eigenes SSH-Schlüsselpaar erzeugen. Öffentlichen Schlüssel ausschließlich beim neuen Ziel unter Deploy keys mit Schreibrecht eintragen. Privaten Schlüssel als Actions-Secret **`LANDING_PAGES_DEPLOY_KEY`** im Quell-Repository hinterlegen; nicht an Codex geben, nicht als Datei/Argument in Git oder Logs. Keine Schlüssel dieses Auftrags wurden erzeugt.
5. Quell-Repository-Variablen **`LANDING_PAGES_TARGET_READY=true`** erst nach Ziel/Key-Prüfung und **`LANDING_PAGES_USAGE_CONFIRMED=true`** erst nach geklärter Nutzungszulässigkeit. Geprüfte Privacy-Datei und oben genannte öffentliche Build-Variablen bereitstellen. Der Live-Newsletter kann weiterhin gesperrt bleiben, sofern die öffentliche Datenschutzerklärung dies korrekt beschreibt.
6. PR #543 separat prüfen/übernehmen, anschließend den neuen Workflow **„Coming-soon | separates Pages-Ziel (manuell)“** auf `main` starten. Build-/Alias-/Formulartests bestehen vor Zielzugriff. Der noch nicht abgerufene tatsächliche `github.io`-Projektlink wird erst aus den Ziel-Pages-Einstellungen übernommen; keine erfolgreiche Veröffentlichung behaupten.

`_headers` ist auf GitHub Pages wirkungslos. Der Build liefert deshalb seine unterstützte CSP als HTML-Meta sowie `no-referrer`; keine Behauptung eigener HTTP-Header-Konfiguration. Originale Inline-Styles der Geräte dürfen über `style-src-attr` wirken, Skripte bleiben ausschließlich lokal. `.nojekyll` ist enthalten. Alte Research-Rechtslinks `/policies/legal-notice` und `/policies/privacy-policy` funktionieren durch statische Inhalts-Aliase; kein vorgetäuschter serverseitiger 301.

## Spätere Domainumstellung – separat, bei united-domains

1. Zone einschließlich Shopify, Mail und `research` sichern. Die Domain gemäß [GitHub-Domainverifizierung](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages) für den richtigen Owner verifizieren; dafür später den tatsächlich angezeigten TXT-Wert verwenden.
2. Im **neuen** Pages-Ziel die Custom Domain **`www.visionuniverse.de`** setzen und deren Bereitstellung/TLS prüfen. Erst zum separat freigegebenen Umschaltzeitpunkt bei united-domains den `www`-CNAME auf den von GitHub angegebenen Owner-Host und den Apex auf die [aktuellen offiziellen GitHub-Pages-DNS-Werte](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) richten. Keine IPs raten oder alte Werte ungeprüft übernehmen.
3. GitHub Pages übernimmt bei korrekt konfiguriertem Apex und `www` die [automatische Weiterleitung](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages) zur eingetragenen Custom Domain `www`. Canonical ist bereits `https://www.visionuniverse.de/`. Die `_redirects`-Datei aus dem alten Cloudflare-Vorschlag wird nicht verwendet.
4. HTTPS, Zertifikate, Apex-Redirect mit Pfad/Query, Canonical, Newsletter und alte Rechtslinks prüfen. `research.visionuniverse.de`, dessen Repository-CNAME und Workflow, MX/SPF/DKIM/DMARC und Shopify bleiben erhalten. Kein Nameserverwechsel, keine Kündigung und keine DNS-Änderung durch diesen Auftrag.

Die vorhandene Sites-Kopie ist ausschließlich eine **private** Review-Veröffentlichung. Sie ersetzt weder das geplante Pages-Ziel noch die öffentliche Domain. Ihr aktueller Zugriff bleibt erhalten; keine Custom Domain hinzufügen.
