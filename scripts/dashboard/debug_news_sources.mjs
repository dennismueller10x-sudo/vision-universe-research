const fetchText = async (url) => (await fetch(url, { headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 (compatible; VisionUniverseNewsdesk/1.0)' } })).text();

console.log('\n--- wallstreet-online.de: first full <item> block ---');
const wo = await fetchText('https://www.wallstreet-online.de/rss/nachrichten-alle.xml');
console.log(wo.match(/<item>[\s\S]*?<\/item>/i)?.[0]?.slice(0, 1200));

console.log('\n--- finanznachrichten.de/service/rss.htm: candidate feed links ---');
const fn = await fetchText('https://www.finanznachrichten.de/service/rss.htm');
const fnLinks = [...fn.matchAll(/href="([^"]+\.(?:xml|rss)[^"]*)"/gi)].map((m) => m[1]);
console.log([...new Set(fnLinks)].slice(0, 40));

console.log('\n--- investing.com DE: category id probe ---');
for (const id of [1, 25, 95, 285, 287, 301, 1064]) {
  try {
    const xml = await fetchText(`https://de.investing.com/rss/news_${id}.rss`);
    const title = xml.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
    console.log(`id ${id}: ${title} (items: ${(xml.match(/<item>/gi) || []).length})`);
  } catch (e) {
    console.log(`id ${id}: ERROR ${e}`);
  }
}
