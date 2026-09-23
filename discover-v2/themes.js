/* Vision Universe® – 40 Themenwelten (Darstellung).
 * Ein redaktioneller Katalog fuer die Oberflaeche: Titel, Kurztext, Foto,
 * Farbton. Er bewertet nichts und aendert keine Reihe. Wo eine Themenwelt
 * eine kanonische Sammlung hat (rowId), fuehrt sie dorthin; alle anderen
 * sind als "in Vorbereitung" gekennzeichnet - eine Aktienzahl wird nie
 * erfunden.
 *
 * Fotos: assets/themen/NN-slug.webp (schwarzer Hintergrund, 16:9).
 * Ein neues Foto wird sichtbar, sobald es dort liegt und "photo: true"
 * gesetzt ist. Ohne Foto zeigt die Kachel einen dunklen Farbverlauf. */
(function (global) {
  'use strict';
  var V = global.VUDiscoverV2 = global.VUDiscoverV2 || {};
  // n, slug, Titel, Kurztext, Zeile fuer Karten, Leitsatz (Banner), Ton, Gruppe, rowId, Foto
  var list = [
    [1, 'kuenstliche-intelligenz', 'Künstliche Intelligenz', 'AI-Modelle, Software, Computing', 'Intelligentere Software. Neue Wertschöpfung.', 'Intelligentere Märkte. Größere Möglichkeiten.', '#6d4bff', 'tech', 'thema-ki'],
    [2, 'halbleiter-chips', 'Halbleiter & Chips', 'GPUs, CPUs, Foundries, Equipment', 'Die Rechenkraft hinter jedem Fortschritt.', 'Kleine Chips. Große Wirkung.', '#3867ff', 'tech', null, true],
    [3, 'rechenzentren-cloud', 'Rechenzentren & Cloud', 'Datacenter, Hyperscaler, Infrastruktur', 'Das Fundament der digitalen Welt.', 'Daten brauchen ein Zuhause.', '#2f7dd8', 'tech', null, true],
    [4, 'cybersecurity', 'Cybersecurity', 'Digitale Sicherheit und Netzwerke', 'Schutz für eine vernetzte Welt.', 'Vertrauen ist Infrastruktur.', '#1f9c8f', 'tech', null, true],
    [5, 'quantencomputing', 'Quantencomputing', 'Quantum Hardware & Software', 'Rechnen jenseits der Grenzen.', 'Die nächste Rechenära.', '#8a4dff', 'tech', null, true],
    [6, 'humanoide-robotik', 'Humanoide Robotik', 'Humanoide Roboter, Physical AI', 'Maschinen, die sich wie Menschen bewegen.', 'Physical AI. Neue Arbeitswelt.', '#5b6cff', 'industry', null, true],
    [7, 'robotik-automation', 'Robotik & Automation', 'Industrie-, Lager- und Servicerobotik', 'Wer Fabriken automatisiert, bewegt die Welt.', 'Intelligente Maschinen. Größere Möglichkeiten.', '#f08a24', 'industry', 'thema-robotik', true],
    [8, 'drohnen-autonome-systeme', 'Drohnen & autonome Systeme', 'UAVs und autonome Maschinen', 'Autonom in der Luft und am Boden.', 'Autonomie wird Alltag.', '#e0782a', 'industry', null, true],
    [9, 'elektromobilitaet', 'Elektromobilität', 'Elektroautos und EV-Technologie', 'Der Antrieb der nächsten Generation.', 'Leise. Elektrisch. Schnell.', '#1fb37a', 'consumer', 'thema-mobilitaet', true],
    [10, 'autonomes-fahren', 'Autonomes Fahren', 'Robotaxis, Sensorik, ADAS', 'Mobilität ohne Fahrer.', 'Die Straße denkt mit.', '#2d8cff', 'tech'],
    [11, 'batterien-energiespeicher', 'Batterien & Energiespeicher', 'Zellhersteller, Speicher, Materialien', 'Energie, wann immer sie gebraucht wird.', 'Gespeicherte Zukunft.', '#22b573', 'energy'],
    [12, 'erneuerbare-energien', 'Erneuerbare Energien', 'Solar, Wind und Clean Energy', 'Saubere Energie. Starke Unternehmen.', 'Sonne. Wind. Wandel.', '#2fb34d', 'energy'],
    [13, 'wasserstoff', 'Wasserstoff', 'Elektrolyse, Brennstoffzellen, Infrastruktur', 'Das leichteste Element für schwere Aufgaben.', 'Energie aus Wasser.', '#2aa7c9', 'energy'],
    [14, 'kernenergie-uran', 'Kernenergie & Uran', 'Reaktoren, SMRs, Uranwirtschaft', 'Grundlast für eine elektrische Welt.', 'Kleine Reaktoren. Große Leistung.', '#c9b21c', 'energy'],
    [15, 'stromnetze-elektrifizierung', 'Stromnetze & Elektrifizierung', 'Grid, Transformatoren, Power Equipment', 'Die Leitungen der Energiewende.', 'Alles wird elektrisch.', '#f2b01e', 'energy'],
    [16, 'raumfahrt', 'Raumfahrt', 'Raketen, Raumstationen, Weltrauminfrastruktur', 'Die Wirtschaft jenseits der Atmosphäre.', 'Der Orbit wird Markt.', '#4a5bd6', 'industry'],
    [17, 'satelliten-konnektivitaet', 'Satelliten & Konnektivität', 'Satelliteninternet und Kommunikation', 'Verbindung für jeden Ort der Erde.', 'Netz ohne Grenzen.', '#3c7be0', 'tech'],
    [18, 'defense-aerospace', 'Defense & Aerospace', 'Luftfahrt, Verteidigung, Hightech', 'Sicherheit und Luftfahrt auf Weltniveau.', 'Präzision. Verlässlichkeit.', '#61708a', 'industry'],
    [19, 'biotechnologie', 'Biotechnologie', 'Neue Wirkstoffe und Biotech-Plattformen', 'Biologie als Technologie.', 'Leben neu verstehen.', '#1fae8c', 'health'],
    [20, 'genomik-gentherapie', 'Genomik & Gentherapie', 'CRISPR, Sequenzierung, Gene Editing', 'Den Code des Lebens lesen und schreiben.', 'Präzision im Erbgut.', '#2b9fd0', 'health'],
    [21, 'medizintechnik', 'Medizintechnik', 'Diagnostik, OP-Robotik, Geräte', 'Technik, die heilt.', 'Präziser behandeln.', '#2a8bd8', 'health'],
    [22, 'pharma-wirkstoffforschung', 'Pharma & Wirkstoffforschung', 'Medikamente und Drug Discovery', 'Neue Therapien für große Krankheiten.', 'Forschung, die wirkt.', '#3aa0c8', 'health'],
    [23, 'longevity-praezisionsmedizin', 'Longevity & Präzisionsmedizin', 'Personalisierte Medizin, gesundes Altern', 'Länger gesund leben.', 'Medizin für jeden Einzelnen.', '#27b39a', 'health'],
    [24, 'landwirtschaft-agtech', 'Landwirtschaft & AgTech', 'Precision Farming, autonome Landtechnik', 'Mehr Ernte mit weniger Ressourcen.', 'Die Zukunft wächst.', '#6aa82a', 'industry'],
    [25, 'rohstoffe-bergbau', 'Rohstoffe & Bergbau', 'Kupfer, Lithium, Seltene Erden', 'Die Basis des Fortschritts.', 'Ohne Rohstoffe kein Wandel.', '#b8792f', 'energy'],
    [26, 'industrie-maschinenbau', 'Industrie & Maschinenbau', 'Produktionsanlagen, Industrietechnik', 'Die Maschinen hinter den Maschinen.', 'Präzision in Serie.', '#7b8494', 'industry'],
    [27, 'logistik-automation', 'Logistik & Automation', 'Lager, Supply Chain, Transport', 'Waren schneller ans Ziel.', 'Die Welt in Bewegung.', '#e39a2c', 'industry'],
    [28, 'infrastruktur', 'Infrastruktur', 'Straßen, Brücken, Schienen, Bau', 'Was Länder zusammenhält.', 'Bauen für Generationen.', '#8d7a5e', 'industry'],
    [29, 'banken-fintech', 'Banken & Fintech', 'Banken, Payments, digitale Finanzen', 'Geld wird digital.', 'Finanzen neu gedacht.', '#2c6fd1', 'finance'],
    [30, 'versicherungen', 'Versicherungen', 'Versicherer, Rückversicherer, InsurTech', 'Stabilität in unsicheren Zeiten.', 'Sicherheit als Geschäft.', '#3d5fa8', 'finance'],
    [31, 'immobilien-reits', 'Immobilien & REITs', 'Immobiliengesellschaften und REITs', 'Werte aus Stein und Beton.', 'Substanz mit Rendite.', '#9a6b4b', 'finance'],
    [32, 'konsum-marken', 'Konsum & Marken', 'Globale Consumer-Marken', 'Marken, die jeder kennt.', 'Starke Marken. Treue Kunden.', '#d65c7a', 'consumer'],
    [33, 'luxus-premium', 'Luxus & Premium', 'Mode, Schmuck, Beauty, Premium', 'Begehrlichkeit als Geschäftsmodell.', 'Zeitlos begehrt.', '#b8923a', 'consumer'],
    [34, 'lebensmittel-getraenke', 'Lebensmittel & Getränke', 'Food, Beverage, Produktion', 'Was die Welt täglich braucht.', 'Genuss mit Beständigkeit.', '#d9832b', 'consumer'],
    [35, 'e-commerce', 'E-Commerce', 'Onlinehandel und Marktplätze', 'Einkaufen ohne Ladenschluss.', 'Ein Klick zum Kunden.', '#e2622f', 'consumer'],
    [36, 'reisen-tourismus', 'Reisen & Tourismus', 'Airlines, Hotels, Kreuzfahrten, Booking', 'Die Lust am Unterwegssein.', 'Die Welt erleben.', '#23a6c9', 'consumer'],
    [37, 'freizeit-entertainment', 'Freizeit & Entertainment', 'Freizeitparks, Sport, Erlebnisse', 'Erlebnisse statt Dinge.', 'Freizeit wird Wert.', '#c44fb0', 'consumer'],
    [38, 'medien-werbung', 'Medien & Werbung', 'Content, Werbeplattformen, Medien', 'Aufmerksamkeit ist Währung.', 'Reichweite mit Wirkung.', '#8b54d6', 'tech'],
    [39, 'streaming-gaming', 'Streaming & Gaming', 'Video-, Musik- und Spieleplattformen', 'Unterhaltung auf Abruf.', 'Play. Stream. Wiederholen.', '#a24dde', 'tech'],
    [40, 'telekommunikation-netze', 'Telekommunikation & Netze', 'Mobilfunk, Glasfaser, Netzwerktechnik', 'Die Adern der Vernetzung.', 'Immer verbunden.', '#2f86c9', 'tech']
  ];
  var themes = list.map(function (t) {
    var file = String(t[0]).padStart(2, '0') + '-' + t[1];
    return { n: t[0], slug: t[1], title: t[2], short: t[3], line: t[4], tagline: t[5], tone: t[6], group: t[7],
      rowId: t[8] || null, photo: t[9] ? '/assets/themen/' + file + '.webp' : null };
  });
  var bySlug = {}, byRow = {};
  themes.forEach(function (t) { bySlug[t.slug] = t; if (t.rowId) byRow[t.rowId] = t; });
  V.Themes = {
    all: themes,
    bySlug: function (slug) { return bySlug[slug] || null; },
    byRow: function (rowId) { return byRow[rowId] || null; },
    href: function (t) { return '#/thema/' + t.slug; },
    /* Kanonische Aktienzahl einer Themenwelt aus meta.rows - oder null. */
    count: function (t, meta, universeId) {
      if (!t.rowId || !meta) return null;
      var u = (meta.rows || []).find(function (r) { return r.universeId === universeId; });
      var row = u && (u.rows || []).find(function (r) { return r.rowId === t.rowId; });
      return row && row.returned > 0 ? row.returned : null;
    }
  };
})(window);
