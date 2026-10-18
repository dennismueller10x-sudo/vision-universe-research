# Kampagnenfreigabe ohne zusätzlichen GitHub-Klick

Stand: 18. Oktober 2026. Der Betreiber hat ausdrücklich beauftragt, den bisherigen zusätzlichen GitHub-Environment-Review künftig durch seine konkrete Freigabe im Chat zu ersetzen. Dies ändert ausschließlich den Freigabeweg; CI-Gates, Versandumfang, Testpflicht, Sperren und das bestehende Versandregister bleiben erhalten.

## Bedienung

1. Codex erstellt oder prüft den ungesendeten Entwurf und zeigt die konkrete Fassung. Kampagnen-ID, tatsächliche Brevo-Inhaltsversion und gewünschte Aktion müssen eindeutig sein.
2. Der Betreiber gibt ausdrücklich **diesen Test** oder – separat, nach Sichtprüfung des Tests – **diesen Hauptversand** frei. „Für die Zukunft automatisieren“ ist keine pauschale Versandfreigabe. Ein Testerfolg erzeugt keine Hauptfreigabe. Inhaltsänderungen brauchen einen neuen Test und passende Freigaben.
3. Codex hält die tatsächliche Anweisung mit Aktion, Kampagnen-ID, Versionshash und Prüfzeitpunkt privat außerhalb von Git fest und berechnet SHA256 über diesen Nachweis. Keine Nachrichtentexte, Adressen, Dateien oder Schlüssel in Workflow-Eingaben, Logs oder Artefakte übernehmen. Die lokale Ablage ist keine Zusage dauerhafter Speicherung.
4. Codex startet den vorhandenen Workflow manuell im Namen des autorisierten Owners, ausschließlich auf `main`: `operation=test` oder `send`, `campaign_id`, `expected_version`, `authorize_send=true`, `approval_sha256`, `dry_run=false`. **Kein zusätzlicher Review-deployments-Klick.** Die bestehende Umgebung `brevo-newsletter-review` wird dafür nicht mehr verwendet; sie wird weder gelöscht noch umkonfiguriert. Repository-Secrets werden wiederverwendet, keine neuen Tokens nötig.
5. Der Workflow prüft die authentifizierte GitHub-Identität, Ereignisdatei und tatsächlichen Run, liest die aktuelle Brevo-Fassung und speichert eine datensparsame, versionsgebundene Freigabereservierung vor jedem Versand. Offizielles `sendTest` geht nur an die zwei bestätigten internen Empfänger; `sendNow` bleibt eine getrennte Aktion mit eigener ausdrücklicher Freigabe.

**Nachweisgrenze:** GitHub kann den Chat nicht lesen. `approval_sha256` ist eine Referenz zum privaten Nachweis und kein kryptografischer Beweis einer menschlichen Chat-Freigabe. Codex darf den Owner-Dispatch daher nur auf eine tatsächlich vorliegende konkrete Betreiberanweisung ausführen. Technisch nachprüfbar ist der authentifizierte Owner-Dispatch mit exakt gebundener Aktion, Kampagne und Version. Wer eigenständig über das Owner-Konto einen solchen Dispatch auslöst, kann ebenfalls versenden. Es wird keine unabhängige zweite Person oder GitHub-Bestätigung mehr verlangt; genau diese zusätzliche Bestätigung ersetzt der ausdrückliche Änderungsauftrag.

## Technische Bindungen

