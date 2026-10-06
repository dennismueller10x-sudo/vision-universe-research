# Sicherheitsreview (03.10.2026)

Grundlage: Code und Workflows. Es wurden keine Secret-Werte ausgegeben. Der Klon ist **shallow** (148 Commits); die ältere Historie wurde nicht gescannt.

**Ergebnis:** kein kritischer Befund. Es gibt keine fest eingetragenen Live-Schlüssel und keinen Anbieterschlüssel im Browser-Code.
Provider-Abrufe laufen nur in Actions (Tiingo über Header, FMP mit redigierter Fehlermeldung) oder in Workers über `env`.

| # | Schwere | Befund | Status |
|---|---|---|---|
| H1 | High (falls als Zugriffsschutz verstanden) | Research-Zugangsmaske arbeitet nur clientseitig (`scripts/access-gate/runtime.js`). Daten und Originalseiten sind direkt abrufbar. Der Verifier ist öffentlich und hat einen festen Salt, also ist das Passwort offline angreifbar. | dokumentiert, Owner-Entscheidung: echte Durchsetzung am Edge (Cloudflare Access/Worker) oder langes Zufallspasswort |
| H2 | High | Script-Injection: `workflow_dispatch`-Eingaben direkt in `run:` (12 Workflows; braucht Schreibrecht) | **behoben** (`env:` + Formatprüfung; Company Intelligence in PR #389), ausgenommen Social-Workflows |
| M1 | Medium | Actions nicht auf SHA gepinnt; `npx wrangler@4` floatete in Jobs mit Cloudflare-, Anthropic- und Tiingo-Secrets | **erledigt (#422, 05.10.2026):** `wrangler@4.147.0`, `sharp@0.34.5`, jedes `npx`/`npm install` exakt; Wächter `quant/tests/workflow-npx-pinned.test.mjs` läuft in CI Config. SHA-Pins für `actions/*` bewusst nicht (Erstanbieter). |
| M2 | Medium | 6 CI-Workflows ohne `permissions:` | **behoben** (`contents: read`) |
| M3 | Medium | Social-Worker akzeptiert den Admin-Schlüssel auch als `?key=` (landet in Logs und Referer) | offen (Social-Workstream). Empfehlung: nur `Authorization: Bearer` |
| M4 | Medium | `assert-no-secrets.mjs` deckte `workers/`, `api/`, `assets/` nicht ab und kannte Anthropic-, Cloudflare- und S3-Namen nicht | **teilweise erledigt (#441, 05.10.2026):** Ziele und Umgebungswerte ergänzt, Anthropic-Muster, Test mit Gegenprobe. Offen: Scan der vollen Git-Historie (gitleaks), eigener PR mit Werkzeugwahl. |
| M5 | Medium | `vu-live` (WebSocket) ohne Verbindungs- und IP-Limit. Die Origin-Prüfung ist per Skript fälschbar. | offen. Empfehlung: Limit je `cf-connecting-ip` |
| L1 | Low | `vu-ask`: Passwort-Hash unsalted und öffentlich; Klartext im `localStorage` | offen |
| L2 | Low | `vu-ask` gibt Upstream-Fehlerdetails zurück (redigiert) | offen |
| L3 | Low | `news.js`: `javascript:`-URLs aus dem externen Feed | **behoben** |
| L4 | Low | `hedgefonds/index.html`: `photoUrl` ohne Scheme-Prüfung | offen (Seite wird im Branch `claude/hedgefonds-relaunch` neu gebaut) |

Die API-Endpunkte (`api/*.js`) validieren Ticker und Pfade, haben eine CORS-Allowlist und geben keine Fehlerdetails heraus.
`api/history.js` braucht ein Rate-Limit, bevor es eingeschaltet wird.
