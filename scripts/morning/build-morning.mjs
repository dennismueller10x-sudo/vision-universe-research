import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const contentDir = path.join(root, "content", "morning");
const outputDir = path.join(root, "morning");
const categories = new Set(["Aktien", "KI", "Halbleiter", "Robotik", "Biotech", "Märkte", "Makro", "Altersvorsorge", "ETFs", "China", "Zukunftstechnologien", "Unternehmen"]);

const esc = (value = "") => String(value).replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const parseValue = value => {
  const v = value.trim();
  if (v.startsWith("[") && v.endsWith("]")) return JSON.parse(v);
  return v.replace(/^"|"$/g, "");
};
function parse(source, filename) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: Frontmatter fehlt`);
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = parseValue(line.slice(i + 1));
  }
  for (const key of ["date","time","title","subtitle","slug","category","readTime","excerpt"]) if (!meta[key]) throw new Error(`${filename}: ${key} fehlt`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.slug) || meta.slug !== meta.date) throw new Error(`${filename}: slug/date muss YYYY-MM-DD entsprechen`);
  if (!categories.has(meta.category)) throw new Error(`${filename}: unbekannte Kategorie ${meta.category}`);
  return {...meta, body: match[2].trim(), filename};
}
const deDate = iso => new Intl.DateTimeFormat("de-DE", {day:"2-digit",month:"long",year:"numeric",timeZone:"Europe/Berlin"}).format(new Date(`${iso}T12:00:00Z`));
const paragraphs = body => body.split(/\r?\n\s*\r?\n/).map(p => `<p>${esc(p.trim())}</p>`).join("\n");
const tickerHtml = list => (list || []).map(t => `<span>$${esc(t)}</span>`).join("");
const card = issue => `<article class="archive-card"><a href="/morning/${issue.slug}/"><div class="card-date">${esc(deDate(issue.date))}</div><h3>${esc(issue.title)}</h3><p>${esc(issue.excerpt)}</p><div class="card-meta"><span>${esc(issue.category)}</span><span>${esc(issue.readTime)} Lesezeit</span></div></a></article>`;
const head = ({title, description, canonical, image, type="website"}) => `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:type" content="${type}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}">${image ? `<meta property="og:image" content="https://research.visionuniverse.de${esc(image)}">` : ""}<meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/morning/assets/morning.css">`;
const header = `<header class="morning-header"><a href="/" aria-label="Vision Universe Startseite"><img src="/assets/vision-universe-logo.png" alt="Vision Universe"></a><nav aria-label="Hauptnavigation"><a href="/dashboard/">Dashboard</a><a href="/magazin/">Magazin</a><a href="/reports/xpeng/">Reports</a><a href="/morning/" aria-current="page">Morning</a></nav><button class="menu-button" aria-label="Navigation öffnen" aria-expanded="false">Menü</button></header>`;
const footer = `<footer class="morning-footer"><img src="/assets/vision-universe-logo.png" alt="Vision Universe"><p>Research. Märkte. Zukunft.</p></footer><script src="/morning/assets/morning.js" defer></script>`;

const files = (await fs.readdir(contentDir)).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
const issues = await Promise.all(files.map(async f => parse(await fs.readFile(path.join(contentDir, f), "utf8"), f)));
issues.sort((a,b) => b.date.localeCompare(a.date));
if (!issues.length) throw new Error("Keine Morning-Ausgaben gefunden");
await fs.mkdir(outputDir, {recursive:true});

const latest = issues[0];
const indexHtml = `<!doctype html><html lang="de"><head>${head({title:"Vision Universe Morning Briefing",description:"Der tägliche Börsengruß von Atlas.",canonical:"https://research.visionuniverse.de/morning/",image:latest.heroImage})}</head><body>${header}<main><section class="masthead"><p class="eyebrow">VISION UNIVERSE®</p><h1>Morning<br>Briefing</h1><p class="masthead-sub">Der tägliche Börsengruß von Atlas.</p></section><section class="latest"><div class="latest-copy"><div class="issue-meta"><span>${esc(deDate(latest.date))}</span><span>${esc(latest.category)}</span><span>${esc(latest.readTime)} Lesezeit</span></div><h2>${esc(latest.title)}</h2><p>${esc(latest.subtitle)}</p><div class="tickers">${tickerHtml(latest.tickers)}</div><a class="cta" href="/morning/${latest.slug}/">Morning lesen <span>→</span></a></div>${latest.heroImage ? `<a class="latest-image" href="/morning/${latest.slug}/"><img src="${esc(latest.heroImage)}" alt="${esc(latest.heroAlt || "")}" width="1600" height="900"></a>` : ""}</section><section class="archive"><div class="section-heading"><p>Archiv</p><h2>Alle Briefings</h2></div><div class="archive-grid">${issues.map(card).join("")}</div></section></main>${footer}</body></html>`;
await fs.writeFile(path.join(outputDir, "index.html"), indexHtml);

