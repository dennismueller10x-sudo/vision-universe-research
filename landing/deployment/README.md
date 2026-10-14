# Cloudflare Pages: tatsächlich eingerichtetes Projekt

**Aktueller Veröffentlichungsstand: 12.10.2026.** Die nachfolgenden Abschnitte vom 10.10. sind als damalige Prüfungen zu lesen; aktuelle Nachweise stehen im Live-Bericht unten. Der Owner hat **`vision-universe`** manuell eingerichtet. Das Projekt ist live; `vision-universe-landing` und ein zweites GitHub-Pages-Repository sind überholt. Keine weiteren Projekte anlegen. Research bleibt auf GitHub Pages. Dieser Prüflauf änderte keine Provider-Konfiguration, DNS-Einträge, Brevo-Einstellungen oder das Shopify-Abo.

## Öffentliche Auslieferung

| Adresse | Beobachtung |
|---|---|
| https://vision-universe.pages.dev/ | HTTPS 200, Coming-soon-Landingpage |
| https://www.visionuniverse.de/ | HTTPS 200, Coming-soon-Landingpage; Custom Domain laut Owner Active, im Pages-Inventar vorhanden |
| https://visionuniverse.de/ | 301 auf https://www.visionuniverse.de/ |
| https://research.visionuniverse.de/ | HTTPS 200, vorgesehener Research-Zugangsschutz, GitHub Pages |

HTTP leitet bei allen vier Hosts mit 301 auf HTTPS weiter. Beim Apex sind es zwei Schritte: HTTP → HTTPS-Apex → HTTPS-www. Query-Parameter bleiben erhalten; `/datenschutz/?vu_redirect_check=1` führt zu `https://www.visionuniverse.de/datenschutz?vu_redirect_check=1` (normalisierter abschließender Slash); www ergänzt ihn anschließend per 308, die finale Zielseite liefert 200. Canonical und `og:url` zeigen auf `https://www.visionuniverse.de/`. TLS-Prüfung blieb in HTTP-Client und Browser aktiv; keine Zertifikatswarnung umgangen. Prüfung über den vorgegebenen Umgebungsproxy; eine unabhängige Zertifikatslaufzeit wurde nicht erhoben.

Das API-Inventar enthält www am Projekt, den Apex nicht. Der funktionierende Redirect beweist keine zweite Pages-Domainbindung und keinen bestimmten Regeltyp. Bestehende Einstellungen nicht neu anlegen oder ersetzen. [HTTP/Redirects](verification-2026-10-10/http.json) · [Assets/Rechtsseiten](verification-2026-10-10/assets.json) · [Status](status.json).

## Bestätigte GitHub-Anbindung und Build

Der ausschließlich lesende [API-Audit 38060753594](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38060753594) bestätigt:

| Einstellung | Tatsächlicher Wert | Nachweis |
|---|---|---|
| Pages-Projekt | `vision-universe` | Cloudflare API |
| Repository | `dennismueller10x-sudo/vision-universe-research` | API, Quelle github |
| Produktionsbranch | `main` | API |
| Root directory | `landing` | API |
| Build command | `node scripts/build.mjs` | API |
| Build output | `dist` | API |
| Node | `NODE_VERSION=22` | Am 12.10. zusätzlich per lesender API in beiden Umgebungen bestätigt |

