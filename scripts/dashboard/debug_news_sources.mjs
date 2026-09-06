const fetchText = async (url) => (await fetch(url, { headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 (compatible; VisionUniverseNewsdesk/1.0)' } })).text();

console.log('\n--- investing.com id 25: first full <item> block (untruncated) ---');
const iv = await fetchText('https://de.investing.com/rss/news_25.rss');
console.log(iv.match(/<item>[\s\S]*?<\/item>/i)?.[0]);

console.log('\n--- finanznachrichten.de/service/rss.htm: all /rss* links with link text ---');
const fn = await fetchText('https://www.finanznachrichten.de/service/rss.htm');
const pairs = [...fn.matchAll(/<a href="(\/rss[^"]*)"[^>]*>([^<]*)<\/a>/gi)].map((m) => `${m[2].trim()} -> ${m[1]}`);
console.log([...new Set(pairs)]);
