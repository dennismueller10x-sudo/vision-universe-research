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

## Lokal prüfen (Linux oder macOS)

```bash
cd app && npm ci
npm test                       # 36 Tests, kein Netz
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

C16-Sheets und Aktien-Detailklappen behalten ihre Originalinhalte und Listener. Verlinkte Methoden-Details öffnen die bestehende Methodenseite in einem Sheet-Rahmen mit ausgeblendeter Web-Shell; Schließen entfernt den Rahmen wieder. Randwischen startet nur in den ersten 20 px; ab 35 % folgt `history.back()`, sonst Rückkehr. Sheets haben Ziehgriff, festen Zurück-Knopf, Vollbild-Taste, Fokusbindung und Escape. Android `@capacitor/app` sendet Zurück an den sichtbaren Forschungsrahmen (Herkunft und Fenster geprüft); am Produkteinstieg wird minimiert. Nicht erreichbare/alte Rahmen haben nach einer Sekunde einen Minimieren-Rückfall. Konto/Watchlist kehren zuerst zu Start zurück. Keine Token-Brücke.

Prüfung ohne Veröffentlichung:

```bash
node --test assets/tests/vu-gestures.test.mjs app/tests/*.test.mjs # vom Repo-Stamm
node app/scripts/gesture-browser.mjs --modules=/pfad/zu/node_modules --url=http://127.0.0.1:8765 --out=/tmp/vu-gestures-qa
node app/scripts/gesture-bridge-browser.mjs --modules=/pfad/zu/node_modules --url=http://127.0.0.1:8765
```

Browser-QA benötigt Playwright, axe-core und Chromium, verändert keine Produktionsdaten. Native Plugin-Aufrufe werden simuliert; echte iOS-/Android-Gerätegesten und Safe Areas bleiben im privaten Gerätetest zu prüfen. Der UA-Zusatz wird erst beim nächsten lokalen `cap sync` ins native Projekt übernommen; dieser PR veröffentlicht nichts.
