(function (global) {
  'use strict';
  var V = (global.VUDiscover = global.VUDiscover || {}).Views = global.VUDiscover.Views || {};
  var list = [
    [1, 'kuenstliche-intelligenz', 'Künstliche Intelligenz', 'AI-Modelle, Software', 'Intelligentere Software.', '#6d4bff', 'tech', 'thema-ki', true],
    [2, 'halbleiter-chips', 'Halbleiter & Chips', 'GPUs, CPUs', 'Rechenkraft für Fortschritt.', '#3867ff', 'tech', 'thema-halbleiter-chips', true],
    [3, 'rechenzentren-cloud', 'Rechenzentren & Cloud', 'Datacenter', 'Fundament der digitalen Welt.', '#2f7dd8', 'tech', 'thema-rechenzentren-cloud', true],
    [4, 'cybersecurity', 'Cybersecurity', 'Digitale Sicherheit', 'Schutz für eine vernetzte Welt.', '#1f9c8f', 'tech', 'thema-cybersecurity', true],
    [5, 'quantencomputing', 'Quantencomputing', 'Quantum Hard- und Software', 'Rechnen jenseits der Grenzen.', '#8a4dff', 'tech', 'thema-quantencomputing', true],
    [6, 'humanoide-robotik', 'Humanoide Robotik', 'Humanoide Roboter', 'Maschinen wie Menschen.', '#5b6cff', 'industry', 'thema-humanoide-robotik', true],
    [7, 'robotik-automation', 'Robotik & Automation', 'Service- und Lagerrobotik', 'Fabrikautomation.', '#f08a24', 'industry', 'thema-robotik', true],
    [8, 'drohnen-autonome-systeme', 'Drohnen & autonome Systeme', 'UAVs', 'Autonom in Luft und Boden.', '#e0782a', 'industry', 'thema-drohnen-autonome-systeme', true],
    [9, 'elektromobilitaet', 'Elektromobilität', 'Elektroautos', 'Antrieb der nächsten Generation.', '#1fb37a', 'consumer', 'thema-mobilitaet', true],
    [10, 'autonomes-fahren', 'Autonomes Fahren', 'Robotaxis, Sensorik', 'Mobilität ohne Fahrer.', '#2d8cff', 'tech', 'thema-autonomes-fahren', true],
    [11, 'batterien-energiespeicher', 'Batterien & Energiespeicher', 'Zellhersteller', 'Energie auf Abruf.', '#22b573', 'energy', 'thema-batterien-energiespeicher', true],
    [12, 'erneuerbare-energien', 'Erneuerbare Energien', 'Solar, Wind und Clean Energy', 'Saubere Energie.', '#2fb34d', 'energy', 'thema-erneuerbare-energien', true],
    [13, 'wasserstoff', 'Wasserstoff', 'Elektrolyse', 'Leicht und wirkungsvoll.', '#2aa7c9', 'energy', 'thema-wasserstoff', true],
    [14, 'kernenergie-uran', 'Kernenergie & Uran', 'Reaktoren, SMRs', 'Grundlast der Stromversorgung.', '#c9b21c', 'energy', 'thema-kernenergie-uran', true],
    [15, 'stromnetze-elektrifizierung', 'Stromnetze & Elektrifizierung', 'Stromnetze', 'Leitungen der Energiewende.', '#f2b01e', 'energy', 'thema-stromnetze-elektrifizierung', true],
    [16, 'raumfahrt', 'Raumfahrt', 'Raketen, Raumstationen', 'Jenseits der Atmosphäre.', '#4a5bd6', 'industry', 'thema-raumfahrt', true],
    [17, 'satelliten-konnektivitaet', 'Satelliten & Konnektivität', 'Satelliten', 'Verbindung für jeden Ort.', '#3c7be0', 'tech', 'thema-satelliten-konnektivitaet', true],
    [18, 'defense-aerospace', 'Defense & Aerospace', 'Luftfahrt, Rüstung', 'Sicherheit auf Weltniveau.', '#61708a', 'industry', 'thema-defense-aerospace', true],
    [19, 'biotechnologie', 'Biotechnologie', 'Neue Wirkstoffe', 'Biologie als Technologie.', '#1fae8c', 'health', 'thema-biotechnologie', true],
    [20, 'genomik-gentherapie', 'Genomik & Gentherapie', 'CRISPR, Gen-Editing', 'Code des Lebens lesen.', '#2b9fd0', 'health', 'thema-genomik-gentherapie', true],
    [21, 'medizintechnik', 'Medizintechnik', 'Diagnostik, OP-Robotik', 'Technik, die heilt.', '#2a8bd8', 'health', 'thema-medizintechnik', true],
    [22, 'pharma-wirkstoffforschung', 'Pharma & Wirkstoffforschung', 'Drug Discovery', 'Neue Therapien.', '#3aa0c8', 'health', 'thema-pharma-wirkstoffforschung', true],
    [23, 'longevity-praezisionsmedizin', 'Longevity & Präzisionsmedizin', 'Präzisionsmedizin', 'Länger gesund leben.', '#27b39a', 'health', 'thema-longevity-praezisionsmedizin', true],
    [24, 'landwirtschaft-agtech', 'Landwirtschaft & AgTech', 'AgTech', 'Mehr Ernte, weniger Aufwand.', '#6aa82a', 'industry', 'thema-landwirtschaft-agtech', true],
    [25, 'rohstoffe-bergbau', 'Rohstoffe & Bergbau', 'Kupfer, Lithium', 'Die Basis des Fortschritts.', '#b8792f', 'energy', 'thema-rohstoffe-bergbau', true],
    [26, 'industrie-maschinenbau', 'Industrie & Maschinenbau', 'Produktion', 'Maschinen hinter Maschinen.', '#7b8494', 'industry', 'thema-industrie-maschinenbau', true],
    [27, 'logistik-automation', 'Logistik & Automation', 'Lager, Supply Chain', 'Schneller ans Ziel.', '#e39a2c', 'industry', 'thema-logistik-automation', true],
    [28, 'infrastruktur', 'Infrastruktur', 'Straßen, Brücken', 'Was Länder zusammenhält.', '#8d7a5e', 'industry', 'thema-infrastruktur', true],
    [29, 'banken-fintech', 'Banken & Fintech', 'Banken, Payments', 'Geld wird digital.', '#2c6fd1', 'finance', 'thema-banken-fintech', true],
    [30, 'versicherungen', 'Versicherungen', 'Assekuranz', 'Stabilität im Risiko.', '#3d5fa8', 'finance', 'thema-versicherungen', true],
    [31, 'immobilien-reits', 'Immobilien & REITs', 'Immobilien und REITs', 'Werte aus Stein und Beton.', '#9a6b4b', 'finance', 'thema-immobilien-reits', true],
    [32, 'konsum-marken', 'Konsum & Marken', 'Globale Consumer-Marken', 'Marken, die jeder kennt.', '#d65c7a', 'consumer', 'thema-konsum-marken', true],
    [33, 'luxus-premium', 'Luxus & Premium', 'Mode, Schmuck', 'Begehrlichkeit als Modell.', '#b8923a', 'consumer', 'thema-luxus-premium', true],
    [34, 'lebensmittel-getraenke', 'Lebensmittel & Getränke', 'Food, Beverage', 'Täglicher Bedarf.', '#d9832b', 'consumer', 'thema-lebensmittel-getraenke', true],
    [35, 'e-commerce', 'E-Commerce', 'Onlinehandel, Marktplätze', 'Einkaufen ohne Ladenschluss.', '#e2622f', 'consumer', 'thema-e-commerce', true],
    [36, 'reisen-tourismus', 'Reisen & Tourismus', 'Airlines, Hotels', 'Die Lust am Unterwegssein.', '#23a6c9', 'consumer', 'thema-reisen-tourismus', true],
    [37, 'freizeit-entertainment', 'Freizeit & Entertainment', 'Freizeitparks', 'Erlebnisse statt Dinge.', '#c44fb0', 'consumer', 'thema-freizeit-entertainment', true],
    [38, 'medien-werbung', 'Medien & Werbung', 'Content, Werbung', 'Aufmerksamkeit als Währung.', '#8b54d6', 'tech', 'thema-medien-werbung', true],
    [39, 'streaming-gaming', 'Streaming & Gaming', 'Video, Musik, Gaming', 'Unterhaltung auf Abruf.', '#a24dde', 'tech', 'thema-streaming-gaming', true],
    [40, 'telekommunikation-netze', 'Telekommunikation & Netze', 'Mobilfunk', 'Die Adern der Vernetzung.', '#2f86c9', 'tech', 'thema-telekommunikation-netze', true],
    [41, 'oel-gas-versorger', 'Öl, Gas & Versorger', 'Förderung, Raffinerien', 'Klassische Energie.', '#6b5b3e', 'energy', 'thema-oel-gas-versorger', false],
    [42, 'chemie-werkstoffe', 'Chemie & Werkstoffe', 'Grundstoffe, Chemie', 'Für Industrie und Konsum.', '#6a8caf', 'industry', 'thema-chemie-werkstoffe', false],
    [43, 'industrie-fertigung', 'Industrie & Fertigung', 'Maschinen, Fertigung', 'Fabriken im Detail.', '#8a8f99', 'industry', 'thema-industrie-fertigung', false],
    [44, 'handel-einzelhandel', 'Handel & Einzelhandel', 'Läden, Fachhandel', 'Konsum vor Ort.', '#d98a3d', 'consumer', 'thema-handel-einzelhandel', false],
    [45, 'grosshandel-distribution', 'Großhandel', 'Zwischenhandel', 'Vor dem Regal.', '#7a92a3', 'industry', 'thema-grosshandel-distribution', false],
    [46, 'bau-baustoffe', 'Bau & Baustoffe', 'Bau, Baustoffe', 'Was gebaut wird.', '#9c7a56', 'industry', 'thema-bau-baustoffe', false],
    [47, 'transport-spedition', 'Transport & Spedition', 'Bahn, Spedition', 'Fracht in Bewegung.', '#4f7a8a', 'industry', 'thema-transport-spedition', false],
    [48, 'papier-verpackung-forst', 'Papier & Verpackung', 'Holz, Papier', 'Rohstoffe aus dem Wald.', '#6f8a52', 'industry', 'thema-papier-verpackung-forst', false],
    [49, 'textil-bekleidung', 'Textil & Bekleidung', 'Textil, Bekleidung', 'Stoffe im Alltag.', '#b06a8a', 'consumer', 'thema-textil-bekleidung', false],
    [50, 'metallverarbeitung-stahl', 'Metallverarbeitung & Stahl', 'Stahl, Gießereien', 'Werkstoff der Industrie.', '#78808a', 'industry', 'thema-metallverarbeitung-stahl', false],
    [51, 'finanzdienstleistungen-vermoegen', 'Finanzdienstleistungen', 'Broker, Kredite', 'Abseits der großen Banken.', '#3f6a8f', 'finance', 'thema-finanzdienstleistungen-vermoegen', false],
    [52, 'software-it-dienstleistungen', 'Unternehmenssoftware & IT', 'Business-Software', 'Software für Unternehmen.', '#5a6ac0', 'tech', 'thema-software-it-dienstleistungen', false],
    [53, 'dienstleistungen-bildung-personal', 'Dienstleistungen', 'Bildung, Personal', 'Dienste statt Produkte.', '#8a6ac0', 'industry', 'thema-dienstleistungen-bildung-personal', false],
    [54, 'gesundheitsdienstleister', 'Gesundheitsdienstleister', 'Kliniken, Labore', 'Die Versorgung selbst.', '#4a9a8a', 'health', 'thema-gesundheitsdienstleister', false]
  ];
  var themes = list.map(function (t) {
    var file = String(t[0]).padStart(2, '0') + '-' + t[1];
    return { n: t[0], slug: t[1], title: t[2], short: t[3], line: t[4], tone: t[5], group: t[6],
      rowId: t[7] || null, photo: t[8] ? '/assets/themen/' + file + '.webp' : null };
  });
  var bySlug = {}, byRow = {};
  themes.forEach(function (t) { bySlug[t.slug] = t; if (t.rowId) byRow[t.rowId] = t; });
  V.Themes = {
    all: themes,
    bySlug: function (slug) { return bySlug[slug] || null; },
    byRow: function (rowId) { return byRow[rowId] || null; },
    href: function (t) { return '#/thema/' + t.slug; },
    count: function (t, meta, universeId) {
      if (!t.rowId || !meta) return null;
      var u = (meta.rows || []).find(function (r) { return r.universeId === universeId; });
      var row = u && (u.rows || []).find(function (r) { return r.rowId === t.rowId; });
      return row && row.returned > 0 ? row.returned : null;
    }
  };
})(window);
