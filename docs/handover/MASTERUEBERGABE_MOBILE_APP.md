# Masterübergabe – Vision Universe Mobile App (Stand 03.11.2026)

## 1. Auftrag und Priorität
**Einziges Ziel:** Vision Universe als **private iPhone-App über TestFlight** installieren, nur für den Owner.
Keine neuen Audits oder Konzeptphasen, außer sie sind für den ersten lauffähigen TestFlight-Build nötig.
**Keine Nebenprojekte** aus Quant, Elliott, Supertrader oder Datenpipelines. Dokumentierte Probleme bleiben in GitHub und werden unabhängig behandelt.

Repo: `dennismueller10x-sudo/vision-universe-research`. Arbeitsregeln: `CLAUDE.md` (deutsch antworten).

## 2. Feste Regeln (Owner-Entscheidungen)
- **Nie selbst mergen.** Merge nur auf ausdrückliche Owner-Freigabe.
- Keine produktiven Deployments. **Keine Apple-Uploads, keine App-Einträge, keine Neuregistrierung** ohne gesonderte Freigabe.
- **Alle privaten Apple-Schlüssel und Signierdaten nur lokal erzeugen und nur in GitHub Secrets / Passwortmanager.** Nie in Chat, Commit, PR, Artefakt oder Screenshot. Claude sieht nur Namen, nie Werte.
- Passwortmaske der Research-Seite, Stripe-Web, Worker und Datenbank bleiben unverändert. Store-Käufe erst nach erfolgreichem Gerätetest.
- Direkter Supabase-Login in der App nur für die **geschlossene** TestFlight-Phase; vor öffentlichem Release auf Worker-Login umstellen (`docs/mobile/SECURITY_LOGIN.md`).
- Gates nicht abschwächen. Elliott bleibt experimentell.