- Zulässiges Repository, Standardbranch und stabile Owner-ID samt Login stehen in `scripts/brevo/newsletter-approval-policy.json`. Der tatsächlich geprüfte Owner ist `dennismueller10x-sudo`, ID `319072045`. Weitere GitHub-Benutzer mit Repository-Zugriff sind keine freigegebenen Dispatcher. Eine Änderung dieser Policy braucht eine reguläre Codeänderung.
- Nur `workflow_dispatch`, der konkrete Standardbranch-Workflow, erste Run-Ausführung, übereinstimmende Actor-/Triggering-Actor-/Sender-Identität und tatsächliche GitHub-API-Metadaten sind zulässig. PRs, Zeitpläne, andere Workflows, abweichende Branches, Re-runs und Run-Metadaten-Konflikte blockieren.
- Der authentifizierte Ereignisinhalt muss `operation`, `campaign_id`, `expected_version`, `authorize_send`, `approval_sha256` und `dry_run` bestätigen. Der Run muss aktiv und höchstens 24 Stunden alt sein. Eine abgelaufene Ausführung darf nicht automatisch mit einer erfundenen neuen Freigabe ersetzt werden.
- `authorize_send` bleibt standardmäßig false; ein leerer oder ungültiger Freigabehash blockiert Test/Hauptversand. Der Hash darf nur 64 hexadezimale Zeichen enthalten.
- Eine Freigabereferenz ist global einmalig und kann nicht für den Hauptversand wiederverwendet werden. Im bestehenden Register kommen ausschließlich Run-ID, öffentliche Owner-ID, Aktion und zwei Hashes hinzu. Keine Nachricht oder Empfängeradresse. Das alte Register bleibt rückwärtskompatibel; bestehende Tests/Reservationszustände werden nicht zurückgesetzt.
- Version und Testpaar bleiben aneinander gebunden. Der Test prüft den freigegebenen Hash auch bei seiner eigenen letzten Inhaltsprüfung. Der Hauptversand verlangt weiterhin einen API-angenommenen Test derselben tatsächlichen Brevo-Version für dieselben zwei Testempfänger.
- Empfänger-, Absender-, Domain-, Einwilligungs- und Sperrprüfungen bleiben unverändert. Globale Concurrency, CAS-Sicherung vor dem API-Aufruf und die vorhandene Wiederholungssperre verhindern automatische doppelte Test- oder Hauptsendungen. Fehler und unklarer Ausgang bleiben blockiert.
- Es gibt keine zeitgesteuerte Inhaltserstellung, keine neue KI-API und keinen automatisch folgenden Hauptversand. Brevo kann Änderungen zwischen letzter API-Prüfung und Versand nicht atomar ausschließen; währenddessen keine parallelen UI-Inhaltsänderungen vornehmen.

## Live-Prüfung ohne Mail

Für die nicht sendende Validierung des neuen Freigabewegs dieselben Metadaten mit `operation=test` und **`dry_run=true`** verwenden. Der Workflow prüft die tatsächliche Owner-Identität und Brevo-Version, speichert aber keine neue Freigabe/Testreservierung und ruft keine Versandroute auf. Der API-Client steht dabei ausdrücklich im ausschließlich lesenden `check`-Modus. Ausgabe: `approval_valid=true`, `dry_run=true`, `emails_sent=0`. Ein Dry-run ist kein Testversand und erlaubt keinen Hauptversand.

`dry_run=true` ist nur für `test/send` zulässig. Bei einem send-Dry-run muss zusätzlich ein passender tatsächlicher Vorabtest vorliegen. Die Dry-run-Markierung wird gegen das authentifizierte Ereignis geprüft, damit eine reine Prüfung nicht als Versand ausgeführt werden kann.

## Aktueller tatsächlicher Stand

Kampagne **10**, **VU | Vision Universe. Die App.**, wurde mit [Run 39121827685](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39121827685) erstellt und anschließend zurückgelesen. Der vom Owner bereits freigegebene bisherige [Testlauf 39122311094](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/39122311094) wurde zwischenzeitlich über das bisherige Gate tatsächlich genehmigt und ist erfolgreich abgeschlossen: **Brevo hat den Test angenommen**, Inhaltsversion `90580a007dac76c46c0a8ab13e963a22eed9cd0d7692b7123ac3399105b5cabe`. Zustellung/Inhalt im Postfach sind dadurch noch nicht belegt. Der Test wird nicht erneut ausgelöst. Die Hauptkampagne bleibt ungesendet; **keine Hauptversandfreigabe vorhanden**.

Offizielle Schnittstellen: [Workflow-Runs lesen](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run), [manueller Workflow-Dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event), [Inhalte mit SHA-Vergleich schreiben](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents).
