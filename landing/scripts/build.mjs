import {readFile, writeFile, mkdir, cp, rm, readdir} from 'node:fs/promises';
import {resolve, dirname, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateConfig(config = {}) {
  const keys = ['actionUrl','doubleOptInVerified','privacyReviewed','sourceAttribute','privacyHtmlPath'];
  if (Object.keys(config).some(k => !keys.includes(k))) throw new Error('Unbekanntes Konfigurationsfeld. Keine API-Schlüssel verwenden.');
  if (config.actionUrl) {
    const url = new URL(config.actionUrl);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.sibforms\.com$/.test(url.hostname) || !/^\/serve\/[A-Za-z0-9_-]+$/.test(url.pathname) || url.username || url.password || url.port || url.search || url.hash) throw new Error('Nur die HTTPS-Formularaktion aus dem einfachen Brevo-HTML-Export ist erlaubt.');
    if (config.doubleOptInVerified !== true) throw new Error('Double-Opt-in ist noch nicht geprüft.');
    if (config.privacyReviewed !== true || !config.privacyHtmlPath) throw new Error('Freigegebene Datenschutzhinweise fehlen.');
    if (!/^[A-Z][A-Z0-9_]{0,49}$/.test(config.sourceAttribute || '') || ['EMAIL','OPT_IN','LOCALE'].includes(config.sourceAttribute)) throw new Error('Brevo-Textattribut für die Quelle fehlt oder ist ungültig.');
  }
  if (config.privacyReviewed === true && !config.privacyHtmlPath) throw new Error('Pfad zu freigegebenen Datenschutzhinweisen fehlt.');
  return Boolean(config.actionUrl);
}

export async function build({output = resolve(root,'dist'), config = {}, production = false} = {}) {
  const ready = validateConfig(config);
  if (production && config.privacyReviewed !== true) throw new Error('Öffentliche Veröffentlichung blockiert: Datenschutzhinweise für Hosting/Brevo fehlen.');
  output = resolve(output);
  const rel = relative(root,output);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || !['dist','.preview','tests/output'].some(p => rel === p || rel.startsWith(p+'/'))) throw new Error('Ausgabe nur unter landing/dist, landing/.preview oder landing/tests/output.');
  // Only owned build directories may be replaced; never touch Research sources.
  await rm(output,{recursive:true,force:true});
  await mkdir(output,{recursive:true});
  for (const path of ['index.html','styles.css','legal.css','presentation.js','newsletter.js','impressum/index.html','datenschutz/index.html']) {
    await mkdir(dirname(resolve(output,path)),{recursive:true});
    await cp(resolve(root,path),resolve(output,path));
  }
  await cp(resolve(root,'assets'),resolve(output,'assets'),{recursive:true});
  if (config.privacyHtmlPath) {
    const privacy = await readFile(resolve(root,config.privacyHtmlPath),'utf8');
    if (!/<html\b/i.test(privacy) || !/<html[^>]+lang=["']de["']/i.test(privacy) || !/<title>/i.test(privacy)) throw new Error('Datenschutzhinweise müssen ein vollständiges deutsches HTML-Dokument sein.');
    if (/data-policy-status=["']draft["']/i.test(privacy)) throw new Error('Die Vorschau-Datenschutzhinweise sind noch kein freigegebener Rechtstext.');
    await writeFile(resolve(output,'datenschutz/index.html'),privacy);
  }
  let html = await readFile(resolve(output,'index.html'),'utf8');
  if (ready) {
    html = html.replace('data-ready="false"',`data-ready="true" action="${esc(config.actionUrl)}"`).replace('<fieldset disabled>','<fieldset>')
      .replace('<input type="hidden" name="locale" value="de">',`<input type="hidden" name="locale" value="de"><input type="hidden" name="${esc(config.sourceAttribute)}" value="Coming-soon-Landingpage">`)
      .replace('Aktuell können wir deine E-Mail-Adresse noch nicht entgegennehmen.','Nach dem Absenden erhältst du eine E-Mail. Bestätige darin deine Anmeldung.')
      .replace('Die Anmeldung ist derzeit noch nicht freigeschaltet.','Du wirst nach dem Absenden zum Anmeldeformular weitergeleitet. Bestätige anschließend deine E-Mail-Adresse.')
      .replace(' aria-describedby="signup-status" novalidate',' aria-describedby="signup-status"');
    // Native validity remains available without JavaScript. JS adds German inline messages.
  }
  if (production) html = html.replace('content="noindex, nofollow"','content="index, follow"');
  const formOrigin = ready ? new URL(config.actionUrl).origin : "'none'";
  const csp = `default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; form-action ${formOrigin}; base-uri 'none'; object-src 'none'`;
  // GitHub Pages does not apply _headers. Enforce supported CSP in HTML too.
  html=html.replace('<head>','<head>\n  <meta http-equiv="Content-Security-Policy" content="'+esc(csp)+'">\n  <meta name="referrer" content="no-referrer">');
  await writeFile(resolve(output,'index.html'),html);
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
  if (production) await writeFile(resolve(output,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.visionuniverse.de/</loc></url></urlset>');
  const files = await readdir(output);
  return {newsletter:ready?'Brevo-POST vorbereitet; Live-DOI noch separat prüfen':'BLOCKIERT: kein Brevo-Formular konfiguriert',mode:production?'production':'preview',output,entries:files.length};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const configArg = args.find(a=>a.startsWith('--config='))?.slice(9);
  const outputArg = args.find(a=>a.startsWith('--out='))?.slice(6);
  try {
    const publicationMode=process.env.LANDING_PUBLICATION_MODE||'preview';
    if(!['preview','production'].includes(publicationMode))throw new Error('Ungültiger Veröffentlichungsmodus.');
    const hasEnv = ['BREVO_FORM_ACTION','LANDING_PRIVACY_REVIEWED','LANDING_PRIVACY_HTML_PATH'].some(k=>process.env[k]);
    const config = configArg ? JSON.parse(await readFile(resolve(configArg),'utf8')) : hasEnv ? {
      actionUrl: process.env.BREVO_FORM_ACTION || '',
      doubleOptInVerified: process.env.BREVO_DOUBLE_OPT_IN_VERIFIED === 'true',
      privacyReviewed: process.env.LANDING_PRIVACY_REVIEWED === 'true',
      sourceAttribute: process.env.BREVO_SOURCE_ATTRIBUTE || 'VU_SOURCE',
      privacyHtmlPath: process.env.LANDING_PRIVACY_HTML_PATH || ''
    } : {};
    console.log(JSON.stringify(await build({config,output:outputArg,production:args.includes('--production')||publicationMode==='production'})));
  } catch (error) { console.error(error instanceof SyntaxError ? 'Konfiguration ist kein gültiges JSON/keine gültige URL.' : error.message); process.exitCode=1; }
}
