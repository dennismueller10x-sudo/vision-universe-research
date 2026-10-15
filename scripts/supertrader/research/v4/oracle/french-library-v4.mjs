/**
 * Parser for the official Kenneth R. French Data Library CSV members used as V4 external calibration oracles.
 *
 * Only monthly sections are parsed. Values are percent in the source and returned as decimal returns.
 * Missing values (-99.99, -999) become null and are counted, never zero-filled.
 * The raw files are copyrighted (redistribution licence not established): the repository only stores their
 * URLs and SHA-256 hashes; the bytes are downloaded inside the runner and verified against those hashes.
 */
const MISSING = new Set([-99.99, -999]);

/** Returns {title: {columns, rows: Map(YYYY-MM -> number[] | null entries)}} for every monthly YYYYMM section. */
export function parseFrenchSections(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const sections = {};
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i + 1];
    if (!header || !header.startsWith(',')) continue;
    const title = lines[i].trim();
    if (!title) continue;
    const columns = header.split(',').slice(1).map((c) => c.trim());
    const rows = new Map();
    let j = i + 2;
    for (; j < lines.length; j++) {
      const m = /^\s*(\d{6})\s*,(.*)$/.exec(lines[j]);
      if (!m) break;
      const values = m[2].split(',').map((v) => Number(v.trim()));
      if (values.length !== columns.length || values.some((v) => !Number.isFinite(v))) throw new Error('FRENCH_ROW_SHAPE_INVALID');
      rows.set(`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}`, values.map((v) => (MISSING.has(v) ? null : v)));
    }
    if (rows.size) sections[title] = { columns, rows };
    i = j - 1;
  }
  return sections;
}

function section(sections, title) {
  const s = sections[title];
  if (!s) throw new Error('FRENCH_SECTION_MISSING:' + title.replace(/[^A-Za-z]+/g, '_'));
  return s;
}
const pick = (s, names) => names.map((n) => { const i = s.columns.indexOf(n); if (i < 0) throw new Error('FRENCH_COLUMN_MISSING'); return i; });
const inWindow = (month, w) => month >= w.from && month <= w.to;

/**
 * EW market oracle from Portfolios_Formed_on_ME.csv: firm-count weighted average of the ten equal-weighted
 * size-decile returns = equal-weighted return of every firm in the size deciles (CRSP common shares,
 * NYSE/AMEX/NASDAQ, positive June market equity).
 */
export function ewMarketOracle(sections, window) {
  const ew = section(sections, 'Average Equal Weighted Returns -- Monthly'), n = section(sections, 'Number of Firms in Portfolios');
  const deciles = ['Lo 10', '2-Dec', '3-Dec', '4-Dec', '5-Dec', '6-Dec', '7-Dec', '8-Dec', '9-Dec', 'Hi 10'];
  const ri = pick(ew, deciles), ni = pick(n, deciles), out = [];
  for (const [month, r] of ew.rows) {
    if (!inWindow(month, window)) continue;
    const counts = n.rows.get(month);
    if (!r || !counts || ri.some((i) => r[i] === null) || ni.some((i) => counts[i] === null)) { out.push({ month, ret: null, firms: null }); continue; }
    const firms = ni.reduce((a, i) => a + counts[i], 0);
    out.push({ month, ret: ri.reduce((a, i, k) => a + counts[ni[k]] * r[i], 0) / firms / 100, firms });
  }
  return out;
}

/** Equal-weighted bucket returns and firm counts for a sorted-portfolio file (deciles or quintiles). */
export function bucketOracle(sections, { returnsTitle, countsTitle = 'Number of Firms in Portfolios', buckets }, window) {
  const ew = section(sections, returnsTitle), n = section(sections, countsTitle);
  const ri = pick(ew, buckets), ni = pick(n, buckets), out = [];
  for (const [month, r] of ew.rows) {
    if (!inWindow(month, window)) continue;
    const counts = n.rows.get(month);
    out.push({ month, buckets: ri.map((i) => (r && r[i] !== null ? r[i] / 100 : null)), firms: ni.map((i) => (counts && counts[i] !== null ? counts[i] : null)) });
  }
  return out;
}

export const MOM_DECILES = ['Lo PRIOR', 'PRIOR 2', 'PRIOR 3', 'PRIOR 4', 'PRIOR 5', 'PRIOR 6', 'PRIOR 7', 'PRIOR 8', 'PRIOR 9', 'Hi PRIOR'];
export const VAR_QUINTILES = ['Lo 20', 'Qnt 2', 'Qnt 3', 'Qnt 4', 'Hi 20'];

export function momentumOracle(sections, window) {
  return bucketOracle(sections, { returnsTitle: 'Average Equal Weighted Returns -- Monthly', buckets: MOM_DECILES }, window);
}
export function varianceOracle(sections, window) {
  return bucketOracle(sections, { returnsTitle: 'Equal Weighted Returns -- Monthly', buckets: VAR_QUINTILES }, window);
}
