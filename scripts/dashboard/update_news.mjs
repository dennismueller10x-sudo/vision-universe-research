import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url), output = new URL('dashboard/data/news_feed.json', root);
const universe = JSON.parse(await readFile(new URL('dashboard/config/universe.json', root), 'utf8'));
const maxAgeMs = 72 * 3600000, cutoff = Date.now() - maxAgeMs;
const clean = (v = '') => String(v).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&uuml;/g, 'ü').replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&szlig;/g, 'ß').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => clean(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '');
const fetchText = async (url, options = {}) => { const r = await fetch(url, options); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); };
const active = universe.stocks.filter((s) => s.active), names = new Map(active.flatMap((s) => [[s.symbol.toUpperCase(), s], [s.name.toUpperCase(), s]]));
function detectStock(text) { const h = text.toUpperCase(); for (const [needle, stock] of names) { if (needle.length < 3) continue; const e = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (new RegExp(`(^|[^A-ZÄÖÜ0-9])${e}([^A-ZÄÖÜ0-9]|$)`).test(h)) return stock; } return null; }
function score(i) { const hours = Math.max(0, (Date.now() - i.published_ms) / 3600000); return Math.round(100 - Math.min(hours, 72) + (/ZAHLEN|EARNINGS|GUIDANCE|PROGNOSE|ÜBERNAHME|MERGER|AUFTRAG|FDA|DIVIDEND|CEO|GEWINN|UMSATZ|8-K|AD.HOC/i.test(`${i.headline} ${i.raw_summary}`) ? 35 : 0) + (i.symbol ? 15 : 0)); }
// Article images from these feeds are tiny (~305x280) and blur badly at header size, so headers
// always use one of our own high-resolution local images, picked by topic for variety.
function pickImage(stock, headline) {
  const h = headline.toUpperCase();
  if (stock || /CHIP|HALBLEITER|KI\b|TECH/.test(h)) return '/dashboard/assets/news-us-tech.jpg';
  if (/DAX|MDAX|SDAX|TECDAX|AKTIENINDE|AUSWAHLINDIZ|DEUTSCHE.?B[ÖO]RSE/.test(h)) return '/dashboard/assets/news-dax.jpg';
  return '/dashboard/assets/news-small-caps.jpg';
}
// Wire-service filler, press-release spam and forum/community posts that these aggregators
// syndicate alongside real editorial news — filtered out before scoring, not just ranked low.
const JUNK_PATTERN = /^(IRW-PRESS|EQS-News|PR Newswire|GlobeNewswire|Business Wire|Sponsored|Anzeige|Werbung|Gewinnspiel|Horoskop|Rätsel|Forum:|Community:|Diskussion:|Kolumne:)/i;
function isJunk(headline, raw) { return JUNK_PATTERN.test(headline) || raw.replace(/\s/g, '').length < 40; }
async function rssItems(sourceName, prefix, url) {
  const xml = await fetchText(url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
  return (xml.match(/<item>[\s\S]*?<\/item>/gi) || []).flatMap((item) => {
    const headline = tag(item, 'title'), raw = tag(item, 'description'), published = Date.parse(tag(item, 'pubDate'));
    if (!headline || !published || published < cutoff || isJunk(headline, raw)) return [];
    const stock = detectStock(`${headline} ${raw}`);
    return [{ id: `${prefix}-${stock?.symbol || 'markt'}-${published}`, symbol: stock?.symbol || null, company: stock?.name || 'Marktbericht', market: stock ? 'US-Aktien' : 'Markt & Makro', category: stock ? 'Unternehmen' : 'Marktbericht', headline, raw_summary: raw.slice(0, 900), source: sourceName, source_url: tag(item, 'link'), image_url: pickImage(stock, headline), published_ms: published }];
  });
}
const frankfurtItems = () => rssItems('Börse Frankfurt', 'bf', 'https://api.boerse-frankfurt.de/v1/feeds/news.rss');
// wallstreet-online.de explicitly permits headline + excerpt + backlink reuse (not full articles);
// strong Wall-Street/US-stock focus complements Börse Frankfurt's German-market coverage.
const wallstreetOnlineItems = () => rssItems('wallstreet-online.de', 'wo', 'https://www.wallstreet-online.de/rss/nachrichten-alle.xml');
const finanznachrichtenItems = () => rssItems('FinanzNachrichten.de', 'fn', 'https://www.finanznachrichten.de/rss-nachrichten-boerse.htm');
const investingComItems = () => rssItems('Investing.com', 'iv', 'https://de.investing.com/rss/news_301.rss');
function summarize(text, maxLen = 320) {
  const t = clean(text);
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen), sentenceEnd = cut.lastIndexOf('. ');
  return sentenceEnd > 80 ? cut.slice(0, sentenceEnd + 1).trim() : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}
