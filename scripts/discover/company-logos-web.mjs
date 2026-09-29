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

/* Ehrliche Crawler-Kennung im ueblichen Format - viele CDNs lassen
   "compatible; ...bot"-Kennungen durch, eine nackte Kennung nicht. */
export const WEB_USER_AGENT =
  "Mozilla/5.0 (compatible; VisionUniverseLogoSync/1.1; +https://github.com/dennismueller10x-sudo/vision-universe-research)";

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
export function parseIconLinks(html, baseUrl, companyName) {
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
  /* Das Logo im Seitenkopf: <img> mit "logo" in Quelle, Alternativtext,
     Klasse oder ID - fuer Seiten, die nur ein kleines Favicon haben. */
  for (const m of head.slice(0, 250000).matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const src = a.src || a["data-src"] || "";
    const hint = [src, a.alt, a.class, a.id].join(" ");
    if (!src || !/logo/i.test(hint) || /(partner|award|footer|sponsor|badge|client|customer)/i.test(hint)) continue;
    /* Nur das eigene Logo: Firmenname oder Domain im Hinweis, oder klar als
       Seitenlogo ausgezeichnet - sonst trifft man Partnerlogos (Xencor ->
       Novartis). */
    if (!ownLogoHint(hint, baseUrl, companyName)) continue;
    let href;
    try { href = new URL(src.replace(/&amp;/g, "&"), baseUrl).href; } catch (e) { continue; }
    if (/^https?:/.test(href)) icons.push({ href, size: 0, kind: "logo" });
    if (icons.filter((i) => i.kind === "logo").length >= 3) break;
  }
  return { icons, manifest, inlineSvg: inlineLogoSvg(head, baseUrl, companyName) };
}

const SEITENLOGO = /(site|brand|header|nav|navbar|main|primary|global|corporate|company|masthead|home)[-_ ]?logo|logo[-_ ]?(link|main|primary|header|brand|home)/i;

