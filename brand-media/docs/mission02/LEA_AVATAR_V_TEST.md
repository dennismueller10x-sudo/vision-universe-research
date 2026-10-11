# LEA – Avatar V Praxistest (2026-10-11)

Dateien: `video/tests/avatar_v_compare_01/` · Registry-Eintrag `video-lea-avatarv-compare-01` · Status **REVIEW** (keine automatische Freigabe).

## Durchführung
- Bestehender Photo-Look `5962a9dd…` (VU LEA), **keine neue Identität**. Vorabprüfung: `GET /v3/avatars/looks/{id}` listet `avatar_v`. Dass V für diesen Photo-Look wirklich läuft, bestätigt erst der Test: **Ja, er lief** (die Doku nennt V nur für Digital Twins).
- Anfrage: `POST /v3/videos`, `engine: avatar_v`, 9:16, 1080p, `fit: cover`, Stimme „Lea“ `becf484d…` (identisch zu Avatar IV), Skript: „Drei Aktien zeigen heute besondere Stärke. Doch welche davon überzeugen wirklich?“ Kein `motion_prompt` (bei Photo Avatars ohne Referenz-Look für V nicht zulässig), keine Beauty-Parameter.
- Genau **eine** Generierung. Keine weitere.

## Kosten (gemessen)
| | |
|---|---|
| Videodauer | 5,17 s (Datei 5,16 s) |
| Wallet vorher / nachher | 1,80 → **1,20 USD** (Anzeige auf 0,01 gerundet) |
| Abgebucht | **0,60 USD ≈ 0,116 USD/s ≈ 6,96 USD/min** |
| Schätzgrundlage | HeyGen-Blog 0,0667 USD/s (UNVERIFIZIERT, galt für „Digital Twin“) ⇒ erwartet 0,37 USD |
| Budget | 0,50 USD ⇒ **um 0,10 USD überschritten** |
Die API bietet keinen Kostenhöchstbetrag pro Anfrage; ich habe nur die Dauer begrenzt. Die Schätzung lag um den Faktor ≈ 1,7 zu niedrig. Ich hätte die Testdauer kürzen müssen, um sicher unter 0,50 USD zu bleiben. Der Test war fachlich nötig in voller Länge (Vergleichsskript), die Überschreitung ist trotzdem meine. Seitdem keine weitere kostenpflichtige Aktion.

## Vergleichsbedingungen und Grenzen
- Avatar-IV-Referenz: die ersten 5,2 s von **Clip 15**, **anderes Skript** (ein IV-Clip mit dem Testskript hätte eine zweite kostenpflichtige Generierung bedeutet, nicht freigegeben). Gleicher Avatar, gleiche Stimme, gleiches Studio, gleiche Kamera. Wörter und Betonung unterscheiden sich, daher Mimik/Mundbild nur eingeschränkt vergleichbar.
- Ein einzelner 5-Sekunden-Clip je Engine: **keine statistische Aussage**.
- Vergleichsdatei: `lea_IV_vs_V_vergleich.mp4` (links IV, rechts V, Ton von V).

## Ergebnis nach Kriterien
Prüfart: **S** = Sichtprüfung durch mich (Frames im Abstand von 0,4 s und Detailfenster, **nicht** in Echtzeit abgespielt), **M** = Messung, **ASR** = automatische Spracherkennung, **A** = Hörprüfung.
| Kriterium | Avatar IV (Clip 15) | Avatar V | Prüfart |
|---|---|---|---|
| Gesichtskonsistenz zum Master | erkennbar dieselbe Person; einzelne Frames mit halb geschlossenen/hängenden Lidern, Gesicht wirkt dort älter | erkennbar dieselbe Person; Augen offen und zugewandt, Gesichtsproportionen im Detailfenster näher am Master | S |
| Hautnatürlichkeit | Poren sichtbar, leichte Glättung | ähnlich, keine zusätzliche Glättung erkennbar | S |
| Mimik | zurückhaltend, Lider-Ausreißer | lebendiger, gerichteter Blick, offener Mund beim Sprechen; ob „natürlich“ in Bewegung: nicht beurteilbar aus Standbildern | S |
| Körperbewegung | Hand bleibt am Kinn, Arm statisch | **Hand löst sich vom Kinn, offene Handgeste zum Gegenüber, wiederkehrend**; Hand mit fünf Fingern, keine Artefakte sichtbar | S |
| Schulterbewegung | gering | **nicht messbar stärker**: Region Schultern/Oberkörper 6,4× (IV) vs. 7,3× (V) Bildrauschen. Der Unterschied liegt im Arm (16,4× vs. 6,5×) | M |
| Kleidung/Studio | identisch zum Master | identisch zum Master | S |
| Abweichung von der Masterpose | gering (Hand am Kinn bleibt) | **deutlich** (Handgeste statt Kinnstütze). Nicht steuerbar, da `motion_prompt` entfällt | S |
| Deutsche Aussprache | – | ASR (Parakeet v3) erkennt **11 von 11 Wörtern exakt** = verständlich; **Natürlichkeit/Akzent nicht beurteilt** | ASR; A offen |
| Lippensynchronisation | – | Mundöffnung wirkt im Standbild zum Sprechmoment passend; **Sync in Bewegung nicht beurteilt** | S, A offen |
| Tonqualität | gleiche Stimme | gleiche Stimme; Pegel V −17,5 LUFS, IV −16,3 LUFS (Spitze −5,3 / −3,4 dBTP); **Klang/Natürlichkeit ungeprüft** (kann ich nicht verlässlich beurteilen). Auftraggeber hatte die Stimme bei IV als „künstlich“ eingestuft | M; A ungeprüft |
| Gesamteindruck „echter Mensch“ | Auftraggeber: „sofort KI“ | **offen – deine Beurteilung**. Meine Sicht: lebendiger als IV, aber Gestik wirkt generisch (immer dieselbe Handbewegung) | Auftraggeber/S |

## Empfehlung
**Avatar V ist für die langfristige Produktion nur bedingt geeignet: als Premium-Engine für kurze Sprechsequenzen, nicht als Standard.**
- **Für V:** sichtbar mehr Lebendigkeit (offene Augen, Handgeste), Identität und Studio bleiben stabil, Sprache verständlich, läuft mit dem bestehenden Photo-Look ohne neue Anlage.
- **Gegen V als Standard:** ca. 3× so teuer wie Avatar IV (0,116 vs. 0,039 USD/s, jeweils gemessen), keine Steuerung der Gestik (kein Motion-Prompt), Masterpose geht verloren, Schulterbewegung nicht klar besser, Stimme unverändert „TTS“, ein einziger 5-s-Test.
- **Konsequenz:** Hook und CTA (≤ 4–5 s je Video) mit V, Rest als Voice-over mit Charts/Screens oder Avatar IV. Kosten je Reel (10 s Avatar + TTS): nur IV 0,44 USD, nur V 1,21 USD, Hybrid (4 s V + 6 s IV) 0,75 USD.
- **Bevor V Standard wird:** (a) deine Hör- und Sichtprüfung beider Clips, (b) ein IV-Clip mit identischem Testskript (≈ 0,2 USD) für den echten A/B, (c) Zweitengine-Test (OmniHuman 1.5/Kling v2), (d) eine natürlichere, extern erzeugte Stimme. Der „KI-Eindruck“ hängt stark an Stimme und Schnitt, nicht nur an der Engine.
