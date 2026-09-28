// SIC-Stammdaten fuer den Screener.
//
// Die SEC fuehrt je Emittent einen vierstelligen SIC-Code. Er ist die einzige
// Branchenklassifikation, die fuer das ganze Universum real vorliegt
// (quant/data/product/sic-peer-taxonomy-v1.json). GICS-Sektoren gibt es nicht.
//
// Zwei Ebenen werden daraus gebildet:
//  1. SIC-Hauptgruppe (zweistellig) - die offizielle Bezeichnung, uebersetzt.
//  2. Ein abgeleiteter "Sektor" (Vision-Universe-Zuordnung sic-sector-1.0.0).
//     Er ist eine offengelegte, deterministische Abbildung von SIC-Bereichen
//     auf gelaeufige Sektornamen - keine Anbieterangabe und kein GICS.

export const SIC_SECTOR_VERSION = 'sic-sector-1.0.0';

export const MAJOR_GROUPS = {
  '01': 'Landwirtschaft (Pflanzen)', '02': 'Landwirtschaft (Tiere)', '07': 'Landwirtschaftliche Dienste', '08': 'Forstwirtschaft', '09': 'Fischerei',
  '10': 'Metallbergbau', '12': 'Kohlebergbau', '13': 'Öl- und Gasförderung', '14': 'Bergbau (Nichtmetalle)',
  '15': 'Hochbau', '16': 'Tiefbau', '17': 'Bauhandwerk',
  '20': 'Nahrungsmittel', '21': 'Tabak', '22': 'Textilien', '23': 'Bekleidung', '24': 'Holzprodukte', '25': 'Möbel',
  '26': 'Papier', '27': 'Druck und Verlage', '28': 'Chemie und Pharma', '29': 'Mineralölverarbeitung', '30': 'Gummi und Kunststoff',
  '31': 'Leder', '32': 'Glas, Stein, Keramik', '33': 'Metallerzeugung', '34': 'Metallwaren', '35': 'Maschinen und Computer',
  '36': 'Elektronik und Halbleiter', '37': 'Fahrzeuge und Luftfahrt', '38': 'Mess-, Medizin- und Optiktechnik', '39': 'Sonstige Fertigung',
  '40': 'Eisenbahn', '41': 'Personennahverkehr', '42': 'Güterverkehr und Lager', '43': 'Postdienste', '44': 'Schifffahrt', '45': 'Luftverkehr',
  '46': 'Pipelines', '47': 'Transportdienste', '48': 'Telekommunikation', '49': 'Strom, Gas, Wasser, Entsorgung',
  '50': 'Großhandel (langlebige Güter)', '51': 'Großhandel (Verbrauchsgüter)',
  '52': 'Baumarkt und Gartenbedarf', '53': 'Warenhäuser', '54': 'Lebensmittelhandel', '55': 'Autohandel und Tankstellen', '56': 'Bekleidungshandel',
  '57': 'Einrichtungshandel', '58': 'Gastronomie', '59': 'Sonstiger Einzelhandel',
  '60': 'Banken', '61': 'Kreditinstitute (ohne Einlagen)', '62': 'Wertpapierhandel und Börsen', '63': 'Versicherungen', '64': 'Versicherungsvermittlung',
  '65': 'Immobilien', '67': 'Holdings und Investmentgesellschaften',
  '70': 'Hotels', '72': 'Persönliche Dienstleistungen', '73': 'Unternehmensdienste und Software', '75': 'Kfz-Dienstleistungen', '76': 'Reparaturdienste',
  '78': 'Film und Video', '79': 'Freizeit und Unterhaltung', '80': 'Gesundheitsdienste', '81': 'Rechtsdienste', '82': 'Bildung', '83': 'Soziale Dienste',
  '86': 'Organisationen', '87': 'Ingenieur-, Forschungs- und Beratungsdienste', '89': 'Sonstige Dienste', '99': 'Nicht klassifiziert'
};

