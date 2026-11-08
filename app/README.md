# Vision Universe App (Prototyp, ADR-007)

Begrenzter Capacitor-Prototyp für eine **private iOS-Testversion**. Eigenständig: keine Seite, kein Workflow und kein Worker hängt davon ab.
Dokumente: [Login-Sicherheit](../docs/mobile/SECURITY_LOGIN.md) · [UI-Zielbild](../docs/mobile/UI_INTEGRATION.md) · [Performance](../docs/mobile/PERFORMANCE.md) · [TestFlight](../docs/mobile/TESTFLIGHT_PLAN.md)
Entscheidung: [ADR-007](../docs/architecture/ADR-007-capacitor-prototype.md) · Bericht und Messwerte: [docs/mobile/PHASE1_REPORT.md](../docs/mobile/PHASE1_REPORT.md)

## Aufbau

| Pfad | Inhalt |
|---|---|
| `www/` | Shell im App-Bundle: `index.html`, `app.css`, `js/` (Konfiguration, Token-Speicher, Anmeldung, Konto-API, Oberfläche) |
| `src/native.js` | Einstieg für das Bundle der nativen Plugins (`www/vendor/native.js`, erzeugt, nicht eingecheckt) |
| `capacitor.config.json` | Bundle-ID `de.visionuniverse.app` (Vorschlag), kein `server.url`, kein Klartext |
| `ios/` | erzeugtes Xcode-Projekt (`npx cap add ios`, **auf Linux erzeugt, nicht gebaut**) |
| `resources/` | **vorläufiges** Icon und Startbild aus der Wortmarke; `npm run` siehe unten |
| `scripts/` | `poc-browser.mjs` (Machbarkeitsnachweis), `measure-payload.mjs [--root <Release>]` (Ladegrößen), `verify-release.sh` (Release-Test, `app/` nicht ausgeliefert), `build-www.mjs`, `make-resources.mjs` |
| `ci/`, `ios/App/ci_scripts/` | **inaktive** Vorlagen für TestFlight (GitHub Actions bzw. Xcode Cloud), siehe `docs/mobile/TESTFLIGHT_PLAN.md` |
| `tests/` | Node-Tests für Anmeldung, API-Client, Token-Speicher und Grenzen aus ADR-007 |

## Nächster Build (0.2.0)

Sammelliste bis zum nächsten TestFlight-/Android-Build (Owner baut in 2–3 Tagen). **Stand des letzten Builds:**
TestFlight-Lauf 6 vom 07.11.2026 auf Commit `d871426`. Alles bleibt auf `main` gemergt; der Build vom aktuellen
`main` enthält es automatisch. Jeder App-PR trägt sich hier ein.

**Wirkt erst mit dem neuen Build** (liegt im App-Bundle `www/` oder im nativen Teil):

| PR | Änderung | Teil im Build |
|---|---|---|
| #1600 (K1) | natives Rand-Wischen vor/zurück auf iOS mit Vorschau und Haptik | `ios/App/App/VUBridgeViewController.swift`, `Main.storyboard`, `www/js/main.js` (Brücke `vuNav`, Haptik) |
| #1602 (K4, Teil) | kurzer Haptik-Impuls bei langem Drücken | Empfang in `www/js/main.js` aus K1; die Website sendet schon |
| #1630 | App startet mit der Willkommensseite `/willkommen/` statt mit Discover; Zurück endet dort | `www/index.html`, `www/js/main.js` |

**Wirkt schon ohne Build** (Website, live nach dem Pages-Deploy; die App lädt sie im Rahmen):

| PR | Änderung |
|---|---|
| #1602 (K4) | Druck-Feedback, kein Doppeltipp-Warten, kein Markieren beim Wischen (`assets/vu-gestures.css/js`) |
| #1604 (K5) | zwischen Untertabs wischen (`assets/vu-gestures.js`) |
| #1605 | Menü „Rechtliches & Infos“ statt Seitenfuß in der App |
| #1629 | Rechtstexte aus dem Menü öffnen im System-Browser (vorher still verworfen) |
| #1630 (Website-Teil) | `/willkommen/` zählt als Einstieg für Zurück (`assets/vu-gestures.js`); im alten Build ohne Wirkung |

**Build-Weg** (wirkt beim nächsten Build mit, ändert die App nicht): #1633 `npm ci --ignore-scripts` (kein libvips-Download), Gradle-Wrapper aus dem Actions-Cache mit Wiederholung und 60 s Netz-Zeitgrenze – nach dem Ausfall von GitHub Releases am 08.11.2026.

