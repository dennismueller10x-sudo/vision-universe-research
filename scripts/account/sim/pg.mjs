// Fuehrt SQL ueber psql gegen eine Test-Datenbank aus, wahlweise in der Rolle
// und mit den JWT-Claims einer PostgREST-Anfrage. Nur Simulation und Tests.
import {spawn} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';

const ROLES = new Set(['anon', 'authenticated', 'service_role']);

export class PgError extends Error {
  constructor(sqlstate, message) { super(message); this.sqlstate = sqlstate; }
}

function run(url, script, vars = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', url];
    for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`);
    const child = spawn('psql', args, {stdio: ['pipe', 'pipe', 'pipe']});
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) return resolve(out.trim());
      const m = err.match(/ERROR:\s+([0-9A-Z]{5}):\s+([^\n]*)/) || err.match(/ERROR:\s+([^\n]*)/);
      reject(m && m.length === 3 ? new PgError(m[1], m[2]) : new PgError('XX000', (m && m[1]) || err.trim() || 'psql failed'));
    });
    child.stdin.end('\\set VERBOSITY verbose\n' + script);
  });
}

export function createPg(url) {
  return {
    url,
    // Ergebnis der letzten Anweisung als JSON (die Anweisung muss genau einen JSON-Wert liefern).
    async json(sql, vars = {}, {role = null, claims = null} = {}) {
      if (role && !ROLES.has(role)) throw new Error('ROLE_INVALID');
      const prefix = role
        ? `\\o /dev/null\nbegin;\nselect set_config('request.jwt.claims', :'claims', true);\nset local role ${role};\n\\o\n`
        : 'begin;\n';
      const text = await run(url, `${prefix}${sql};\ncommit;\n`, {...vars, claims: JSON.stringify(claims || {})});
      return text ? JSON.parse(text) : null;
    },
    exec: (sql, vars = {}) => run(url, sql + '\n', vars),
  };
}

// Frische Datenbank mit Plattform-Stub, Migrationen und Seed.
export async function createTestDatabase(adminUrl, root) {
  const name = 'vu_account_sim_' + randomBytes(4).toString('hex');
  await run(adminUrl, `create database ${name};\n`);
  const u = new URL(adminUrl);
  u.pathname = '/' + name;
  const url = u.toString();
  const files = ['supabase/local/platform-stub.sql',
    ...readdirSync(join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort().map(f => 'supabase/migrations/' + f),
    'supabase/seed.sql'];
  for (const f of files) await run(url, `\\i ${join(root, f)}\n`);
  return {url, name, drop: () => run(adminUrl, `drop database if exists ${name} with (force);\n`)};
}
