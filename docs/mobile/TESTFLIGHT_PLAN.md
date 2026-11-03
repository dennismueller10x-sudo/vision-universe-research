# TestFlight-Plan: macOS-Buildweg, Apple-Konfiguration, erster privater Upload

**Stand:** 03.11.2026 (Phase 2) · Nichts davon wurde ausgeführt. Kein Apple-Zugang, kein Upload, keine Veröffentlichung.
Angaben zu Apple-Produkten (Kontingente, Rollen, Xcode-Versionen) sind mein Wissensstand und wurden in dieser Sitzung **nicht** bei Apple geprüft. Sie sind als [prüfen] markiert und vor dem Start gegen die Apple-Dokumentation abzugleichen.

## 1. Was am Repository den Buildweg bestimmt

- Das Repository ist **öffentlich** (anonymer API-Aufruf liefert 200, 03.11.2026). Folge: Xcode Cloud braucht keinen Zugriff auf Privates, aber Apple liest Quellen mit; Secrets dürfen nie im Repository stehen (gilt ohnehin).
- Das iOS-Projekt liegt unter `app/ios/App` (Capacitor 7, **CocoaPods**: `Podfile`). Vor dem Xcode-Build sind nötig: `npm ci`, `npm run build:www` (Bundle der Plugins und `runtime-config.js`), `npx cap sync ios` (führt `pod install` aus).
- Der Web-Teil enthält nur **öffentliche** Werte (Supabase-URL und Publishable Key). Es gibt kein App-Geheimnis im Build.
- Projektregeln für Workflows (CLAUDE.md, ADR-005) gelten: Eingaben nur über `env:`, `permissions: contents: read`, Concurrency mit Ref-Name, Umgebung mit Prüfern für alles mit Geheimnissen, kein Rücksetzen auf `main`.

## 2. Vergleich der Buildwege

| Kriterium | **Xcode Cloud** | **GitHub Actions (macOS-Runner)** |
|---|---|---|
| Einrichtung | in Xcode oder App Store Connect (Web) [prüfen]; Verknüpfung mit dem GitHub-Repository | Workflow-Datei im Repository (Vorlage: `app/ci/ios-testflight.workflow.yml.template`) |
| Signierung | **von Apple verwaltet** (Cloud-Signierung): wir halten keine Zertifikate | Zertifikat und Profil selbst verwalten **oder** Cloud-Signierung per App-Store-Connect-API-Schlüssel (`-allowProvisioningUpdates`) |
| Geheimnisse bei uns | keine für den Build | API-Schlüssel (`.p8`, Key-ID, Issuer-ID) und Team-ID in einer Umgebung mit Prüfern |
| Anbindung an TestFlight | direkt (Aktion „TestFlight intern“) | Upload-Schritt im Workflow |
| Kosten | Kontingent im Developer Program (häufig 25 Compute-Stunden pro Monat) [prüfen] | für öffentliche Repositories kostenlose Standard-Runner [prüfen]; macOS-Minuten sonst mit Multiplikator |
| Node/CocoaPods | nicht vorinstalliert: `ci_post_clone.sh` installiert per Homebrew | `setup-node`; CocoaPods auf dem Image vorhanden [prüfen] |
| Xcode-/SDK-Stand | folgt Apples Vorgaben, Version im Workflow wählbar | Runner-Image muss die geforderte Xcode-Version haben [prüfen] |
| Auslöser | Branch/Tag/Pull-Request-Regeln im Workflow | `workflow_dispatch` (von Hand) wie die übrigen Freigabe-Workflows |
| Passt zu unseren Regeln | gut: nichts committet, nichts deployt, keine Secrets | gut, aber mehr Secret-Handling |
| Nachvollziehbarkeit im Repository | Konfiguration liegt bei Apple, nicht im Repository | Workflow im Repository, Review per PR |
| Fehlersuche | Logs in App Store Connect | Logs in GitHub Actions |