Vor dem Build: Bauprobe Android (`app-android-build.yml`, läuft auf jedem App-PR) und für iOS die Prüfungen ohne Mac
(`npm test`, `npm run poc`, Swift-Syntax und `project.pbxproj` gegen den letzten erfolgreichen TestFlight-Lauf).

## Lokal prüfen (Linux oder macOS)

```bash
cd app && npm ci
npm test                       # 52 Tests, kein Netz
node scripts/poc-browser.mjs   # Shell + echte Produktseiten im iPhone-Viewport, simulierte Dienste (Playwright nötig)
node scripts/measure-payload.mjs [--slow]   # gegen den Quelltext; für Produktionswerte --root <gebauter Release>
```

## Bauen (nur macOS mit Xcode)

```bash
cd app && npm ci
VU_SUPABASE_URL=https://<projekt>.supabase.co VU_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… npm run build:www   # öffentliche Werte; schreibt www/js/runtime-config.js (nicht eingecheckt)
npx cap sync ios && npx cap open ios
```

Der Build ist **nicht verifiziert**. Das Projekt wurde auf Linux erzeugt; `pod install` und Xcode liefen nicht.

## Grenzen

- Keine Stripe-, StoreKit- oder RevenueCat-Anbindung, keine Registrierung, keine Veröffentlichung.
- Das Token liegt nie in `localStorage`, `sessionStorage` oder Cookies (Wächtertest `tests/guards.test.mjs`).
- Konfiguration im Repository bleibt leer. Es gehört **kein** Service-, Secret-, Stripe- oder Store-Schlüssel in `app/`.

## App-Gesten (E3)

Die WebView kennzeichnet sich mit `VUApp/1` im User-Agent (`appendUserAgent`). Die gemeinsame Web-Shell lädt dann `assets/vu-gestures.{js,css}`. Native Hauptdokumente werden auch über Capacitor erkannt. Zum gezielten Browser-Test `?vuGestures=1` vor die Hash-Route setzen; ohne Flag/Capacitor/App-UA werden keine Gesten-Assets geladen.

C16-Sheets und Aktien-Detailklappen behalten ihre Originalinhalte und Listener. Verlinkte Methoden-Details öffnen die bestehende Methodenseite in einem Sheet-Rahmen mit ausgeblendeter Web-Shell; Schließen entfernt den Rahmen wieder. Randwischen startet nur in den ersten 20 px; ab 35 % folgt `history.back()`, sonst Rückkehr. Sheets haben Ziehgriff, festen Zurück-Knopf, Vollbild-Taste, Fokusbindung und Escape. Android `@capacitor/app` sendet Zurück an den sichtbaren Forschungsrahmen (Herkunft und Fenster geprüft); am Produkteinstieg wird minimiert. Nicht erreichbare/alte Rahmen haben nach einer Sekunde einen Minimieren-Rückfall. Konto/Watchlist kehren zuerst zu Start zurück. **Start ist die Willkommensseite `/willkommen/`** (Owner 08.11.2026, Ansicht `start` in `www/index.html`); Discover und alle anderen Bereiche öffnen von dort über Dock und Menü der Website im selben Rahmen, Zurück führt wieder zur Willkommensseite, dort minimiert Android. Keine Token-Brücke.

Prüfung ohne Veröffentlichung:

```bash
node --test app/tests/*.test.mjs # vom Repo-Stamm
node app/scripts/gesture-browser.mjs --modules=/pfad/zu/node_modules --url=http://127.0.0.1:8765 --out=/tmp/vu-gestures-qa
node app/scripts/gesture-bridge-browser.mjs --modules=/pfad/zu/node_modules --url=http://127.0.0.1:8765
```

Browser-QA benötigt Playwright, axe-core und Chromium, verändert keine Produktionsdaten. Native Plugin-Aufrufe werden simuliert; echte iOS-/Android-Gerätegesten und Safe Areas bleiben im privaten Gerätetest zu prüfen. Der UA-Zusatz wird erst beim nächsten lokalen `cap sync` ins native Projekt übernommen; dieser PR veröffentlicht nichts.
## K1: natives Rand-Wischen vor/zurück (iOS) und Haptik

`ios/App/App/VUBridgeViewController.swift` ersetzt im `Main.storyboard` den `CAPBridgeViewController`. Wischen vom linken Rand = zurück, vom rechten Rand = vor; die aktuelle Seite folgt dem Finger, darunter liegt die zuletzt gesehene Ansicht der Zielseite (Momentaufnahme je Verlaufseintrag, höchstens 8), Haptik an der 35-%-Schwelle, schneller Wisch ab 10 %. Entscheidung: kein `allowsBackForwardNavigationGestures`, weil die Website im Iframe der Shell läuft und WKWebView dann die gemeinsame Historie aller Rahmen und Momentaufnahmen des Hauptdokuments nutzen würde.

