import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url), output = new URL('dashboard/data/news_feed.json', root);
const universe = JSON.parse(await readFile(new URL('dashboard/config/universe.json', root), 'utf8'));
const maxAgeMs = 72 * 3600000, cutoff = Date.now() - maxAgeMs, finnhubKey = process.env.FINNHUB_API_KEY;
const clean = (v = '') => String(v).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&uuml;/g, 'ü').replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&szlig;/g, 'ß').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => clean(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '');
const fetchText = async (url, options = {}) => { const r = await fetch(url, options); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); };
const fetchJson = async (url, options = {}) => JSON.parse(await fetchText(url, options));
const active = universe.stocks.filter((s) => s.active), names = new Map(active.flatMap((s) => [[s.symbol.toUpperCase(), s], [s.name.toUpperCase(), s]]));
const usSymbols = active.map((s) => s.symbol).filter((s) => !s.includes('.') && !s.startsWith('^')).slice(0, 24);
function detectStock(text) { const h = text.toUpperCase(); for (const [needle, stock] of names) { if (needle.length < 3) continue; const e = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (new RegExp(`(^|[^A-ZÄÖÜ0-9])${e}([^A-ZÄÖÜ0-9]|$)`).test(h)) return stock; } return null; }
function score(i) { const hours = Math.max(0, (Date.now() - i.published_ms) / 3600000); return Math.round(100 - Math.min(hours, 72) + (/ZAHLEN|EARNINGS|GUIDANCE|PROGNOSE|ÜBERNAHME|MERGER|AUFTRAG|FDA|DIVIDEND|CEO|GEWINN|UMSATZ|8-K|AD.HOC/i.test(`${i.headline} ${i.raw_summary}`) ? 35 : 0) + (i.symbol ? 15 : 0)); }
async function finnhubItems() {
  if (!finnhubKey) return [];
  const today = new Date().toISOString().slice(0, 10), from = new Date(cutoff).toISOString().slice(0, 10);
  const urls = [`https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(finnhubKey)}`, ...usSymbols.map((s) => `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(s)}&from=${from}&to=${today}&token=${encodeURIComponent(finnhubKey)}`)];
  const batches = await Promise.allSettled(urls.map((url) => fetchJson(url)));
  return batches.flatMap((r) => r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []).flatMap((i) => { const published = Number(i.datetime) * 1000; if (!published || published < cutoff || !i.headline || !i.url) return []; const stock = detectStock(`${i.related || ''} ${i.headline} ${i.summary || ''}`); return [{ id: `fh-${i.id}`, symbol: stock?.symbol || (i.related || '').split(',')[0] || null, company: stock?.name || null, market: stock ? 'US-Aktien' : 'Märkte', category: i.category || 'Unternehmen', headline: clean(i.headline), raw_summary: clean(i.summary).slice(0, 900), source: clean(i.source || 'Finnhub News'), source_url: i.url, image_url: i.image || '/dashboard/assets/news-us-tech.jpg', published_ms: published }]; });
}
async function secItems() {
  const xml = await fetchText('https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-k&count=100&output=atom', { headers: { 'User-Agent': 'Vision Universe Newsdesk kontakt@visionuniverse.de', Accept: 'application/atom+xml' } });
  return (xml.match(/<entry>[\s\S]*?<\/entry>/gi) || []).flatMap((entry) => { const published = Date.parse(tag(entry, 'updated')), headline = tag(entry, 'title'), stock = detectStock(headline); if (!stock || published < cutoff) return []; return [{ id: `sec-${stock.symbol}-${published}`, symbol: stock.symbol, company: stock.name, market: 'US-Aktien', category: 'Pflichtmeldung', headline, raw_summary: `${stock.name} hat eine aktuelle 8-K-Pflichtmeldung bei der US-Börsenaufsicht eingereicht.`, source: 'SEC EDGAR', source_url: entry.match(/<link[^>]+href="([^"]+)"/)?.[1] || 'https://www.sec.gov/edgar/search/', image_url: '/dashboard/assets/news-us-tech.jpg', published_ms: published }]; });
}
async function frankfurtItems() {
  const xml = await fetchText('https://api.boerse-frankfurt.de/v1/feeds/news.rss', { headers: { Accept: 'application/rss+xml' } });
  return (xml.match(/<item>[\s\S]*?<\/item>/gi) || []).flatMap((item) => { const headline = tag(item, 'title'), raw = tag(item, 'description'), published = Date.parse(tag(item, 'pubDate')), stock = detectStock(`${headline} ${raw}`); if (published < cutoff || !stock) return []; return [{ id: `bf-${stock.symbol}-${published}`, symbol: stock.symbol, company: stock.name, market: 'Deutsche Aktien', category: 'Unternehmen', headline, raw_summary: raw.slice(0, 900), source: 'Börse Frankfurt', source_url: tag(item, 'link'), image_url: item.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] || '/dashboard/assets/news-dax.jpg', published_ms: published }]; });
}
function summarize(text, maxLen = 320) {
  const t = clean(text);
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen), sentenceEnd = cut.lastIndexOf('. ');
  return sentenceEnd > 80 ? cut.slice(0, sentenceEnd + 1).trim() : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}
function buildArticles(items) {
  if (!items.length) throw new Error('Keine frischen Kandidaten gefunden.');
  return items.map((i) => ({ id: i.id, symbol: i.symbol, company: i.company, market: i.market, category: i.category, title: clean(i.headline).slice(0, 90), summary: summarize(i.raw_summary) || clean(i.headline), why_it_matters: i.company ? `Relevant für ${i.company}-Anleger im Bereich ${i.category}.` : `Relevant für Anleger im Bereich ${i.category}.`, source: i.source, source_url: i.source_url, image_url: i.image_url, published_at: new Date(i.published_ms).toISOString(), relevance: score(i), editorial: 'Vision Universe Redaktion' }));
}
const feeds = await Promise.allSettled([finnhubItems(), secItems(), frankfurtItems()]), seen = new Set();
const candidates = feeds.flatMap((r) => r.status === 'fulfilled' ? r.value : []).sort((a, b) => score(b) - score(a)).filter((i) => { const key = i.source_url || i.headline.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 10);
const items = buildArticles(candidates);
await writeFile(output, JSON.stringify({ updated_at: new Date().toISOString(), freshness_hours: 72, sources: [...new Set(items.map((i) => i.source))], methodology: 'Automatisch aggregierte Kurzmeldungen auf Basis der verlinkten Quellen (Originalzusammenfassungen, redaktionell nicht umformuliert).', items }, null, 2) + '\n');
console.log(`${items.length} eigene Newsartikel aus ${new Set(items.map((i) => i.source)).size} Quellen geschrieben.`);
