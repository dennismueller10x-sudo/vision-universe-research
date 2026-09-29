/**
 * Zweite Logo-Quelle: das Icon auf der offiziellen Website der Firma.
 *
 * Greift nur, wo Wikimedia Commons kein frei lizenziertes Logo hat. Die
 * Website stammt aus Wikidata (P856, dasselbe Item wie bei der Logo-
 * Zuordnung ueber CIK, Ticker oder Namen) oder aus den SEC-Stammdaten zur
 * CIK - geraten wird keine Adresse.
 *
 * Rechtlich ist das keine Lizenz, sondern die Nutzung der Marke zur
 * Identifizierung des Unternehmens neben seinen eigenen Kursdaten (bewusst
 * getroffene Entscheidung des Betreibers, 29.09.2026). Deshalb:
 *   - das Icon wird nur verkleinert, nie veraendert oder beschnitten;
 *   - die Quelle steht am Logo ("Website des Unternehmens"), keine
 *     Lizenzangabe wird behauptet;
 *   - discover/config/logo-exclusions.json entfernt jedes Logo auf Wunsch.
 *
 * Aus Sicherheitsgruenden wird nie eine fremde SVG-Datei ausgeliefert - SVG
 * wird zu PNG gerastert. Ein Icon, das bei mehreren verschiedenen Websites
 * identisch auftaucht, ist ein Baukasten-Icon und faellt heraus.
 */

export const MIN_ICON = 64;
export const OUT_SIZE = 128;

/* Adressen, die keine Firmenseite sind. */
const KEINE_FIRMENSEITE = /(^|\.)(wikipedia\.org|wikidata\.org|facebook\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|instagram\.com|sec\.gov|google\.com|bloomberg\.com|reuters\.com|yahoo\.com|github\.com)$/i;

/** Offizielle Website -> {url, origin, host} oder null. */
export function normalizeSite(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (KEINE_FIRMENSEITE.test(host)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  u.hash = "";
  return { url: u.href, origin: u.origin, host };
}

function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5];
  return out;
}

function groesste(sizes) {
  if (!sizes) return 0;
  if (/any/i.test(sizes)) return 512;
  return Math.max(0, ...String(sizes).split(/\s+/).map((s) => {
    const m = /^(\d+)x(\d+)$/i.exec(s);
    return m ? Math.min(Number(m[1]), Number(m[2])) : 0;
  }));
}

/**
 * Icon-Kandidaten aus dem HTML der Startseite, beste zuerst:
 * apple-touch-icon, dann Icons nach angegebener Groesse; mask-icon
 * (einfarbige Safari-Silhouette) zaehlt nicht.
 * @returns {{icons: Array<{href, size, kind}>, manifest: string|null}}
 */
export function parseIconLinks(html, baseUrl) {
  const icons = [];
  let manifest = null;
  const head = String(html || "").slice(0, 400000);
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = String(a.rel || "").toLowerCase();
    if (!a.href) continue;
    let href;
    try { href = new URL(a.href.replace(/&amp;/g, "&"), baseUrl).href; } catch (e) { continue; }
    if (!/^https?:/.test(href)) continue;
    if (/\bmanifest\b/.test(rel)) { manifest = manifest || href; continue; }
    if (/mask-icon/.test(rel)) continue;
    if (/apple-touch-icon/.test(rel)) icons.push({ href, size: groesste(a.sizes) || 180, kind: "apple" });
    else if (/\bicon\b/.test(rel)) icons.push({ href, size: groesste(a.sizes) || (/\.svg(\?|$)/i.test(href) ? 256 : 0), kind: "icon" });
  }
  return { icons, manifest };
}

/** Icons aus einer Web-App-Manifest-Datei. */
export function parseManifest(json, baseUrl) {
  const list = (json && Array.isArray(json.icons)) ? json.icons : [];
  const out = [];
  for (const i of list) {
    if (!i || !i.src) continue;
    if (/monochrome/i.test(i.purpose || "")) continue;
    try { out.push({ href: new URL(i.src, baseUrl).href, size: groesste(i.sizes), kind: "manifest" }); } catch (e) { /* weiter */ }
  }
  return out;
}

