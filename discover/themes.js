(function (global) {
  'use strict';
  var V = (global.VUDiscover = global.VUDiscover || {}).Views = global.VUDiscover.Views || {};
  var list = [
    [1, 'kuenstliche-intelligenz', 'Künstliche Intelligenz', 'AI-Modelle', 'Neue Software', '#6d4bff', 't', 'thema-ki', true],
    [2, 'halbleiter-chips', 'Halbleiter & Chips', 'GPUs', 'Große Wirkung', '#3867ff', 't', 'thema-halbleiter-chips', true],
    [3, 'rechenzentren-cloud', 'Rechenzentren & Cloud', 'Datacenter', 'Fundament der Cloud', '#2f7dd8', 't', 'thema-rechenzentren-cloud', true],
    [4, 'cybersecurity', 'Cybersecurity', 'Sicherheit', 'Digitaler Schutz', '#1f9c8f', 't', 'thema-cybersecurity', true],
    [5, 'quantencomputing', 'Quantencomputing', 'Quantensysteme', 'Neue Ära', '#8a4dff', 't', 'thema-quantencomputing', true],
    [6, 'humanoide-robotik', 'Humanoide Robotik', 'Roboter', 'Wie Menschen', '#5b6cff', 'i', 'thema-humanoide-robotik', true],
    [7, 'robotik-automation', 'Robotik & Automation', 'Lagerrobotik', 'Fabrikautomation', '#f08a24', 'i', 'thema-robotik', true],
    [8, 'drohnen-autonome-systeme', 'Drohnen & autonome Systeme', 'UAVs', 'Autonomie wird Alltag', '#e0782a', 'i', 'thema-drohnen-autonome-systeme', true],
    [9, 'elektromobilitaet', 'Elektromobilität', 'Elektroautos', 'Antrieb von morgen', '#1fb37a', 'c', 'thema-mobilitaet', true],
    [10, 'autonomes-fahren', 'Autonomes Fahren', 'Robotaxis', 'Mobilität ohne Fahrer', '#2d8cff', 't', 'thema-autonomes-fahren', true],
    [11, 'batterien-energiespeicher', 'Batterien & Energiespeicher', 'Zellhersteller', 'Auf Abruf', '#22b573', 'e', 'thema-batterien-energiespeicher', true],
    [12, 'erneuerbare-energien', 'Erneuerbare Energien', 'Solar', 'Saubere Energie', '#2fb34d', 'e', 'thema-erneuerbare-energien', true],
    [13, 'wasserstoff', 'Wasserstoff', 'Elektrolyse', 'Leicht und wirkungsvoll', '#2aa7c9', 'e', 'thema-wasserstoff', true],
    [14, 'kernenergie-uran', 'Kernenergie & Uran', 'Reaktoren', 'Grundlast der Zukunft', '#c9b21c', 'e', 'thema-kernenergie-uran', true],
    [15, 'stromnetze-elektrifizierung', 'Stromnetze & Elektrifizierung', 'Stromnetze', 'Elektrisch', '#f2b01e', 'e', 'thema-stromnetze-elektrifizierung', true],
    [16, 'raumfahrt', 'Raumfahrt', 'Raketen', 'Der Orbit wird Markt', '#4a5bd6', 'i', 'thema-raumfahrt', true],
    [17, 'satelliten-konnektivitaet', 'Satelliten & Konnektivität', 'Satelliten', 'Ohne Grenzen', '#3c7be0', 't', 'thema-satelliten-konnektivitaet', true],
    [18, 'defense-aerospace', 'Defense & Aerospace', 'Luftfahrt', 'Auf Weltniveau', '#61708a', 'i', 'thema-defense-aerospace', true],
    [19, 'biotechnologie', 'Biotechnologie', 'Wirkstoffe', 'Leben neu verstehen', '#1fae8c', 'h', 'thema-biotechnologie', true],
    [20, 'genomik-gentherapie', 'Genomik & Gentherapie', 'CRISPR', 'Code des Lebens lesen', '#2b9fd0', 'h', 'thema-genomik-gentherapie', true],
    [21, 'medizintechnik', 'Medizintechnik', 'Diagnostik', 'Technik, die heilt', '#2a8bd8', 'h', 'thema-medizintechnik', true],
    [22, 'pharma-wirkstoffforschung', 'Pharma & Wirkstoffforschung', 'Forschung', 'Therapien', '#3aa0c8', 'h', 'thema-pharma-wirkstoffforschung', true],
    [23, 'longevity-praezisionsmedizin', 'Longevity & Präzisionsmedizin', 'Medizin', 'Gesund altern', '#27b39a', 'h', 'thema-longevity-praezisionsmedizin', true],
    [24, 'landwirtschaft-agtech', 'Landwirtschaft & AgTech', 'AgTech', 'Mehr Ernte', '#6aa82a', 'i', 'thema-landwirtschaft-agtech', true],
    [25, 'rohstoffe-bergbau', 'Rohstoffe & Bergbau', 'Kupfer', 'Basis des Fortschritts', '#b8792f', 'e', 'thema-rohstoffe-bergbau', true],
    [26, 'industrie-maschinenbau', 'Industrie & Maschinenbau', 'Produktion', 'Präzision in Serie', '#7b8494', 'i', 'thema-industrie-maschinenbau', true],
    [27, 'logistik-automation', 'Logistik & Automation', 'Lager', 'Schneller ans Ziel', '#e39a2c', 'i', 'thema-logistik-automation', true],
    [28, 'infrastruktur', 'Infrastruktur', 'Straßen', 'Was verbindet', '#8d7a5e', 'i', 'thema-infrastruktur', true],
    [29, 'banken-fintech', 'Banken & Fintech', 'Banken', 'Geld wird digital', '#2c6fd1', 'f', 'thema-banken-fintech', true],
    [30, 'versicherungen', 'Versicherungen', 'Assekuranz', 'Stabilität im Risiko', '#3d5fa8', 'f', 'thema-versicherungen', true],
    [31, 'immobilien-reits', 'Immobilien & REITs', 'REITs', 'Substanz, Rendite', '#9a6b4b', 'f', 'thema-immobilien-reits', true],
    [32, 'konsum-marken', 'Konsum & Marken', 'Marken', 'Starke Marken', '#d65c7a', 'c', 'thema-konsum-marken', true],
    [33, 'luxus-premium', 'Luxus & Premium', 'Mode', 'Zeitlos begehrt', '#b8923a', 'c', 'thema-luxus-premium', true],
    [34, 'lebensmittel-getraenke', 'Lebensmittel & Getränke', 'Food', 'Täglicher Bedarf', '#d9832b', 'c', 'thema-lebensmittel-getraenke', true],
    [35, 'e-commerce', 'E-Commerce', 'Onlinehandel', 'Ohne Ladenschluss', '#e2622f', 'c', 'thema-e-commerce', true],
    [36, 'reisen-tourismus', 'Reisen & Tourismus', 'Airlines', 'Die Welt erleben', '#23a6c9', 'c', 'thema-reisen-tourismus', true],
    [37, 'freizeit-entertainment', 'Freizeit & Entertainment', 'Freizeitparks', 'Statt Dinge', '#c44fb0', 'c', 'thema-freizeit-entertainment', true],
    [38, 'medien-werbung', 'Medien & Werbung', 'Content', 'Reichweite mit Wirkung', '#8b54d6', 't', 'thema-medien-werbung', true],
    [39, 'streaming-gaming', 'Streaming & Gaming', 'Video', 'Unterhaltung auf Abruf', '#a24dde', 't', 'thema-streaming-gaming', true],
    [40, 'telekommunikation-netze', 'Telekommunikation & Netze', 'Mobilfunk', 'Vernetzung', '#2f86c9', 't', 'thema-telekommunikation-netze', true],
    [41, 'oel-gas', 'Öl, Gas & Versorger', 'Förderung', 'Klassische Energie', '#6b5b3e', 'e', 'thema-oel-gas-versorger', true],
    [42, 'chemie', 'Chemie & Werkstoffe', 'Grundstoffe', 'Für Industrie', '#6a8caf', 'i', 'thema-chemie-werkstoffe', true],
    [43, 'fertigung', 'Industrie & Fertigung', 'Maschinen', 'Fabriken im Detail', '#8a8f99', 'i', 'thema-industrie-fertigung', true],
    [44, 'einzelhandel', 'Handel & Einzelhandel', 'Läden', 'Konsum vor Ort', '#d98a3d', 'c', 'thema-handel-einzelhandel', true],
    [45, 'grosshandel', 'Großhandel', 'Zwischenhandel', 'Vor dem Regal', '#7a92a3', 'i', 'thema-grosshandel-distribution', true],
    [46, 'bau', 'Bau & Baustoffe', 'Bau', 'Was gebaut wird', '#9c7a56', 'i', 'thema-bau-baustoffe', true],
    [47, 'spedition', 'Transport & Spedition', 'Bahn', 'Fracht in Bewegung', '#4f7a8a', 'i', 'thema-transport-spedition', true],
    [48, 'papier', 'Papier & Verpackung', 'Holz', 'Rohstoffe aus dem Wald', '#6f8a52', 'i', 'thema-papier-verpackung-forst', true],
    [49, 'textil', 'Textil & Bekleidung', 'Textil', 'Stoffe im Alltag', '#b06a8a', 'c', 'thema-textil-bekleidung', true],
    [50, 'stahl', 'Metallverarbeitung & Stahl', 'Stahl', 'Für die Industrie', '#78808a', 'i', 'thema-metallverarbeitung-stahl', true],
    [51, 'finanzdienste', 'Finanzdienstleistungen', 'Broker', 'Kapital im Hintergrund', '#3f6a8f', 'f', 'thema-finanzdienstleistungen-vermoegen', true],
    [52, 'software-it', 'Unternehmenssoftware & IT', 'Software', 'Für Firmen', '#5a6ac0', 't', 'thema-software-it-dienstleistungen', true],
    [53, 'unternehmen', 'Dienstleistungen', 'Bildung', 'Dienste statt Produkte', '#8a6ac0', 'i', 'thema-dienstleistungen-bildung-personal', true],
    [54, 'gesundheit', 'Gesundheitsdienstleister', 'Kliniken', 'Die Versorgung selbst', '#4a9a8a', 'h', 'thema-gesundheitsdienstleister', true]
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
