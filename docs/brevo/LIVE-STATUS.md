# Brevo: Live-Status und manuelle Übergabe

Stand: 9. Oktober 2026. **Import vorbereitet, noch nicht durchgeführt.**

PR [544](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/544) wurde mit ausdrücklicher bedingter Owner-Freigabe gemergt, Commit `6bd5893858897c2bde3a7d58e3f955c9898b6828`. Alle ausgeführten PR-Prüfungen außer Core waren erfolgreich. Core hatte 93 erfolgreiche Tests und genau den separat auf der unveränderten Basis reproduzierten News-/Company-Master-Fehler; keine Gates oder Research-Dateien wurden geändert. Siehe historischen [Prüfnachweis](MERGE-REVIEW.md).

Der erste und einzige Brevo-Admin-Lauf war [audit 37934324872](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/37934324872) auf dem Merge-Commit. Er wurde beim ersten Aufruf `GET /account` mit **HTTP 403** abgewiesen. Das vorhandene Actions-Secret war im Runner belegt und im Log maskiert. Der Schlüssel wurde nicht ausgelesen oder zurückgeliefert; keine Antwortinhalte, Kontaktadressen oder Kontaktexporte wurden protokolliert.

## Was tatsächlich geprüft wurde

| Gegenstand | Ergebnis |
|---|---|
| Secret-Übergabe an Actions und manueller Main-Guard | funktionsfähig |
| Brevo-Kontoabruf | abgewiesen, HTTP 403; genaue Ursache nicht bestätigt |
| Kostenloser Tarif, Kontakte, Abmeldungen und Sperren | ungeprüft |
| Vorhandene Listen, Merkmale und Segmente | ungeprüft |
| Aktive Automationen | ungeprüft; vollständiger Abgleich benötigt weiterhin Brevo-UI |
| Absender und Domain, konkrete fehlende Bestätigungen/DNS-Werte | ungeprüft; keine Werte erfunden |
| setup | nicht gestartet; keine Struktur in Brevo angelegt |
| Kontaktimport und Newsletter-/Testversand | nicht ausgeführt |

## Zugang klären

1. In Brevo als Owner **Einstellungen → Sicherheit → Autorisierte IP-Adressen** öffnen. Die nicht autorisierten Zugriffe um **9. Oktober 2026, 13:05 UTC** mit dem Actions-Lauf abgleichen. Brevo dokumentiert, dass unbekannte API-IP-Adressen blockiert werden können. Das ist eine mögliche Ursache, kein durch diesen HTTP-Status bewiesenes Ergebnis. Keine globalen Sperren deaktivieren und keine pauschalen Runner-Netze freigeben. Eine Freigabe muss sich auf eine verifizierte, vertrauenswürdige Quelle beziehen; gehostete Actions-Runner haben keine zugesicherte feste Ausgangs-IP.
2. Falls kein passender blockierter Zugriff vorliegt: Kontozugang, Status und Berechtigung des normalen API-Schlüssels unter **SMTP & API → API-Schlüssel** prüfen. Einen erforderlichen Ersatz ausschließlich direkt als GitHub-Actions-Secret `BREVO_API_KEY` hinterlegen, nie in Chat, Git oder Logs. Aus dem HTTP 403 allein ist ein ungültiger Schlüssel nicht ableitbar.
3. Danach denselben Workflow auf `main` erneut ausschließlich mit `audit` ausführen. Erst nach erfolgreicher Prüfung `setup` starten. Kein Import und kein Versand zur Zugangsdiagnose.

Offizielle Quelle: [IP-Adressen für API-/SMTP-Sicherheit autorisieren und sperren](https://help.brevo.com/hc/en-us/articles/5740111683858-Authorize-and-block-IP-addresses-for-API-and-SMTP-security).

## Manuelle Importgrenzen

Der Owner wählt manuelle private CSVs; zusätzliche Import-Secrets werden nicht angelegt. CSV-Boolean-Werte müssen nach [offiziellem Format](https://help.brevo.com/hc/en-us/articles/208729849-Create-a-file-to-import-your-contacts) `Yes`/`No` sein. Die private API-JSON bleibt unverändert.

Vorbereitet: 135 reguläre Kontakte, zwei eindeutige interne Testkontakte, 13 nicht angemeldete Kontakte; sechs Käufer insgesamt, davon einer nicht angemeldet. Der tatsächliche Brevo-Bestand ist unbekannt. Daher sind **alle 150 Kontakte zurückgestellt**. Absender-/Domainwerte und Listen-IDs dürfen erst nach erfolgreichem Kontoabruf als tatsächlich eingerichtet gemeldet werden.

Die manuelle Klickfolge und Attribute stehen in der [README](README.md#verbleibende-schritte-in-brevo--in-dieser-reihenfolge). Vorhandene Kontakte privat abgleichen und aus den Dateien für neue Kontakte ausschließen. Attribut-Updates ausschalten schützt keine Listenmitgliedschaft automatisch. Kein Import, solange Kontaktanlage, Änderungen oder Listenzugang aktive Automationen auslösen könnten. Keine fremden Automationen pauschal deaktivieren.

Für die 13 nicht angemeldeten Kontakte ist ein listenloser manueller Import nicht durch die offizielle Anleitung bestätigt. Sie bleiben zusätzlich zurückgestellt, falls die Oberfläche keine sichere listenlose Aufnahme mit aktivierter E-Mail-Blocklist erlaubt. Keine Aufnahme in die Haupt-, Test- oder App-Warteliste und keine neue Dauerliste zur Vereinfachung.

Korrigierte CSVs und eine aktuelle Klickanleitung werden ausschließlich in der bestehenden privaten ChatGPT-Dateiablage bereitgestellt. Der unveränderte Originalexport bleibt außerhalb des Repositories. Private Dateireferenzen, Adressen und personenbezogene Prüfberichte gehören nicht in dieses öffentliche Dokument. Ein bestätigter privater Upload ist keine Zusage unbegrenzter Aufbewahrung.
