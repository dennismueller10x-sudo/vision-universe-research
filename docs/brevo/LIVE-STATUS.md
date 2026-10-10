# Brevo: Live-Status und manuelle Übergabe

Stand: 9. Oktober 2026. **Import vorbereitet, noch nicht durchgeführt.**

PR [544](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/544) wurde mit ausdrücklicher bedingter Owner-Freigabe gemergt, Commit `6bd5893858897c2bde3a7d58e3f955c9898b6828`. Der einzige rote Core-Check war der separat auf der unveränderten Basis reproduzierte News-/Company-Master-Fehler (93/94 erfolgreiche Tests). Keine Gates oder Research-Dateien wurden verändert. Siehe historischen [Prüfnachweis](MERGE-REVIEW.md).

## Diagnose des HTTP 403

Der erste [Audit 37934324872](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37934324872) meldete HTTP 403 ohne Endpoint-Angabe. Die frühere Zuordnung zu `GET /account` war deshalb nicht belegt. Der gezielte read-only [Vergleich 37950403422](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37950403422) zeigt:

| Abruf / Client | Tatsächliches Ergebnis |
|---|---|
| `GET /account`, bisheriger urllib-Client | HTTP 200 |
| `GET /senders`, bisheriger urllib-Client | HTTP 403, numerischer Fehlercode 1010 |
| Derselbe Audit mit `User-Agent: VisionUniverse-Brevo/1.0` | sämtliche sieben Abrufarten HTTP 200; vollständiger Aggregate-Audit erfolgreich |

`BREVO_API_KEY` ist im Runner gesetzt, hat das API-v3-Format und enthält keine äußeren Leerzeichen oder Anführungszeichen. Schlüsselwert, Schlüsselfragmente und Fingerprints werden nicht ausgegeben oder gespeichert. Der Header `api-key` und `https://api.brevo.com/v3/account` stimmen mit der offiziellen Schnittstelle überein. Die Secret-Metadatenabfrage bleibt für diesen GitHub-Zugang mit HTTP 403 gesperrt; die Verfügbarkeit ist stattdessen durch den erfolgreichen authentifizierten Abruf belegt.

Cloudflare beschreibt [1010](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010.mdx) als Sperre anhand der Client-/Browser-Signatur. Im kontrollierten Vergleich wurde nur der User-Agent geändert; Schlüssel, Authentifizierungsheader und Endpoints blieben gleich. Die konkrete Korrektur ist deshalb eine ausdrücklich benannte Integrationskennung im HTTP-Client. Keine Schlüsselrotation, Tarifbuchung oder Änderung der IP-/DNS-Konfiguration ist für diese Korrektur erforderlich. Sie ist im offenen Folge-PR vorbereitet, noch nicht auf `main` wirksam. Der Diagnose-Job lief ausschließlich manuell auf einem eigenen Branch mit unveränderlichem Code-Checkout und reinen GET-Aufrufen; der bestehende Admin-Job blieb dort übersprungen.

## Tatsächlicher Kontostand

| Gegenstand | Ergebnis des erfolgreichen Audits |
|---|---|
| Tarif | free |
| Kontaktinventar | 1 bestehender Kontakt; Einzelstatus und Shopify-Abgleich noch ungeprüft |
| VU-Listen | keine |
| VU-Merkmale | 0 von 10 vorhanden, keine Typkonflikte |
| Segmente | 0 |
| Absender | 1, aktiv/Bestätigung laut API vorhanden; Adresse bleibt privat |
| Domains | 0 registriert; keine kontospezifischen DNS-Werte verfügbar |
| Aktive Automationen | vollständiger Abgleich weiterhin über Brevo-UI erforderlich |
| setup, Kontaktimport und Newsletter-/Testversand | nicht ausgeführt |

Der aktuelle Auftrag erlaubt ausschließlich Audits. Nach Freigabe der Client-Korrektur kann der normale Audit auf `main` erneut ausgeführt werden. `setup`, Import und Versand werden dadurch nicht automatisch gestartet.

## E-Mail-Vorlage und manuelle Importgrenzen

Der vorhandene Navigations-Sync fügte nach dem Merge in Commit `f268fe0` automatisch Website-CSS und JavaScript in `scripts/brevo/newsletter.html` ein. Die E-Mail-Vorlage wird deshalb als `newsletter.html.tmpl` isoliert und von `render` unter diesem Namen gelesen. Der Sync verarbeitet ausschließlich Dateien mit Endung `.html`. Kein fremder Workflow oder Navigationscode wird verändert; die Vorlage enthält wieder ausschließlich E-Mail-Inhalt.

Der Owner wählt private manuelle CSVs; zusätzliche Import-Secrets werden nicht angelegt. CSV-Boolean-Werte müssen nach [offiziellem Format](https://help.brevo.com/hc/en-us/articles/208729849-Create-a-file-to-import-your-contacts) `Yes`/`No` sein. Die private API-JSON und der Originalexport bleiben unverändert.

Vorbereitet: 135 reguläre Kontakte, zwei eindeutige interne Testkontakte, 13 nicht angemeldete Kontakte; sechs Käufer insgesamt, davon einer nicht angemeldet. Da Bestands-/Sperrenabgleich und Automationsprüfung noch fehlen, sind **alle 150 Kontakte zurückgestellt**. Die drei VU-Listen sind noch nicht eingerichtet; beide internen Empfänger noch nicht als VU-Testkontakte angelegt.

Die manuelle Klickfolge und Attribute stehen in der [README](README.md#verbleibende-schritte-in-brevo--in-dieser-reihenfolge). Bestehende Kontakte privat abgleichen und aus den Dateien für neue Kontakte ausschließen. Attribut-Updates auszuschalten schützt keine Listenmitgliedschaft automatisch. Kein Import, solange Kontaktanlage, Änderungen oder Listenzugang aktive Automationen auslösen könnten. Keine fremden Automationen pauschal deaktivieren.

Die 13 nicht angemeldeten Kontakte bleiben zusätzlich zurückgestellt, falls die Oberfläche keinen sicheren listenlosen Import mit E-Mail-Blocklist erlaubt. Keine Aufnahme in Haupt-, Test- oder App-Warteliste und keine zusätzliche Dauerliste zur Vereinfachung.

Korrigierte CSVs und die Klickanleitung liegen ausschließlich in der bestehenden privaten ChatGPT-Dateiablage. Private Dateireferenzen, Adressen und personenbezogene Prüfberichte gehören nicht in dieses öffentliche Dokument. Ein bestätigter privater Upload ist keine Zusage unbegrenzter Aufbewahrung.