**Empfehlung für den ersten privaten TestFlight: Xcode Cloud.** Gründe: Es entsteht kein Zertifikats- oder Schlüsselwesen auf unserer Seite, die Signierung und die TestFlight-Verteilung sind aus einer Hand, und wir brauchen vor dem Gerätetest keine neuen GitHub-Geheimnisse. Ausgelöst wird **nur** durch einen Tag `app-v*` (nie bei jedem Push), damit nichts ungewollt zu Apple läuft.
**GitHub Actions später**, wenn alle Builds im Repository nachvollziehbar sein sollen oder Xcode Cloud nicht passt. Die Vorlage ist fertig, aber nicht aktiv (liegt außerhalb von `.github/workflows`).
**Eigener Mac:** Nicht zwingend. Der erste Lauf kann in Xcode Cloud entstehen. Ein Mac ist nur nötig, wenn die Workflow-Einrichtung in Xcode (nicht im Web) erfolgen muss [prüfen] oder wenn wir Fehler lokal nachstellen wollen.

## 3. Apple-Konfiguration, exakt

| # | Schritt | Wer | Ergebnis |
|---|---|---|---|
| 1 | **Apple Developer Program** beitreten (99 €/Jahr). Als Organisation: D-U-N-S-Nummer, Prüfung kann Tage dauern | Owner | Team-ID, Rolle Account Holder |
| 2 | **Zusätzliche Nutzer** nur mit nötiger Rolle anlegen (App Manager reicht für TestFlight) | Owner | optional |
| 3 | **App-ID** (explizit) registrieren: Bundle-ID `de.visionuniverse.app` (Vorschlag, Verfügbarkeit prüfen). Capabilities: keine | Owner | App-ID |
| 4 | **App-Eintrag in App Store Connect:** Plattform iOS, Name „Vision Universe“ (Verfügbarkeit prüfen), Primärsprache Deutsch, Bundle-ID, SKU | Owner | App-Eintrag |
| 5 | **Interne Tester:** Personen als App-Store-Connect-Nutzer anlegen (bis zu 100); sie installieren über die TestFlight-App. **Keine** Beta-App-Prüfung bei internen Testern [prüfen] | Owner | Testgruppe „Intern“ |
| 6 | **Exportnachweis:** App nutzt nur HTTPS (Standardverschlüsselung). Der Owner beantwortet die Frage in App Store Connect; danach kann `ITSAppUsesNonExemptEncryption` in `Info.plist` gesetzt werden | Owner entscheidet, Claude setzt | keine Rückfrage bei jedem Build |
| 7 | **Datenschutz (App Privacy)** in App Store Connect grob ausfüllen (Konto: E-Mail, Nutzer-ID; Diagnose: keine). Für intern genügt ein Minimum, für den Store Pflicht | Owner | Eintrag |
| 8 | **Xcode Cloud** (Weg A): Produkt „Xcode Cloud“ für die App aktivieren, GitHub-App „Xcode Cloud“ mit Zugriff auf **nur dieses Repository** freigeben, Workflow anlegen (siehe 5.) | Owner (Zugriffsfreigabe), Claude liefert Skript und Einstellungen | Workflow |
| 8b | **API-Schlüssel** (nur Weg B): App Store Connect, Benutzer und Zugriff, Integrationen, Schlüssel mit Rolle App Manager (für Cloud-Signierung gegebenenfalls Admin) [prüfen]; `.p8` einmal laden, als GitHub-Geheimnis in der Umgebung `app-testflight` | Owner | `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID` |
| 9 | **Öffentliche Build-Werte** liefern: Supabase-URL und Publishable Key (Supabase, Project Settings, API) | Owner | `VU_SUPABASE_URL`, `VU_SUPABASE_PUBLISHABLE_KEY` |
| 10 | **iPhone** des Testers: iOS-Version ≥ Mindestversion der App (`IPHONEOS_DEPLOYMENT_TARGET = 14.0`), TestFlight-App installiert, Einladung angenommen | Tester | Installation |