/** Gehoert ein Logo-Hinweis zur Firma selbst? */
export function ownLogoHint(hint, baseUrl, companyName) {
  const h = String(hint || "").toLowerCase();
  if (SEITENLOGO.test(h)) return true;
  const woerter = String(companyName || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter((w) => w.length >= 2 && !/^(inc|corp|co|the|and|holdings|group|class|company|ltd|plc|technologies|international)$/.test(w));
  let label = "";
  try { label = rootDomain(new URL(baseUrl).hostname).split(".")[0]; } catch (e) { /* ohne */ }
  /* Kurze Namen (HP, GE, 3M) nur als eigenes Wort - "hp" steckt auch in "php". */
  const trifft = (w) => w.length >= 4 ? h.includes(w) : new RegExp("(^|[^a-z0-9])" + w.replace(/[^a-z0-9]/g, "") + "([^a-z0-9]|$)").test(h);
  return (label.length >= 2 && trifft(label)) || woerter.some(trifft);
}

/** Ein <svg> im Seitenkopf, das als Logo ausgezeichnet ist (Klasse, ID, aria-label, title). */
export function inlineLogoSvg(html, baseUrl, companyName) {
  const text = String(html || "").slice(0, 250000);
  const re = /<svg\b[^>]*>/gi;
  let m;
  while ((m = re.exec(text))) {
    const vorher = text.slice(Math.max(0, m.index - 300), m.index);
    const tag = m[0];
    const innen = text.slice(m.index, m.index + 600);
    if (!/logo/i.test(tag) && !/<title>[^<]*logo/i.test(innen) && !/(class|id|aria-label)="[^"]*logo[^"]*"[^<]*$/i.test(vorher)) continue;
    if (baseUrl !== undefined && !ownLogoHint(vorher.slice(-200) + tag + innen.slice(0, 300), baseUrl, companyName)) continue;
    const ende = text.indexOf("</svg>", m.index);
    if (ende < 0) continue;
    let svg = text.slice(m.index, ende + 6);
    if (svg.length < 200 || svg.length > 200000) continue;
    if (!/xmlns=/.test(tag)) svg = svg.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    return svg;
  }
  return null;
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
  const logos = out.filter((c) => c.kind === "logo");
  const rest = out.filter((c) => c.kind !== "logo");
  out.length = 0; seen.clear();
  /* Quadratische Icons ab 64 px zuerst, dann die ueblichen Pfade, dann das
     Logo aus dem Seitenkopf, zuletzt kleine Favicons (die meist abgelehnt
     werden, aber ein ICO mit eingebettetem 256er-PNG sein koennen). */
  rest.filter((c) => c.size >= MIN_ICON).forEach(add);
  for (const pfad of ["/apple-touch-icon.png", "/apple-touch-icon-precomposed.png", "/apple-touch-icon-180x180.png",
                      "/android-chrome-512x512.png", "/android-chrome-192x192.png", "/favicon.svg"])
    add({ href: origin + pfad, size: 180, kind: "fallback" });
  logos.forEach(add);
  rest.filter((c) => c.size < MIN_ICON).forEach(add);
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
export async function toPng(buf, sharp, opts = {}) {
  let fmt = sniff(buf);
  if (!fmt) return { reason: "WEB_KEIN_BILD" };
  if (fmt === "ico") {
    const png = icoLargestPng(buf);
    if (!png) return { reason: "WEB_ICON_ZU_KLEIN" };
    buf = png; fmt = "png";
  }
  let img = sharp(buf, { limitInputPixels: 4096 * 4096, density: fmt === "svg" ? 300 : undefined });
  const meta = await img.metadata();
  /* Icon: beide Seiten ab 64 px. Wortmarke aus dem Seitenkopf: breit genug
     (ab 96 px) - sie ist naturgemaess flach. */
  const w = meta.width || 0, h = meta.height || 0;
  if (fmt !== "svg" && (opts.logo ? (Math.max(w, h) < 96 || Math.min(w, h) < 16) : Math.min(w, h) < MIN_ICON)) return { reason: "WEB_ICON_ZU_KLEIN" };
  const ratio = (meta.width || 1) / (meta.height || 1);
  /* Ein Logo aus dem Seitenkopf darf breit sein (Wortmarke), ein Icon nicht. */
  const maxRatio = opts.logo ? 8 : 4;
  if (ratio > maxRatio || ratio < 1 / maxRatio) return { reason: "WEB_ICON_FORMAT" };
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

/* ------------------------------------------------ Website aus SEC-Berichten */

/* Adressen, die in Berichten stehen, aber nicht die der Firma sind. */
const FREMD = /(^|\.)(sec\.gov|fasb\.org|xbrl\.(org|us)|w3\.org|pcaobus\.org|nasdaq\.com|nyse\.com|investor\.gov|irs\.gov|gov|edgar-online\.com|adobe\.com|microsoft\.com|google\.com|computershare\.com|broadridge\.com|astfinancial\.com|equiniti\.com|proxyvote\.com|q4cdn\.com|q4ir\.com|gcs-web\.com|businesswire\.com|prnewswire\.com|globenewswire\.com|sedarplus\.ca|sedar\.com|linkedin\.com|twitter\.com|x\.com|facebook\.com|youtube\.com|instagram\.com)$/i;

/** Registrierbare Domain (grob): letzte zwei Teile, bei co.uk/com.cn usw. drei. */
export function rootDomain(host) {
  const teile = String(host || "").toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (teile.length <= 2) return teile.join(".");
  const zwei = teile.slice(-2).join(".");
  return /^(co|com|net|org|gov|ac)\.[a-z]{2}$/.test(zwei) ? teile.slice(-3).join(".") : zwei;
}

/**
 * Die eigene Website aus dem Text eines SEC-Berichts. Gezaehlt werden nur
 * Adressen im Umfeld von "our website", "our internet address" usw. - eine
 * Adresse, die nur irgendwo im Text steht, reicht nicht.
 * @returns {string|null} Domain wie "nvidia.com"
 */
export function websiteFromFiling(text, companyName) {
  const t = String(text || "");
  const re = /\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+(?:com|net|org|io|ai|co|us|bio|biz|info|tech|health|energy|bank|group|global|inc|ca|cn|hk|il|uk|de|nl|ch|se|no|dk|fi|fr|it|es|ie|au|sg|jp|kr|in|br|mx|ar|cl|lu|be|at|tw|com\.cn|com\.hk|co\.uk|com\.au|com\.br|co\.il))(?![a-z0-9-])/gi;
  const kontext = /(our|the company['’]?s|its)\s+(corporate\s+|principal\s+|main\s+|investor\s+relations\s+)?(web\s?site|internet\s+(web\s?)?site|internet\s+address|home\s?page|web\s+address)|website\s+(address\s+)?(is|at|located\s+at)|available\s+(free\s+of\s+charge\s+)?(on|at|through)\s+our/i;
  const tokens = String(companyName || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 4);
  const score = new Map();
  let m;
  while ((m = re.exec(t))) {
    const host = m[1].toLowerCase().replace(/\.$/, "");
    const dom = rootDomain(host);
    if (!dom.includes(".") || FREMD.test(dom) || FREMD.test(host)) continue;
    if (/^\d/.test(dom) || /\.(htm|html|pdf|xml|jpg|png)$/i.test(host)) continue;
    const umfeld = t.slice(Math.max(0, m.index - 220), m.index);
    if (!kontext.test(umfeld)) continue;
    let pkt = 3 + (tokens.some((w) => dom.includes(w)) ? 2 : 0);
    score.set(dom, (score.get(dom) || 0) + pkt);
  }
  let best = null, bestScore = 0;
  for (const [d, v] of score) if (v > bestScore) { best = d; bestScore = v; }
  return best;
}

/** HTML/Text eines Berichts -> Fliesstext. */
export function filingText(html) {
  return String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;|&#xa0;/gi, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "’")
    .replace(/\s+/g, " ");
}

/** Juengster Jahres- oder Quartalsbericht aus der SEC-Einreichungsliste. */
export function latestReport(recent) {
  if (!recent || !Array.isArray(recent.form)) return null;
  const rang = ["10-K", "20-F", "40-F", "10-K/A", "20-F/A", "10-Q", "S-1", "F-1", "424B4", "10-12B", "8-K"];
  for (const form of rang) {
    const i = recent.form.indexOf(form);
    if (i >= 0 && recent.primaryDocument[i]) return { form, accession: recent.accessionNumber[i], document: recent.primaryDocument[i] };
  }
  return null;
}