function buildArticles(items) {
  return items.map((i) => ({ id: i.id, symbol: i.symbol, company: i.company, market: i.market, category: i.category, title: clean(i.headline).slice(0, 90), summary: summarize(i.raw_summary) || clean(i.headline), why_it_matters: i.company ? `Relevant für ${i.company}-Anleger im Bereich ${i.category}.` : `Relevant für Anleger im Bereich ${i.category}.`, source: i.source, source_url: i.source_url, image_url: i.image_url, published_at: new Date(i.published_ms).toISOString(), relevance: score(i), editorial: 'Vision Universe Redaktion' }));
}
const normalizeHeadline = (h) => h.toLowerCase().normalize('NFKD').replace(/[^a-z0-9äöüß ]/g, '').replace(/\s+/g, ' ').trim();
const MIN_RELEVANCE = 40, MIN_ARTICLES = 4;
const sourceCalls = [['Börse Frankfurt', frankfurtItems], ['wallstreet-online.de', wallstreetOnlineItems], ['FinanzNachrichten.de', finanznachrichtenItems], ['Investing.com', investingComItems]];
const feeds = await Promise.allSettled(sourceCalls.map(([, fn]) => fn()));
feeds.forEach((r, idx) => { const [name] = sourceCalls[idx]; console.log(r.status === 'fulfilled' ? `${name}: ${r.value.length} Rohtreffer` : `${name}: FEHLER — ${r.reason}`); });
const seenUrl = new Set(), seenHeadline = new Set();
const deduped = feeds.flatMap((r) => r.status === 'fulfilled' ? r.value : []).sort((a, b) => score(b) - score(a)).filter((i) => {
  const urlKey = i.source_url || null, headKey = normalizeHeadline(i.headline);
  if ((urlKey && seenUrl.has(urlKey)) || seenHeadline.has(headKey)) return false;
  if (urlKey) seenUrl.add(urlKey);
  seenHeadline.add(headKey);
  return true;
});
// Filter out low-relevance noise (stale/unrelated filler), but never drop below MIN_ARTICLES —
// on a quiet news day the next-best items still beat an empty feed.
const relevant = deduped.filter((i) => score(i) >= MIN_RELEVANCE);
const candidates = (relevant.length >= MIN_ARTICLES ? relevant : deduped).slice(0, 12);
if (!candidates.length) {
  console.log('Keine frischen deutschsprachigen Kandidaten gefunden – news_feed.json bleibt unverändert.');
  process.exit(0);
}
const items = buildArticles(candidates);
await writeFile(output, JSON.stringify({ updated_at: new Date().toISOString(), freshness_hours: 72, sources: [...new Set(items.map((i) => i.source))], methodology: 'Automatisch aggregierte Kurzmeldungen auf Basis deutschsprachiger Quellen (Originalzusammenfassungen, redaktionell nicht umformuliert).', items }, null, 2) + '\n');
console.log(`${items.length} eigene Newsartikel aus ${new Set(items.map((i) => i.source)).size} Quellen geschrieben.`);