### Signierung (Voraussetzungen)
- Distribution erfolgt **nur** über App Store Connect (TestFlight), kein Ad-hoc, keine Geräteregistrierung nötig.
- Weg A: Cloud-Signierung durch Apple, nichts bei uns.
- Weg B: entweder (1) API-Schlüssel mit `-allowProvisioningUpdates`, oder (2) Distribution-Zertifikat und App-Store-Profil, in einem temporären Schlüsselbund des Runners. Variante (1) ist in der Vorlage umgesetzt.
- Niemals ins Repository, in Chat oder PR: `.p8`, `.p12`, Profile, Passwörter.
- `CURRENT_PROJECT_VERSION` muss je Upload steigen (Skript setzt `CI_BUILD_NUMBER` bzw. `GITHUB_RUN_NUMBER`), `MARKETING_VERSION` setzt der Tag bzw. die Eingabe.

## 4. Vorbereitet im Repository (alles inaktiv)

| Datei | Zweck |
|---|---|
| `app/ios/App/ci_scripts/ci_post_clone.sh` | Xcode Cloud: Node und CocoaPods installieren, Web-Teil bauen, `cap sync`, Build-Nummer setzen. Ohne Xcode Cloud ohne Wirkung. |
| `app/ci/ios-testflight.workflow.yml.template` | GitHub-Actions-Vorlage (Weg B), liegt außerhalb von `.github/workflows`, Umgebung `app-testflight` mit Prüfern, nur `workflow_dispatch` von `main` |
| `app/README.md` | lokaler Ablauf auf einem Mac |

## 5. Ablauf des ersten privaten TestFlight-Uploads (Weg A: Xcode Cloud)

| Schritt | Wer | Ergebnis / Prüfung |
|---|---|---|
| 0 | Owner | Entscheidungen: Weg A, Bundle-ID, Namen. Developer-Konto vorhanden (Tabelle 3, Schritte 1 bis 4) |
| 1 | Claude | PR #1280 mergen lassen (Owner gibt frei) oder Branch als Quelle verwenden |
| 2 | Owner | Öffentliche Werte als Workflow-Umgebungsvariablen in Xcode Cloud setzen (Schritt 9) |
| 3 | Owner | Xcode-Cloud-Workflow anlegen: Repository, Projekt `app/ios/App/App.xcworkspace`, Scheme `App`, Plattform iOS, **Auslöser nur Tag `app-v*`**, Aktion Archive, Nach-Aktion „TestFlight (nur interne Tests)“ |
| 4 | Owner | Tag setzen, z. B. `app-v0.1.0`, **nur nachdem er das ausdrücklich beschlossen hat** (kein automatischer Auslöser) |
| 5 | Xcode Cloud | `ci_post_clone.sh`: `npm ci`, `build:www`, `cap sync ios`; Archiv; Upload |
| 6 | Owner | Build erscheint in App Store Connect unter TestFlight; Verarbeitung abwarten; Exportnachweis bestätigen |
| 7 | Tester | Einladung, Installation über TestFlight |
| 8 | Tester + Claude | Gerätetest nach Liste (Abschnitt 6) |

Fehlerfälle: Build-Nummer wiederholt (Skript prüfen), `pod install` scheitert (Podfile, Capacitor-Version), Signierung (Rolle/Vertrag nicht akzeptiert: Vertragsbedingungen in App Store Connect bestätigen), Exportnachweis offen (Build bleibt „Fehlende Compliance“).

## 6. Gerätetest (erster tatsächlicher iPhone-Test)

1. Start, Startbild, Safe Areas (Notch, Home-Indikator) im Hoch- und Querformat.
2. Anmeldung, Abmeldung, App beenden und neu starten (Sitzung bleibt), Flugmodus (Offline-Hinweis, keine Abmeldung).
3. Watchlist-Abgleich mit Web (Eintrag im Web entfernen, in der App prüfen).
4. Die vier Produkte: Bedienbarkeit, Scrollen, Chart-Gesten (Zoom, Fadenkreuz), Tastatur bei Suche, Ladezeit im Mobilfunk.
5. Passwortmaske im Rahmen: Eingabe, Verhalten nach App-Neustart.
6. Speicher (Instruments oder Xcode-Messwerte) und Abstürze.
7. Messwerte aus `PERFORMANCE.md` auf dem Gerät wiederholen.
