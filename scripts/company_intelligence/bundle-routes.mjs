// Seit E5 (scripts/mobile/bundle-discover.mjs, danach minifiziert) liefert die Seite die
// Discover-Skripte als Buendel unter /discover/delivery/*.js aus. Einzelne Datei-Routen der QAs
// (rollout.js, contract.js, stock-section.js, discover/ui/detail.js) greifen dort nicht mehr;
// die Seite liefe mit der Produktions-Konfiguration gegen Kandidaten-Daten
// (PRODUCTION_GENERATION_MISMATCH, Kapitel entfernt).
//
// Die minifizierten Buendel tragen keine Modulgrenzen. Deshalb ersetzt diese Hilfe nichts im
// Buendel, sondern haengt die Kandidaten-Module an jedes Buendel an, das das jeweilige Modul
// enthaelt (erkannt an einer Signatur). Alle vier Module setzen am Ende ihre globale Variable
// (VUCompanyIntelligenceRollout, VUCompanyIntelligence, VUCompanyIntelligenceStock,
// VUDiscover.Detail), die erst zur Laufzeit gelesen wird: die spaetere Definition gilt.
export const SIGNATURES = {
  'company-intelligence/config/rollout.js': 'VUCompanyIntelligenceRollout',
  'company-intelligence/api/contract.js': 'PRODUCTION_GENERATION_MISMATCH',
  'company-intelligence/ui/stock-section.js': 'VUCompanyIntelligenceStock=',
  'discover/ui/detail.js': 'dv3-profi'
};

/**
 * Haengt an `code` die Ersatzmodule an, deren Signatur im Buendel vorkommt.
 * overrides: pfad -> Quelltext. Gibt {code, appended} zurueck; ohne Treffer unveraendert.
 */
export function appendOverrides(code, overrides, signatures = SIGNATURES) {
  const appended = [];
  let out = code;
  for (const [path, source] of Object.entries(overrides)) {
    const sig = signatures[path];
    if (!sig) throw Error('UNKNOWN_OVERRIDE_MODULE:' + path);
    if (!code.includes(sig)) continue;
    out += '\n;\n/* qa-override: ' + path + ' */\n' + source + '\n';
    appended.push(path);
  }
  return { code: out, appended };
}

/**
 * Leitet /discover/delivery/*.js ueber appendOverrides. overrides: pfad -> Text oder
 * async (original) => Text; das Original kommt aus der weiterhin einzeln ausgelieferten Datei.
 * Gibt eine Menge zurueck, in der die tatsaechlich angehaengten Pfade landen.
 */
export async function routeDeliveryBundles(page, overrides, origin) {
  const seen = new Set();
  const resolved = {};
  for (const [path, value] of Object.entries(overrides)) {
    if (typeof value !== 'function') { resolved[path] = value; continue; }
    const response = await page.request.get(origin.replace(/\/$/, '') + '/' + path);
    if (!response.ok()) throw Error('OVERRIDE_ORIGINAL_UNAVAILABLE:' + path);
    resolved[path] = await value(await response.text());
  }
  await page.route('**/discover/delivery/*.js*', async (route) => {
    const response = await route.fetch();
    const { code, appended } = appendOverrides(await response.text(), resolved);
    appended.forEach((p) => seen.add(p));
    await route.fulfill({ response, body: code, contentType: 'application/javascript' });
  });
  return seen;
}