## 3. Stand der App
- **Capacitor-7-Prototyp ist auf `main`** (`app/`, ADR-007 `docs/architecture/ADR-007-capacitor-prototype.md`, PR #1280 gemerged). App-Tests 38/38, PoC 22/22.
- Login: Supabase-Passwort-/Refresh-Grant, Token nur im iOS-Keychain (`@aparajita/capacitor-secure-storage`), nie localStorage.
- Die Produktbereiche laufen im Prototyp als iframes in einer CSP-Shell; `app/` ist aus dem Pages-Release ausgeschlossen (getestet).
- **Pipeline-Vorlage vorhanden, nicht aktiv:** `app/ci/ios-testflight.workflow.yml.template`, `app/ci/fastlane/`, `app/ci/make-signing-request.sh`. Aktiv wird sie erst als `.github/workflows/app-ios-testflight.yml` in einem Folge-PR.
- Dokumente: `docs/mobile/TESTFLIGHT_STEP_BY_STEP.md` (**Hauptanleitung**), `TESTFLIGHT_PLAN.md`, `APPLE_DEVELOPER_NAME.md`, `SECURITY_LOGIN.md`, `UI_INTEGRATION.md`, `PERFORMANCE.md`.
- Buildweg (entschieden): **GitHub Actions, macOS-26-Runner (Xcode 26.6), manuelle Signierung (.p12 + Profil), fastlane `beta`, ASC-API-Schlüssel, Umgebung `app-testflight` mit Pflichtfreigabe durch den Owner, nur `main`.** Xcode Cloud nur als Rückfall (braucht einmal einen Mac).

## 4. Blockade und Reihenfolge
**Blockiert durch Apple:** Die Organisationsregistrierung der **RAM Consulting UG** läuft. Bis zur Bestätigung gibt es kein Zertifikat, keinen API-Schlüssel, keinen App-Eintrag.
Entwicklername „Vision Universe“: im Feld *Company Name* **nur beim ersten App-Eintrag**, danach unveränderbar (`APPLE_DEVELOPER_NAME.md`). Daher App-Eintrag erst nach Klärung.

Was **vor** der Apple-Bestätigung schon möglich ist (für den Owner, Windows-PC): Git for Windows installieren, Repo als ZIP/clone holen, Passwortmanager bereithalten, D-U-N-S/Firmen-Daten nach `APPLE_DEVELOPER_NAME.md` §5 prüfen, Supabase-URL und **publishable** Key heraussuchen.

### Schritte nach Apple-Freigabe (Details: TESTFLIGHT_STEP_BY_STEP.md, Phasen 1–9)
| # | Schritt | Wer / Gerät |
|---|---|---|
| 1 | Mitgliedschaft aktiv, Verträge akzeptieren, Team-ID notieren | Owner, PC-Browser |
| 2 | Bundle-ID `de.visionuniverse.app` anlegen (explizit, keine Capabilities) | Owner, PC |
| 3 | App-Eintrag in App Store Connect (Company Name = geklärter Name), Gruppe „Intern“ mit Owner | Owner, PC |
| 4 | `bash app/ci/make-signing-request.sh csr <apple-id>` → CSR hochladen → `.cer` laden → `… p12 <cer>` (Passwort ≥ 16 Zeichen) → Profil „VU App Store“ laden | Owner, Git Bash |
| 5 | ASC-API-Schlüssel (Rolle App Manager), `.p8` einmal laden | Owner, PC |
| 6 | GitHub-Umgebung `app-testflight` (Reviewer = Owner, Self-Review aus, nur `main`), **7 Secrets**: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `IOS_DIST_P12_BASE64`, `IOS_DIST_P12_PASSWORD`, `IOS_PROFILE_BASE64`; **3 Variablen**: `IOS_PROFILE_NAME`, `VU_SUPABASE_URL`, `VU_SUPABASE_PUBLISHABLE_KEY` | Owner, PC |
| 7 | Gemeinsame Prüfliste A1–A7, G1–G5 (nur Ja/Nein, nie Werte) | gemeinsam |
| 8 | Claude: Folge-PR aktiviert Workflow (kein Lauf); Owner gibt frei | Claude / Owner |
| 9 | **Vorprüflauf** (`preflight_only` an, Freigabe in GitHub) | Owner startet, Claude liest Ergebnis |
| 10 | **Erster Build** Version `0.1.0`, `preflight_only` aus, 20–40 min; Claude behebt Fehler in Folge-PRs (typisch: Pod-Signiermodus, Info.plist, Privacy-Manifest, Profilname) | Owner / Claude |
| 11 | Exportkonformität beantworten, Build der Gruppe „Intern“ zuweisen; iPhone: TestFlight installieren, App installieren, Login testen | Owner, iPhone |

Die Anleitung ist auf den Stand `main` aktualisiert (kein Capacitor-Branch, #1280 erledigt).
Geräte: Apple-Portal, App Store Connect und GitHub-Einstellungen am **Windows-PC im Browser**; Zwei-Faktor und TestFlight am **iPhone**; Build auslösen/freigeben PC oder GitHub-App.

## 5. Offene Punkte nur für die App (nicht blockierend, nach dem ersten Build)
- Etappe B: App-Modus im Hauptfenster statt iframes (UI_INTEGRATION.md).
- Worker-Login statt direktem Supabase vor öffentlichem Release.
- Zertifikat läuft nach 1 Jahr ab (Termin notieren).

## 6. GitHub-Stand (nur Übersicht, nicht Teil des App-Auftrags)
- `main`: `b7cdd0b6ad` (Intraday-Takt). Repo-Schutz: nur „Schutz vor Verlust“ (kein Löschen/Force-Push), keine Pflicht-Checks. Vercel-Free-Limit 100 Deployments/Tag und Cloudflare-Preview-Fehler auf PRs sind extern.
- **PR #1300 (Betrieb, offen, nicht gemerged):** Healthcheck Chartbild-Nachziehen, begrenzte fetch/push-Versuche, `workflow_run` nur auf `main`. Lokal Tests grün; CI beim letzten Stand noch laufend. Beleg: `docs/operations/V3_FOLLOW_HEALTH_AND_PUSH_LIMITS.md`. Merge nur auf Owner-Freigabe.
- **Offene Issues (2):** #1293 (Pipeline-Alarm technical-world, Commit-Schritt cancelled, vermutlich dasselbe Hänge-Muster), #1211 (Elliott-Registry-Wochenlauf 30.10. rot, ggf. durch #1296 behoben, ungeprüft). Beide unabhängig von der App.
- **Offene PRs (31)** gehören zu Quant, Supertrader, Technical, Europe, Konto-UX: unberührt lassen. Nicht ohne Freigabe mergen: #1227 (Backtest-Vorschau), #1268/#1270/#1272/#1273 (Paper 2027). #1284 (Vercel-Doku) unberührt.
- Bekannte, getrennte Altlasten: Quant-CI auf `main` war schon vor der App rot (Datenlauf `a8219f07a7`), getrennt in #1279 behandelt.

## 7. Erste Aktionen im neuen Chat
1. `TESTFLIGHT_STEP_BY_STEP.md` lesen, Owner nach dem Apple-Status fragen (Registrierung bestätigt?).
2. Falls noch nicht bestätigt: nur Vorbereitung am PC (Abschnitt 4), nichts bei Apple anlegen.
3. Falls bestätigt: Schritt 1–7 mit dem Owner durchgehen, danach Aktivierungs-PR (Schritt 8). Keine Werte im Chat.
