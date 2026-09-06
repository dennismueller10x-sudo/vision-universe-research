const fetchText = async (url) => (await fetch(url, { headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 (compatible; VisionUniverseNewsdesk/1.0)' } })).text();

console.log('\n--- finanznachrichten.de/service/rss.htm: any href/text mentioning rss ---');
const fn = await fetchText('https://www.finanznachrichten.de/service/rss.htm');
const idx = [];
let i = 0;
while ((i = fn.toLowerCase().indexOf('rss', i)) !== -1 && idx.length < 60) { idx.push(i); i += 3; }
for (const at of idx) console.log(JSON.stringify(fn.slice(Math.max(0, at - 60), at + 60)));

console.log('\n--- trying a few common finanznachrichten.de RSS URL guesses ---');
for (const url of [
  'https://www.finanznachrichten.de/rss-nachrichten-boerse.xml',
  'https://www.finanznachrichten.de/nachrichten-aktien/rss.htm',
  'https://www.finanznachrichten.de/rss/boersennews.xml',
  'https://www.finanznachrichten.de/rss-boersennews.htm',
]) {
  try {
    const xml = await fetchText(url);
    console.log(url, '-> items:', (xml.match(/<item>/gi) || []).length, 'contentType-ish first80:', xml.slice(0, 80).replace(/\n/g, ' '));
  } catch (e) {
    console.log(url, '-> ERROR', e);
  }
}