/** Reihenfolge der Versuche; Standardpfade am Ende. */
export function orderCandidates(found, origin) {
  const seen = new Set(), out = [];
  const add = (c) => { if (!seen.has(c.href)) { seen.add(c.href); out.push(c); } };
  const rank = (c) => (c.size >= MIN_ICON ? 0 : 1) * 1e6 - c.size + (c.kind === "apple" ? -1 : 0);
  found.slice().sort((a, b) => rank(a) - rank(b)).forEach(add);
  add({ href: origin + "/apple-touch-icon.png", size: 180, kind: "fallback" });
  add({ href: origin + "/favicon.ico", size: 0, kind: "fallback" });
  return out;
}

/** Bildformat aus den ersten Bytes - nie aus der Endung oder dem Server-Header. */
export function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf.slice(0, 4).toString("latin1") === "GIF8") return "gif";
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return "ico";
  const head = buf.slice(0, 1024).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  return null;
}

/**
 * Aus einer ICO-Datei der groesste Eintrag, sofern er als PNG eingebettet
 * ist (moderne Favicons). BMP-Eintraege sind fuer 16/32 px gedacht - zu klein.
 */
export function icoLargestPng(buf) {
  const n = buf.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < n && 6 + 16 * (i + 1) <= buf.length; i++) {
    const o = 6 + 16 * i;
    const w = buf[o] || 256, size = buf.readUInt32LE(o + 8), off = buf.readUInt32LE(o + 12);
    if (off + size > buf.length) continue;
    const data = buf.slice(off, off + size);
    if (sniff(data) !== "png") continue;
    if (!best || w > best.w) best = { w, data };
  }
  return best ? best.data : null;
}

/**
 * Rohes Icon -> verkleinertes PNG, oder {reason}.
 * @param {Buffer} buf
 * @param {Function} sharp  die sharp-Bibliothek
 */
export async function toPng(buf, sharp) {
  let fmt = sniff(buf);
  if (!fmt) return { reason: "WEB_KEIN_BILD" };
  if (fmt === "ico") {
    const png = icoLargestPng(buf);
    if (!png) return { reason: "WEB_ICON_ZU_KLEIN" };
    buf = png; fmt = "png";
  }
  let img = sharp(buf, { limitInputPixels: 4096 * 4096, density: fmt === "svg" ? 300 : undefined });
  const meta = await img.metadata();
  if (fmt !== "svg" && Math.min(meta.width || 0, meta.height || 0) < MIN_ICON) return { reason: "WEB_ICON_ZU_KLEIN" };
  const ratio = (meta.width || 1) / (meta.height || 1);
  if (ratio > 4 || ratio < 0.25) return { reason: "WEB_ICON_FORMAT" };
  const out = await img.resize(OUT_SIZE, OUT_SIZE, { fit: "inside", withoutEnlargement: fmt !== "svg" })
    .png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
  return { png: out, width: meta.width || null, format: fmt };
}

/**
 * Baukasten-Icons: dasselbe Bild auf mindestens drei verschiedenen
 * Websites. Aktiengattungen derselben Firma (gleiche Website) zaehlen
 * nicht mit.
 * @param {Map<symbol,{hash, host}>} icons
 * @returns {Set<symbol>} Titel, deren Icon generisch ist
 */
export function genericIcons(icons, minHosts = 3) {
  const hosts = new Map();
  for (const { hash, host } of icons.values()) {
    if (!hosts.has(hash)) hosts.set(hash, new Set());
    hosts.get(hash).add(host);
  }
  const out = new Set();
  for (const [sym, { hash }] of icons) if (hosts.get(hash).size >= minHosts) out.add(sym);
  return out;
}
