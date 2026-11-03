# Mobile Anmeldung: Tempolimit, Token-Lebenszyklus, Backend-Vorschlag

**Stand:** 03.11.2026 (Phase 2) · Code: `app/www/js/auth.js`, `app/www/js/token-store.js` · Tests: `app/tests/auth.test.mjs`, `security.test.mjs`
Alles hier ist aus dem Repository belegt oder als [offen] markiert. Es wurde **nichts** am Worker, an Supabase oder an einer Konfiguration geändert.

## 1. Befund: Login-Tempolimit bei direkter Supabase-Anmeldung

| Weg | Tempolimit | Quelle |
|---|---|---|
| Web (heute) | Worker: 10 Versuche je IP in 5 min, 30 je Adresse in 1 h (`LIMITS.login`, `loginAccount`), optional Cloudflare-Binding über alle Isolates; dahinter die Grenzen von Supabase Auth | `workers/vu-account/src/limits.mjs` |
| App-Prototyp (direkt) | **nur** die Grenzen von Supabase Auth selbst | `app/www/js/auth.js` |

Folgen, die sich aus dem Code ergeben:

1. **Der Worker-Schutz greift nicht.** Wer die Supabase-URL und den Publishable Key kennt, kann `/auth/v1/token` direkt aufrufen. Heute sieht kein Browser diese Werte, weil nur der Worker sie hält (Backend-for-Frontend, ADR-006). Eine App, die beide Werte enthält, macht sie auslesbar. Der Publishable Key ist öffentlich gedacht und kein Geheimnis, aber das Tempolimit des Workers umgeht man damit.
2. **Was bleibt, ist Supabase.** Die Repository-Konfiguration (`scripts/account/supabase-auth-config.mjs`) setzt Passwort-Mindestlänge 10, Refresh-Token-Rotation und ein Wiederverwendungsfenster von 10 s. Sie setzt **keine** eigenen Anmelde-Tempolimits und kein Captcha. Es gelten damit die Supabase-Vorgaben des Projekts. Deren Höhe habe ich nicht abgerufen [offen].
3. **Mobilfunk-IPs:** Viele Geräte teilen sich eine Provider-IP (CGNAT). Ein IP-Limit trifft dann Unbeteiligte. Das gilt für das Worker-Limit ebenso.
4. **Registrierung:** Die App ruft keine Registrierung auf, das Tor im Worker (`VU_REGISTRATION_ENABLED`) bleibt unberührt. Ein direkter Supabase-Signup wäre dagegen offen, falls Supabase Signups erlaubt [offen, nicht geprüft].

**Bewertung:** Für den **privaten, internen** TestFlight-Build vertretbar (wenige bekannte Tester). Für alles Öffentliche **nicht** vertretbar. Die Anmeldung gehört dann über den Worker.

## 2. Vorschlag (separater PR, nicht Teil von #1280, braucht Worker-Freigabe)

**Stand 03.11.2026:** Umgesetzt als Entwurf in **#1308** (Worker, rollt nach Merge automatisch aus, braucht Owner-Freigabe) und im App-PR (Verdrahtung, `app/tests/worker-route.test.mjs` gegen den echten Worker). Abweichungen zum Vorschlag: Neben `Origin` und Cookie wird auch `Sec-Fetch-Site`/`Sec-Fetch-Mode` abgelehnt, und ein Preflight auf `/v1/auth/app/*` bekommt 403. Das Refresh-Limit heißt `appRefresh` und liegt bei 60/h je IP. `logout` nimmt zusätzlich `{refreshToken}` an, damit die Sitzung auch mit abgelaufenem Zugriffstoken widerrufen wird. Der Standard bleibt `authTransport: 'supabase'` bis zum Gerätetest. Auf dem Gerät ist zu prüfen, ob CapacitorHttp ohne `Origin` und ohne Cookies sendet. Hat die WebView Cookies von `konto.visionuniverse.de`, etwa aus einem Web-Login im eingebetteten Inhalt, lehnt der Worker die Anfrage ab (`APP_CLIENT_ONLY`).

Neue Endpunkte im Worker, die dieselbe Logik und dieselben Limits wie `login`, `refresh` und `logout` nutzen, aber Tokens im **Antworttext** liefern. Die App braucht dann **keinen** Supabase-Schlüssel mehr (`authTransport: 'worker'` in `app/www/js/config.js`, bereits implementiert und getestet gegen einen simulierten Worker).

