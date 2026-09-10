# Vercel als geschuetzte Vorschau

**Stand:** 2026-09-10 · Zweig `claude/vercel-protected-preview`

Zwei Auslieferungen aus einem Repository:

| | GitHub Pages | Vercel |
|---|---|---|
| Adresse | `research.visionuniverse.de` | die Vorschauadresse des Projekts |
| Zugang | oeffentlich | nur angemeldet |
| Daten | wie bisher, unveraendert | zusaetzlich das abgeleitete Universum |
| Suchindex | wie bisher | `noindex, nofollow, noarchive` |

Der Unterschied entsteht **zur Bauzeit**, nicht im Repository. Vercel
fuehrt `scripts/preview/build-preview-dataset.mjs` aus; dabei entstehen
`quant/data/preview/universe.json` und `preview-universe/index.html`.
Beide sind in `.gitignore` und existieren auf Pages schlicht nicht. Damit
bleibt die oeffentliche Auslieferung Byte fuer Byte, was sie war — das
prueft `PD8` gegen den Diff, nicht gegen eine Zusicherung.

---

## 1. Was der Eigentuemer noch einstellen muss

Diese Schritte liegen in der Vercel-Oberflaeche und sind von hier aus
nicht erreichbar. **Ohne Schritt 1.1 ist die Vorschau oeffentlich.**

### 1.1 Deployment Protection einschalten — zwingend

*Vercel Dashboard → Projekt → Settings → Deployment Protection*

1. **Vercel Authentication**: auf **Standard Protection** oder
   **All Deployments** stellen.
   * *Standard Protection* schuetzt Vorschau-Deployments; die
     Produktionsdomain bleibt offen.
   * *All Deployments* schuetzt zusaetzlich die Produktionsdomain des
     Vercel-Projekts.
   Fuer dieses Projekt ist **All Deployments** richtig: es gibt hier
   keine oeffentliche Vercel-Domain, die offen bleiben soll — das
   Oeffentliche liegt auf GitHub Pages.
2. Zugriff bekommt, wer Mitglied des Vercel-Teams ist. Weitere Personen
   ueber *Settings → Members* einladen.

Alternative, falls kein Vercel-Konto je Person gewuenscht ist:
**Password Protection** (Pro-Tarif). Ein Passwort fuer alle. Schwaecher —
kein Entzug je Person, keine Spur, wer geschaut hat — aber
serverseitig durchgesetzt und damit kein Scheinschloss.

### 1.2 Adresse hinterlegen — zwingend fuer den Nachweis

*GitHub → Repository → Settings → Secrets and variables → Actions → Variables*

| Name | Wert |
|---|---|
| `VERCEL_PREVIEW_URL` | `https://<projekt>.vercel.app` |

Die Adresse ist kein Geheimnis (die Tuer ist ja zu), deshalb Variable und
nicht Secret.

### 1.3 Bypass-Token fuer den Automaten — optional, aber ohne ihn bleibt der halbe Nachweis offen

*Vercel → Projekt → Settings → Deployment Protection → Protection Bypass for Automation*

1. Token erzeugen, Wert kopieren.
2. In GitHub als **Secret** ablegen:

| Name | Wert |
|---|---|
| `VERCEL_AUTOMATION_BYPASS_SECRET` | der erzeugte Token |

Ohne diesen Token prueft der Workflow nur die Abweisung (V1) und die
oeffentliche Seite (V9). V2 bis V7 meldet er dann als `SKIPPED` — nicht
als bestanden.

> **Was der Token beweist und was nicht.** Er belegt, dass die
> Schutzschicht einen *berechtigten* Aufrufer durchlaesst. Er belegt
> **nicht**, dass die SSO-Anmeldung eines Menschen funktioniert; das ist
> ein anderer Weg durch dieselbe Tuer. Der Bericht schreibt diesen
> Unterschied in das Feld `authenticationProofScope`.

### 1.4 Build-Einstellungen gegenpruefen — sollte automatisch stimmen

*Vercel → Projekt → Settings → General*

