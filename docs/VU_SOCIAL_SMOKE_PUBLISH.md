# VU SOCIAL — DER EINE TESTBEITRAG

Stand: 2026-09-16 · Zweig `claude/vision-universe-social-os-eudjmx`

Dies ist der erste Schritt im Projekt, der etwas **öffentlich** macht. Alles
bisherige war lesend oder speichernd; ein Fehler kostete einen Versuch. Hier
kostet ein Fehler einen Beitrag im Instagram-Konto eines Unternehmens.

---

## 1. Warum so viele Sperren

Die Graph API kennt **kein Idempotenz-Token**. Ein zweiter
`media_publish`-Aufruf mit demselben Container erzeugt einen zweiten Beitrag. Es
gibt hier also keine Wiederholung, die folgenlos wäre — und damit keine Sperre,
die man sich sparen könnte.

| Sperre | Wogegen |
|---|---|
| Admin-Schlüssel | sonst könnte jeder veröffentlichen |
| nur `POST` | ein `GET` wäre über einen untergeschobenen Link auslösbar |
| `confirm=PUBLISH-ONE-TEST-POST` | absichtlich unbequem zu tippen — in einer Browserzeile entsteht das nicht versehentlich |
| Allowlist, **erneut** | zwischen Verbinden und Veröffentlichen kann die Konfiguration sich geändert haben |
| einmalig | die einzige Sperre gegen einen zweiten Beitrag |

Jede hat ihren eigenen Regressionstest. Ein Test, der nur den Erfolgsweg prüft,
prüft hier das Unwichtigere.

---

## 2. Der Ablauf

```
Bild prüfen  →  Container erstellen  →  Zustand abfragen  →  Freigeben  →  Zurücklesen
   HEAD          POST /{ig}/media       GET /{container}    POST /media_publish   GET /{media}
                 ─────────────── nichts öffentlich ──────────────┤ ab hier öffentlich
```

**Container erstellen und freigeben sind zwei Aufrufe, nicht einer.** Dazwischen
liegt der einzige Moment, in dem sich noch nichts Öffentliches ereignet hat: der
Container existiert, ist prüfbar, und niemand sieht ihn. Ein Container in
`ERROR` führt deshalb nicht zur Freigabe.

**Das Bild wird geprüft, bevor Meta es abholen soll.** Ohne diesen Schritt käme
eine unerreichbare Adresse als Meta-Fehlercode zurück, der nach einem Problem
mit dem Konto aussieht. Der Unterschied zwischen „Instagram mag das Bild nicht"
und „die Adresse antwortet nicht" gehört festgestellt, bevor Meta gefragt wird.

Zusätzlich prüft der Verifikationslauf in GitHub Actions dieselbe Adresse bei
jedem Deployment — dort ist sie erreichbar, aus meiner Arbeitsumgebung nicht.

---

## 3. Der Aufruf

```bash
export VU_SOCIAL_ADMIN_KEY=...        # einmal setzen, nicht in den Befehl tippen

curl -sS -X POST \
  -H "Authorization: Bearer $VU_SOCIAL_ADMIN_KEY" \
  "https://social.visionuniverse.de/social/meta/smoke-publish?confirm=PUBLISH-ONE-TEST-POST"
```

Der Schlüssel steht in der Kopfzeile, nicht in der Adresse: was in der Adresse
steht, landet im Verlauf und in Protokollen.

### Was Sie bei Erfolg zurückbekommen

```json
{
  "published": true,
  "mediaId": "…",
  "permalink": "https://www.instagram.com/p/…",
  "mediaType": "IMAGE",
  "account": "visionuniverse.aktienreports",
  "verified": true,
  "note": "Ein einzelner Testbeitrag. Es läuft keine Automatik …"
}
```

Der **Permalink ist der eigentliche Beleg**. Eine Medien-ID ist eine Zusage der
API; der Permalink lässt sich öffnen.

### Was der Beitrag enthält

**Das Bild:** `assets/social/vu-social-publishing-test.jpg`, 1080×1080, JPEG.
Dunkler Grund in der Palette der Seite (`#050505`, roter Akzent `#e5231f`),
darauf `VISION UNIVERSE®` und `Social Publishing Test`. Erzeugt von
`scripts/social/make-test-asset.mjs` — Farben, Maße und Text stehen dort im
Klartext, das Bild lässt sich jederzeit identisch neu erzeugen.

Vorher stand hier ein Fallback-Vorschaubild der Nachrichtenseite. Es war
abstrakt, seine Herkunft ist im Repository nicht dokumentiert, und es sagte
einem Betrachter nicht, was er sieht. Für ein Thumbnail auf der eigenen Seite
genügt das; für einen Beitrag aus einem Unternehmenskonto nicht.