for (const issue of issues) {
  const canonical = `https://research.visionuniverse.de/morning/${issue.slug}/`;
  const jsonLd = JSON.stringify({"@context":"https://schema.org","@type":"Article",headline:issue.title,description:issue.excerpt,datePublished:`${issue.date}T${issue.time}:00+02:00`,author:{"@type":"Person",name:"Atlas"},publisher:{"@type":"Organization",name:"Vision Universe"},mainEntityOfPage:canonical,image:issue.heroImage ? `https://research.visionuniverse.de${issue.heroImage}` : undefined}).replace(/</g,"\\u003c");
  const sourceItems = (issue.sources || []).map(s => `<li>${esc(s)}</li>`).join("");
  const html = `<!doctype html><html lang="de"><head>${head({title:`${issue.title} | Vision Universe Morning`,description:issue.excerpt,canonical,image:issue.heroImage,type:"article"})}<script type="application/ld+json">${jsonLd}</script></head><body>${header}<main class="article-shell"><article><header class="article-header"><a class="back" href="/morning/">← Morning Briefing</a><div class="issue-meta"><span>${esc(deDate(issue.date))}</span><span>${esc(issue.time)} Uhr</span><span>${esc(issue.readTime)} Lesezeit</span></div><p class="eyebrow">Atlas Börsengruß</p><h1>${esc(issue.title)}</h1><p class="deck">${esc(issue.subtitle)}</p></header>${issue.heroImage ? `<figure class="article-hero"><img src="${esc(issue.heroImage)}" alt="${esc(issue.heroAlt || "")}" width="1600" height="900"><figcaption>KI-generiertes Editorial Visual · Vision Universe Morning</figcaption></figure>` : ""}<section class="key-number"><p>Die Zahl des Tages</p><strong>${esc(issue.keyNumber)}</strong><span>${esc(issue.keyNumberLabel)}</span></section><div class="article-body">${paragraphs(issue.body)}</div><aside class="atlas-opinion"><div><p class="eyebrow">Atlas Meinung</p><blockquote>Deutschland braucht langfristig eine stärkere Aktienkultur. Beim Investieren ist unser wertvollster Rohstoff Zeit.</blockquote></div><img src="/assets/atlas.png" alt="Atlas" loading="lazy"></aside><section class="investor-takeaway"><p class="eyebrow">Warum das für Anleger wichtig ist</p><h2>Zeit macht aus regelmäßigen Beiträgen Vermögen.</h2><p>Ein langer Anlagehorizont und breit gestreute Aktieninvestments können den Zinseszinseffekt nutzbar machen. Persönliche Vorsorge bleibt deshalb ein entscheidender Baustein.</p></section><section class="article-tools"><div><p class="eyebrow">Relevante Aktien & ETFs</p><div class="tickers">${tickerHtml(issue.tickers)}</div></div><div class="share"><p class="eyebrow">Teilen</p><button data-share="x">X</button><button data-share="linkedin">LinkedIn</button><button data-share="copy">Link kopieren</button></div></section>${sourceItems ? `<section class="sources"><p class="eyebrow">Quellen</p><ol>${sourceItems}</ol><small>Die genannten Werte dienen der redaktionellen Einordnung. Keine Anlageberatung.</small></section>` : ""}<section class="research-cta"><p class="eyebrow">Vision Universe Research</p><h2>Noch tiefer einsteigen.</h2><p>Unsere aktuellen Analysen zu den wichtigsten Unternehmen und Zukunftstrends.</p><a class="cta light" href="/reports/xpeng/">Research entdecken <span>→</span></a></section></article></main>${footer}</body></html>`;
  const dir = path.join(outputDir, issue.slug); await fs.mkdir(dir,{recursive:true}); await fs.writeFile(path.join(dir,"index.html"),html);
}
const manifest = issues.map(({body,filename,...issue}) => issue);
await fs.writeFile(path.join(outputDir,"issues.json"), JSON.stringify(manifest,null,2));
console.log(`Morning: ${issues.length} Ausgabe(n), aktuell ${latest.slug}`);
