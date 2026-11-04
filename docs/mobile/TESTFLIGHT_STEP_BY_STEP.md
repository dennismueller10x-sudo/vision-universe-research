# TestFlight auf Ihrem iPhone: Einrichtung mit Windows-PC und iPhone, ohne Mac

**Stand:** 03.11.2026 · Ziel: Vision Universe **nur für Sie** über TestFlight auf Ihrem iPhone. **Keine** Store-Veröffentlichung, keine Apple-Prüfung, keine Store-Käufe, keine Änderung an Web, Worker, Datenbank, Stripe oder Passwortmaske.
Weg: GitHub Actions mit macOS-Runner, manuelle Signierung ([Vergleich](TESTFLIGHT_PLAN.md) §2). Der Capacitor-Prototyp (`app/`) ist auf `main`. Nichts davon wurde bisher ausgeführt, die Pipeline ist **nicht aktiv** (Vorlage unter `app/ci/`).
Kennzeichnung: **[Sie]** nur Sie · **[Claude]** ich · **[gemeinsam]** Prüfpunkt, den wir zusammen abhaken · **[prüfen]** Angabe aus Apple- oder GitHub-Dokumentation oder meinem Wissen, vor Ort kurz gegenprüfen.

## Regeln für alle Geheimnisse (gelten in jeder Phase)

1. Private Schlüssel, `.p12`, `.p8`, Profile, Passwörter und Base64-Werte entstehen **nur auf Ihrem Rechner** und wandern **nur** (a) in Ihren Passwortmanager und (b) in **GitHub Secrets**. Nirgendwo sonst.
2. **Nie** in Chat (auch nicht an mich), Issue, PR, Commit, Bildschirmfoto, E-Mail oder Cloud-Ordner (OneDrive, iCloud, Dropbox). Wenn Sie mir etwas zeigen wollen: nur **Namen** von Geheimnissen, nie Werte.
3. Das Skript `app/ci/make-signing-request.sh` verweigert Ordner innerhalb eines Git-Repositorys und in Cloud-Ordnern. Standardordner: `~/vu-signing` (Windows: `C:\Users\<Name>\vu-signing`).
4. `app/.gitignore` schließt `*.p12`, `*.p8`, `*.key`, `*.pem`, `*.csr`, `*.cer`, `*.mobileprovision`, `vu-signing/`, `.env*` aus. Ein Test (`app/tests/guards.test.mjs`) prüft, dass nichts davon eingecheckt ist und dass die Workflow-Vorlage keine Artefakte oder Caches schreibt.
5. Die Pipeline gibt keine Werte aus, lädt keine Artefakte hoch und löscht Schlüssel am Laufende. GitHub maskiert Geheimnisse in Logs zusätzlich.
6. Zugriff nur über die GitHub-Umgebung `app-testflight` mit Freigabe durch Sie und nur von `main`.
7. Bei Verdacht auf Verlust: Apple-Zertifikat widerrufen, API-Schlüssel löschen, GitHub-Geheimnis ersetzen. Dauer: Minuten.

## Wer macht was: iPhone und Windows-PC

| Aufgabe | Gerät |
|---|---|
| Apple-Konto einschreiben, Zwei-Faktor-Codes, später TestFlight installieren | **iPhone** |
| Alles im Apple-Developer-Portal und in App Store Connect (Bundle-ID, App-Eintrag, Zertifikat, Profil, API-Schlüssel) | **Windows-PC im Browser** (auf dem iPhone-Safari sperrig, nicht empfohlen) |
| Schlüssel, CSR und .p12 erzeugen | **Windows-PC** mit Git for Windows (enthält Git Bash und OpenSSL) |
| GitHub-Umgebung und Geheimnisse | **Windows-PC im Browser** (die GitHub-App für iPhone kann Umgebungen und Geheimnisse nicht verwalten [prüfen]) |
| Build auslösen und freigeben | PC oder iPhone (GitHub-App: Workflow starten und Freigabe bestätigen [prüfen]) |

