/* =========================================================================
   VISION UNIVERSE — scripts/core/diagnose.mjs

   Selbstdiagnose je Wertpapier (core/diagnose.js).

     node scripts/core/diagnose.mjs NVDA
     node scripts/core/diagnose.mjs NVDA BRK-B AVB --site=https://research.visionuniverse.de
     node scripts/core/diagnose.mjs NVDA --json

   Zusaetzlich (nur Bericht): eingefrorenes Kursende und Widerspruch
   Wertpapierstamm <-> Reihe (core/listing-staleness.js, DQ-PX-6/7, DQ-ID-4).
   ========================================================================= */
import { join } from "node:path";
import { args, makeLoader, loadEngines, REPO_ROOT, require } from "./lib.mjs";

const a = args();
if (!a._.length) { console.error("Aufruf: node scripts/core/diagnose.mjs <TICKER> [...] [--site=URL] [--json]"); process.exit(1); }
const E = loadEngines();
const Diagnose = require(join(REPO_ROOT, "core", "diagnose.js"));
const Staleness = require(join(REPO_ROOT, "core", "listing-staleness.js"));
const Client = require(join(REPO_ROOT, "core", "client.js"));
const load = makeLoader({ site: a.site || null });
const now = a.now ? new Date(a.now) : new Date();
const lage = E.TradingSession.resolve(now, { calendar: E.calendar });
const expected = lage.lastCompletedSession ? lage.lastCompletedSession.sessionDate : null;
const lagSessions = (date, exp) => {
  if (!date || !exp) return null;
  if (date >= exp) return 0;
  let d = date, n = 0;
  while (d < exp && n < 60) { d = E.TradingSession.nextTradingDay(d, { calendar: E.calendar }); if (!d) return null; n++; }
  return n;
};
const opt = async (path) => { try { return await load(path); } catch (e) { return null; } };
let masterIdx;
async function kursende(ticker) {
  let id; try { id = E.Identity.securityIdForTicker(E.Identity.normalizeTicker(ticker)); } catch (e) { return []; }
  if (masterIdx === undefined) { const m = await opt("/quant/data/market/security-master/us-security-master.json"); masterIdx = m ? Staleness.masterIndex(m) : null; }
  if (!masterIdx) return [{ kind: "NO_MASTER", text: "Wertpapierstamm nicht ladbar" }];
  return Staleness.assess({ state: masterIdx.byId[id] || null, daily: await opt(Client.PATHS.dailySeries(id)), weekly: await opt(Client.PATHS.weeklySeries(id)) },
    { expectedSession: expected, lagFn: lagSessions });
}
let schlecht = 0;
const alle = [];
for (const t of a._) {
  const d = await Diagnose.diagnose(t, { load, expectedSession: expected, lagSessions, marketState: lage.marketState });
  d.kursende = (await kursende(t)).map((f) => ({ kind: f.kind, text: f.text }));
  alle.push(d);
  if (d.status === "FAILED" || d.status === "STALE") schlecht++;
  if (!a.json) {
    console.log(Diagnose.formatText(d));
    console.log("  Kursende/Stamm (nur Bericht): " + (d.kursende.length ? "" : "unauffaellig"));
    for (const f of d.kursende) console.log("    WARN " + f.kind + ": " + f.text);
    console.log("");
  }
}
if (a.json) console.log(JSON.stringify(alle.length === 1 ? alle[0] : alle, null, 2));
if (a.strict && schlecht) process.exit(2);
