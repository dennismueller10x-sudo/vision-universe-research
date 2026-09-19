# OWNER-SCHRITT A — META: EINMALIGE REAUTORISIERUNG

Stand: 2026-09-19

---

## ZUERST: NICHT SOFORT KLICKEN

Dieses Dokument hat einen Vorlauf von zwei Minuten, und der ist wichtig.

Nach dem ersten echten Lauf kamen alle acht Hashtag-Abfragen mit
`permissionRevoked` zurück. Die naheliegende Erklärung war: ein Recht
fehlt, also neu autorisieren. **Diese Erklärung kann falsch sein**, und
dann wäre die Reautorisierung verbraucht, ohne dass sich etwas ändert.

Die Hashtag-Suche braucht **zweierlei** von Meta:

| | Was | Kommt aus | Reautorisierung hilft? |
|---|---|---|---|
| **Recht** | `instagram_basic`, `pages_read_engagement`, `instagram_manage_insights` | der Autorisierung | **ja** |
| **Freischaltung** | „Instagram Public Content Access" | der App-Überprüfung | **nein** |

Meta antwortet in beiden Fällen mit derselben Fehlerklasse. Der
Unterschied lässt sich nur am Abgleich mit den tatsächlich erteilten
Rechten erkennen.

> **Alle drei Rechte stehen bereits in `REQUIRED_SCOPES`** des Workers —
> seit dem ersten Bau. Der klassische OAuth-Pfad fragt sie an. Die
> Verbindung läuft aber über die **Business-Anmeldung**, und dort steht
> die Rechtemenge in einer Konfiguration bei Meta, die der Worker nicht
> lesen kann. Deshalb ist `scopes` dort `null` — und `null` ist nicht
> „keine".

---

## SCHRITT 0 — MESSEN STATT RATEN (kostet nichts, keinen Hashtag-Platz)

Es gibt jetzt einen Endpunkt, der die Frage beantwortet:

```
GET https://social.visionuniverse.de/social/meta/hashtag-capability?probe=aktien
Authorization: Bearer <VU_SOCIAL_ADMIN_KEY>
```

`#aktien` ist einer der acht Hashtags, deren Sieben-Tage-Fenster am
19.09. geöffnet wurde. Eine **erneute** Abfrage innerhalb des Fensters
zählt nicht noch einmal — dieser Test kostet **keinen** der 30 Plätze.

Bequemer, mit derselben Messung und fertiger Diagnose:

```
VU_SOCIAL_ADMIN_KEY=... node scripts/social/verify-hashtag-access.mjs
```

Das Skript wählt den Probe-Hashtag selbst aus dem Portfolio — und
probiert **gar nicht**, wenn kein Fenster mehr offen ist.

Es meldet einen von vier Zuständen:

| Zustand | Bedeutung | Owner-Schritt |
|---|---|---|
| `MISSING_SCOPE` | Rechte lesbar, eines fehlt | **Teil 1 unten** — Reautorisierung |
| `MISSING_APP_REVIEW_FEATURE` | alle Rechte da, trotzdem abgewiesen | **Teil 2 unten** — App-Überprüfung. **Keine Reautorisierung.** |
| `HASHTAG_ACCESS_UNKNOWN` | Rechte nicht lesbar | beide Teile lesen, mit Teil 2 beginnen |
| `HASHTAG_ACCESS_OK` | funktioniert | nichts zu tun |

---

## TEIL 1 — REAUTORISIERUNG (nur bei `MISSING_SCOPE`)

Genau **ein** Durchlauf. Der bestehende Pfad, keine zweite Integration,
keine neue Token-Architektur.

1. Auf dem Handy oder am Rechner öffnen:
   ```
   https://social.visionuniverse.de/social/meta/connect?key=<VU_SOCIAL_ADMIN_KEY>
   ```
   > Der Admin-Schlüssel steht hier in der Adresse, weil der Browser
   > keine Kopfzeile mitschicken kann. Er ist derselbe, der schon den
   > Smoke-Publish getragen hat.

2. Meta fragt nach dem Facebook-Konto → auswählen.
3. **Wichtig:** Im Berechtigungs-Dialog alle Haken **gesetzt lassen**.
   Wer hier etwas abwählt, nimmt dem System das Veröffentlichen weg —
   und das fällt sonst erst beim nächsten Beitrag auf.