export const DIVISIONS = {
  A: 'Land- und Forstwirtschaft', B: 'Bergbau', C: 'Bau', D: 'Verarbeitendes Gewerbe', E: 'Transport, Kommunikation, Versorgung',
  F: 'Großhandel', G: 'Einzelhandel', H: 'Finanzen, Versicherungen, Immobilien', I: 'Dienstleistungen', J: 'Öffentliche Verwaltung'
};

export const SECTORS = {
  tech: 'Technologie', comm: 'Kommunikation', health: 'Gesundheit', fin: 'Finanzen', estate: 'Immobilien', energy: 'Energie',
  util: 'Versorger', materials: 'Grundstoffe', industry: 'Industrie', discretionary: 'Zyklischer Konsum', staples: 'Basiskonsum', other: 'Sonstige'
};

const inRange = (c, a, b) => c >= a && c <= b;

/** SIC4 (Zahl) -> Sektor-ID. Reihenfolge der Pruefungen ist Teil der Methodik. */
export function sectorFromSic(sic) {
  const c = Number(sic);
  if (!Number.isInteger(c) || c <= 0) return null;
  // Technologie
  if (inRange(c, 3570, 3579) || inRange(c, 3661, 3679) || inRange(c, 3690, 3699) || inRange(c, 3820, 3829) || inRange(c, 7370, 7379)) return 'tech';
  // Gesundheit
  if (inRange(c, 2830, 2836) || inRange(c, 3840, 3851) || inRange(c, 8000, 8099) || c === 8731 || inRange(c, 5120, 5122)) return 'health';
  // Kommunikation
  if (inRange(c, 4800, 4899) || inRange(c, 2710, 2799) || inRange(c, 7810, 7829) || inRange(c, 7310, 7319)) return 'comm';
  // Immobilien vor Finanzen (6798 REIT)
  if (inRange(c, 6500, 6599) || c === 6798) return 'estate';
  if (inRange(c, 6000, 6799)) return 'fin';
  // Energie
  if (inRange(c, 1200, 1399) || inRange(c, 2900, 2999) || inRange(c, 4610, 4619) || c === 4922 || c === 4923 || inRange(c, 5170, 5172)) return 'energy';
  // Entsorgung gehoert zur Industrie, der Rest von 49 zu den Versorgern
  if (inRange(c, 4950, 4959)) return 'industry';
  if (inRange(c, 4900, 4999)) return 'util';
  // Basiskonsum
  if (inRange(c, 100, 999) || inRange(c, 2000, 2199) || inRange(c, 2840, 2844) || inRange(c, 5140, 5149) || inRange(c, 5400, 5499) || c === 5912 || inRange(c, 5180, 5182)) return 'staples';
  // Zyklischer Konsum
  if (inRange(c, 1520, 1531) || inRange(c, 2200, 2399) || inRange(c, 2500, 2599) || inRange(c, 3000, 3199) || inRange(c, 3630, 3652) || inRange(c, 3710, 3716) || inRange(c, 3940, 3949)
    || inRange(c, 5200, 5999) || inRange(c, 7000, 7299) || inRange(c, 7500, 7599) || inRange(c, 7900, 7999) || inRange(c, 8200, 8299)) return 'discretionary';
  // Grundstoffe
  if (inRange(c, 1000, 1099) || inRange(c, 1400, 1499) || inRange(c, 2400, 2499) || inRange(c, 2600, 2699) || inRange(c, 2800, 2829) || inRange(c, 2850, 2899)
    || inRange(c, 3200, 3399)) return 'materials';
  // Industrie
  if (inRange(c, 1500, 1799) || inRange(c, 3400, 3569) || inRange(c, 3580, 3629) || inRange(c, 3653, 3660) || inRange(c, 3700, 3799) || inRange(c, 3800, 3819) || inRange(c, 3830, 3839)
    || inRange(c, 3852, 3939) || inRange(c, 3950, 3999) || inRange(c, 4000, 4799) || inRange(c, 5000, 5199) || inRange(c, 7300, 7369) || inRange(c, 7380, 7389) || inRange(c, 8700, 8799)) return 'industry';
  return 'other';
}
