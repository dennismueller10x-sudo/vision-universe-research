# VU SOCIAL — DER END-TO-END-NACHWEIS

Stand: 2026-09-16 · Zweig `claude/vision-universe-social-os-eudjmx`

Am 16.09.2026 um 17:10:14 UTC ist der erste Beitrag dieses Projekts
öffentlich geworden. Dieses Dokument hält fest, **was belegt ist** — und
woraus. Es ist die Grenze zwischen „die Kette müsste funktionieren" und „die
Kette hat funktioniert".

---

## 1. Was der Beitrag war

| | |
|---|---|
| Konto | `@visionuniverse.aktienreports` (IG-ID `17841480148117405`) |
| Medien-ID | `17992767560843861` |
| Permalink | `https://www.instagram.com/p/DdWyjKNml42/` |
| Typ | `IMAGE` |
| Zeitstempel | `2026-09-16T17:10:14+0000` |
| Container-ID | `17895129099671604` |
| Bild | `assets/social/vu-social-publishing-test.jpg`, 1080×1080 |
| Text | Technischer Test unserer Social-Infrastruktur. Dieser Beitrag dient ausschließlich der Überprüfung des Publishing-Workflows. |

Der Owner hat den Beitrag nach der Prüfung **archiviert**. Er ist damit nicht
mehr öffentlich sichtbar; der Permalink zeigt für Fremde nichts mehr. Das
ändert nichts am Nachweis: der Beitrag hat existiert, und die Belege dafür
liegen unabhängig vom Beitrag.

---

## 2. Zwei Quellen, nicht eine

Ein einzelner Beleg für eine einmalige, nicht wiederholbare Handlung ist zu
wenig. Es gibt deshalb zwei, die voneinander nichts wissen:

**Erstens die Antwort des Aufrufs** — Lauf
[35126462509](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/35126462509),
`workflow_dispatch`, HTTP 200, als Artefakt `smoke-publish-antwort` (90 Tage):

```json
{ "published": true,
  "mediaId": "17992767560843861",
  "permalink": "https://www.instagram.com/p/DdWyjKNml42/",
  "mediaType": "IMAGE", "timestamp": "2026-09-16T17:10:14+0000",
  "containerId": "17895129099671604",
  "account": "visionuniverse.aktienreports",
  "verified": true, "verifyError": null, "attempts": 1 }
```

**Zweitens das Protokoll in KV** unter `smoke:publish:v1`, zurückgelesen in
Lauf [35127106052](https://github.com/dennismueller10x-sudo/vision-universe-research/actions/runs/35127106052):

```
published:      true
mediaId:        17992767560843861
permalink:      https://www.instagram.com/p/DdWyjKNml42/
mediaType:      IMAGE
timestamp:      2026-09-16T17:10:14+0000
Konto:          visionuniverse.aktienreports (17841480148117405)
Zurueckgelesen: ja
Versuche:       1, davon mit Medien-ID: 1

Genau EIN Beitrag ist entstanden.
```

Die Antwort sah nur der Lauf, der sie ausgelöst hat. Das Protokoll überdauert
ihn und liegt unter einem **eigenen** KV-Schlüssel, nicht in der Verbindung —
ein Trennen löscht die Verbindung, aber nicht den Beleg dafür, dass etwas
öffentlich gemacht wurde.

**Beide nennen dieselbe Medien-ID.** Das ist der eigentliche Nachweis: nicht
dass eine Stelle „veröffentlicht" sagt, sondern dass zwei unabhängig
geführte Aufzeichnungen dieselbe Kennung tragen.

---

## 3. Was damit bewiesen ist

Die vollständige Kette ist einmal in der Realität gelaufen:

```
Owner-Klick → GitHub Actions → Admin-Schluessel (Kopfzeile)
  → Worker → Allowlist → Bildpruefung (HEAD)
  → POST /{ig}/media       Container 17895129099671604
  → GET  /{container}      FINISHED
  → POST /{ig}/media_publish   Medien-ID 17992767560843861
  → GET  /{media}          Permalink zurueckgelesen  ✓
  → KV-Protokoll
```

Bewiesen ist damit — jeweils durch die Realität, nicht durch einen Test:

- Der **Business-Login** trägt ein Token, mit dem sich veröffentlichen lässt.
  Alle Zweifel aus der Diagnosephase (Redirect-URI, App-Domains,
  `noInstagramAccount`) sind damit erledigt, nicht umgangen.
- Der **Asset-Resolver** hat das richtige Konto gefunden. `/me/accounts` war
  leer; der Weg über `granular_scopes.target_ids` hat getragen.
- Die **Allowlist** hat das freigegebene Konto durchgelassen — und nur dieses.
- Die **Zweistufigkeit** (Container, dann Freigabe) funktioniert samt
  Zustandsabfrage dazwischen.
- Das **Zurücklesen** bestätigt aus einer dritten Richtung: `verified: true`,
  mit Permalink von Meta selbst.
- Der **Admin-Schutz** hat gehalten; der Schlüssel erscheint in keinem
  Protokoll, keiner Adresse und keinem Artefakt.
- **Genau ein Beitrag.** Ein Versuch, eine Medien-ID.

---

## 4. Was damit **nicht** bewiesen ist

Diese Liste ist der wichtigere Teil des Dokuments.

- **Nicht bewiesen: dass sich beliebige Inhalte veröffentlichen lassen.**
  Veröffentlicht wurde, was in zwei Umgebungsvariablen stand. Es gibt keinen
  Weg, ein Inhaltsobjekt aus der Pipeline zu veröffentlichen — die Stufen
  davor produzieren derzeit ins Leere.
- **Nicht bewiesen: dass Wiederholung folgenlos ist.** Die Einmaligkeit kam
  von einem globalen Schalter (`smoke:publish:v1`), nicht von einer Eigenschaft
  des Inhalts. Für einen zweiten Beitrag gibt es keine Idempotenz, und die
  Graph API stellt keine bereit.
- **Nicht bewiesen: dass die Verbindung dauerhaft trägt.** Gespeichert ist ein
  Page-Token; `tokenExpiresAt` steht auf `null`, weil der Code
  Page-Tokens als nicht ablaufend führt. Ob und wann dieses Token stirbt, ist
  **nicht gemessen** — und es gibt keine Überwachung, die es bemerken würde,
  bevor eine Veröffentlichung daran scheitert.
- **Nicht bewiesen: Videos, Karussells, Reels, Stories.** Geprüft ist genau
  ein Bildbeitrag.
- **Nicht bewiesen: Verhalten unter Rate Limits.** Ein Aufruf sagt darüber
  nichts.

---

## 5. Der Zustand danach

- Der Scheduler ist **aus**. Autopublish ist **aus**.
- `smoke:publish:v1` steht auf `published: true`. Ein erneuter Aufruf des
  Smoke-Endpunkts wird mit `alreadyPublished` (HTTP 409) abgelehnt und nennt
  den bestehenden Beitrag. Der manuelle Workflow bricht schon vorher ab, ohne
  den Endpunkt zu berühren.
- Der nächste öffentliche Beitrag kann nur durch eine neue, ausdrückliche
  Handlung entstehen.
- 225 Social-Tests, 117 Worker-Tests, 898 Quant-Tests grün.
