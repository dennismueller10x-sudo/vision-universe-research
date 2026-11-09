/* =========================================================================
   VISION UNIVERSE — ein Zeitgeber fuer alle Zeitplaene (Plan Neustart §3)

   GitHub-Crons kamen bis zu fuenf Stunden zu spaet oder gar nicht
   (Europe-Refresh 07.11.2026, Im Blick 12.10.2026, Taktgeber 21.09.2026).
   Dieser Teil des Weckers ersetzt sie: jede Minute liest er das Register
   core/registry/schedule.json von main und stoesst jeden Eintrag mit
   timer "waker" zu seiner Zeit per workflow_dispatch an.

   EINE WAHRHEIT, KEIN DEPLOY JE UMSTELLUNG

   Das Register wird bei jedem Takt frisch gelesen. Ein Eintrag wechselt
   von "github" zu "waker" im selben Commit, in dem sein Cron aus dem
   Workflow verschwindet. Es gibt deshalb keinen Zeitpunkt, an dem beide
   Zeitgeber denselben Termin besitzen (kein Doppelstart), und keinen, an
   dem keiner ihn besitzt.

   DER LAUF WEISS, DASS ER EIN ZEITPLAN-LAUF IST

   Der Dispatch traegt den Cron-Ausdruck als Eingabe `zeitplan`. Der
   Workflow wertet `github.event.schedule || inputs.zeitplan` aus, also
   dieselbe Weiche wie zuvor, und nennt sich per run-name
   "<Workflow> · Takt <cron>". Daran erkennt der Wecker einen schon
   gestarteten Termin.

   NACHHOLEN STATT VERLIEREN

   Ein Termin wird zur Minute angestossen und, falls dort nichts ankam
   (Wecker-Ausfall, GitHub-Fehler), zu den Nachholminuten erneut geprueft.
   Gestartet wird nur, wenn seit dem Termin kein Lauf mit seiner Marke
   entstanden ist. Ist die Lage unbekannt, wird nur zur Terminminute
   gestartet, nie beim Nachholen - ein doppelter Lauf waere schlimmer als
   ein verspaeteter.

   Cron-Lesart wie GitHub (POSIX): UTC, Wochentag 0-7 (0 und 7 = Sonntag);
   sind Tag-des-Monats UND Wochentag eingeschraenkt, genuegt EINES davon.
   ========================================================================= */

const GRENZEN = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

function feld(text, [lo, hi]) {
  const werte = new Set();
  for (const teil of String(text).split(",")) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(teil);
    if (!m) throw new Error("UNGUELTIGER_CRON_TEIL:" + teil);
    let a = lo, b = hi;
    if (m[1] !== "*") { a = Number(m[2]); b = m[3] !== undefined ? Number(m[3]) : (m[4] ? hi : a); }
    const schritt = m[4] ? Number(m[4]) : 1;
    if (a < lo || b > hi || a > b || schritt < 1) throw new Error("CRON_AUSSERHALB:" + teil);
    for (let v = a; v <= b; v += schritt) werte.add(v);
  }
  return werte;
}

export function leseCron(ausdruck) {
  const teile = String(ausdruck).trim().split(/\s+/);
  if (teile.length !== 5) throw new Error("CRON_BRAUCHT_5_FELDER:" + ausdruck);
  const [min, std, tag, monat, wtag] = teile.map((t, i) => feld(t, GRENZEN[i]));
  if (wtag.has(7)) wtag.add(0);
  return { min, std, tag, monat, wtag, tagFrei: teile[2] === "*", wtagFrei: teile[4] === "*" };
}

export function cronTrifft(ausdruck, zeitMs) {
  const c = typeof ausdruck === "string" ? leseCron(ausdruck) : ausdruck;
  const d = new Date(zeitMs);
  if (!c.min.has(d.getUTCMinutes()) || !c.std.has(d.getUTCHours()) || !c.monat.has(d.getUTCMonth() + 1)) return false;
  const t = c.tag.has(d.getUTCDate()), w = c.wtag.has(d.getUTCDay());
  if (c.tagFrei && c.wtagFrei) return true;
  if (c.tagFrei) return w;
  if (c.wtagFrei) return t;
  return t || w;
}

/* Die Marke im run-name. Ein Workflow, den der Wecker taktet, setzt
   run-name: ${{ inputs.zeitplan && format('{0} · Takt {1}', github.workflow, inputs.zeitplan) || '' }} */
export const marke = (cron) => "· Takt " + cron;

