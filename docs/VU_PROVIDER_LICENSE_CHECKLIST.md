# VU PROVIDER LICENSE CHECKLIST

Die Fragen, die **vor** der ersten Zeile Adapter-Code beantwortet sein muessen.

Diese Liste ersetzt keine Rechtsberatung. Sie sorgt dafuer, dass die Fragen
gestellt werden, an denen ein Projekt spaeter teuer scheitert — meistens nicht
an der Technik, sondern daran, dass die Daten so nicht veroeffentlicht werden
durften.

---

## Warum das hier ernst ist

Vision Universe ist keine private Auswertung auf einem Laptop. Es ist eine
**oeffentliche Website**, deren Daten in einem **oeffentlichen Repository**
liegen. Damit fallen mehrere Nutzungsarten zusammen, die viele Anbieter
getrennt lizenzieren:

1. Abruf der Daten
2. Speicherung
3. **Weiterveroeffentlichung**
4. **Anzeige an Dritte**
5. Ableitung neuer Kennzahlen daraus
6. Veroeffentlichung dieser abgeleiteten Kennzahlen

Punkt 3 und 4 sind der Unterschied zwischen „ich schaue mir Kurse an" und „ich
betreibe einen Datendienst". Viele kostenlose Zugaenge erlauben ausdruecklich
nur die ersten beiden.

---

## Vor der Anbindung

### Nutzungsrechte

- [ ] Erlaubt der Vertrag die **Anzeige** der Daten gegenueber Dritten?
- [ ] Erlaubt er die **Speicherung** ueber die Sitzung hinaus (Caching-Fristen)?
- [ ] Erlaubt er die **Weiterveroeffentlichung** der Rohdaten?
- [ ] Erlaubt er die Veroeffentlichung **abgeleiteter** Werte (Scores, Ranglisten,
      Backtest-Ergebnisse)? Das ist oft anders geregelt als die Rohdaten.
- [ ] Ist die Ablage in einem **oeffentlichen Git-Repository** gedeckt?
      (Ein committetes JSON ist eine dauerhafte, kopierbare Verbreitung —
      rechtlich etwas anderes als ein fluechtiger Cache.)
- [ ] Gibt es eine Grenze fuer die Zahl der Endnutzer oder Seitenaufrufe?
- [ ] Sind Redistribution und „display only" im Plan unterschieden?

### Pflichten

- [ ] Ist eine **Quellenangabe** vorgeschrieben? In welcher Form und an welcher
      Stelle (je Seite, je Datenpunkt, im Impressum)?
- [ ] Gibt es vorgeschriebene Formulierungen oder Logos?
- [ ] Sind Verzoegerungsangaben Pflicht („15 Minuten verzoegert")?
- [ ] Gibt es Loeschfristen nach Vertragsende? Muessen committete Daten dann
      aus der Git-Historie entfernt werden?

### Boersengebuehren

- [ ] Fallen fuer die genutzten Handelsplaetze **Exchange Fees** an?
      (Diese sind unabhaengig vom Anbieterpreis und werden oft je Boerse und
      je Nutzerkategorie berechnet.)
- [ ] Aendert sich die Einstufung durch die Veroeffentlichung von
      „non-professional" zu „professional"? Das ist die haeufigste teure
      Ueberraschung: sobald Daten oeffentlich angezeigt werden, gilt der
      Betreiber bei vielen Boersen als professioneller Nutzer.
- [ ] Sind Endtagesdaten anders eingestuft als Intraday-Daten? (Fast immer ja,
      und fast immer deutlich guenstiger.)

### Technische Grenzen

- [ ] Anfragen pro Minute, Stunde, Tag, Monat?
- [ ] Zahl gleichzeitiger Verbindungen?
- [ ] Gilt eine Fehlerantwort (429, 500) als verbrauchte Anfrage?
- [ ] Historientiefe je Abruf und insgesamt?
- [ ] Wie wird bei Ueberschreitung reagiert — Drosselung, Sperre, Nachberechnung?

### Datenqualitaet

- [ ] Sind Kurse **bereinigt**? Um Splits, um Dividenden, um beides?
- [ ] Gibt es ein eigenes `adjusted_close`-Feld oder nur bereinigte Rohkurse?
- [ ] Sind Kapitalmassnahmen als **Ereignisse** abrufbar (dann laesst sich
      selbst bereinigen)?
- [ ] Tragen Fundamentalkennzahlen einen **Point-in-Time-Zeitstempel**?
- [ ] Sind **Restatements** von Erstmeldungen unterscheidbar?
- [ ] Sind **delistete** Unternehmen enthalten?
- [ ] Wie werden Korrekturen an bereits gelieferten Daten kommuniziert?

### Betrieb

- [ ] Gibt es eine Verfuegbarkeitszusage?
- [ ] Wie werden Aenderungen an der API angekuendigt, und mit welcher Frist?
- [ ] Gibt es eine Versionierung der API?
- [ ] Was passiert mit den bereits abgerufenen Daten bei Vertragsende?

---

## Stand fuer Twelve Data (Free Plan)

**Keiner dieser Punkte ist geprueft.** Das ist eine bewusste Feststellung, keine
Nachlaessigkeit: in dieser Phase wird kein Zugang produktiv betrieben, es sind
keine Daten committet, und `quant/data/market/status.json` steht auf
`configured: false`.

| Punkt | Stand |
|---|---|
| Weiterveroeffentlichung der Rohdaten | **ungeprueft** |
| Veroeffentlichung abgeleiteter Kennzahlen | **ungeprueft** |
| Ablage im oeffentlichen Repository | **ungeprueft** |
| Quellenangabepflicht | **ungeprueft** |
| Exchange Fees / Nutzereinstufung | **ungeprueft** |
| Kontingente | dokumentiert (8/min, 800/Tag), nicht vertraglich geprueft |
| Bereinigung | teilweise geprueft, siehe `VU_PROVIDER_CAPABILITIES.md` |

### Was daraus folgt

Bevor der Workflow `market-data.yml` mit einem echten Schluessel scharf
geschaltet und das Ergebnis committet wird, sind mindestens die drei
Veroeffentlichungsfragen zu klaeren. Bis dahin gilt:

- `--dry-run` ruft ab und prueft, schreibt aber nichts.
- Der Workflow laeuft ohne Secret folgenlos durch und schreibt nur den
  Statusbericht.
- Das System bleibt vollstaendig funktionsfaehig im Mock-Modus.

### Ein moeglicher Zwischenweg

Sollte sich die Weiterveroeffentlichung der Rohkurse als nicht gedeckt
erweisen, muss das nicht das Ende sein. Denkbar waere, nur **abgeleitete**
Werte zu committen — Momentum ueber 12 Monate, Volatilitaet, relative
Staerke — und keine Kursreihe. Ob das gedeckt ist, ist allerdings ebenfalls eine
Vertragsfrage und keine technische. Sie steht auf derselben Liste.

---

## Fuer jeden weiteren Anbieter

Diese Liste einmal vollstaendig durchgehen und das Ergebnis in
`docs/VU_PROVIDER_CAPABILITIES.md` neben die technischen Faehigkeiten
schreiben. Ein Anbieter, dessen Daten sich technisch hervorragend anbinden
lassen, aber nicht angezeigt werden duerfen, ist fuer dieses Projekt genauso
unbrauchbar wie einer ohne API.
