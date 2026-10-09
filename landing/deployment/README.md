# Cloudflare Pages: eigene Landingpage, Research bleibt GitHub Pages

Diese Konfiguration ersetzt die frühere Empfehlung eines zweiten GitHub-Pages-Repositories. Kein zweites Repository erforderlich, kein bestehender Research-Workflow oder Research-CNAME geändert. Der alte neue Pages-Ziel-Workflow bleibt ungenutzt und ausschließlich manuell.

## Geprüfter Stand vor der Umstellung

- Research: GitHub API bestätigt `build_type: workflow`, `main`, `research.visionuniverse.de`; HTTPS-Startseite antwortet 200 mit dem vorgesehenen Research-Zugangsschutz.
- Öffentliche NS-Auflösung am 09.10.2026: `saanvi.ns.cloudflare.com` und `weston.ns.cloudflare.com`. united-domains bleibt Registrar; kein Nameserverwechsel nötig oder vorgesehen.
- Öffentliche A/AAAA-Antworten für die Web-Domains zeigen Cloudflare-Proxy-Adressen. Daraus lässt sich das Shopify-Origin-Ziel nicht ablesen. Erst der authentifizierte DNS-Audit belegt die tatsächlichen Web-Ziele. Keine Ursprungswerte raten.
- Der vorhandene Repository-Bericht vom 17.09.2026 bestätigt ein `CLOUDFLARE_API_TOKEN` für Workers/R2. Das beweist keine aktuellen Pages-/DNS-Rechte. Der neue ausschließlich manuelle, lesende Workflow `landing-cloudflare-audit.yml` prüft sie ohne Tokenwerte, Rohantworten, Kontaktlisten oder DNS-TXT-Inhalte in Logs.
- Datenschutz bleibt eine konkrete inhaltliche Freigabe vor öffentlicher Domainumschaltung. Der vorbereitete [Cloudflare-Text](privacy-cloudflare.draft.html) bleibt als Entwurf markiert. Die Produktionsprüfung wird nicht umgangen. Brevo bleibt gesperrt und wird in diesem Auftrag nicht eingerichtet oder versendet.

## Projektkonfiguration

`cloudflare-pages.json` ist die vorbereitete REST-Konfiguration, **kein Nachweis eines angelegten Projekts**. Der vorgeschlagene Projektname `vision-universe-landing` muss im Konto verfügbar sein. Bestehende Projekte anderer Zwecke dürfen nicht überschrieben werden.

| Einstellung | Wert |
|---|---|
| Repository | `dennismueller10x-sudo/vision-universe-research` |
| Produktionsbranch | `main` |
| Root directory | `landing` |
| Framework | None |
| Build command | `node scripts/build.mjs` |
| Build output | `dist` |
| Environment variable | `NODE_VERSION=22` |
| Production environment | `LANDING_PUBLICATION_MODE=production` |
| Preview environment | `LANDING_PUBLICATION_MODE=preview` |
| Preview branch | `feat/coming-soon-landing` – nach Merge behalten |
| Build watch paths | nur `landing/*`, keine Daten-Commits |

Der unveränderte Build-Befehl verwendet über den expliziten Veröffentlichungsmodus denselben bestehenden Datenschutz-Gate wie `--production`. Main-Builds bleiben bis zur tatsächlichen Privacy-Freigabe blockiert. Die Branch-Vorschau ist `noindex`, nimmt keine Adressen an und bezeichnet den Rechtstext ehrlich als Vorschau.

Nach konkreter Freigabe die überprüfte Datei ohne Draft-Markierung als `deployment/privacy-cloudflare.html` ablegen und **nur in Production** `LANDING_PRIVACY_REVIEWED=true` sowie `LANDING_PRIVACY_HTML_PATH=deployment/privacy-cloudflare.html` setzen. Das allein aktiviert Brevo nicht. Keine `BREVO_FORM_ACTION`, keine privaten Schlüssel im Browser.

