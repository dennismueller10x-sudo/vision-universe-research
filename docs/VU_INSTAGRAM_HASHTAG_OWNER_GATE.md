# INSTAGRAM HASHTAG SEARCH — BEFUND AUS DEM ERSTEN ECHTEN LAUF

Stand: 2026-09-19

---

## WAS GEMESSEN WURDE

GitHub-Actions-Lauf **35459630391** (`Social External Observe` #2),
2026-09-19 17:57 UTC, gegen die echte Produktionsverbindung.

| Schritt | Ergebnis |
|---|---|
| Plan aus dem Content Universe | 8 Hashtags (5 Kern, 3 Erkundung), 0 von 30 Plaetzen belegt |
| Worker erreichbar | ja — `https://social.visionuniverse.de`, **HTTP 200** |
| Admin-Schluessel | gueltig, Anfrage angenommen |
| Hashtag-Abfragen | **8 von 8 gescheitert: `permissionRevoked`** |
| Gespeicherte Muster | 0 |

Die Kette steht also vollstaendig — Ausloeser, Plan, Worker, Endpunkt,
Abstraktion, Speicherung. Sie bekommt nur keine Daten.

`permissionRevoked` ist die kanonische Uebersetzung der Meta-Fehlercodes
10, 200, 3 und der Subcodes 458/459 (`workers/.../graph.js`). Sie
bedeutet: die App darf diese Abfrage nicht ausfuehren.

---

## WAS DAS NICHT BEDEUTET

- **Nicht**, dass die Verbindung weg ist. Der Worker hat einen
  Verbindungsdatensatz gefunden und das Token benutzt; ein abgelaufenes
  Token haette `tokenExpired` ergeben, nicht `permissionRevoked`.
- **Nicht**, dass die Hashtags leer sind. Sie wurden nie gefragt. Genau
  dieser Unterschied ist im Portfolio-Manager jetzt festgeschrieben:
  ein gescheiterter Versuch setzt `observedMediaCount` NICHT auf 0 und
  fuehrt im naechsten Fenster nicht zur Ausmusterung.
- **Nicht**, dass der Smoke-Publish-Weg betroffen ist. Veroeffentlichen
  und Hashtag-Suche brauchen verschiedene Berechtigungen.

---

## WAS DIE HASHTAG-SUCHE BRAUCHT

Zwei Berechtigungen, beide am selben Instagram-Business-Konto:

- `instagram_basic`
- `instagram_manage_insights`

Die zweite ist die, die beim Veroeffentlichen nicht gebraucht wird — und
der wahrscheinlichste Grund fuer diesen Befund.

---

## DER OWNER-SCHRITT

1. <https://developers.facebook.com/apps> oeffnen, die
   Vision-Universe-App auswaehlen.
2. Links **App-Ueberpruefung** → **Berechtigungen und Funktionen**.
3. Pruefen, ob `instagram_manage_insights` den Status **Standardzugriff**
   oder **Erweiterter Zugriff** hat. Fehlt sie oder steht sie auf
   „Nicht angefordert", dort beantragen.
4. Danach die Verbindung erneuern, damit das Token die neue Berechtigung
   traegt: die Connect-URL des Workers noch einmal durchlaufen
   (`/social/meta/connect`). Eine bestehende Autorisierung nimmt neue
   Berechtigungen NICHT nachtraeglich auf.

> Dieser Schritt kostet nichts und aktiviert keine kostenpflichtige
> Quelle. Er erweitert nur, was die bereits verbundene App lesen darf.

---

## WAS DANACH PASSIERT

`social/data/observe-request.json` aendern (ein neues `requestedAt`
genuegt) und pushen. Der naechste Lauf:

- gibt **keinen** neuen Hashtag-Platz aus — die acht vom 19.09. sind im
  Fenster bereits offen und werden **kostenlos** aufgefrischt;
- liefert also sofort Beobachtungen, ohne das Budget weiter zu belasten.

---

## WAS DER LAUF AUSSERDEM GEKOSTET HAT

Unbekannt — und so eingetragen.

Ob Meta einen der 30 Plaetze verbraucht, wenn `ig_hashtag_search`
scheitert, ist von hier aus nicht feststellbar. Bei einem Rahmen von 30
je sieben Tagen ist die teurere Annahme die richtige: die acht gelten
als verbraucht (`countedAgainstWindow: true`), aber ausdruecklich
**nicht** als beobachtet.

Solange der Befund besteht, gibt der Portfolio-Manager keine neuen
Plaetze mehr aus (`blockedByTerminalFailure`). Zwei Laeufe gegen
dieselbe fehlende Berechtigung waeren sechzehn moeglicherweise
verbrauchte Plaetze und null Beobachtungen.

---

## DREI NEBENBEFUNDE AUS DEMSELBEN LAUF

1. **`VU_SOCIAL_WORKER_URL` war als Secret verlangt und existiert
   nicht.** Die Worker-Adresse ist oeffentlich und steht in
   `social-smoke-publish.yml` im Klartext. Sie zum Geheimnis zu
   erklaeren, hat einen bekannten Wert in einen fehlenden verwandelt.
   Behoben — der erste Lauf brach daran ab, bevor irgendetwas abgefragt
   wurde.

2. **`git diff --quiet` sieht neue Dateien nicht.** Der Ingest meldete
   „Geschrieben", der Commit-Schritt direkt darunter „Keine Aenderung".
   Beides stimmte: die Dateien waren neu. Diesmal war nichts zu sichern —
   bei der ersten erfolgreichen Beobachtung waere es die Beobachtung
   selbst gewesen. Behoben (`git status --porcelain`).

3. **Ein Test verlangte das falsche Verhalten.** `EP9` hiess „Ein
   gescheiterter Hashtag zaehlt als null beobachtete Medien" und
   begruendete das mit der Ausmusterung. Die Begruendung war der Fehler.
   Der Test verlangt jetzt das Gegenteil.
