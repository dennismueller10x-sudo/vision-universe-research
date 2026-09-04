import { mkdir, writeFile } from 'node:fs/promises';

const output = new URL('../../dashboard/data/news_feed.json', import.meta.url);
const us = {
  'APPLE INC': ['AAPL', 'Nasdaq 100'], 'MICROSOFT CORP': ['MSFT', 'Nasdaq 100'], 'NVIDIA CORP': ['NVDA', 'Nasdaq 100'],
  'AMAZON COM INC': ['AMZN', 'Nasdaq 100'], 'META PLATFORMS INC': ['META', 'Nasdaq 100'], 'ALPHABET INC': ['GOOGL', 'Nasdaq 100'],
  'TESLA INC': ['TSLA', 'Nasdaq 100'], 'BROADCOM INC': ['AVGO', 'Nasdaq 100'], 'ADVANCED MICRO DEVICES INC': ['AMD', 'Nasdaq 100'],
  'PALANTIR TECHNOLOGIES INC': ['PLTR', 'S&P 500'], 'MICROSTRATEGY INC': ['MSTR', 'Nasdaq 100'], 'COINBASE GLOBAL INC': ['COIN', 'Nasdaq']
};
const de = {
  'SAP': ['SAP', 'DAX'], 'SIEMENS ENERGY': ['ENR', 'DAX'], 'SIEMENS': ['SIE', 'DAX'], 'RHEINMETALL': ['RHM', 'DAX'],
  'DEUTSCHE TELEKOM': ['DTE', 'DAX'], 'INFINEON': ['IFX', 'DAX'], 'BAYER': ['BAYN', 'DAX'], 'BASF': ['BAS', 'DAX'],
  'ALLIANZ': ['ALV', 'DAX'], 'MUNICH RE': ['MUV2', 'DAX'], 'MERCEDES': ['MBG', 'DAX'], 'BMW': ['BMW', 'DAX'],
  'VOLKSWAGEN': ['VOW3', 'DAX'], 'RWE': ['RWE', 'DAX'], 'E.ON': ['EOAN', 'DAX'], 'ZALANDO': ['ZAL', 'DAX'],
  'ADIDAS': ['ADS', 'DAX'], 'COMMERZBANK': ['CBK', 'DAX'], 'DEUTSCHE BANK': ['DBK', 'DAX'], 'HELLOFRESH': ['HFG', 'MDAX'],
  'EVOTEC': ['EVT', 'MDAX'], 'IONOS': ['IOS', 'SDAX'], 'JENOPTIK': ['JEN', 'SDAX'], 'SMA SOLAR': ['S92', 'SDAX']
};
const clean = (value = '') => value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&uuml;/g, 'ü').replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&szlig;/g, 'ß').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => clean(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '');
const get = async (url, headers = {}) => { const response = await fetch(url, { headers }); if (!response.ok) throw new Error(`${url}: ${response.status}`); return response.text(); };
const containsName = (text, name) => new RegExp(`(^|[^A-ZÄÖÜ0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-ZÄÖÜ0-9]|$)`, 'i').test(text);

async function secItems() {
  const xml = await get('https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-k&count=100&output=atom', { 'User-Agent': 'Vision Universe Newsdesk kontakt@visionuniverse.de', Accept: 'application/atom+xml' });
  return (xml.match(/<entry>[\s\S]*?<\/entry>/gi) || []).flatMap((entry) => {
    const raw = tag(entry, 'title');
    const name = (raw.split(' - ')[1] || '').replace(/\s*\(\d+\).*$/, '').trim().toUpperCase();
    const found = Object.entries(us).find(([company]) => containsName(name, company));
    if (!found) return [];
    const [company, [symbol, market]] = found;
    const published = Date.parse(tag(entry, 'updated')) || Date.now();
    return [{ id: `sec-${symbol}-${published}`, symbol, company: clean(company.replace(/ INC$| CORP$/, '')), market, category: 'Pflichtmeldung', title: `${symbol}: Neue 8-K-Unternehmensmeldung`, summary: `${symbol} hat bei der US-Börsenaufsicht eine potenziell kursrelevante Unternehmensmeldung eingereicht. Alle Details stehen in der verlinkten Originalmeldung.`, source: 'SEC EDGAR', source_url: entry.match(/<link[^>]+href="([^"]+)"/)?.[1] || 'https://www.sec.gov/edgar/search/', image_url: '/dashboard/assets/news-us-tech.jpg', published_at: new Date(published).toISOString(), relevance: 92 }];
  });
}

async function frankfurtItems() {
  const xml = await get('https://api.boerse-frankfurt.de/v1/feeds/news.rss', { Accept: 'application/rss+xml' });
  return (xml.match(/<item>[\s\S]*?<\/item>/gi) || []).flatMap((item) => {
    const title = tag(item, 'title'); const summary = tag(item, 'description'); const haystack = `${title} ${summary}`.toUpperCase();
    const found = Object.entries(de).find(([company]) => containsName(haystack, company));
    const [company, [symbol, market]] = found || ['Marktbericht', [null, 'Markt & Makro']]; const published = Date.parse(tag(item, 'pubDate')) || Date.now();
    return [{ id: `bf-${symbol || 'markt'}-${published}`, symbol, company, market, category: found ? 'Deutscher Markt' : 'Marktbericht', title, summary: summary.slice(0, 420), source: 'Börse Frankfurt', source_url: tag(item, 'link'), image_url: item.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] || '/dashboard/assets/news-dax.jpg', published_at: new Date(published).toISOString(), relevance: /PROGNOSE|ZAHLEN|GEWINN|AUFTRAG|ÜBERNAHME|KAUF|VERKAUF/i.test(haystack) ? 88 : found ? 74 : 62 }];
  });
}

const results = await Promise.allSettled([secItems(), frankfurtItems()]);
const items = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []).sort((a, b) => b.relevance - a.relevance || Date.parse(b.published_at) - Date.parse(a.published_at)).slice(0, 36);
if (!items.length) throw new Error(`Keine Meldungen empfangen: ${results.map((result) => result.status === 'rejected' ? result.reason : 'leer').join(' | ')}`);
await mkdir(new URL('../../dashboard/data/', import.meta.url), { recursive: true });
await writeFile(output, JSON.stringify({ updated_at: new Date().toISOString(), sources: ['SEC EDGAR', 'Börse Frankfurt'], coverage: ['Nasdaq 100', 'S&P 500', 'DAX', 'MDAX', 'SDAX', 'TecDAX'], items }, null, 2) + '\n');
console.log(`${items.length} Meldungen geschrieben.`);