**Die Bildunterschrift**, vom Owner zeichengenau freigegeben:

> Technischer Test unserer Social-Infrastruktur. Dieser Beitrag dient
> ausschließlich der Überprüfung des Publishing-Workflows.

Keine Hashtags, keine Erwähnungen, keine Verweise, kein Standort, keine
Markierungen. Der Container trägt genau zwei Felder — `image_url` und
`caption`; S17 prüft, dass kein drittes dazukommt.

Die Umlaute stehen hier ausgeschrieben, anders als in der übrigen
Konfiguration. Das ist Absicht: diese eine Zeile wird öffentlich *gelesen*.
IN5 und S16 halten sie fest — von `wrangler.toml` bis in den Parameter, den
die Graph API zu sehen bekommt.

Nach der Prüfung können Sie den Beitrag in der Instagram-App löschen — das
Protokoll im Worker bleibt davon unberührt.

---

## 4. Wenn es schiefgeht

Jede Stufe meldet sich mit eigenem Namen, und der Meta-Fehler kommt vollständig
zurück: `code`, `error_subcode`, `type`, `fbtrace_id`, HTTP-Status. Ohne die
`fbtrace_id` ist eine Rücksprache mit dem Meta-Support wertlos.

| `stage` | Bedeutung |
|---|---|
| `imageCheck` | Die Bildadresse antwortet nicht oder liefert kein JPEG. Meta wurde gar nicht gefragt. |
| `createContainer` | Meta lehnt das Bild ab. Nichts veröffentlicht. |
| `containerStatus` | Der Container steht auf `ERROR`/`EXPIRED`. Nicht freigegeben. |
| `publish` | Die Freigabe schlug fehl. **Der Zustand ist offen** — siehe unten. |
| `verify` | Veröffentlicht, aber das Zurücklesen scheiterte. HTTP 207. |

**Zu `publish`:** nach diesem Aufruf weiß niemand ohne nachzusehen, ob etwas
entstanden ist. Der Worker meldet das deshalb als *unsicher* statt zu behaupten,
es sei nichts veröffentlicht worden. **Vor einem zweiten Versuch im Konto
nachsehen.**

Tokens erscheinen in keiner dieser Meldungen und in keinem Protokolleintrag. Die
Meta-Meldung läuft durch dieselbe Schwärzung wie alles andere — Meta spiegelt
regelmäßig den gesamten Request zurück, und darin steht das Token.

---

## 5. Das Protokoll

Liegt unter einem **eigenen** KV-Schlüssel (`smoke:publish:v1`), nicht in der
Verbindung. Der Grund: ein Trennen löscht die Verbindung. Der Beleg dafür, dass
etwas öffentlich gemacht wurde, darf davon nicht verschwinden — der Beitrag ist
ja noch da.

Einmal veröffentlicht bleibt `published: true`, auch wenn ein späterer Versuch
fehlschlägt. Ein Fehlversuch darf einen Beleg nicht überschreiben.

---

## 6. Was danach **nicht** passiert

- Kein Scheduler, keine Content-Automation, keine Wiederholung.
- Der globale Autopublish-Schalter bleibt aus.
- Der nächste Beitrag entsteht nur durch einen weiteren ausdrücklichen Aufruf.

Ein zweiter Aufruf wird abgelehnt (`alreadyPublished`, HTTP 409) und nennt den
ersten Beitrag. Wer wirklich einen zweiten will, hängt
`&again=JA-ICH-WEISS-DASS-EIN-ZWEITER-BEITRAG-ENTSTEHT` an — der Parameter
benennt beim Tippen, was er tut.

---

## 7. Abgeschlossen

Der Testbeitrag ist am 2026-09-16 um 17:10:14 UTC auf
`@visionuniverse.aktienreports` erschienen — Medien-ID `17992767560843861`,
Permalink `https://www.instagram.com/p/DdWyjKNml42/` — und vom Owner nach der
Prüfung archiviert.

Der vollständige Nachweis samt beider Belegquellen und, wichtiger, der Liste
dessen, was damit **nicht** bewiesen ist, steht in
[`VU_SOCIAL_E2E_NACHWEIS.md`](./VU_SOCIAL_E2E_NACHWEIS.md).

Dieser Endpunkt hat seine Aufgabe damit erfüllt. Er bleibt bestehen, aber er
ist keine Grundlage für Automatik: er veröffentlicht, was in zwei
Umgebungsvariablen steht, und seine Einmaligkeit ist ein globaler Schalter
und keine Eigenschaft des Inhalts.
