# Vision Universe · Coming soon

Isolierte statische Landingpage für die spätere kanonische Adresse **https://www.visionuniverse.de/**. Keine Änderungen an Research, dessen `CNAME`, Pages-Release, API-Deployment, DNS oder Shopify. Keine Produktionsveröffentlichung und kein Merge.

## Lokal ansehen und prüfen

```sh
cd landing
npm ci --ignore-scripts
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run build
python3 -m http.server 8787 --directory dist
```

Die Seite ist dann unter `http://localhost:8787/` erreichbar. Der Build selbst benötigt ausschließlich Node 22+, keine npm-Pakete. Playwright und axe sind reine Entwicklungsabhängigkeiten. In einer Umgebung mit System-Chromium wird `/usr/bin/chromium` verwendet; alternativ `CHROMIUM_PATH` setzen. CI erzeugt zusätzlich ein herunterladbares Build-/Screenshot-Artefakt, veröffentlicht aber nichts.

Die Review-Screenshots und gemessenen Seitenhöhen liegen unter [review/](review/). Die Prüfung umfasst 1440 × 900, 390 × 844, zusätzlich 320 px, 200 % Textvergrößerung, horizontale Überläufe, Sprungmarken, Fokus, axe, Formularvalidierung, Einwilligung, Honeypot, Laden, Offline, Zeitüberschreitung, Anbieterfehler, Rücknavigation und native Anmeldung ohne JavaScript. Anbieterantworten werden im Test abgefangen: **kein echter Kontakt, kein echter Versand und kein Live-DOI-Test**.

## Newsletter: Live-Versand blockiert

Das vorhandene Research-Formular postet an Shopify (`index.html`, Abschnitt `#newsletter`). Es gibt keine Brevo-Anbindung im untersuchten Repository und keine Brevo-Zugänge in dieser Umgebung. Actions-Secrets lassen sich mit der verfügbaren GitHub-Berechtigung nicht lesen (403); daraus wird nicht behauptet, dass im Account keine weiteren Secrets existieren.

Die neue Seite hat standardmäßig ein deaktiviertes Fieldset, keine Formularaktion und einen sichtbaren Hinweis. Das gilt auch ohne JavaScript. Es werden weder E-Mail-Adressen angenommen noch im Browser gespeichert oder in einem Schein-Backend verworfen. Es gibt keine erfundene Erfolgsmeldung.

Vorgesehen ist Brevos **einfacher HTML-Formularexport**: nativer HTTPS-POST an den signierten Brevo-Formular-Endpunkt, ohne eigenen Server, API-Schlüssel oder Brevo-Skript. Der Anbieter zeigt Fehler und Annahmebestätigung. Nach Annahme muss dessen Text zunächst zur E-Mail-Bestätigung auffordern. Nur Brevo darf nach dem gültigen DOI-Link die bestätigte Anmeldung anzeigen. Die Landingpage wertet keine URL-Parameter als Erfolg aus.

### Exakt noch einzurichten

