// Bundelt die nativen Plugins (src/native.js) nach www/vendor/native.js. Erzeugte Datei: nicht einchecken.
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({entryPoints: [path.join(app, 'src/native.js')], outfile: path.join(app, 'www/vendor/native.js'), bundle: true,
  format: 'esm', target: 'safari15', minify: true, legalComments: 'none', logLevel: 'info'});

// Laufzeitkonfiguration aus der Umgebung (nur OEFFENTLICHE Werte). Ohne Werte bleibt die App unkonfiguriert und die Anmeldung aus.
import fs from 'node:fs';
const env = process.env;
const cfg = {supabaseUrl: env.VU_SUPABASE_URL || '', supabasePublishableKey: env.VU_SUPABASE_PUBLISHABLE_KEY || ''};
if (env.VU_ACCOUNT_API) cfg.accountApi = env.VU_ACCOUNT_API;
if (/(sb_secret_|service_role|sk_live|sk_test|rk_live|rk_test)/i.test(JSON.stringify(cfg))) throw new Error('GEHEIMNIS_IN_APP_KONFIGURATION');
fs.writeFileSync(path.join(app, 'www/js/runtime-config.js'), `globalThis.VU_APP_CONFIG=${JSON.stringify(cfg)};\n`);
console.log('runtime-config.js geschrieben (konfiguriert: ' + Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey) + ')');