`vercel.json` setzt bereits Framework (`null`), Build-Befehl und
Ausgabeverzeichnis. Falls in der Oberflaeche noch etwas anderes steht,
dort auf **Override: aus** stellen, damit `vercel.json` gilt.

---

## 2. Nachweis fahren

*GitHub → Actions → „Vercel — Nachweis der geschuetzten Vorschau" → Run workflow*

Oder lokal, wenn das Netz offen ist:

```
VERCEL_AUTOMATION_BYPASS_SECRET=… \
  node scripts/site/verify-vercel-preview.mjs --base https://<projekt>.vercel.app
```

| Nachweis | Frage |
|---|---|
| V1 | Wird ein Aufruf **ohne** Zugangsmittel abgewiesen — Wurzel, Ansicht **und** JSON-Datei? |
| V2 | Kommt ein berechtigter Aufrufer hinein? |
| V3 | Traegt der Datensatz 5.684 Titel, ohne Kursniveaus und ohne Kursreihen? |
| V4 | Sind Titel ausserhalb der Golden Five auffindbar und belegt? |
| V5 | Traegt der Screener echte Zaehlungen, und ist jede leere Rangfrage **ausgewiesen** leer? |
| V6 | Oeffnet sich ein Einzeltitel (`?ticker=ORCL`)? |
| V7 | Laeuft das Layout bei 390 px nicht ueber? |
| V8 | Steht irgendwo ein Schluessel im ausgelieferten Inhalt? |
| V9 | Ist die oeffentliche Auslieferung unveraendert, und fehlen die Vorschaupfade dort? |

Das Gesamturteil kennt drei Werte:

* `PREVIEW_VERIFIED` — alle neun belegt.
* `PARTIALLY_VERIFIED` — nichts gescheitert, aber etwas uebersprungen.
  **Ein uebersprungener Nachweis ist kein bestandener.**
* `FAILED` — mindestens einer gescheitert.

---

## 3. Was in der Vorschau steht — und was nicht

Drei Dinge, die regelmaessig verwechselt werden:

| | Zustand |
|---|---|
| **Abgeleitetes Universum** — Zustaende und Zaehlungen je Titel | **vorhanden**, 5.684 Titel |
| **Kurshistorien-Bestand** — rund 7,4 GB Kursreihen | **NICHT ausgeliefert**, existiert in keinem Zweig dieses Repositorys |
| **Kursniveaus** — einzelne Kurse, SMA-Werte, 52-Wochen-Marken | **zurueckgehalten**, Lizenzpruefung offen |

Ausserdem fehlt eines, und es fehlt sichtbar:

**Die Faktorzeilen je Titel** (Momentum, SMA-Abstand, Lage im
52-Wochen-Band) liegen nur fuer die fuenf Canary-Titel vor. Sie
entstanden im FULL_UNIVERSE-Lauf in der Arbeitsablage des Runners und
gingen mit ihm. Folgen:

* Jede Zeile traegt `factorsStatus: "NOT_IN_DELIVERED_ARTEFACTS"` — kein
  leeres Feld, das wie ein Nullwert aussieht.
* Die neun **Rangfragen** des Screeners tragen keine Namen und weisen das
  aus (`resultStatus: "NOT_IN_DELIVERED_ARTEFACTS"`). Die neun
  **Zaehlfragen** tragen vollstaendige, echte Zahlen aus dem Lauf.

Das schliesst sich mit einem erneuten FULL_UNIVERSE-Lauf, dessen
abgeleitete Zeilen anschliessend committet werden. Sie enthalten keine
Kursniveaus und liegen bei rund 8 MB — der teure Teil, der Abruf beim
Anbieter, ist bereits bezahlt, aber ein erneuter Lauf kostet ihn wieder.

---

## 4. Das eigene Schloss unter `preview/`

Der eigenstaendige Auth-Gate auf Zweig `claude/preview-auth-gate` bleibt
unangetastet, bis der Vercel-Schutz nachgewiesen ist. `.vercelignore`
schliesst `preview` aus der Auslieferung aus: zwei Schloesser an einer
Tuer sind eines zu viel, und das schwaechere entscheidet dann.

Erst wenn V1 und V2 in einem echten Lauf gruen sind, ist der Gate
entbehrlich.