GitHub-App `cloudflare-workers-and-pages`: **Cloudflare Pages / success** für Commit [dc454c7d8982cc5a36545c1d9013bf7d0d827fd1](https://github.com/dennismueller10x-sudo/vision-universe-research/commit/dc454c7d8982cc5a36545c1d9013bf7d0d827fd1), abgeschlossen 10.10.2026, 14:34:46 UTC. Das belegt die aktive Git-Integration und den Build dieses Commits, keine dauerhafte Aktualität des jeweils neuesten ausgelieferten Commits. [API-Inventar](verification-2026-10-10/api.json) · [GitHub-Check](verification-2026-10-10/github.json).

`cloudflare-pages.json` hält bestätigte Basiswerte und die gemeldete Node-Version zum Vergleich fest: **kein vollständiger Account-Export, kein Create-/Patch-Auftrag**. Ungeprüfte Branch-, Analytics- oder Build-Watch-Einstellungen werden nicht als eingerichtet behauptet. Der frühere `landing-cloudflare-prepare.yml` prüft jetzt ausschließlich das **vorhandene** Projekt per GET; fehlt es oder gehört es einem anderen Repository, stoppt er ohne Ersatzprojekt. Auch der Audit-Workflow bleibt lesend. Beide sind manuell, nur auf main, mit `contents: read`.

Build-Watch- und Preview-Branch-Regeln bleiben ungeprüft. Im **bestehenden** Projekt unter **Settings → Builds & deployments → Build watch paths** prüfen: Include `landing/*`, Exclude leer. Ein erfolgreicher Check eines allgemeinen Main-Commits beweist keine Begrenzung auf Landing-Änderungen. Pages Free dokumentiert [500 Builds pro Monat](https://developers.cloudflare.com/pages/platform/limits/); Tarif/Kontingent im Konto prüfen, kein Upgrade buchen. Keine Einstellungen durch diesen Auftrag verändert.

## Live-Abnahme: Layout bestanden, Ressourcenfehler offen

Tatsächliche Seiten auf **pages.dev und www**, jeweils Chromium Desktop 1440×900 und iPhone 390×844:

- Desktop **1.191 px**, iPhone **1.684 px**, kein horizontaler Überlauf.
- **17 originale Research-Stilgruppen** einschließlich Header, Inter, Hero, Hintergrund, Buttons, Raster und Gerätehüllen identisch; CSS-SHA-256 entspricht der Originalreferenz.
- Axe **0 Verstöße**; Skip-Link per Tastatur und Newsletter-Sprungmarke funktionieren.
- „App bald verfügbar“, Modul-Icons, keine NVIDIA-/Kursdaten, Store-Links oder Research-Passworteingabe.
- Formular `data-ready=false`, E-Mail und Submit deaktiviert; ehrliche Meldung, dass noch keine Adresse entgegengenommen werden kann. Keine Adresse eingegeben/abgesendet, keine Brevo-Mutation.
- Impressum/Datenschutz, lokale Inter-Datei, Favicon und Social-Bild: 200 mit passenden Dateitypen.

[pages.dev-Messung](verification-2026-10-10/browser-pages.json) · [www-Messung](verification-2026-10-10/browser-www.json) · [Desktop](verification-2026-10-10/desktop.png) · [iPhone](verification-2026-10-10/iphone.png). iPhone-Viewport, kein physisches Safari-Gerät.

**Keine pauschal fehlerfreie Browserabnahme:** Die auf main vorhandenen Referenzen `/assets/site-navigation.css` und `/assets/site-navigation.js` fehlen im isolierten Landing-Build. Pages liefert HTML-Fallback mit 200; Chromium verwirft CSS/JS wegen falschem MIME-Typ. Weitere CSP-Meldungen sind Folge davon. [Konsolen-/Ressourcenbefund](verification-2026-10-10/browser-network.json). Dieser historische Ressourcenfehler wurde in PR #577 durch Entfernen der ungeeigneten globalen Referenzen aus Haupt- und Rechtsseiten behoben. Keine geschützte Research-Navigation kopiert. Vor Veröffentlichung die bereinigte Fassung erneut prüfen.

www ergänzt Cloudflares E-Mail-Obfuskation (`/cdn-cgi/scripts/.../email-decode.min.js`), pages.dev nicht. Der geprüfte Unterschied erklärt abweichende HTML-Hashes, kein anderes Landing-Design. Diese Sicherheitseinstellung gehört in die Datenschutzprüfung.

## Datenschutz und tatsächlicher Veröffentlichungsmodus

**Öffentlich erreichbar, aber als Vorschau gebaut:** Meta-Robots und `X-Robots-Tag` sind `noindex, nofollow`; `robots.txt` enthält `Disallow: /`. `/sitemap.xml` liefert HTML-Fallback statt XML. HTTP 200 und erfolgreiche Builds sind keine finale Inhalts-/Datenschutzfreigabe.

Live unter `/datenschutz/`: **„Datenschutzhinweise zur Vorschau – Vision Universe“**, `data-policy-status="draft"`. Der [Cloudflare-spezifische Entwurf](privacy-cloudflare.draft.html) ist vorbereitet, aber **nicht** die live ausgelieferte Erklärung und nicht freigegeben.

Der Build nutzt standardmäßig `preview`. main/Custom Domain wählen **nicht** automatisch production. Ob die Provider-Variable fehlt oder explizit preview lautet, wurde nicht ausgelesen; beide passen zum Ergebnis. Der Privacy-Gate schützt einen expliziten Produktionsbuild, verhindert aber keine manuelle Domainbindung eines Preview-Builds. Keine Datenschutzfreigabe aus der Domainaktivierung ableiten.

Noch konkret offen, Newsletter weiterhin gesperrt:

1. Im tatsächlichen Cloudflare-Konto Vertragspartner/AVV, Verarbeitungs-/Übermittlungsbedingungen sowie Sicherheits-, Cookie-, E-Mail-Obfuskations- und Log-/Speichereinstellungen prüfen. Keine Speicherfrist/Vertragserfüllung erfinden. Den darauf abgestimmten vollständigen deutschen Text freigeben.
2. Freigegebenen Text als `landing/deployment/privacy-cloudflare.html` bereitstellen, ohne Draft-Markierung und ungeeignete globale Navigation. Keine bloße Entfernung der Markierung ohne Inhaltsprüfung.
3. Erst dann im **bestehenden** Projekt, Production, `LANDING_PUBLICATION_MODE=production`, `LANDING_PRIVACY_REVIEWED=true`, `LANDING_PRIVACY_HTML_PATH=deployment/privacy-cloudflare.html` setzen und neu bauen. Node 22 behalten. **Keine** Brevo-Formular-/DOI-Konfiguration aktivieren.
4. Erklärung, Footer, `index, follow`, erlaubende robots.txt, echte XML-Sitemap, Ressourcen und Domains erneut prüfen. Preview-Umgebung getrennt preview/noindex halten. Brevo bleibt ein separater geprüfter Prozess.

## API-Rechte separat von der manuellen Einrichtung

Erneut bestätigt: **Pages-Lesen 200**, **Zonen-Lesen 200**, aktive Zone im selben Konto. **DNS-Lesen weiterhin 403 / Fehler 10000.** Vollständiger Zonenauszug, verdeckte Web-Origin-Ziele und sämtliche Mail-/DKIM-Fingerprints bleiben blockiert. Die manuelle Einrichtung bestätigt keine neuen Token-Rechte.

**Pages-, DNS- und Redirect-Schreibrechte wurden am 10.10. nicht getestet.** Der abgewiesene Projekt-POST 401/8000011 vom 09.10. ist historisch, keine aktuelle Schreibrechteprüfung. Die GitHub-Verbindung ist jetzt positiv belegt.

Nur für einen gewünschten vollständigen DNS-Audit: eigenes begrenztes **lesendes** Token (Account / Cloudflare Pages / Read, Zone / Zone / Read, Zone / DNS / Read; dieses Konto und visionuniverse.de) privat unter **GitHub Repository → Settings → Secrets and variables → Actions → `LANDING_CLOUDFLARE_API_TOKEN`** hinterlegen. Bestehende Workers-/R2-Tokens behalten; keine Tokens im Chat/Code/Log. Für diesen Prüflauf keine Schreibrechte erforderlich.

## Research, Mail und unveränderte Dienste

GitHub bestätigt Research mit `build_type: workflow`, main und `research.visionuniverse.de`. HTTPS 200, derselbe Startseiten-Hash wie am 09.10. (`7d734dbdfc8610be975a9e895641fdb3e0bb0d17c3cb26b2667e9b3d3842013f`). Bestehendes Research-Deployment, CNAME und Anwendung unverändert.

**14 bekannte öffentliche NS-/Mail-/Research-DNS-Abfragen** identisch zur Stichprobe vom 09.10. [Vergleich ohne TXT-Rohwerte](verification-2026-10-10/public-dns.json). Kein Ersatz für einen vollständigen authentifizierten Zonenauszug oder eine lückenlose DKIM-Aufzählung. Keine DNS-/Nameserver-Änderung durch diesen Auftrag. united-domains bleibt Registrar; Brevo und Shopify-Abo unverändert. Die manuelle Web-Domainumstellung des Owners wird nicht als eigene DNS-Änderung ausgegeben.

## Rechtstexte und neues Abo-Modell – 12.10.2026

Der Owner hat Datenschutz, AGB und Impressum als vollständige Anhänge sowie Widerruf und Versand-/Lieferbedingungen geliefert. Alle Originale sind [unverändert archiviert](../legal-source/README.md). Die frühere Beschaffungslücke ist damit geschlossen.

Zusätzlich klargestellt: künftig **App und Web-App mit Free/Paid-Abo-Varianten**, kein bisheriger PDF-Einzelkauf. Deshalb werden die Shop-Aussagen zu Shopify-Konten/-Zahlungen/-Email, Download-Lieferung, fehlenden Aktualisierungspflichten und Widerrufsverzicht nicht als aktuelle App-Verträge veröffentlicht.

Die beiden Landing-Rechtsseiten enthalten jetzt gekennzeichnete **Coming-soon-Entwürfe** für den tatsächlich beurteilten Ankündigungsbetrieb; die komplette Originalfassung bleibt im Quellenordner erhalten. Der Cloudflare-Datenschutzentwurf ist damit synchronisiert. [Änderungstabelle, App-Abo-AGB, Widerruf, Bereitstellung und konkrete fehlende Angaben](../legal-drafts/README.md). Diese zusätzlichen Vertragsentwürfe werden nicht in dist kopiert; keine aktiven Abo-/Kündigungs-/Widerrufsfunktionen suggeriert.

Noch offen: bestätigte Abo-Regeln und Kaufwege; App-/Konto-/Zahlungsanbieter; konkrete Cloudflare-/Mail-Vertrags-, Sicherheits- und Aufbewahrungsangaben; passende fachliche Freigabe. Beide aktuellen Rechtsseiten bleiben als Entwurf markiert, der Newsletter deaktiviert. Der bestehende Produktions-/Datenschutz-Gate bleibt unverändert. Kein Merge, keine Provider-Veröffentlichung und keine Änderungen an Research, DNS, Brevo oder Shopify-Abo durch diese Rechtstext-Anpassung.

Die am 10.10. erhobenen Live-Befunde oben sind historische Messungen der damals ausgelieferten Seite. Die neuen Texte befinden sich zunächst nur im PR und getesteten Preview-Build; eine Aktualisierung der öffentlichen Domain wird nicht behauptet.

## Freigabe zur Live-Aktualisierung

Der Owner hat den Merge und die Veröffentlichung der soweit vorbereiteten Coming-soon-Fassung autorisiert. Die Live-Aktualisierung nutzt die vorhandene Git-Integration des Projekts vision-universe; keine Provider-/DNS-Mutation. Bekannte ungültige globale Navigationsreferenzen wurden aus der Hauptseite und den Rechtsseiten entfernt. Rechtstexte bleiben Entwürfe und der Newsletter gesperrt; offene Hosting-/Mail-Details und App-Abo-Regeln gelten nicht als bestätigt. LANDING_PUBLICATION_MODE wird nicht auf production umgestellt und keine Privacy-Freigabevariable gesetzt. Damit bleibt die Seite öffentlich erreichbar, jedoch noindex. Quellen und Abo-Arbeitsentwürfe bleiben außerhalb des Builds.

## Verifizierte Live-Aktualisierung am 12.10.2026

PR #577 ist regulär gemergt: **f688d8cc4a9a08735fd35e5def9eb1ba2ba1f76f**. Landing-CI, Core, CI Config und Currency des geprüften Kopfes grün, keine Schutzregel verändert. Die neue Coming-soon-Fassung und beide aktualisierten Rechtsseiten sind auf **https://www.visionuniverse.de/** tatsächlich ausgeliefert.

Cloudflare meldete zunächst nach erfolgreichen Builds interne Uploadfehler. Der unveränderte geprüfte Merge-Build wurde deshalb mit Wrangler 4.149.0 im **bestehenden** Git-Projekt vision-universe, Branch main, veröffentlicht ([Run 38256451609](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/38256451609)); die erzeugte Adresse lieferte bytegenau den Build. Anschließend war auch der Retry des regulären Git-Deployments erfolgreich: **https://a39a1a90.vision-universe.pages.dev**. Die ursprüngliche direkte Adresse bleibt **https://aa273d54.vision-universe.pages.dev**. Die GitHub-App meldet Cloudflare Pages success für denselben Merge-Commit. Kein dauerhafter Wechsel des Hosting-Modells.

Der Konto-GET bestätigte nach direktem Upload unverändert source=github, main, Root landing, node scripts/build.mjs, dist und aktivierte automatische Produktionsbuilds. Node 22 in beiden Umgebungen, Veröffentlichungsmodus-Variable nicht gesetzt, keine Privacy-/Formularfreigabe. Der Build nutzt deshalb bewusst weiter seinen bestehenden Preview-Modus. Kein Projekt angelegt, keine Provider-/DNS-Konfiguration geändert, keine kostenpflichtige Buchung. Temporäre Diagnose-/Upload-Workflows liefen ausschließlich auf einem isolierten Branch; das Original-cloudflare-probe.yml und Research-Deployment auf main blieben erhalten. Dieser Hilfsbranch wird nach Abschluss entfernt.

Öffentlich geprüft: www und pages.dev HTTPS 200, HTTP→HTTPS 301, Apex→www 301 mit Pfad/Query, neue Impressums-/Datenschutztitel und Draft-Markierungen. Hauptseite ohne ungültige globale Navigationsreferenzen, Password-Gate oder aktiven Newsletter. Desktop 1.191 px, iPhone 1.684 px; 17 originale Stilgruppen, Axe 0, keine horizontalen Überläufe und **0 Browser-/Netzwerkfehler**. Research HTTPS 200 mit gleichem Hash wie unmittelbar vor der Veröffentlichung; GitHub Pages/CNAME unverändert. Alle 14 unmittelbar vor/nach Veröffentlichung verglichenen geschützten öffentlichen DNS-Antworten identisch; kein vollständiger Zonenexport behauptet.

**Weiterhin bewusst offen:** Hosting-/Mail-Vertrags- und Speicherangaben sowie die künftigen Abo-/Zahlungsregeln. Rechtsseiten bleiben Entwürfe, robots/header weiterhin noindex, Newsletter gesperrt. App-Abo-Texte und vollständige Originalquellen sind außerhalb des Landing-Builds. Nachreichen der Geschäftsangaben ist keine bereits erfolgte App-/Brevo-Aktivierung.

[HTTP-Nachweis](release-2026-10-12/http.json) · [DNS-Stichprobe](release-2026-10-12/protected-dns-sample.json) · [Browserwerte](release-2026-10-12/browser.json) · [Git-Deploy](release-2026-10-12/git-deployment.json) · [Desktop](release-2026-10-12/desktop.png) · [iPhone](release-2026-10-12/iphone.png).

## Cookie-Banner und Rechtsvorbereitung – nächster Review-Stand

Der Owner hat die vollständige Vorbereitung einschließlich Cookie-Banner ausdrücklich beauftragt. Die neue isolierte Umsetzung liegt im Landing-Branch und enthält eigene Einstellungen, Widerruf, überprüfbare Freigabe-Callbacks und aktualisierte Datenschutzhinweise. [Konkrete Umsetzung und verbleibende Angaben](cookies-and-legal.md). Keine neuen Anbieter oder Projekte, keine Aktivierung von Tracking/Brevo, kein DNS-/Research-/Mail-/Shopify-Eingriff. Eine erfolgreiche Browserprüfung ist keine Bestätigung der noch fehlenden tatsächlichen Konto-/Vertragsdaten. Dieser Abschnitt behauptet keine schon erfolgte Produktionsveröffentlichung der Cookie-Erweiterung; der dokumentierte Live-Release oben bleibt ein eigener historischer Nachweis.
