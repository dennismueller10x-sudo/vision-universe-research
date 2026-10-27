#!/usr/bin/env node
// Vision Universe — Kuendigungen bearbeiten (berechtigte Personen).
//
// Solange VU_CANCELLATION_AUTO_PROCESS=false gilt, fuehrt nur dieses Werkzeug
// eine Kuendigung ohne Anmeldung bei Stripe aus. Es nutzt dieselben Bausteine
// wie der Worker (workers/vu-account/src/cancellation.mjs).
//
//   node scripts/account/cancellations.mjs list
//   node scripts/account/cancellations.mjs show <id>
//   node scripts/account/cancellations.mjs execute <id> --operator=<name>
//   node scripts/account/cancellations.mjs assign <id> --user=<uuid> --operator=<name>
//   node scripts/account/cancellations.mjs no-contract <id> --operator=<name>
//   node scripts/account/cancellations.mjs deliver      # Postausgang jetzt abarbeiten
//   node scripts/account/cancellations.mjs retry [<id>] --operator=<name>   # unzustellbare Bestaetigungen erneut senden
//   node scripts/account/cancellations.mjs drop <id> --operator=<name> --note=<grund>   # begruendet aufgeben
//   node scripts/account/cancellations.mjs check        # Exit 1, wenn etwas ueberfaellig/unzustellbar ist
//
// Umgebung: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, VU_ACCOUNT_API_ORIGIN,
// STRIPE_SECRET_KEY (Testmodus), BREVO_API_KEY, VU_MAIL_SENDER.
// --redact: keine Namen, Adressen, Gruende ausgeben (Pflicht in GitHub Actions:
// das Repository ist oeffentlich, seine Protokolle auch).
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../../workers/vu-account/src/index.mjs';
import {billingBlocker, supabaseReady} from '../../workers/vu-account/src/config.mjs';
import * as C from '../../workers/vu-account/src/cancellation.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function redactRow(row) {
  const {email, full_name, reason, reference, ...rest} = row;
  return {...rest, email: email ? email.replace(/^(.).*@/, '$1…@') : null, full_name: full_name ? '…' : null,
    reference: reference ? '…' : null, ...(reason !== undefined ? {reason: reason ? '…' : null} : {})};
}

export async function run(argv, {env = process.env, fetchImpl, out = console.log} = {}) {
  const [command, id] = argv.filter(a => !a.startsWith('--'));
  const opt = name => (argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
  const redact = argv.includes('--redact');
  const app = createApp({env, ...(fetchImpl ? {fetchImpl} : {}), log: (level, message, fields) => out(JSON.stringify({level, message, ...fields}))});
  const deps = app.deps;
  if (!supabaseReady(deps.cfg)) throw new Error('ACCOUNTS_NOT_CONFIGURED (SUPABASE_URL, Schluessel, VU_ACCOUNT_API_ORIGIN)');
  const needId = () => { if (!UUID.test(String(id || ''))) throw new Error('ID_REQUIRED'); return id; };
  // Das Webhook-Geheimnis braucht nur der Worker; zum Ausfuehren genuegt ein gueltiger Test-Schluessel.
  const needBilling = () => { const b = billingBlocker(deps.cfg); if (b && b !== 'BILLING_WEBHOOK_NOT_CONFIGURED') throw new Error(b); };
  const operator = opt('operator');
  const show = row => out(JSON.stringify(redact ? redactRow(row) : row, null, 2));

  switch (command) {
    case 'list': {
      const queue = await deps.store.cancellationQueue(200);
      for (const q of queue) show(q);
      out(`${queue.length} offene Kuendigung(en).`);
      return 0;
    }
    case 'show': show(await deps.store.getCancellation(needId())); return 0;
    case 'execute': needBilling(); show(await C.executeCancellation(deps, needId(), {operator})); return 0;
    case 'assign': {
      needBilling();
      const user = opt('user');
      if (!UUID.test(user)) throw new Error('USER_REQUIRED');
      show(await C.assignAndExecute(deps, needId(), user, {operator}));
      return 0;
    }
    case 'no-contract': out(JSON.stringify({emailSent: await C.closeWithoutContract(deps, needId(), {operator})})); return 0;
    case 'retry': {
      const target = id ? needId() : null;
      const r = await C.retryMails(deps, target, {operator});
      out(JSON.stringify({requeued: r.requeued, delivered: r.delivered.map(d => ({id: d.id, kind: d.kind, status: d.status}))}));
      return 0;
    }
    case 'drop': out(JSON.stringify(await C.dropMails(deps, needId(), {operator, note: opt('note')}))); return 0;
    case 'deliver': out(JSON.stringify((await C.deliverDueMails(deps, 100)).map(r => ({id: r.id, kind: r.kind, status: r.status})))); return 0;
    case 'check': {
      const health = await deps.store.cancellationHealth();
      out(JSON.stringify(health));
      if (C.needsAttention(health)) { out('ACHTUNG: Kuendigungen ueberfaellig oder Bestaetigungen nicht zugestellt.'); return 1; }
      out('Kuendigungen in Ordnung.');
      return 0;
    }
    default:
      out('Befehle: list | show <id> | execute <id> --operator=… | assign <id> --user=… --operator=… | no-contract <id> --operator=… | deliver | retry [<id>] --operator=… | drop <id> --operator=… --note=… | check [--redact]');
      return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).then(code => process.exit(code), e => {
    console.error(`FEHLER: ${e.upstreamMessage || e.message}`);
    process.exit(1);
  });
}