4. Die Seite **Instagram-Konto auswählen** → `visionuniverse.aktienreports`.
5. Bestätigen. Der Worker zeigt eine Erfolgsseite mit dem verbundenen
   Konto.

> Die bestehende Verbindung wird dabei **ersetzt**, nicht ergänzt. Das
> ist der übliche Weg und der Grund, warum es genau ein Durchlauf sein
> soll.

---

## TEIL 2 — APP-ÜBERPRÜFUNG (bei `MISSING_APP_REVIEW_FEATURE` oder `UNKNOWN`)

Hier hilft kein Klick am Login, sondern nur ein Antrag.

1. <https://developers.facebook.com/apps> → die Vision-Universe-App.
2. Links **App-Überprüfung** → **Berechtigungen und Funktionen**.
3. Im Suchfeld `Instagram Public Content Access` eingeben.
4. Status ansehen:
   - **Erweiterter Zugriff** → vorhanden, dann ist die Ursache eine
     andere; Teil 1 prüfen.
   - **Standardzugriff** oder **Nicht angefordert** → **Erweiterten
     Zugriff anfordern**.
5. Meta verlangt dafür in der Regel:
   - eine **verifizierte Unternehmensidentität** (Business Manager →
     Unternehmensinfo → Verifizierung),
   - eine Beschreibung des Anwendungsfalls,
   - ein Screencast.

   Anwendungsfall, so wie er hier zutrifft und so, wie er stimmt:

   > Die App beobachtet öffentliche Beiträge zu Finanz-Hashtags, um
   > daraus abstrakte Formatmuster abzuleiten (Hook-Archetyp,
   > Format, Verhältnis Kommentare zu Likes). Fremde Texte, Bilder
   > und Creatives werden weder gespeichert noch weiterverwendet;
   > gespeichert werden ausschließlich Muster und Zahlen.

   Das ist keine Formulierungshilfe, sondern eine Beschreibung des
   gebauten Verhaltens: `social/tests/external-patterns.test.mjs`
   durchsucht die Ausgabe darauf.

6. Absenden. Die Prüfung dauert; eine Frist sagt Meta nicht zu.

---

## DANACH — NACHPRÜFEN (Pflicht, nicht Kür)

```
VU_SOCIAL_ADMIN_KEY=... node scripts/social/verify-hashtag-access.mjs
```

Der Lauf prüft in dieser Reihenfolge:

1. Verbindung und Zielkonto **gegen die Allowlist** — eine
   Reautorisierung kann ein anderes Konto verbinden.
2. **Veröffentlichen weiterhin möglich.** Das ist der einzige Befund,
   der den Lauf rot macht (Exit 2). Eine engere Rechtemenge nimmt dem
   System das Publishing, und das darf nicht stillschweigend passieren.
3. Rechte des gespeicherten Tokens.
4. Ein Versuch gegen einen bereits geöffneten Hashtag.
5. Die Diagnose daraus.

---

## DANN LÄUFT ES VON SELBST

`social/data/observe-request.json` ändern (ein neues `requestedAt`
genügt) und pushen. Der nächste Lauf:

- gibt **keinen** neuen Hashtag-Platz aus — die acht vom 19.09. sind im
  Fenster offen und werden **kostenlos** aufgefrischt;
- liefert also sofort Beobachtungen, ohne das Budget zu belasten.

Eine regelmäßige manuelle Re-Autorisierung ist **nicht** vorgesehen. Das
gespeicherte Page-Token läuft nicht ab, solange die Berechtigung nicht
entzogen und das Passwort nicht geändert wird — genau dafür wurde
seinerzeit das Page-Token statt des User-Tokens gespeichert.

---

## WAS DIESER SCHRITT NICHT FREIGIBT

- **Kein Publishing.** `GLOBAL_AUTOPUBLISH` und `VU_SOCIAL_AUTOPUBLISH`
  bleiben aus.
- **Keine kostenpflichtige Quelle.** Die Hashtag-Suche ist im
  bestehenden Zugang enthalten.
- **Keine Übernahme fremder Inhalte.** Gespeichert werden Muster und
  Zahlen, kein Text und kein Bild.
