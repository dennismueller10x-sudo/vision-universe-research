import {readFile, writeFile, mkdir, cp, rm, readdir} from 'node:fs/promises';
import {resolve, dirname, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const root = fileURLToPath(new URL('../', import.meta.url));
// Story-Website (Owner 17.11.2026): Unterseiten neben index.html; Bilder, Stil und Skript unter web/.
export const SITE_PAGES = ['start/index.html','app/index.html','news/index.html','magazin/index.html','report/index.html',...['discover','fundamental','technical','supertrader','vorsorge','screener','atlas','quant','hedgefonds','elliott','portfolios'].map(id=>`produkte/${id}/index.html`)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateConfig(config = {}) {
  const keys=['mode','liveFlowVerified','privacyReviewed','privacyHtmlPath'];
  if(Object.keys(config).some(k=>!keys.includes(k)))throw new Error('Unbekanntes Konfigurationsfeld. Keine Schlüssel oder fremden Formularaktionen verwenden.');
  const mode=config.mode||'closed';
  if(!['closed','test','controlled','public'].includes(mode))throw new Error('Unbekannter Formularmodus.');
  for(const n of ['liveFlowVerified','privacyReviewed'])if(config[n]!==undefined&&typeof config[n]!=='boolean')throw new Error('Freigaben müssen boolesch sein.');
  if(mode==='public'&&(config.liveFlowVerified!==true||config.privacyReviewed!==true||!config.privacyHtmlPath))throw new Error('Echter DOI-/Abmeldetest und freigegebener Datenschutz fehlen.');
  if(mode==='controlled'&&(config.privacyReviewed!==true||!config.privacyHtmlPath))throw new Error('Kontrollierter Hauptdomain-Test benötigt freigegebenen Datenschutz.');
  if(config.privacyReviewed===true&&!config.privacyHtmlPath)throw new Error('Pfad zu freigegebenen Datenschutzhinweisen fehlt.');
  return mode!=='closed';
}

// Google Analytics (Owner 17.11.2026): lädt nur nach Zustimmung im Cookie-Banner (web/consent.js).
// Die Mess-ID kommt aus LANDING_GA_ID; ohne ID bleibt die CSP ohne Google und es wird nichts geladen.
export function analyticsId(id = '') {
  if (!id) return '';
  if (!/^G-[A-Z0-9]{4,16}$/.test(id)) throw new Error('LANDING_GA_ID muss eine GA4-Mess-ID sein (G-…).');
  return id;
}

export async function build({output = resolve(root,'dist'), config = {}, production = false, gaId = '', concepts = false} = {}) {
  const ready = validateConfig(config);
  const ga = analyticsId(gaId);
  if (production && config.mode === 'test') throw new Error('Testmodus darf nicht öffentlich veröffentlicht werden.');
  if (production && config.privacyReviewed !== true) throw new Error('Öffentliche Veröffentlichung blockiert: Datenschutzhinweise für Hosting/Brevo fehlen.');
  output = resolve(output);
  const rel = relative(root,output);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || !['dist','.preview','tests/output'].some(p => rel === p || rel.startsWith(p+'/'))) throw new Error('Ausgabe nur unter landing/dist, landing/.preview oder landing/tests/output.');
  // Only owned build directories may be replaced; never touch Research sources.
  await rm(output,{recursive:true,force:true});
  await mkdir(output,{recursive:true});
  for (const path of ['index.html','styles.css','legal.css','presentation.js','newsletter.js','impressum/index.html','datenschutz/index.html','newsletter/bestaetigen/index.html','newsletter/bestaetigt/index.html','newsletter/fehler/index.html','partner/index.html','partner/partner.css','partner/partner.js','instagram/index.html','instagram/instagram.css','instagram/robotaxi/index.html','instagram/energie/index.html','instagram/zonen/index.html','instagram/robotaxi-nebenwerte/index.html','instagram/ki-unterstuetzung/index.html','instagram/teilnahmebedingungen/index.html']) {
    await mkdir(dirname(resolve(output,path)),{recursive:true});
    await cp(resolve(root,path),resolve(output,path));
  }
  for (const path of SITE_PAGES) { await mkdir(dirname(resolve(output,path)),{recursive:true}); await cp(resolve(root,path),resolve(output,path)); }
  await cp(resolve(root,'web'),resolve(output,'web'),{recursive:true});
  await cp(resolve(root,'assets'),resolve(output,'assets'),{recursive:true});
  await cp(resolve(root,'partner/media'),resolve(output,'partner/media'),{recursive:true});
  if (config.privacyHtmlPath) {
    const privacy = await readFile(resolve(root,config.privacyHtmlPath),'utf8');
    if (!/<html\b/i.test(privacy) || !/<html[^>]+lang=["']de["']/i.test(privacy) || !/<title>/i.test(privacy)) throw new Error('Datenschutzhinweise müssen ein vollständiges deutsches HTML-Dokument sein.');
    if (/data-policy-status=["']draft["']/i.test(privacy)) throw new Error('Die Vorschau-Datenschutzhinweise sind noch kein freigegebener Rechtstext.');
    if (config.mode === 'public' && /data-newsletter-release-scope=["']controlled["']/i.test(privacy)) throw new Error('Datenschutzfreigabe gilt ausschließlich für den kontrollierten Test.');
    await writeFile(resolve(output,'datenschutz/index.html'),privacy);
  }
  // Dasselbe Formular steht auf der Startseite und auf der Landingpage /start/ (Owner 17.11.2026); beide schalten gleich.
  const formState = page => {
    if(config.mode==='controlled')return page.replace('data-ready="false"','data-ready="false" data-controlled="true"');
    if(!ready)return page;
    return page.replace('data-ready="false"','data-ready="true" action="/api/newsletter/subscribe"').replace('<fieldset disabled>','<fieldset>')
      .replace('Aktuell können wir deine E-Mail-Adresse noch nicht entgegennehmen.','Anmeldung mit E-Mail-Bestätigung.')
      .replace('Die Anmeldung ist derzeit noch nicht freigeschaltet.','Nach dem Absenden prüfe dein Postfach und bestätige deine neue Anmeldung.')
      .replace(' aria-describedby="signup-status" novalidate',' aria-describedby="signup-status"');
  };
  let html = formState(await readFile(resolve(output,'index.html'),'utf8'));
  // Remove upstream Research-only navigation from the isolated static output.
  for (const path of ['index.html','impressum/index.html','datenschutz/index.html','newsletter/bestaetigen/index.html','newsletter/bestaetigt/index.html','newsletter/fehler/index.html','instagram/teilnahmebedingungen/index.html']) {
    let page = path === 'index.html' ? html : await readFile(resolve(output,path),'utf8');
    page = page.replace('<link rel="stylesheet" href="/assets/site-navigation.css">','').replace('<vu-navigation></vu-navigation>','').replace('<script src="/assets/site-navigation.js"></script>','');
    if (path !== 'index.html') {
      const version=createHash('sha256').update(await readFile(resolve(output,'legal.css'))).digest('hex').slice(0,16);
      page=page.replace(/href="((?:\.\.\/)+legal\.css)"/g,`href="$1?v=${version}"`);
    }
    if (path === 'index.html') html = page; else await writeFile(resolve(output,path),page);
  }

  if (production) html = html.replace('content="noindex, nofollow"','content="index, follow"');
  const formPolicy=ready?"'self'":"'none'";
  const gaHosts = ga ? {script:' https://www.googletagmanager.com', img:' https://*.google-analytics.com https://*.googletagmanager.com', connect:' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com'} : {script:'',img:'',connect:''};
  const csp = `default-src 'none'; script-src 'self'${gaHosts.script}; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self'${gaHosts.img}; media-src 'self'; font-src 'self'; connect-src 'self'${gaHosts.connect}; form-action ${formPolicy}; frame-src 'none'; base-uri 'none'; object-src 'none'`;
  // GitHub Pages does not apply _headers. Enforce supported CSP in HTML too.
  html=html.replace('<head>','<head>\n  <meta http-equiv="Content-Security-Policy" content="'+esc(csp)+'">\n  <meta name="referrer" content="no-referrer">');
  // Returning browsers must not combine new preview markup with old cached
  // controls/styles. Each changed file gets a new, deterministic asset URL.
  for(const [asset,attribute] of [['styles.css','href'],['presentation.js','src'],['assets/home/discover-swipe.js','src']]){
    const version=createHash('sha256').update(await readFile(resolve(output,asset))).digest('hex').slice(0,16);
    html=html.replace(`${attribute}="./${asset}"`,`${attribute}="./${asset}?v=${version}"`);
  }
  // Story-Website: Stil und Skript mit inhaltsabhängigen Adressen auf allen Seiten.
  const stamp={};for(const asset of ['web/site.css','web/site.js','web/consent.js','web/liste.css','newsletter.js'])stamp[asset]=createHash('sha256').update(await readFile(resolve(output,asset))).digest('hex').slice(0,16);
  const stampPage=(page,prefix)=>{for(const asset of Object.keys(stamp))page=page.replaceAll(`"${prefix}${asset}"`,`"${prefix}${asset}?v=${stamp[asset]}"`);return page;};
  html=stampPage(html,'./').replace('<meta name="vu-ga" content="">',`<meta name="vu-ga" content="${ga}">`);
  await writeFile(resolve(output,'index.html'),html);
  for(const path of SITE_PAGES){
    let page=await readFile(resolve(output,path),'utf8');
    if(path==='start/index.html')page=formState(page);
    // Der Sync-Lauf („Integrate shared navigation on new pages“) fügt die research-Navigation in neue Seiten ein. Auf www gibt
    // es /assets/site-navigation.* nicht (404); die Story-Seiten haben ihr eigenes Menü. Wie bei index.html hier entfernen.
    page=page.replace('<link rel="stylesheet" href="/assets/site-navigation.css">','').replace('<vu-navigation></vu-navigation>','').replace('<script src="/assets/site-navigation.js"></script>','');
    page=page.replace('<head>','<head>\n  <meta http-equiv="Content-Security-Policy" content="'+esc(csp)+'">\n  <meta name="referrer" content="no-referrer">');
    if (production) page = page.replace('content="noindex, nofollow"','content="index, follow"');
    await writeFile(resolve(output,path),stampPage(page,'../'.repeat(path.split('/').length-1)).replace('<meta name="vu-ga" content="">',`<meta name="vu-ga" content="${ga}">`));
  }
  // The partner presentation is shared by direct link only and stays out of search.
  let partner=await readFile(resolve(output,'partner/index.html'),'utf8');
  partner=partner.replace('<head>','<head>\n  <meta http-equiv="Content-Security-Policy" content="'+esc(csp)+'">\n  <meta name="referrer" content="no-referrer">');
  for(const asset of ['partner.css','partner.js']){
    const version=createHash('sha256').update(await readFile(resolve(output,'partner',asset))).digest('hex').slice(0,16);
    partner=partner.replace(`"./${asset}"`,`"./${asset}?v=${version}"`);
  }
  await writeFile(resolve(output,'partner/index.html'),partner);
  // Instagram pages reuse the partner layout and media; each list is a subpage.
  for(const page of ['instagram/index.html','instagram/robotaxi/index.html','instagram/energie/index.html','instagram/zonen/index.html','instagram/robotaxi-nebenwerte/index.html','instagram/ki-unterstuetzung/index.html']){
    let html=await readFile(resolve(output,page),'utf8');
    html=html.replace('<head>','<head>\n  <meta http-equiv="Content-Security-Policy" content="'+esc(csp)+'">\n  <meta name="referrer" content="no-referrer">');
    for(const asset of ['partner/partner.css','partner/partner.js','instagram/instagram.css']){
      const version=createHash('sha256').update(await readFile(resolve(output,asset))).digest('hex').slice(0,16);
      const from=relative(dirname(resolve(output,page)),resolve(output,asset)).replaceAll('\\','/');
      const ref=from.startsWith('.')?from:'./'+from;
      html=html.replaceAll(`"${ref}"`,`"${ref}?v=${version}"`);
    }
    // Listen im Stil der Story-Website laden web/site.css, web/site.js und web/liste.css.
    html=stampPage(html,'../'.repeat(page.split('/').length-1));
    await writeFile(resolve(output,page),html);
  }
  await writeFile(resolve(output,'_headers'),`/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n${production?'':'  X-Robots-Tag: noindex, nofollow\n'}`);
  // Pages handles apex -> www in custom-domain settings, not _redirects.
  // Static aliases keep the existing Research legal links working later.
  for(const [alias,target] of [['legal-notice','impressum'],['privacy-policy','datenschutz']]){
    await mkdir(resolve(output,'policies',alias),{recursive:true});
    const legal=await readFile(resolve(output,target,'index.html'),'utf8');
    await writeFile(resolve(output,'policies',alias,'index.html'),legal.replaceAll('href="../','href="../../'));
  }
  await writeFile(resolve(output,'.nojekyll'),'');
  await writeFile(resolve(output,'robots.txt'),production?'User-agent: *\nAllow: /\nSitemap: https://www.visionuniverse.de/sitemap.xml\n':'User-agent: *\nDisallow: /\n');
  if (production) await writeFile(resolve(output,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.visionuniverse.de/</loc></url>'+SITE_PAGES.map(p=>'<url><loc>https://www.visionuniverse.de/'+p.replace('index.html','')+'</loc></url>').join('')+'</urlset>');
  // Advanced-mode source contains binding names, never credential values.
  await cp(resolve(root,'server/newsletter.mjs'),resolve(output,'_worker.js'));
  await writeFile(resolve(output,'_routes.json'),JSON.stringify({version:1,include:['/api/*','/.newsletter-internal/*','/_worker*','/server/*'],exclude:[]}));
  // Entwurfs-Konzepte (Owner 18.11.2026) nur in Branch-Vorschauen, nie auf main: /konzepte/
  if (concepts) await buildConcepts(output);
  const files = await readdir(output);
  return {newsletter:ready?'Eigene Formularoberfläche; geschützte Brevo-DOI-API':'BLOCKIERT: Newsletter-Anmeldung geschlossen',mode:production?'production':'preview',output,entries:files.length};
}
const CONCEPTS = {
  s: [['s1','Kompakt','Kleinere Schrift, Karten neben dem iPhone'],['s2','Zweispaltig','Text links, iPhone rechts, alles auf einem Bildschirm'],['s3','Ruhig','Kleine Überschrift, iPhone ohne Karten, Karten als Leiste darunter'],['s4','Fähigkeiten oben','Sechs Fähigkeiten direkt im Hero neben dem iPhone'],['s5','Apple-Bühne','iPhone wächst von unten ins Bild, Karten links und rechts']],
  l: [['l1','Kompakt','Kleinere Schrift, kleines iPhone, Karten links und rechts'],['l2','Zweispaltig','Text und Knopf links, iPhone rechts'],['l3','Ohne Karten','iPhone frei, drei Stichworte darunter'],['l4','Fähigkeiten zuerst','Überschrift, sechs Fähigkeiten, kleines iPhone'],['l5','Apple-Bühne','iPhone wächst von unten ins Bild, Knopf darüber']]
};
async function buildConcepts(output) {
  const rel = (html, from) => html.replace(/(src|href|data-img|data-src)="(\.\.?\/)/g, (m, a, p) => `${a}="${p === './' && from === 'home' ? '../../' : '../../'}`);
  const home = await readFile(resolve(output,'index.html'),'utf8'), start = await readFile(resolve(output,'start/index.html'),'utf8');
  const make = async (kind, [id, name, text]) => {
    let html = rel(kind === 's' ? home : start, kind === 's' ? 'home' : 'start');
    html = html.replace('<html lang="de"', `<html lang="de" class="kz kz-${id}"`).replace('</head>', '<link rel="stylesheet" href="../../web/konzepte.css"></head>')
      .replace(/(<body[^>]*>)/, `$1<a class="kz-badge" href="../">Konzept ${id.toUpperCase()} · ${name} <span>‹ alle Konzepte</span></a>`);
    await mkdir(resolve(output,'konzepte',id),{recursive:true}); await writeFile(resolve(output,'konzepte',id,'index.html'),html);
  };
  for (const c of CONCEPTS.s) await make('s', c);
  for (const c of CONCEPTS.l) await make('l', c);
  // Präsentation mit Konzept A und B (Handarbeit unter landing/konzepte/) ersetzt die alte Liste.
  await cp(resolve(root,'konzepte'),resolve(output,'konzepte'),{recursive:true});
  // Technik-Konzepte (Owner 19.11.2026): www.visionuniverse.de unverändert (konzepte/t/basis.html = Stand main), nur die Technik neu.
  const TECH = [['t1','Karussell'],['t2','Vollbild-Folien'],['t3','Bühne mit Reitern'],['t4','Akkordeon'],['t5','Seitwärts-Bühne']];
  const basis = (await readFile(resolve(root,'konzepte/t/basis.html'),'utf8'))
    .replace('<link rel="stylesheet" href="/assets/site-navigation.css">','').replace('<vu-navigation></vu-navigation>','').replace('<script src="/assets/site-navigation.js"></script>','')
    .replace('"./web/site.css"','"../t/basis-site.css"').replace('"./web/site.js"','"../t/basis-site.js"')
    .replace(/(src|href|data-img|data-src|data-vid|poster)="\.\//g,'$1="../../');
  for (const [id,name] of TECH) {
    const html = basis.replace('<html lang="de"',`<html lang="de" class="tk tk-${id}"`)
      .replace('</head>','<link rel="stylesheet" href="../t/techniken.css"><script src="../t/techniken.js" defer></script></head>')
      .replace(/(<body[^>]*>)/,`$1<a class="kz-badge" href="../">Technik ${id.slice(1)} · ${name} <span>‹ alle Techniken</span></a>`);
    await mkdir(resolve(output,'konzepte',id),{recursive:true}); await writeFile(resolve(output,'konzepte',id,'index.html'),html);
  }
  // Referenz-Konzepte (Owner 19.11.2026): Technik von dls-consulting.de (D) und rockstargames.com (R) auf die Live-Seite übertragen.
  for (const [id,name,cls] of [['d','Technik wie DLS','tk rf rf-d'],['r','Technik wie Rockstar Games','rf rf-r']]) {
    const css = (cls.includes('tk')?'<link rel="stylesheet" href="../t/techniken.css">':'')+'<link rel="stylesheet" href="../t/referenz.css">';
    const html = basis.replace('<html lang="de"',`<html lang="de" class="${cls}"`)
      .replace('</head>',css+'</head>')
      .replace('</body>','<script src="../t/referenz.js" defer></script></body>')
      .replace(/(<body[^>]*>)/,`$1<a class="kz-badge" href="../">${name} <span>‹ alle Konzepte</span></a>`);
    await mkdir(resolve(output,'konzepte',id),{recursive:true}); await writeFile(resolve(output,'konzepte',id,'index.html'),html);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const configArg = args.find(a=>a.startsWith('--config='))?.slice(9);
  const outputArg = args.find(a=>a.startsWith('--out='))?.slice(6);
  try {
    const publicationMode=process.env.LANDING_PUBLICATION_MODE||'preview';
    if(!['preview','production'].includes(publicationMode))throw new Error('Ungültiger Veröffentlichungsmodus.');
    const hasEnv=['NEWSLETTER_FORM_MODE','LANDING_PRIVACY_REVIEWED','LANDING_PRIVACY_HTML_PATH'].some(k=>process.env[k]);
    const config=configArg?JSON.parse(await readFile(resolve(configArg),'utf8')):hasEnv?{
      mode:process.env.NEWSLETTER_FORM_MODE||'closed',
      liveFlowVerified:process.env.NEWSLETTER_LIVE_VERIFIED==='true',
      privacyReviewed:process.env.LANDING_PRIVACY_REVIEWED==='true',
      privacyHtmlPath:process.env.LANDING_PRIVACY_HTML_PATH||''
    }:{};
    if(config.mode==='test'&&process.env.CF_PAGES_BRANCH==='main')throw new Error('Testformular auf main gesperrt.');
    console.log(JSON.stringify(await build({config,output:outputArg,gaId:process.env.LANDING_GA_ID||'',concepts:(!!process.env.CF_PAGES_BRANCH&&process.env.CF_PAGES_BRANCH!=='main')||process.env.LANDING_CONCEPTS==='1',production:args.includes('--production')||publicationMode==='production'})));
  } catch (error) { console.error(error instanceof SyntaxError ? 'Konfiguration ist kein gültiges JSON/keine gültige URL.' : error.message); process.exitCode=1; }
}