Ablauf: `assets/vu-gestures.js` meldet `vu:nav-state` (Navigation-API-Schlüssel, zurück/vor möglich, Sheet offen) an die Shell; `www/js/main.js` prüft Herkunft und Fenster und reicht an `webkit.messageHandlers.vuNav` weiter (Handler nimmt nur Nachrichten des Hauptrahmens an). Beim Loslassen ruft der Controller `VUAppNav.go('back'|'forward')`; die Shell schickt `vu:back`/`vu:forward` an den Iframe. Zurück ist mit Navigation API echter Rahmenverlauf (auch Start → Quant → Aktie), ohne API bleibt die E3-Regel. Die App hängt `VUEdge/1` an den User-Agent; dann baut die Website ihr JS-Randwischen nicht auf (alte Builds behalten es). Nur die äußersten Randpunkte gehören der Geste; Karussells und Charts behalten jedes andere Wischen.

Haptik: Tippen auf Leiste/Untertabs der Website meldet `vu:haptic`; iOS über den eigenen Handler, Android über `@capacitor/haptics` (7.x, MIT). Android-Zurück bleibt `backButton` → `vu:back`. Neuer App-Build nötig (`cap sync`, TestFlight-Workflow).

## K4: Tipp-Gefühl

Nur in der App (`[data-vu-gestures]`, `assets/vu-gestures.css`): sofortiges Druck-Feedback (`:active` 62 % Deckkraft), `touch-action: manipulation` (kein Warten auf Doppeltipp), kein grauer Tipp-Schleier, Bedienelemente nicht markierbar (Fließtext und Eingaben bleiben es), kein seitliches Gummiband beim Wischen. Langes Drücken auf Bedienelemente meldet einen Haptik-Impuls. Pull-to-refresh nativ entfällt bewusst: die Seite scrollt im Iframe, nicht in der Scroll-Ansicht der WebView.

## K5: zwischen Untertabs wischen

In der App wechselt ein deutlicher, schneller, waagrechter Wisch (≥ 70 px, mindestens 2,2-mal so waagrecht wie senkrecht, < 0,7 s) auf dem Inhalt zum Nachbar-Tab: zuerst im ARIA-Tabsatz um den Startpunkt (z. B. Discover-Detail), sonst in der Produkt-Leiste (z. B. Supertrader Start → Methoden → Signale → Backtests). Links wischen = nächster Tab. Ausgenommen sind die äußersten 24 px (native Randgeste K1), waagrecht scrollbare Bereiche (Karussells), SVG/Canvas (Charts), Eingaben, Regler, offene Sheets, markierter Text und alles mit `data-vu-no-swipe`. Touch-Ereignisse, weil der Browser beim Wischen `pointercancel` meldet. Rückwärts gewischt überspringt die Vorwärts-Gleitanimation aus K2. Swipe-to-Watchlist auf Listenzeilen ist bewusst nicht gebaut: die Zeilen liegen oft in waagrecht scrollbaren Tabellen, und das kollidiert mit dieser Geste.

## E4: Biometrie und kostenlose Push-Zustellung einrichten

`@capgo/capacitor-native-biometric` ist auf **7.5.1 (MIT)** festgesetzt. Es prüft die Biometrie; die Sitzung bleibt im vorhandenen nativen SecureStorage (Keychain/Keystore). Erst nach Passwortanmeldung wird einmal gefragt. Ohne Opt-in bleibt die Sitzung im Arbeitsspeicher. Einstellungen → Biometrie aus entfernt die persistierte Sitzung; Abmelden löscht sie ebenfalls. Beim nächsten Start werden Biometrie und ein Refresh abgewartet. Abbruch oder fehlgeschlagener Refresh zeigt die Passwortanmeldung.

Einmalige Einrichtung durch den Owner (keine Store-Veröffentlichung):

