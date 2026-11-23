// Suche (Google, Bing, KI-Suchen) für www.visionuniverse.de: strukturierte Daten je Seite und llms.txt.
// Die Seiten selbst bleiben handgeschrieben; der Build ergänzt nur, was sich aus ihren eigenen Angaben ableitet
// (Titel, Beschreibung, Kanonisch, Fragen und Antworten). Keine Aussage, die nicht schon auf der Seite steht.
export const SITE = 'https://www.visionuniverse.de';
export const ORG = {
  '@type': 'Organization',
  '@id': SITE + '/#organisation',
  name: 'Vision Universe',
  legalName: 'RAM Consulting UG (haftungsbeschränkt)',
  url: SITE + '/',
  logo: SITE + '/assets/vision-universe-logo-web.png',
  address: { '@type': 'PostalAddress', streetAddress: 'Bahnhofplatz 15', postalCode: '74189', addressLocality: 'Weinsberg', addressCountry: 'DE' },
  sameAs: ['https://www.instagram.com/app.visionuniverse/', 'https://www.tiktok.com/@app.visionuniverse'],
};

const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (html) => decode(String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim());
const meta = (html, re) => { const m = html.match(re); return m ? decode(m[1]).trim() : ''; };

export function seitenAngaben(html) {
  return {
    titel: meta(html, /<title>([^<]*)<\/title>/),
    beschreibung: meta(html, /<meta name="description" content="([^"]*)"/),
    kanonisch: meta(html, /<link rel="canonical" href="([^"]*)"/),
    bild: meta(html, /<meta property="og:image" content="([^"]*)"/),
  };
}

// Fragen und Antworten aus <div class="faq"><details><summary>Frage<i>+</i></summary><p>Antwort</p></details>…
export function fragen(html) {
  const block = html.match(/<div class="faq">([\s\S]*?)<\/div>/);
  if (!block) return [];
  return [...block[1].matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
    .map(([, f, a]) => ({ frage: text(f.replace(/<i[^>]*>[\s\S]*?<\/i>/g, '')), antwort: text(a) }))
    .filter((x) => x.frage && x.antwort);
}

// Kurzname für Brotkrumen: Titel bis zum ersten Trenner („Quant: …“, „News · Vision Universe“).
const kurz = (titel) => titel.split(/\s[·|–]\s|:\s/)[0].trim() || titel;

export function strukturierteDaten(pfad, html) {
  const a = seitenAngaben(html);
  if (!a.kanonisch || !a.kanonisch.startsWith(SITE + '/')) return [];
  const graph = [];
  if (pfad === 'index.html') {
    graph.push(ORG, { '@type': 'WebSite', '@id': SITE + '/#website', name: 'Vision Universe', url: SITE + '/', inLanguage: 'de-DE', publisher: { '@id': ORG['@id'] } });
    const faq = fragen(html);
    if (faq.length) graph.push({ '@type': 'FAQPage', '@id': a.kanonisch + '#fragen', inLanguage: 'de-DE', mainEntity: faq.map((x) => ({ '@type': 'Question', name: x.frage, acceptedAnswer: { '@type': 'Answer', text: x.antwort } })) });
  } else {
    const typ = pfad === 'app/index.html' ? 'WebApplication' : 'WebPage';
    const seite = { '@type': typ, '@id': a.kanonisch, url: a.kanonisch, name: a.titel, description: a.beschreibung, inLanguage: 'de-DE', isPartOf: { '@id': SITE + '/#website' }, publisher: { '@id': ORG['@id'] } };
    if (typ === 'WebApplication') Object.assign(seite, { applicationCategory: 'FinanceApplication', operatingSystem: 'iOS, Android, Web' });
    if (a.bild) seite.image = a.bild;
    graph.push(seite, {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Vision Universe', item: SITE + '/' },
        ...(pfad.startsWith('produkte/') ? [{ '@type': 'ListItem', position: 2, name: 'Produkte', item: SITE + '/app/' }] : []),
        { '@type': 'ListItem', position: pfad.startsWith('produkte/') ? 3 : 2, name: kurz(a.titel), item: a.kanonisch },
      ],
    });
  }
  return graph;
}

// Fügt einen JSON-LD-Block vor </head> ein (data-vu-seo; bestehende Blöcke der Seite bleiben).
export function mitStrukturiertenDaten(pfad, html) {
  if (html.includes('data-vu-seo')) return html;
  const graph = strukturierteDaten(pfad, html);
  if (!graph.length) return html;
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
  return html.replace('</head>', `<script type="application/ld+json" data-vu-seo>${json}</script>\n</head>`);
}

// llms.txt (llmstxt.org): Kurzbeschreibung und Seitenliste aus Titel und Beschreibung jeder Seite.
export function llmsTxt(seiten) {
  const zeile = ({ pfad, html }) => { const a = seitenAngaben(html); return a.kanonisch ? `- [${kurz(a.titel)}](${a.kanonisch}): ${a.beschreibung}` : null; };
  const gruppe = (f) => seiten.filter(f).map(zeile).filter(Boolean);
  const start = seiten.find((s) => s.pfad === 'index.html');
  const faq = start ? fragen(start.html) : [];
  return [
    '# Vision Universe',
    '',
    '> Vision Universe ist eine Analyse-App für Aktien, ETFs und Altersvorsorge (iPhone, Android, Browser). Sie erklärt jede Aktie in einfachen Sätzen: Geschäftszahlen aus den offiziellen Berichten, Kursverlauf, Pflichtmeldungen großer Fonds (13F). Keine Anlageberatung und keine Kaufempfehlungen. Anbieter: RAM Consulting UG (haftungsbeschränkt), Weinsberg.',
    '',
    '## Website',
    ...gruppe((s) => !s.pfad.startsWith('produkte/') && !s.pfad.startsWith('marktbriefing/2') && !s.pfad.startsWith('ratgeber/')),
    '',
    '## Produkte',
    ...gruppe((s) => s.pfad.startsWith('produkte/')),
    '',
    ...(seiten.some((s) => s.pfad.startsWith('ratgeber/')) ? ['## Ratgeber', ...gruppe((s) => s.pfad.startsWith('ratgeber/') && !s.pfad.startsWith('ratgeber/thema/')), ''] : []),
    '## Artikel',
    '- [Insights](https://research.visionuniverse.de/insights/): Tagesthemen, Aktienmagazin und Reports',
    '',
    ...(faq.length ? ['## Fragen und Antworten', ...faq.map((x) => `- ${x.frage} ${x.antwort}`), ''] : []),
  ].join('\n');
}