**Vorbereitung am PC:** [Git for Windows](https://git-scm.com/download/win) installieren (Standardoptionen), dann „Git Bash“ öffnen. Ein Arbeitsstand dieses Repositorys wird nur für das Skript gebraucht (`git clone` oder ZIP von GitHub, Branch `main`). Den Schlüsselordner **nicht** in diesen Ordner legen (das Skript verhindert es).

## Phase 0: Entscheidungen [Sie]
1. **Entschieden (03.11.2026): Organisation, juristische Person RAM Consulting UG.** Im Store soll „Vision Universe“ als Entwickler erscheinen. Voraussetzungen, Optionen und die Anfrage an Apple: [APPLE_DEVELOPER_NAME.md](APPLE_DEVELOPER_NAME.md). **Der erste App-Eintrag (Phase 2, Schritt 2) wird erst angelegt, wenn die Entwicklernamen-Frage geklärt ist**, denn der Name wird dort einmalig und endgültig gesetzt.
2. **Name und Bundle-ID** `de.visionuniverse.app` (Verfügbarkeit ungeprüft). Die Bundle-ID legt den Entwicklernamen nicht fest.

## Phase 1: Apple Developer Program [Sie, PC]
Organisation: Einschreibung nur im Web. Vorab D-U-N-S, Firmen-E-Mail der eigenen Domain, Website, Vertretungsbefugnis bereitlegen (Liste in [APPLE_DEVELOPER_NAME.md](APPLE_DEVELOPER_NAME.md) §5).
1. [Einschreiben](https://developer.apple.com/programs/enroll/) als Organisation (RAM Consulting UG), Apple-Kennung mit Zwei-Faktor, 99 USD pro Jahr.
2. In App Store Connect die **Verträge** akzeptieren [prüfen].
3. **Team-ID** notieren (Mitgliedschaft im Developer-Portal, 10 Zeichen). Das ist kein Geheimnis im engeren Sinn, kommt aber nur in GitHub Secrets.

## Phase 2: Bundle-ID und App-Eintrag [Sie, PC]
1. Developer-Portal, **Identifiers**, **+**, **App IDs**, **App**, Explicit `de.visionuniverse.app`, keine Capabilities.
2. **NICHT JETZT.** Erst nach Klärung des Entwicklernamens: App Store Connect, **Apps**, **+**, Neue App: iOS, Name, Deutsch, Bundle-ID, SKU frei (z. B. `vu-app-001`), im Feld **Company Name** genau den geklärten Entwicklernamen. Der Name ist danach nicht mehr änderbar. Kein „Probe-Eintrag“.
3. Nach dem App-Eintrag: **TestFlight**, **Interne Tests**, Gruppe „Intern“, sich selbst hinzufügen. Die Phasen 3 bis 5 brauchen den App-Eintrag nicht und können vorher laufen.

## Phase 3: Zertifikat und Profil [Sie, PC, Git Bash] (ohne App-Eintrag möglich)
```bash
cd <Ordner mit dem Repository>
bash app/ci/make-signing-request.sh csr <Ihre-Apple-ID-E-Mail>
```
1. Erzeugt `~/vu-signing/vu-dist.key` (geheim) und `vu-dist.csr`.
2. Developer-Portal, **Certificates**, **+**, **Apple Distribution**, `vu-dist.csr` hochladen, die `.cer` herunterladen (z. B. in `Downloads`).
3. `bash app/ci/make-signing-request.sh p12 ~/Downloads/<datei>.cer`. Es fragt nach einem **neuen Passwort (mindestens 16 Zeichen)**: im Passwortmanager speichern. Es erzeugt `vu-dist.p12` und zeigt den SHA-1-Fingerabdruck.
4. Developer-Portal, **Profiles**, **+**, **App Store Connect** (Distribution), App-ID aus Phase 2, Zertifikat aus Schritt 2, Name `VU App Store`, `.mobileprovision` herunterladen.
5. `.key`, `.p12` und Passwort zusätzlich in den Passwortmanager (Datei-Anhang) sichern. Das Zertifikat läuft nach einem Jahr ab.

## Phase 4: App-Store-Connect-API-Schlüssel [Sie, PC]
App Store Connect, **Benutzer und Zugriff**, **Integrationen**, **App Store Connect API**, **Team-Schlüssel**, **+**: Name „GitHub Upload“, Zugriff **App Manager**. Key-ID und Issuer-ID notieren, `.p8` **einmal** laden und im Passwortmanager sichern.

## Phase 5: GitHub-Umgebung und Geheimnisse [Sie, PC]
1. Repository, **Settings**, **Environments**, **New environment**: **`app-testflight`**.
2. **Required reviewers** = Sie. **Prevent self-review** bei nur einer Person **aus** (sonst blockiert sich der Lauf). **Deployment branches and tags** = nur `main`. **Wait timer** nicht nötig.
3. **Environment secrets** (Namen exakt; Werte nur direkt eintippen oder aus der Zwischenablage einfügen):

| Name | Herkunft |
|---|---|
| `APPLE_TEAM_ID` | Phase 1 |
| `ASC_KEY_ID`, `ASC_ISSUER_ID` | Phase 4 |
| `ASC_KEY_P8` | gesamter Text der `.p8` (Texteditor öffnen, alles kopieren, einfügen, Editor schließen ohne zu speichern) |
| `IOS_DIST_P12_BASE64` | `bash app/ci/make-signing-request.sh clip` legt das Base64 in die Zwischenablage, einfügen, Zwischenablage danach leeren (Windows: Win+V, Verlauf löschen) |
| `IOS_DIST_P12_PASSWORD` | Passwort aus Phase 3 |
| `IOS_PROFILE_BASE64` | PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Downloads\<profil>.mobileprovision")) \| Set-Clipboard`, einfügen, Zwischenablage leeren |

4. **Environment variables** (öffentlich): `IOS_PROFILE_NAME` (`VU App Store`), `VU_SUPABASE_URL`, `VU_SUPABASE_PUBLISHABLE_KEY` (Supabase, Project Settings, API; **nicht** den Secret-/Service-Schlüssel).
5. Danach auf dem PC: `bash app/ci/make-signing-request.sh clean` löscht den Arbeitsordner, **nachdem** der Passwortmanager die Sicherung enthält und GitHub die Geheimnisse hat.

## Phase 6: Gemeinsame Prüfung vor der Aktivierung [gemeinsam]
Bevor ich die Pipeline aktiviere, gehen wir diese Punkte durch. Sie nennen mir nur **Ja/Nein, Namen und Einstellungen**, nie Werte.

| # | Prüfpunkt | Woran erkennbar |
|---|---|---|
| A1 | Mitgliedschaft aktiv, Verträge akzeptiert | Developer-Portal zeigt Mitgliedschaft, App Store Connect ohne Vertragsbanner |
| A2 | App-ID `de.visionuniverse.app` explizit | Identifiers-Liste |
| A3 | App-Eintrag vorhanden, **erst nach geklärtem Entwicklernamen angelegt** | Apps-Liste |
| A4 | Gruppe „Intern“ enthält Sie | TestFlight, Interne Tests |
| A5 | Distribution-Zertifikat gültig, Ablaufdatum notiert | Certificates |
| A6 | Profil „VU App Store“ Typ App Store, gehört zu A2 und A5 | Profiles |
| A7 | API-Schlüssel Rolle App Manager | Integrationen |
| G1 | Umgebung `app-testflight` existiert, Required reviewers = Sie, Branches = `main` | Settings, Environments |
| G2 | Sieben Secrets und drei Variablen mit **exakt** diesen Namen vorhanden (Werte unsichtbar) | Namensliste |
| G3 | Repository-Schutz: Regelsatz „Schutz vor Verlust“ aktiv (kein Löschen, kein Force-Push auf `main`); **keine** erforderlichen Prüfungen | Settings, Rules; bereits von mir lesend bestätigt (Stand 03.11.) |
| G4 | Actions: „Workflow permissions“ = nur Lesen; Fork-Pull-Requests brauchen Freigabe | Settings, Actions, General |
| G5 | Kein Geheimnis im Repository (`app/tests/guards.test.mjs` grün, GitHub „Secret scanning“ an, falls verfügbar) | CI, Security |

## Phase 7: Aktivierung und Vorprüflauf [Claude, Sie geben frei]
1. *(erledigt: der Capacitor-Prototyp ist auf `main`)*
2. **[Claude]** Kleiner Folge-PR: Vorlage nach `.github/workflows/app-ios-testflight.yml`, Wächtertests (`workflow-environments`, Konten-CI), **kein** Lauf.
3. **[Sie]** Folge-PR freigeben.
4. **[Sie]** Actions, „App - iOS TestFlight (intern, von Hand)“, **Run workflow**, `main`, Haken **preflight_only** (Standard) an. Umgebungsfreigabe bestätigen.
5. Der **Vorprüflauf** prüft auf dem macOS-Runner ohne Build und ohne Upload: alle Secrets vorhanden, `.p12` öffnet mit Passwort, Zertifikat ist „Apple Distribution“ und noch mindestens 30 Tage gültig, Profil passt zu Bundle-ID, Team und Zertifikat, Supabase-Schlüssel ist kein Geheimschlüssel. Er gibt **keine** Werte aus. **[Claude]** liest das Ergebnis.

## Phase 8: Erster Build und Upload [Sie lösen aus]
1. **Run workflow**, `main`, Version `0.1.0`, **preflight_only** **aus**. Freigabe bestätigen. Dauer 20 bis 40 Minuten.
2. **[Claude]** liest die Logs und behebt Fehler in Folge-PRs. Typisch beim ersten Mal: Signiermodus der Pods, Info.plist-Angaben, Datenschutz-Manifest, Profil-Namen.
3. Der Build erscheint nach 10 bis 30 Minuten Verarbeitung in App Store Connect, TestFlight.

## Phase 9: Installation auf dem iPhone [Sie, iPhone]
1. App Store Connect: Frage zur **Exportkonformität** beantworten (nur HTTPS, Standardverschlüsselung); Build der Gruppe „Intern“ zuweisen.
2. iPhone: **TestFlight** laden, mit derselben Apple-Kennung anmelden, „Vision Universe“ installieren.
3. Testen nach [TESTFLIGHT_PLAN.md](TESTFLIGHT_PLAN.md) §6. Rückmeldung an mich: Fehlertexte oder Beschreibung, Bildschirmfotos **ohne** Zugangsdaten.
4. Anmeldung in der App: Konto-E-Mail und Passwort wie im Web (direkt gegen Supabase, nur in dieser geschlossenen Phase, [SECURITY_LOGIN.md](SECURITY_LOGIN.md)).

## Was ausdrücklich nicht passiert
Kein Store-Antrag, keine Apple-Prüfung, kein externer Tester, keine Store-Käufe, keine Änderung an Web/Worker/Datenbank/Stripe/Passwortmaske, kein Geheimnis im Repository, in Artefakten oder im Chat.

## Alternative Xcode Cloud
Braucht einmalig einen Mac (Apple richtet den ersten Workflow in Xcode ein, [Apple](https://developer.apple.com/xcode-cloud/get-started/)). Nicht empfohlen, weil Sie keinen Mac wollen.