1. Brevo-Account bereitstellen, Absender `info@visionuniverse.de` beziehungsweise einen tatsächlich freigegebenen Absender verifizieren und Versandberechtigung/Authentifizierung prüfen. Nichts am aktuellen DNS ändern; eventuell nötige Absender-DNS-Einträge separat für später dokumentieren.
2. Neue Liste **App-Warteliste** anlegen; ihre tatsächliche Listen-ID im Brevo-Formular auswählen. Keine bestehenden Shopify-Kontakte importieren, kein pauschales Opt-in setzen.
3. Ein Brevo-Anmeldeformular mit ausschließlich `EMAIL`, verpflichtender und anfangs leerer GDPR-Einwilligung (`OPT_IN`) und **Double confirmation / Double-Opt-in** erstellen. Den erwarteten Feldnamen im Export überprüfen. Die Einwilligung muss zu den Launch-News der RAM Consulting UG passen.
4. Text-Kontaktattribut `SOURCE` anlegen und als vom Formular akzeptiertes Feld hinterlegen. Im einfachen HTML-Export muss es mit dem Wert **Coming-soon-Landingpage** übermittelt werden können. Der Build setzt diesen Wert als Hidden-Feld. Abweichenden tatsächlichen Attributnamen in `sourceAttribute` konfigurieren. Liste und Quelle mit einem neuen Testkontakt überprüfen.
5. Deutsche DOI-Mail, Abmeldelink und Anbieter-Fehler-/Bestätigungstexte konfigurieren. Anfänglicher Erfolgstext: **„Bitte bestätige deine E-Mail-Adresse über den Link in unserer E-Mail. Erst danach erhältst du die Launch-News.“** Keine Rückleitung auf eine lokal erfundene Erfolgsseite. Unbestätigte Kontakte dürfen keinen Newsletter erhalten. Brevo-Honeypot `email_address_check` beibehalten. Dieser ist einfache Spam-Abwehr; falls das Account-Formular CAPTCHA verlangt, passt der einfache HTML-Export nicht: dann den konkreten gehosteten Brevo-Formularexport integrieren und erneut testen, nicht das CAPTCHA entfernen.
6. Den tatsächlichen `action`-URL aus **Share → Simple HTML** liefern. Eine Formular-ID allein genügt nicht. Der Build akzeptiert ausschließlich `https://<anbieter>.sibforms.com/serve/<signierter-pfad>` ohne Query, Credentials oder API-Schlüssel.
7. Passende geprüfte Datenschutzhinweise für tatsächliches Hosting, Brevo, Empfänger, Rechtsgrundlagen, Fristen, DOI-Nachweis, Widerruf und Übermittlungen bereitstellen; Auftragsverarbeitung mit den tatsächlich genutzten Anbietern klären. Der vorhandene Shopify-/Shopify-Email-Text passt nicht zur neuen Auslieferung. Die Vorschau enthält deshalb ausdrücklich vorläufige Hinweise. Die vorhandenen Angaben zur Firma wurden am 09.10.2026 mit dem [aktuellen Impressum](https://www.visionuniverse.de/policies/legal-notice) abgeglichen; keine USt-ID erfunden.
8. Mit einer kontrollierten neuen Adresse live prüfen: fehlende Einwilligung abgelehnt; DOI-Mail kommt an; vor DOI kein Newsletter/kein bestätigter Listenstatus; nach Klick richtige Liste und Quelle; erneute Anmeldung; Abmeldung; Anbieterfehler. Erst dann `doubleOptInVerified` setzen. DOI-Testdaten nicht in Git oder Logs ablegen.

### Konfiguration aktivieren

`newsletter.config.example.json` nach `newsletter.config.json` kopieren (ignoriert):

```json
{
  "actionUrl": "https://DEIN-ANBIETER.sibforms.com/serve/DEIN-SIGNIERTER-PFAD",
  "doubleOptInVerified": true,
  "privacyReviewed": true,
  "sourceAttribute": "SOURCE",
  "privacyHtmlPath": "datenschutz/index.approved.html"
}
```

Die URL oben ist nur ein Beispiel, kein betriebsfähiger Endpunkt. Den freigegebenen Rechtstext als vollständiges deutsches HTML-Dokument mit relativen Links ablegen. Ein mit `data-policy-status="draft"` markierter Text wird nicht akzeptiert.

```sh
node scripts/build.mjs --config=newsletter.config.json
# Erst für die spätere öffentliche Veröffentlichung:
node scripts/build.mjs --config=newsletter.config.json --production
```

Alternativ im neuen Hosting-Projekt die **öffentlichen** Werte konfigurieren:

| Variable | Tatsächlicher Wert |
|---|---|
| `BREVO_FORM_ACTION` | `action` aus dem einfachen HTML-Export |
| `BREVO_DOUBLE_OPT_IN_VERIFIED` | `true` erst nach echtem DOI-Test |
| `BREVO_SOURCE_ATTRIBUTE` | z. B. `SOURCE`, im Brevo-Formular vorhanden |
| `LANDING_PRIVACY_REVIEWED` | `true` erst mit passendem geprüftem Text |
| `LANDING_PRIVACY_HTML_PATH` | z. B. `datenschutz/index.approved.html` |

Hier wird **kein BREVO_API_KEY** gebraucht. Andere Konfigurationsfelder werden abgelehnt. Der Build schreibt weder die signierte Aktion noch Adressen in seine Ausgabe. Öffentliches Hosting mit gesperrtem Newsletter ist technisch möglich, benötigt ebenfalls passende Datenschutzhinweise; ohne diese verweigert `--production` den Build. Alle Vorbereitungs-Builds sind `noindex`.

## Zweite Veröffentlichung: Cloudflare Pages

**Empfehlung: separates Cloudflare-Pages-Projekt aus demselben GitHub-Repository**, Root `landing`. Die bestehende Vercel-App liefert nur den Product Data Service. Ihr Build und ihre GitHub-Verbindung werden nicht umgestellt. GitHub Pages mit der Research-Domain bleibt ebenfalls unangetastet.

Tarif-/Bedingungsprüfung am 09.10.2026:

- [Cloudflare Pages](https://www.cloudflare.com/products/pages/) bietet den Free-Tarif für statische Auslieferung; laut [Limits](https://developers.cloudflare.com/pages/platform/limits/) 500 Builds/Monat, 20.000 Dateien und 100 Custom Domains pro Projekt. Statische Requests sind [kostenlos und unbegrenzt](https://developers.cloudflare.com/pages/functions/pricing/). Die [Self-Serve-Bedingungen](https://www.cloudflare.com/terms/) enthalten keine Beschränkung auf private, nicht kommerzielle Projekte wie Vercel Hobby. Diese reine Ankündigungsseite verarbeitet keine Zahlungen und benötigt keine kostenpflichtigen Functions, KV, R2 oder Datenbank. Innerhalb des Free-Tarifs sind daher keine zusätzlichen laufenden Hostingkosten vorgesehen; keine bezahlten Add-ons aktivieren.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby) ist auf private, nicht kommerzielle Nutzung beschränkt. Ein unbekannter Account-Tarif ist kein Nachweis einer zulässigen kostenlosen Geschäftsveröffentlichung. Deshalb kein zweites Hobby-Projekt.
- Brevos tatsächliche Form-/Versandfreigabe und [Tarif](https://www.brevo.com/pricing/) müssen im bereitgestellten Account geprüft werden. Aus einer erreichbaren Preis-Seite wird kein unbegrenzter kostenloser Newsletter-Versand abgeleitet. Der statische Build ist unabhängig davon.

### Einmaliger Verbindungsschritt (noch nicht durchgeführt)

Cloudflare Dashboard → **Workers & Pages → Create application → Pages → Connect to Git**. GitHub-Zugriff nur für `dennismueller10x-sudo/vision-universe-research` freigeben. Ein **neues** Pages-Projekt `vision-universe-coming-soon` erstellen; kein bestehendes Worker-/Research-Projekt ändern.

| Einstellung | Wert |
|---|---|
| Framework | None |
| Root directory | `landing` |
| Build command für Vorbereitung | `node scripts/build.mjs` |
| Build output directory | `dist` (relativ zu `landing`) |
| Node | 22 (`NODE_VERSION=22`) |
| Vorbereitungsbranch | `feat/coming-soon-landing` |
| Produktionsbranch später | `main`, erst nach separat genehmigtem Merge |
| Build watch include paths | `landing/**` |
| Build watch exclude paths | alle anderen Pfade, um Daten-Commits nicht neu zu bauen |

Die vorläufige `pages.dev`-Veröffentlichung ist noch **keine** Domainumstellung. Vor öffentlichem Betrieb die Datenschutzhinweise ergänzen, dann `node scripts/build.mjs --production` einstellen und gegebenenfalls die oben genannten Formularwerte hinzufügen. Den von Cloudflare tatsächlich vergebenen `pages.dev`-Host verwenden; keine erfundene Preview-Adresse. Dokumentation: [Monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/), [Build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/).

Eine private Review-Veröffentlichung über Sites ist nur eine separate Kopie des getesteten statischen Builds. GitHub bleibt die maßgebliche Quelle; diese Kopie ersetzt kein Research- oder Produktionsdeployment. Keine Custom Domain dort hinzufügen.

## Spätere DNS-Umstellung – ausdrücklich separat

1. Erst nach Review, separatem Merge und erfolgreichem neuem Pages-/Newsletter-Test `www.visionuniverse.de` im **neuen** Pages-Projekt als Custom Domain registrieren. Die tatsächlich angezeigten DNS-/TLS-Vorgaben übernehmen. Vorher die aktuelle Zone einschließlich Shopify- und Mail-Einträgen sichern.
2. Zum separat freigegebenen Umschaltzeitpunkt ausschließlich den Web-Eintrag für `www` auf den tatsächlich vergebenen Pages-Host richten. MX, SPF, DKIM, DMARC und `research` erhalten. Nie den Repository-`CNAME` ändern. Shopify nicht kündigen.
3. Den Apex `visionuniverse.de` ebenfalls für das neue Projekt und TLS einrichten. Für einen Pages-Apex verlangt Cloudflare üblicherweise eine Zone bei Cloudflare; bei externen Nameservern ist der konkrete Weg vom DNS-Anbieter abhängig. Daher ohne Kenntnis von Registrar/Zone **keine** A-/AAAA-Adressen oder Nameserver erfinden. Ein späterer Nameserverwechsel ist ein eigener Schritt mit vollständig kopierter Zone. [Custom Domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
4. Der Build enthält bereits die hostgebundene 301-Regel `https://visionuniverse.de/* → https://www.visionuniverse.de/:splat` in `_redirects`. Sie wird erst wirksam, wenn der Apex tatsächlich an diesem Projekt ankommt. Pfad und Query sowie HTTPS und Zertifikate nach Umschaltung prüfen. Bei Nutzung einer externen Apex-Weiterleitung dort dieselbe 301-Regel einrichten.
5. `https://www.visionuniverse.de/`, Apex-Redirect und `https://research.visionuniverse.de/` kontrollieren. Canonical und Social-Metadaten sind auf `www` vorbereitet. Auch die Weiterleitungen der bisherigen Rechtstext-URLs `/policies/legal-notice` und `/policies/privacy-policy` auf `/impressum/` und `/datenschutz/` sind im Build enthalten, damit bestehende Research-Links nach Umstellung funktionieren. Shopify bleibt bis zu einer separaten Entscheidung bestehen.

## Markenassets und Herkunft

Originale unverändert kopiert: `assets/vision-universe-logo-web.png`, `assets/fonts/inter-latin.woff2`, `assets/product-icons.svg`, `assets/icons/icon-192.png`, `assets/icons/apple-touch-icon.png`. Die kleinen lokalen Kopien machen den Landing-Build eigenständig und vermeiden Cross-Origin-Abhängigkeiten. Inter-Lizenz: [assets/inter-LICENSE.txt](assets/inter-LICENSE.txt).

Die Produktabbildung wird aus `index.html .hero .phone` der bestehenden generierten Startseite aufgenommen, ohne Kurse oder Ergebnisse zu verändern. Commit und Capture-Herkunft: [assets/research-preview.source.json](assets/research-preview.source.json). Sie wird als statische Ansicht gekennzeichnet und muss nicht den aktuellen Marktstand behaupten. Reproduzierbar über `npm run capture:product` bei laufendem Repository-Server. Das separate Social-Bild verwendet Original-Logo, lokale Schrift und Coming-soon-Text; `node scripts/social-preview.mjs` zeichnet es reproduzierbar. Kein Bildgenerator und kein neu erfundenes Logo.