export const NACHHOLEN_MINUTEN = [0, 5, 10, 15];

/* Welche Termine sind zu diesem Takt zu pruefen? Nur Eintraege mit
   timer "waker". Ergebnis je Termin: Eintrag, Terminzeit, Abstand. */
export function faellig(register, tickMs, nachholen) {
  const minute = Math.floor(tickMs / 60000) * 60000;
  const out = [];
  for (const e of (register && register.entries) || []) {
    if (e.timer !== "waker") continue;
    let c;
    try { c = leseCron(e.cron); } catch { continue; }
    for (const k of (nachholen || (register.nachholenMinuten) || NACHHOLEN_MINUTEN)) {
      const slot = minute - k * 60000;
      if (cronTrifft(c, slot)) out.push({ eintrag: e, slotMs: slot, abstand: k });
    }
  }
  return out;
}

/* Gibt es seit dem Termin schon einen Lauf mit seiner Marke? */
async function schonGestartet(env, kopf, f) {
  const seit = new Date(f.slotMs).toISOString().replace(/\.\d{3}Z$/, "Z");
  const url = "https://api.github.com/repos/" + env.GITHUB_REPO + "/actions/workflows/" +
              f.eintrag.workflow + "/runs?event=workflow_dispatch&per_page=50&created=" + encodeURIComponent(">=" + seit);
  const r = await fetch(url, { headers: kopf });
  if (!r.ok) return { bekannt: false, grund: "http" + r.status };
  const d = await r.json();
  const m = marke(f.eintrag.cron);
  const lauf = (d.workflow_runs || []).find((x) => String(x.display_title || x.name || "").endsWith(m));
  return { bekannt: true, gestartet: !!lauf };
}

export async function takte(env, kopf, register, tickMs, notiere) {
  const log = notiere || (() => {});
  const ergebnisse = [];
  const gesehen = new Set();
  for (const f of faellig(register, tickMs)) {
    const schluessel = f.eintrag.workflow + "|" + f.eintrag.cron + "|" + f.slotMs;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    const lage = await schonGestartet(env, kopf, f);
    if (lage.bekannt && lage.gestartet) { ergebnisse.push({ id: f.eintrag.id, grund: "laeuft" }); continue; }
    if (!lage.bekannt && f.abstand > 0) {
      log("taktLageUnbekannt", { id: f.eintrag.id, grund: lage.grund, abstand: f.abstand });
      ergebnisse.push({ id: f.eintrag.id, grund: "lageUnbekannt" });
      continue;
    }
    const inputs = Object.assign({}, f.eintrag.inputs || {}, { zeitplan: f.eintrag.cron });
    const r = await fetch(
      "https://api.github.com/repos/" + env.GITHUB_REPO + "/actions/workflows/" + f.eintrag.workflow + "/dispatches",
      { method: "POST", headers: Object.assign({ "content-type": "application/json" }, kopf),
        body: JSON.stringify({ ref: env.GITHUB_BRANCH || "main", inputs }) });
    if (!r.ok) {
      log("taktFehlgeschlagen", { id: f.eintrag.id, status: r.status, abstand: f.abstand });
      ergebnisse.push({ id: f.eintrag.id, grund: "http" + r.status });
      continue;
    }
    log(f.abstand ? "taktNachgeholt" : "taktGestartet", { id: f.eintrag.id, abstand: f.abstand });
    ergebnisse.push({ id: f.eintrag.id, grund: f.abstand ? "nachgeholt" : "gestartet" });
  }
  return ergebnisse;
}

/* Das Register liegt oeffentlich im Repository. Gelesen wird es ohne
   Token (raw), damit ein Takt ohne faelligen Termin GitHub nicht einmal
   nach einem Token fragen muss. */
export async function leseRegister(env) {
  const url = "https://raw.githubusercontent.com/" + env.GITHUB_REPO + "/" + (env.GITHUB_BRANCH || "main") +
              "/core/registry/schedule.json";
  try {
    const r = await fetch(url, { headers: { "user-agent": "vu-intraday-waker" }, cf: { cacheTtl: 0 } });
    if (!r.ok) return { ok: false, grund: "registerHttp" + r.status };
    const reg = await r.json();
    if (!reg || reg.schema !== "vu-schedule-1" || !Array.isArray(reg.entries)) return { ok: false, grund: "registerUngueltig" };
    return { ok: true, register: reg };
  } catch (e) {
    return { ok: false, grund: "registerFehler" };
  }
}
