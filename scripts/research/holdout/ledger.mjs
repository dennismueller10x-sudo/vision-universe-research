/**
 * Einmal-Ledger des Holdouts 2008–2015 (docs/research/holdout/PROTOKOLL-2008-2015.json). Liegt im privaten Eimer, nicht im
 * Repository. Ein Lauf schreibt vor der Rechnung einen Eintrag STARTED und nach dem Versiegeln SEALED. Steht schon ein
 * Eintrag SEALED, verweigert jeder weitere Lauf (fail closed). driver: { get(key) -> Buffer|null, put(key, Buffer) }.
 */
export const LEDGER_KEYS = Object.freeze({ supertrader: 'holdout-h-2008-2015/ledger-supertrader.json', quant: 'holdout-h-2008-2015/ledger-quant.json' });

export async function readLedger(driver, part) {
  const key = LEDGER_KEYS[part]; if (!key) throw new Error('LEDGER_PART_UNKNOWN');
  const b = await driver.get(key);
  return b ? JSON.parse(b.toString('utf8')) : { schema: 'vu-holdout-ledger-1.0.0', part, attempts: [] };
}
export const isSealed = (ledger) => ledger.attempts.some((x) => x.status === 'SEALED');

/** Reserviert einen Versuch; wirft HOLDOUT_ALREADY_SEALED, wenn der Holdout verbraucht ist. */
export async function startAttempt(driver, part, { runId, commit, protocolSha256, now = () => new Date().toISOString() }) {
  const l = await readLedger(driver, part);
  if (isSealed(l)) throw new Error('HOLDOUT_ALREADY_SEALED');
  const attempt = { n: l.attempts.length + 1, runId, commit, protocolSha256, startedAt: now(), status: 'STARTED' };
  l.attempts.push(attempt);
  await driver.put(LEDGER_KEYS[part], Buffer.from(JSON.stringify(l)), { contentType: 'application/json' });
  return attempt.n;
}
export async function sealAttempt(driver, part, n, { resultSha256, now = () => new Date().toISOString() }) {
  const l = await readLedger(driver, part), a = l.attempts.find((x) => x.n === n);
  if (!a || a.status !== 'STARTED') throw new Error('LEDGER_ATTEMPT_INVALID');
  if (isSealed(l)) throw new Error('HOLDOUT_ALREADY_SEALED');
  Object.assign(a, { status: 'SEALED', sealedAt: now(), resultSha256 });
  await driver.put(LEDGER_KEYS[part], Buffer.from(JSON.stringify(l)), { contentType: 'application/json' });
  return l;
}