| Endpunkt | Anfrage | Antwort | Limits und Fehler |
|---|---|---|---|
| `POST /v1/auth/app/login` | `{email, password}` | `200 {accessToken, refreshToken, expiresIn, user:{id,email}}` | `ctx.limit('login')`, `ctx.limit('loginAccount')`; gleiche Zustände wie Web: `INVALID_CREDENTIALS` 401 (gleich für unbekannte Adresse), `EMAIL_NOT_CONFIRMED` 403, `RATE_LIMITED` 429 |
| `POST /v1/auth/app/refresh` | `{refreshToken}` | wie oben, neues Paar | eigenes Limit (z. B. 30 je Stunde je IP); `TOKEN_INVALID` 401 |
| `POST /v1/auth/app/logout` | Bearer | `200 {authenticated:false}` | Supabase-Logout best effort |

Vorgaben für den PR:
- Der Endpunkt gilt nur für Anfragen **ohne** Cookie und **ohne** Browser-`Origin` (App-HTTP), damit er kein zweiter Browser-Anmeldeweg wird. Browser behalten Cookies (kein Token im Browser-Speicher).
- Antworten mit `Cache-Control: no-store`. Tokens werden nie protokolliert (`ctx`-Logs prüfen).
- Mit Tests nach dem Muster `workers/vu-account/tests/flows.test.mjs` (Limit, falsches Passwort, Rotation, abgelehnter Refresh).
- Wirkt erst nach Merge und automatischem Ausrollen (`account-production-auto.yml`). Er ändert keine Zahlungsschalter und braucht keine zahlungsrelevante Freigabe. Ob der Owner trotzdem eine ausdrückliche Zustimmung für Worker-Code will, entscheidet er.
- Optional: Gerätebindung und Captcha erst bei öffentlichem Start.

Alternative ohne Worker-Änderung: nur Supabase-Dashboard-Limits für Anmeldungen und Token-Erneuerung prüfen und enger setzen. Das schützt nicht vor dem Auslesen des Schlüssels und lässt sich nicht im Repository versionieren.

## 3. Token-Lebenszyklus (getestet)

| Eigenschaft | Verhalten | Test |
|---|---|---|
| Speicherort nativ | iOS-Keychain, Zugriffsklasse `whenUnlockedThisDeviceOnly`, kein iCloud-Abgleich, genau ein Eintrag | `security.test.mjs` (Keychain) |
| Speicherort Browser (nur Entwicklung) | Arbeitsspeicher; nie `localStorage`, `sessionStorage`, Cookie, IndexedDB | `guards.test.mjs`, `token-store.test.mjs` |
| Ablage scheitert (Keychain gesperrt) | Anmeldung schlägt mit `STORAGE_FAILED` fehl, **keine** Sitzung nur im Speicher | `security.test.mjs` |
| Erneuerung | 60 s vor Ablauf, nur ein Aufruf gleichzeitig (Rotation), neues Paar ersetzt das alte | `auth.test.mjs` |
| Erneuerung abgelehnt (4xx) | Abmeldung und Löschung des Eintrags | `auth.test.mjs`, `security.test.mjs` |
| Kein Netz / Serverfehler | Sitzung bleibt, altes Token wird weiterverwendet bis zur nächsten Erneuerung | `auth.test.mjs`, `security.test.mjs` |
| Abmelden | lokale Löschung zuerst, auch ohne Netz; Server-Logout best effort | `auth.test.mjs`, `security.test.mjs` |
| Kontowechsel | neue Anmeldung ersetzt den Eintrag vollständig | `security.test.mjs` |
| Token in Meldungen und Konsole | nie; Fehler tragen nur Code und Status | `security.test.mjs` |

Nicht geprüft [offen, nur auf dem Gerät möglich]: echte Keychain (Zugriff nach Neustart, nach Gerätesperre, Verhalten bei Backup und Wiederherstellung), Erneuerung nach App-Hintergrund über Stunden, Supabase-Rotation mit dem echten Wiederverwendungsfenster, Verlust des Eintrags bei App-Neuinstallation (iOS behält Keychain-Einträge teils über die Löschung der App; dann beim ersten Start prüfen und bei Bedarf bewusst löschen).

## 4. Konto löschen (Store-Pflicht, noch nicht in der App)

Der Worker bietet `POST /v1/me/delete` (Passwort und „LÖSCHEN“, beendet Stripe-Abos, Cascade). Für den **internen** TestFlight nicht nötig. Für den Store verlangt Apple die Löschung **in der App** (Richtlinie 5.1.1(v), Stand meines Wissens, nicht neu abgerufen). Die App bekommt dafür später eine Maske mit demselben Bearer-Aufruf. Ein Store-Abo wird dadurch nicht gekündigt (Hinweis nötig).
