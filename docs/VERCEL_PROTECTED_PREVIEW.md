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

### Die Faktorzeilen als dauerhaftes Artefakt

`_preview-data/factors-FULL_UNIVERSE.json` — **vorhanden**, erzeugt im
Lauf 34486165298 (Urteil PASS, 57 Minuten, 5.636 Zeilen, 6,2 MB).

> **Keine Zahlen aus diesem Dokument abschreiben.** Universumsgroesse,
> Trefferzahlen und Zeilenzahl aendern sich mit jedem Lauf — ein Titel
> verschwindet aus den Stammdaten, ein Handelstag verschiebt jede
> SMA-Zaehlung. Die oben genannten Werte gelten fuer den genannten Lauf.
> Der aktuelle Stand steht in `coverage` des Artefakts selbst. Dieselbe
> Verwechslung hat vier Tests fehlschlagen lassen, die eine Messung als
> Invariante festgeschrieben hatten.

Bis hierher liefen die Faktorzeilen aller Titel (Momentum, SMA-Abstand,
Lage im 52-Wochen-Band, Volatilitaet, Rueckgang) in die Arbeitsablage des
Runners — `build-market-factors.mjs` liefert sie oberhalb von 500 Titeln
nicht aus (§26) — und starben mit ihm. Jetzt erzeugt
`scripts/preview/build-factor-artefact.mjs` daraus ein committetes
Artefakt, **noch im selben Job, solange die Arbeitsablage existiert**.

Zwei Entscheidungen darin:

**Verdichtet, nicht gekuerzt.** `fieldStatus` — welche Felder berechnet
und welche zurueckgehalten sind — war ueber die Haelfte des Umfangs und
nimmt nur zwei Formen an. Er steht jetzt einmal oben in
`fieldStatusTemplates`, die Zeile verweist mit `fieldStatusRef` darauf.
Ergebnis an GATE_500 gemessen: 66 % kleiner, und der Rueckweg ist
verlustfrei (PD12 prueft jede Zeile einzeln gegen das Original).

**Nicht im oeffentlichen Baum.** `quant/data/market/factors/` liefert
Pages oeffentlich aus. Die Zeilen aller Titel dorthin zu legen hiesse,
die Substanz der geschuetzten Vorschau oeffentlich zu machen. Der Schutz
heute ist hart und pruefbar: die Datei liegt auf dem Vorschauzweig und
nicht auf main, und Pages liefert von main (`git ls-tree origin/main` —
PD13 prueft es). Der fuehrende Unterstrich haelt das Verzeichnis
zusaetzlich aus der Jekyll-Ausgabe, falls es je auf main landet; das ist
eine Konvention und wird dann von V10 am lebenden System gemessen, nicht
angenommen.

`assert-public-data-hygiene.mjs` prueft den neuen Pfad mit: keine Bars,
keine Kursniveaus, und `entitlement.delivery` muss
`PROTECTED_PREVIEW_ONLY` sein. Beide Regeln sind gegengeprueft — ein
eingeschmuggeltes `sma200` und ein entferntes `entitlement` werden
gefangen.

### Was der Screener zeigt

Alle 18 Fragen tragen echte Ergebnisse:

* **9 Zaehlfragen** — vollstaendige Zahlen ueber alle auswertbaren Titel
  (etwa: „ueber SMA200", „auf neuem 52-Wochen-Hoch").
* **9 Rangfragen** — die ersten 50 je Frage, mit Rangwert **und** der
  Datenqualitaet des Titels.

Das Qualitaetsmerkmal steht bewusst neben jedem Rangwert: an der Spitze
der Momentumliste stehen Titel mit Werten, die kein Kursverlauf hergibt,
sondern eine Bereinigungsluecke — alle mit `WARNING` markiert. Ohne
Wert und Merkmal liest sich so eine Zeile wie der staerkste Titel des
Universums.

---

## 4. Das eigene Schloss unter `preview/`

Der eigenstaendige Auth-Gate auf Zweig `claude/preview-auth-gate` bleibt
unangetastet, bis der Vercel-Schutz nachgewiesen ist. `.vercelignore`
schliesst `/preview/` aus der Auslieferung aus: zwei Schloesser an einer
Tuer sind eines zu viel, und das schwaechere entscheidet dann.

Erst wenn V1 und V2 in einem echten Lauf gruen sind, ist der Gate
entbehrlich.

### Der fuehrende Schraegstrich ist nicht Kosmetik

Hier stand `preview` ohne Schraegstrich, und das hat jede
Vorschau-Auslieferung rot gemacht - die erste (`daf7c94`) wie die letzte
(`ca04acc`). `.vercelignore` liest wie `.gitignore`: ein Muster ohne
Schraegstrich trifft **jeden Pfadabschnitt dieses Namens, auf jeder
Ebene**. Das Schloss liegt unter `preview/` im Wurzelverzeichnis und nur
auf `claude/preview-auth-gate`; getroffen hat das Muster stattdessen

* `scripts/preview/` — das Bauskript selbst, und
* `quant/data/preview/` — den Datensatz, den die Ansicht laedt.

Vercel lud das Bauskript nie hoch und brach ab:

```
Error: Cannot find module '/vercel/path0/scripts/preview/build-preview-dataset.mjs'
```

Die Produktion auf `main` blieb dabei gruen, was den Fehler lange
verdeckt hat: `main` traegt keine `vercel.json`, baut also gar nicht.
Rot war nur, was baut.

`/preview/` trifft ausschliesslich das Wurzelverzeichnis. Die Absicht
bleibt damit erhalten, und PD7 prueft sie jetzt nicht mehr als
Zeichenkette, sondern als Wirkung: mit `git check-ignore` gegen eine
Ablage, deren `.gitignore` unser `.vercelignore` ist. Den Skriptpfad
liest der Test aus `buildCommand`, statt ihn abzuschreiben.

## 5. Wenn eine Vorschau rot ist

Die Vercel-Baulogs sind ohne Anmeldung nicht lesbar. Der Zustand jeder
Auslieferung steht aber in GitHubs Deployments-API, und dort auch die
Adresse:

```
/repos/<owner>/<repo>/deployments?sha=<commit>
/repos/<owner>/<repo>/deployments/<id>/statuses
```

`state` ist `success` oder `failure`, `environment_url` traegt die
Vorschau-Adresse. `Preview` und `Production` sind zwei verschiedene
Umgebungen - eine gruene Produktion sagt nichts ueber die Vorschau.

Der Bauschritt laesst sich ausserdem so nachstellen, wie Vercel ihn
fuehrt: die Quelldateien durch denselben Filter schicken und den
Baubefehl darin ausfuehren. Was `.vercelignore` entfernt, fehlt dann
auch hier - genau daran war der Fehler oben zu sehen.
