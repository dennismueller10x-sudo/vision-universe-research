# V7 – Methodikentscheidungen

Archiv #872 bleibt `PRESERVED_PROPOSAL_NOT_APPROVED`; keine geschützte Regel geändert. Die folgende Entscheidungsvorlage gilt für die sechs Arten jeweils nur bei passender Datenabhängigkeit.

| Punkt | Aktive Regel / alter Vorschlag | Reale Grundlage und Entscheidung | Freigabe |
|---|---|---|---|
| Coverage | Aktive Nenner beibehalten / Entwurf 99,5 % | Reife, unreife, zensierte und unzulässige Fälle getrennt; Faktor-Ausschlüsse zusätzlich zum Outcome-Nenner. Keine Schwelle neu aktiviert. Alle sechs Arten betroffen. | Nur bei normativer Schwellenänderung |
| Stichprobe/Power | Artverträge / Entwurf 80 % Power | 11 ausgewählte Listings, 21 finanzierte Trades, 97 SEC-Ereignisse sind keine unabhängigen Marktstichproben. Unsicherheit und Selektionsrisiko berichten; keine Powerbehauptung. Alle sechs Arten. | Neue Mindestzahlen/Powergates nur explizit |
| Reichweite | Daten-/Warm-up-/Reifeabhängig / Entwurf fünf Jahre | Je Listing MAX, keine allgemeine Fünfjahreswartezeit. Benchmark auf eigener Historie. Alle sechs Arten. | Keine Änderung nötig |
| Cluster/Regime | Aktive Regimefreigaben / Entwurf 20 Episoden/Quartale | Überschneidende Eventhorizonte nicht durch Tagescluster unabhängig. Intervalle nur nominal, keine Signifikanzabnahme. Ex-post-Labels nur beschreibend. Alle sechs Arten. | Keine neue Pflichtzahl aktiviert |
| Wirtschaftlicher Effekt | Aktive Artgates / Entwurf +0,50 pp | Kein marktrepräsentativer Nettoedge belegt. MC/OOS-Verwaltung brauchen keinen profitablen Edge; negative korrekte Studien bleiben gültig. | Effektgrenze nur explizit ändern |
| Unabhängigkeit | Expositions-/Holdoutvertrag, Setup-OOS mindestens 30 je Segment und Ownerfreigabe | Bekannt bleibt bekannt. Rechenparität und chronologische Aggregation sind keine unangetastete Bestätigung. Alle sechs Arten. | Fehlende Daten nicht durch Freigabe heilbar |
| Setup-Reife | 120 Stichtage, 180 Tage, 100 M6, 20 Titel | Originalarchiv 20 Stichtage/43 Tage; 13/26-Wochenrekonstruktion erfüllt das nicht. | Keine automatische Änderung |
| Setup Wochen/Monate | Vertrag 20 unabhängige Wochen, Erzeuger zählt Monate | Empfohlen: versionierter separater Wochenzähler und Abhängigkeitsbegründung, Legacy-Monatszähler erhalten. Keine Umstellung in V7. | Explizite Ownerentscheidung erforderlich |
| Strategie/Ranking | 24 Monatsstände, Ranking zusätzlich 12 abgeschlossene M3-Monate, maximal 45 Tage Lücke | Junge Originalarchive reichen nicht; neue Margenrekonstruktion ist anderes Forschungsobjekt. Keine Vermischung. | Produktvertrag nicht geändert |

Umgesetzt ohne normative Änderung: bestehende Research-Engines unterstützen explizite explorative aktuelle Kohorten und beobachtete Wochendaten. Die Standardeinstellungen verlangen weiterhin historische Membership/Sessionzeiten. AS_PUBLISHED_PIT und bestätigende Studien können den Kohortenmodus nicht verwenden. Das zusätzliche Preisportfoliomodell verbietet TR-Label, CA-/Terminalereignisse und Profilselektion; der bestehende HISTORICAL_OBSERVED-TR-Vertrag bleibt bestehen. Keine Produktregistry, kein globaler Block.

Nicht als alter V6-Fehler ausgegeben: V6 verlangte explizite Sessionzeiten und historische Membership. V7 ergänzt einen enger begrenzten retrospektiven Modellscope. Entwicklungsfehler der neuen Orchestrierung wurden korrigiert: ISO-Wochen, chronologische Setup-Sortierung, eindeutige modellierte Membershiphashes, Snapshot-/Signalbudget und Speicherbindung. MC-Engine und fünf Signaldefinitionen wurden nicht geändert.

Quellen-PoC zusätzlich umgesetzt: früheste/späteste Accessions nach Verfügbarkeitszeit statt numerischem Präfix; Archivpfad nach Emittenten-CIK, da Filing-Agent-Präfixe keine Identitätszuordnung belegen. Acht Originale gegen gespeicherte Zeilen geprüft, keine normative Gateänderung.