Cloudflare dokumentiert für Pages Free 500 Builds/Monat; die statische Seite benötigt keine Pages Functions, keine Datenbank und keinen kostenpflichtigen Tarif. Die bestehende Account-Auslastung bleibt zu prüfen; bei ausgeschöpftem Kontingent kein Upgrade buchen. [Aktuelle Limits](https://developers.cloudflare.com/pages/platform/limits/) · [Git-Integration](https://developers.cloudflare.com/pages/get-started/git-integration/).

## Gemessene Kontoblockaden

Der reale isolierte Audit [37958646123](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37958646123) bestätigt ein gültiges vorhandenes Token, Pages- und Zonen-Leserechte und die aktive Zone im selben Konto. **DNS-Lesen scheitert mit HTTP 403 / Fehler 10000.** Es wurde kein vollständiger DNS-Bestand gespeichert; Shopify-Origin-Ziele und Mail-Fingerprints sind daher noch nicht nachgewiesen.

Der reale Projektversuch [37958967398](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37958967398) wurde nach den erfolgreichen Leseprüfungen beim Anlegen mit **HTTP 401 / Fehler 8000011** abgewiesen. **Kein Projekt angelegt, keine Domain angebunden, kein DNS geändert.** GitHub-Git-Integration und Pages-Schreibberechtigung sind noch nicht bestätigt.

## Genau einmal erforderliche Kontoschritte

1. Cloudflare Dashboard → zuständiges Konto → **Workers & Pages → Create application → Pages → Connect to Git**. Falls GitHub noch nicht verbunden ist: GitHub-Konto `dennismueller10x-sudo` wählen, Cloudflare Pages autorisieren, **Only select repositories → vision-universe-research → Install/Authorize**. Alternativ vorhandene Installation über GitHub **Settings → Applications → Installed GitHub Apps → Cloudflare Pages → Configure** um genau dieses Repository ergänzen.
2. Für Automation keine bestehenden Workers-/R2-Tokens erweitern oder ersetzen. Falls deren Rechte fehlen, Cloudflare **My Profile → API Tokens → Create Token → Create Custom Token**: **Account / Cloudflare Pages / Edit**, **Zone / Zone / Read**, **Zone / DNS / Edit**, für den Apex-Redirect zusätzlich **Zone / Dynamic URL Redirect / Edit**. Ressourcen ausschließlich dieses Konto und Zone `visionuniverse.de`. Das neue Token privat unter einem separaten GitHub-Actions-Secret `LANDING_CLOUDFLARE_API_TOKEN` hinterlegen: Repository **Settings → Secrets and variables → Actions → New repository secret**. Nie im Chat, Workflow-Input, Code oder Log einfügen. Der Audit bevorzugt dieses separate Token, falls vorhanden; bestehende Tokens bleiben erhalten.
3. Projekt mit den obigen Werten speichern. Produktionsmodus und Vorschau ausdrücklich unterscheiden; eine erfolgreiche Branch-Vorschau ersetzt keine Privacy-Freigabe für die öffentliche Domain.

## DNS und Domainumschaltung – erst nach funktionierender Vorschau/Freigabe

1. Audit-Artefakt sichern. Es enthält Web-Ziele und SHA-256-Fingerprints **aller anderen DNS-Einträge**, einschließlich Research, MX und sämtlicher TXT-/DKIM-/DMARC-Einträge. Wenn der Zonenauszug unvollständig ist, keine Mutation.
2. Im richtigen Pages-Projekt **Custom domains → Set up a domain → www.visionuniverse.de**; anschließend Apex `visionuniverse.de` hinzufügen. Die Ziel-CNAME wird ausschließlich aus dem tatsächlich erzeugten Pages-Projekt übernommen. Nur bisherige Shopify-Web-A/AAAA/CNAME an `@` und `www` ersetzen. Kein anderer Eintrag und keine fremde Weiterleitungsregel wird verändert. [Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
3. Apex dauerhaft auf www: Cloudflare-Zone **Rules → Redirect Rules → Create rule → Single Redirect**. Match nur `(http.host eq "visionuniverse.de")`; dynamisches Ziel `concat("https://www.visionuniverse.de", http.request.uri.path)`, **301**, **Preserve query string**. `apex-redirect.json` enthält genau diese Regel. Keine breite Wildcard für `*.visionuniverse.de`; kein Redirect von Research. Bestehende Redirect-Regeln bewahren. `_redirects` wird nicht für einen unbelegten Domainredirect verwendet. [Single Redirects](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/settings/).
4. Beide Custom domains erst als fertig melden, wenn Cloudflare deren Zertifikat/Aktivierung bestätigt. `https://www.visionuniverse.de/` muss 200 mit der Landingpage liefern; Apex muss per 301 zu www weiterleiten, auch mit Pfad/Query. Research weiterhin 200 und unveränderte GitHub-Pages-Konfiguration. DNS-Audit wiederholen und alle geschützten Fingerprints mit vorher vergleichen. Shopify nicht kündigen.

## Offene Inhaltsentscheidung

Der Entwurf enthält Cloudflare-Hosting, notwendige technische Verbindungs-/Sicherheitsdaten, keine eigenen Analyse-/Marketing-Skripte, gesperrten Newsletter und bestätigte Unternehmensangaben. Vor Freigabe im tatsächlichen Cloudflare-Konto Vertragspartner/AVV, Sicherheits-Cookies, Log-/Speichereinstellungen und Übermittlungsbedingungen prüfen. Es werden keine individuelle Vertragserfüllung oder konkreten Speicherfristen erfunden. Freizugeben ist der **konkrete fertige Rechtstext für eine öffentliche statische Cloudflare-Landingpage bei weiterhin gesperrtem Newsletter**; die App-Ankündigung und das genehmigte Design werden nicht erneut zur Diskussion gestellt.
