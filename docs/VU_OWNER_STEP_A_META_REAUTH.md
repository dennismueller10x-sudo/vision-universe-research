# OWNER-SCHRITT A — META: GEMESSENER BEFUND UND ZWEI SCHRITTE

Stand: 2026-09-19, nach der Probe

---

## DER BEFUND — GEMESSEN, NICHT GESCHLOSSEN

Actions-Lauf **35463098608**, 19:03:18 UTC, genau ein lesender Versuch
gegen `#aktien` (ein bereits geöffneter Kern-Hashtag, kein zusätzlicher
Platz verbraucht):

| | |
|---|---|
| Konto | `@visionuniverse.aktienreports` |
| Verbunden | `true` |
| Auf Allowlist | `true` |
| **Veröffentlichen** | **`true`** — unverändert intakt |
| Rechte gelesen über | `GRANULAR_SCOPES` (5) |
| Erteilt | `pages_show_list`, `instagram_basic`, `instagram_manage_insights`, `instagram_content_publish`, `public_profile` |
| **Fehlt** | **`pages_read_engagement`** |
| Versuch | abgewiesen |
| `GRAPH_API_REASON` | `permissionRevoked` |

Und die Meldung der Plattform, wörtlich:

> `(#10) To use 'Instagram Public Content Access', your use of this
> endpoint must be reviewed and approved by Facebook. To submit this
> 'Instagram Public Content Access' feature for review please read our
> documentation on reviewable features.`

---

## ZWEI URSACHEN, ZWEI SCHRITTE

Beides liegt gleichzeitig vor. Wer nur einen Schritt geht, steht danach
wieder hier.

| | Was fehlt | Woher | Schritt |
|---|---|---|---|
| **1** | Freischaltung „Instagram Public Content Access" | App-Überprüfung | **Teil 2** |
| **2** | Recht `pages_read_engagement` | Autorisierung | **Teil 1** |

**Reihenfolge:** erst Teil 2 beantragen (er dauert), dann Teil 1 — oder
Teil 1 sofort, wenn die Freigabe da ist. Die Reautorisierung ist billig
und schnell; der Antrag nicht.

> **Was sich gegenüber dem letzten Stand geändert hat:**
> `instagram_manage_insights` ist **erteilt**. Meine erste Vermutung,
> genau dieses Recht fehle, war falsch. Gefehlt hat ein anderes — und
> vor allem die Freischaltung, die kein Recht ist.

---

## SCHRITT 0 — BEREITS GELAUFEN

Die Messung oben stammt aus diesem Schritt. Wiederholen lässt er sich
jederzeit, er kostet nichts und keinen Hashtag-Platz:

```
VU_SOCIAL_ADMIN_KEY=... node scripts/social/verify-hashtag-access.mjs
```

Oder über Actions: `social/data/capability-probe-request.json` ändern
und pushen. Der Endpunkt dahinter ist seit 18:39 UTC produktiv, über den
bestehenden Deploy-Pfad.

---

## TEIL 1 — REAUTORISIERUNG (gemessen erforderlich: `pages_read_engagement`)

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

## TEIL 2 — APP-ÜBERPRÜFUNG (gemessen erforderlich)

Meta hat diesen Schritt selbst benannt. Hier hilft kein Klick am Login,
sondern nur ein Antrag.

1. <https://developers.facebook.com/apps> → die Vision-Universe-App.
2. Links **App-Überprüfung** → **Berechtigungen und Funktionen**.
3. Im Suchfeld `Instagram Public Content Access` eingeben.
4. Status ansehen. Nach dem gemessenen Befund steht er auf
   **Nicht angefordert** oder **Standardzugriff** → **Erweiterten
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