1. Migration `20261106000400_mobile_push.sql` über den vorhandenen Supabase-Migrationsweg einspielen und den Worker mit den neuen `/v1/auth/app/*`- und `/v1/push/devices*`-Endpunkten ausrollen. App bauen mit `VU_AUTH_TRANSPORT=worker VU_ACCOUNT_API=https://konto.visionuniverse.de npm run build:www`; dann `npx cap sync`. Dieser Weg braucht keinen Supabase-Schlüssel im App-Bundle und nutzt die Login-Limits der Konto-API. Der bisherige direkte Supabase-Testweg bleibt konfigurierbar.
2. Ein **Firebase-Projekt im kostenlosen Spark-Tarif** anlegen, Android und iOS mit Bundle-ID `de.visionuniverse.app` registrieren, FCM HTTP v1 aktivieren. Kein Analytics, keine kostenpflichtigen Firebase-Dienste nötig.
3. `google-services.json` lokal nach `app/android/app/` legen. `GoogleService-Info.plist` lokal nach `app/ios/App/App/` legen und in Xcode dem App-Target als Bundle-Ressource hinzufügen. Beide Dateien sind ignoriert und dürfen nicht committet werden. Ohne diese Dateien funktionieren die bisherigen privaten Builds, aber kein Push.
4. Im Apple-Entwicklerkonto für dieselbe App-ID Push Notifications aktivieren, ein passendes Entwicklungsprofil verwenden und den **APNs-Schlüssel nur in Firebase** hinterlegen (Team-ID und Key-ID). Das vorbereitete Entitlement nutzt `development`; Xcode verwaltet beim späteren Distributionssignieren die Umgebung. Keine Schlüssel ins Repo. Auf macOS `npx cap sync ios` / `pod install` ausführen; FirebaseMessaging ist als Pod eingebunden. Der AppDelegate übersetzt die APNs-Registrierung in ein FCM-Token. Automatische Tokeninitialisierung ist aus; eine Berechtigungsabfrage erfolgt nur über den Schalter „Benachrichtigungen“.
5. Ein Firebase-Servicekonto mit ausschließlich der Rolle **Firebase Cloud Messaging API Admin** einrichten. Die JSON-Datei außerhalb des Repositories halten und im Worker-Verzeichnis über `npx wrangler secret put FCM_SERVICE_ACCOUNT` als Worker-Secret setzen (passende Umgebung auswählen). Ohne Secret überspringt der vorhandene Cron den Push-Versand ohne Netzwerkzugriff.
6. Strang A muss den **vorhandenen** Erzeuger `scripts/account/build-watchlist-events.mjs` im bestehenden Release-Lauf anschließen und nach dessen Aktivierungsregeln das Artefakt `/core/data/watchlist-events-v1.json` veröffentlichen. E4 verändert weder die Datenaktivierung noch Workflows oder generierte Daten. Solange das Ereignisartefakt fehlt, bleibt der Versand aus. Nur bekannte frische Ereignisse aus Regelversion `watchlist-events-1.1.0` werden berücksichtigt, und nur Arten, die das Konto eingeschaltet hat (`notification_settings`, Schalter „Benachrichtigungen“ auf den Seiten bzw. `konto/push-settings.js`) und die der Watchlist-Eintrag nicht ausgeschaltet hat (Z4, `20261107000100_push_preferences.sql`). Ohne diese Auswahl im Konto gibt es keinen Push.
7. Auf echten iOS-/Android-Geräten prüfen: Passwort → einmaliger Biometrie-Dialog; Neustart/Abbruch/Rotation; Abschalten; Benachrichtigungen erst nach Opt-in; Empfang und Tokenwechsel; Abmelden. Keine Store-Veröffentlichung durchführen.

Der bestehende Worker-Cron bündelt höchstens **eine Nachricht je UTC-Tag und Konto** an das zuletzt registrierte Gerät; atomare SQL-Reservierung verhindert doppelte Zustellung durch parallele Läufe. Pro Lauf höchstens 15 Konten (Free-Unteranfragenbudget); bei Versandfehlern kein Wiederholen am selben Tag, damit ein unklarer FCM-Status keine zweite Meldung auslöst. Geräte verfallen nach 30 Tagen ohne Registrierung. Der Text nennt nur die Zahl der Regelereignisse und verweist auf Details und Datenstand in der App; keine Handelsaufforderung und keine Übertragung von Notizen/Tickern auf den Sperrbildschirm.

Bei Offline-Abmeldung wird die lokale Sitzung sofort gelöscht und die native Registrierung bestmöglich aufgehoben. Die Serverlöschung wird im sicheren Speicher vorgemerkt und bei der nächsten Anmeldung wiederholt; ohne Verbindung kann keine App eine sofortige Serverlöschung garantieren. Push-Abschaltfehler werden in den Einstellungen angezeigt. FCM und die Plugins verlangen kein laufendes Entgelt; bestehende Plattformkonten sowie die Free-Limits von Worker/Supabase bleiben Voraussetzung.

Prüfen: `npm test` in `app/`; Konten-Suite aus `CLAUDE.md`; zusätzlich `node --test workers/vu-account/tests/push.test.mjs`. Mit einem lokalen `PG_TEST_URL`: `node scripts/account/sql-tests.mjs` und `node --test workers/vu-account/tests/flows.test.mjs`. Native Builds/Keychain, Biometrie-Hardware und APNs/FCM-Empfang sind durch Node-/SQL-Tests nicht abgedeckt.
