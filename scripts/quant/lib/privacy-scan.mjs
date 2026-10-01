/* Datenschutz-Pruefung abgeleiteter Artefakte: eine Reihe (Array oder
   Objekt) unter einem Kursschluessel ist ein Fund, ein beschreibender Text
   darunter nicht. Rohkurse des Anbieters gehoeren nie ins oeffentliche
   Repository (assert-public-data-hygiene.mjs). */
export const PRICE_KEYS = ["bars", "daily", "closes", "prices", "ohlc"];
export function hasPriceKeys(o) {
  if (!o || typeof o !== "object") return false;
  if (Array.isArray(o)) return o.some(hasPriceKeys);
  return Object.keys(o).some((k) => (PRICE_KEYS.includes(k) && o[k] !== null && typeof o[k] === "object") || hasPriceKeys(o[k]));
}
