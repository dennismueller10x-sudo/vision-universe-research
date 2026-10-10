/* =========================================================================
   VISION UNIVERSE — workers/vu-ask/src/gate.mjs

   DAS TOR: EIN EINZIGES DURABLE OBJECT FUER ALLE ZAEHLER

   Alle Fragen aller Nutzer laufen durch dieselbe Instanz. Nur so ist die
   Budgetgrenze hart: Zaehler in mehreren Instanzen koennten gleichzeitig
   "passt noch" sagen. Die Reservierung wird geschrieben, BEVOR die
   Anfrage an Anthropic hinausgeht - eine zweite Frage, die waehrend des
   Wartens eintrifft, sieht die erste schon als verbraucht.

   WAS GESPEICHERT WIRD
     t                       Gesamtausgaben seit Start
     m:<JJJJ-MM>             Ausgaben des Monats
     d:<JJJJ-MM-TT>          Fragen des Tages (alle Nutzer)
     u:<Tag>:<hash>          Fragen eines Anschlusses/Browsers an diesem Tag
     r:<Tag>:<hash>          Anfragen eines Anschlusses an diesem Tag
     c:<hash>                bereits uebersetzte Frage (kostet nie wieder)
     l:<Zeit>:<zufall>       Lernprotokoll: Frage, Status, fehlende Daten

   WAS NICHT GESPEICHERT WIRD
     keine IP-Adresse. Der Schluessel eines Anschlusses ist ein Hash aus
     IP, Tagesdatum und einem geheimen Salz - er wechselt jeden Tag und
     laesst sich nicht auf die Adresse zurueckrechnen.
   ========================================================================= */
import { limitsFrom, admit, worstCase, costOf, dayKey, monthKey, nextResetIso, REASON_TEXT } from "./budget.mjs";
import { interpret, promptChars } from "./claude.mjs";
import { translate, statusOf } from "./translate.mjs";
import { SYSTEM_PROMPT, OUTPUT_SCHEMA } from "./catalog.mjs";

/* Kurzer, fester Fingerabdruck der Anweisungen (FNV-1a), Teil des
   Cache-Schluessels. */
export const PROMPT_FINGERPRINT = (() => {
  const text = SYSTEM_PROMPT + JSON.stringify(OUTPUT_SCHEMA);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
})();

const CACHE_DAYS = 30;
const LOG_KEEP = 5000;
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function cleanQuestion(q) {
  if (typeof q !== "string") return null;
  const s = q.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s.length >= 3 && s.length <= 400 ? s : null;
}

/* Zwei Formulierungen, die sich nur in Gross-/Kleinschreibung,
   Satzzeichen oder Fuellwoertern unterscheiden, teilen sich einen
   Cache-Eintrag. Mehr Normalisierung waere Raten. */
const FILLERS = new Set(["aeh", "äh", "aehm", "ähm", "hm", "hmm", "mal", "bitte", "doch", "halt", "eben", "so", "ja", "also", "eigentlich", "denn", "einfach"]);
export function cacheText(q) {
  return q.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}%.,\s-]/gu, " ").replace(/[.,](?!\d)/g, " ")
    .split(/\s+/).filter((w) => w && !FILLERS.has(w)).join(" ");
}

/* Nachfrage: die vorherige Frage und ihre Interpretation (kompakt, vom
   Browser mitgeschickt) werden dem Modell vorangestellt. Alles wird hier
   neu begrenzt - der Browser ist keine vertrauenswuerdige Quelle. */
export function followUpPrompt(question, previous) {
  if (!previous || typeof previous !== "object") return question;
  const prevQ = cleanQuestion(previous.question);
  if (!prevQ) return question;
  const pick = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
  const compact = {
    kind: typeof previous.kind === "string" ? previous.kind.slice(0, 20) : "screen",
    filters: pick(previous.filters, 24).map((f) => Array.isArray(f) ? f.slice(0, 4).map((x) => (typeof x === "string" ? x.slice(0, 40) : Array.isArray(x) ? x.slice(0, 12).map(String) : x)) : null).filter(Boolean),
    tickers: pick(previous.tickers, 10).map((t) => String(t).slice(0, 12)),
    show: pick(previous.show, 8).map((t) => String(t).slice(0, 40)),
    supertrader: previous.supertrader && typeof previous.supertrader === "object"
      ? { strategy: String(previous.supertrader.strategy || "").slice(0, 30), mode: String(previous.supertrader.mode || "").slice(0, 10) } : null,
    chartbild: previous.chartbild === true,
  };
  return "VORHERIGE FRAGE: " + prevQ + "\nVORHERIGE INTERPRETATION (Filter als [Feld, Operator, Wert, Wert2]): " +
    JSON.stringify(compact).slice(0, 2500) + "\nNEUE NACHRICHT (Korrektur oder Ergaenzung): " + question;
}

export async function sha(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export class AskGate {
  constructor(state, env, deps = {}) {
    this.storage = state.storage;
    this.env = env;
    this.fetchImpl = deps.fetchImpl || ((...a) => fetch(...a));
    this.now = deps.now || (() => Date.now());
  }

  async fetch(request) {
    const url = new URL(request.url);
    const ip = request.headers.get("x-vu-ip") || "unknown";
    try {
      if (url.pathname === "/ask" && request.method === "POST") return await this.ask(await request.json(), ip);
      if (url.pathname === "/quota") return json(200, await this.quota(ip, url.searchParams.get("client")));
      if (url.pathname === "/report") return json(200, await this.report(Number(url.searchParams.get("limit")) || 200));
      return json(404, { ok: false, reason: "NOT_FOUND" });
    } catch (e) {
      return json(500, { ok: false, reason: "INTERNAL" });
    }
  }

  /* Das Salz fuer die Tages-Hashes. Ist keins als Secret gesetzt, erzeugt
     das Objekt beim ersten Aufruf selbst eines und behaelt es - niemand
     muss es kennen oder einrichten, und es verlaesst den Speicher nie. */
  async salt() {
    if (this.env.VU_ASK_SALT) return this.env.VU_ASK_SALT;
    if (this._salt) return this._salt;
    let salt = await this.storage.get("salt");
    if (!salt) {
      salt = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
      await this.storage.put("salt", salt);
    }
    return (this._salt = salt);
  }

  async identities(ip, clientId, day) {
    const salt = await this.salt();
    const ipHash = await sha(`${salt}|${day}|ip|${ip}`);
    const clientHash = CLIENT_ID.test(clientId || "") ? await sha(`${salt}|${day}|client|${clientId}`) : null;
    return { ipKey: `u:${day}:${ipHash}`, clientKey: clientHash ? `u:${day}:c${clientHash}` : null, rateKey: `r:${day}:${ipHash}` };
  }

  async userUsage(ids) {
    const keys = [ids.ipKey, ids.clientKey].filter(Boolean);
    const got = await this.storage.get(keys);
    return { llm: Math.max(...keys.map((k) => (got.get(k) || { llm: 0 }).llm)) };
  }

  async quota(ip, clientId) {
    const now = this.now(), day = dayKey(now), limits = limitsFrom(this.env);
    const user = await this.userUsage(await this.identities(ip, clientId, day));
    return {
      enabled: limits.enabled && !!this.env.ANTHROPIC_API_KEY,
      perUserDaily: limits.perUserDaily,
      remainingToday: Math.max(0, limits.perUserDaily - user.llm),
      resetsAt: nextResetIso(now),
    };
  }

  async ask(body, ip) {
    const question = cleanQuestion(body && body.question);
    if (!question) return json(400, { ok: false, reason: "INVALID_QUESTION", message: "Bitte eine Frage mit 3 bis 400 Zeichen stellen." });

    const now = this.now(), day = dayKey(now), month = monthKey(now);
    const limits = limitsFrom(this.env);
    const ids = await this.identities(ip, body.clientId, day);
    await this.sweep(day);

    /* 1 — Grobe Bremse gegen Dauerfeuer, auch fuer kostenlose Anfragen. */
    const rate = (await this.storage.get(ids.rateKey)) || { n: 0 };
    if (rate.n >= limits.requestsPerIpDaily) return this.refuse(429, "RATE_LIMIT", ip, body.clientId);
    await this.storage.put(ids.rateKey, { n: rate.n + 1 });

    /* 2 — Schon einmal uebersetzt? Dann kostet die Frage nichts und
           verbraucht kein Kontingent. */
    const prompt = followUpPrompt(question, body.previous);
    /* Die Fassung der Anweisungen gehoert zum Schluessel: aendert sich der
       Systemprompt oder das Modell, gelten alte Uebersetzungen nicht mehr. */
    const cacheKey = "c:" + (await sha(PROMPT_FINGERPRINT + "|" + limits.model + "|" + cacheText(prompt)));
    const cached = await this.storage.get(cacheKey);
    if (cached && now - cached.at < CACHE_DAYS * 864e5) {
      await this.log({ question, source: "cache", result: cached.result, status: cached.status });
      return json(200, { ok: true, source: "cache", status: cached.status, result: cached.result, quota: await this.quota(ip, body.clientId) });
    }

    /* 3 — Bot-Pruefung (wenn eingerichtet). Nur Anfragen, die Geld kosten
           koennten, brauchen sie - und sie steht VOR der Budgetpruefung:
           Zwischen Pruefen und Reservieren darf nichts liegen als
           Speicherzugriffe, sonst koennten sich zwei Anfragen waehrend
           eines Netzwerkaufrufs gegenseitig ueberholen. */
    if (!this.env.ANTHROPIC_API_KEY || !limits.enabled) return this.refuse(503, "DISABLED", ip, body.clientId);
    if (this.env.TURNSTILE_SECRET && !(await this.turnstile(body.turnstileToken, ip))) {
      return this.refuse(403, "BOT_CHECK", ip, body.clientId);
    }

    const emptyAt = await this.storage.get("creditEmptyAt");
    if (emptyAt && now - emptyAt < 15 * 60e3) return this.refuse(429, "CREDIT_EXHAUSTED", ip, body.clientId);

    /* 4 — Die Grenzen. Gerechnet wird mit dem schlechtesten Fall. */
    const reserve = worstCase(limits.model, promptChars(prompt), limits.maxOutputTokens);
    const got = await this.storage.get(["t", "m:" + month, "d:" + day]);
    const total = got.get("t") || { usd: 0, calls: 0 };
    const monthly = got.get("m:" + month) || { usd: 0, calls: 0 };
    const daily = got.get("d:" + day) || { llm: 0 };
    const user = await this.userUsage(ids);
    const verdict = admit({ limits, reserve, user, day: daily, month: monthly, total });
    if (!verdict.ok) {
      await this.log({ question, source: "none", status: "rejected", error: verdict.reason });
      return this.refuse(429, verdict.reason, ip, body.clientId);
    }

    /* 5 — Reservieren, dann erst fragen. */
    await this.book({ month, day, ids, usd: reserve, userLlm: 1, dayLlm: 1 });
    const answer = await interpret({ apiKey: this.env.ANTHROPIC_API_KEY, workspaceId: this.env.ANTHROPIC_WORKSPACE_ID, model: limits.model, question: prompt,
      maxOutputTokens: limits.maxOutputTokens, fetchImpl: this.fetchImpl });

    /* 6 — Abrechnen: Reservierung durch die echten Kosten ersetzen. */
    const actual = answer.usage ? costOf(limits.model, answer.usage) : null;
    const usd = answer.billed === false ? -reserve : actual !== null ? actual - reserve : 0;
    /* Scheitert die Frage, bekommt der Nutzer sein Kontingent zurueck -
       der Tageszaehler aller Nutzer aber nicht: sonst liesse sich die
       Tagesgrenze mit absichtlich scheiternden Fragen umgehen. */
    await this.book({ month, day, ids, usd, userLlm: answer.ok ? 0 : -1, dayLlm: 0, calls: answer.billed === false ? 0 : 1 });

    if (answer.error === "CREDIT_EXHAUSTED") {
      /* Das Prepaid-Guthaben bei Anthropic ist leer - die gewollte harte
         Grenze. 15 Minuten lang wird gar nicht mehr gefragt; danach wird
         einmal neu versucht, damit eine Aufladung ohne Eingriff wirkt. */
      await this.storage.put("creditEmptyAt", now);
      await this.log({ question, source: "claude", status: "rejected", error: "CREDIT_EXHAUSTED" });
      return this.refuse(429, "CREDIT_EXHAUSTED", ip, body.clientId);
    }
    if (!answer.ok) {
      await this.log({ question, source: "claude", status: "error", error: answer.error + (answer.detail ? " | " + answer.detail : ""), usd: actual });
      return json(502, { ok: false, reason: "UPSTREAM", code: answer.error, detail: answer.detail || null,
        message: "Die Frage konnte gerade nicht ausgewertet werden. Ihr Kontingent wurde nicht belastet.",
        quota: await this.quota(ip, body.clientId) });
    }

    const result = translate(answer.output);
    const status = statusOf(result);
    await this.storage.put(cacheKey, { at: now, result, status });
    await this.log({ question, source: "claude", result, status, usd: actual });
    return json(200, { ok: true, source: "claude", status, result, quota: await this.quota(ip, body.clientId) });
  }

  /* Bucht Kosten und Kontingent in einem Schreibvorgang. Liest die
     Zaehler frisch, weil waehrend des Wartens auf Anthropic andere
     Fragen gebucht haben koennen. */
  async book({ month, day, ids, usd, userLlm, dayLlm, calls = 0 }) {
    const keys = ["t", "m:" + month, "d:" + day, ids.ipKey, ids.clientKey].filter(Boolean);
    const got = await this.storage.get(keys);
    const out = {};
    for (const k of keys) {
      const cur = got.get(k) || {};
      if (k === "t" || k.startsWith("m:")) out[k] = { usd: Math.max(0, (cur.usd || 0) + usd), calls: (cur.calls || 0) + calls };
      else out[k] = { ...cur, llm: Math.max(0, (cur.llm || 0) + (k.startsWith("d:") ? dayLlm : userLlm)) };
    }
    await this.storage.put(out);
  }

  async refuse(status, reason, ip, clientId) {
    return json(status, { ok: false, reason, message: REASON_TEXT[reason] || REASON_TEXT.DISABLED, quota: await this.quota(ip, clientId) });
  }

  async turnstile(token, ip) {
    if (typeof token !== "string" || !token || token.length > 2048) return false;
    try {
      const res = await this.fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: new URLSearchParams({ secret: this.env.TURNSTILE_SECRET, response: token, remoteip: ip }),
      });
      const body = await res.json();
      return body && body.success === true;
    } catch (e) {
      return false;
    }
  }

  async log({ question, source, result = null, status, error = null, usd = null }) {
    const now = this.now();
    const entry = {
      at: new Date(now).toISOString(), question, source, status, error,
      kind: result ? result.kind : null,
      fields: result && result.query ? result.query.groups[0].filters.map((f) => f.field) : [],
      tickers: result ? result.tickers : [],
      supertrader: result && result.supertrader ? result.supertrader.strategy : null,
      missing: result ? result.missing : [],
      usd: Number.isFinite(usd) ? Math.round(usd * 1e6) / 1e6 : null,
    };
    await this.storage.put(`l:${entry.at}:${Math.random().toString(36).slice(2, 8)}`, entry);
    const meta = (await this.storage.get("logmeta")) || { n: 0 };
    meta.n += 1;
    if (meta.n > LOG_KEEP + 500) {
      const old = await this.storage.list({ prefix: "l:", limit: meta.n - LOG_KEEP });
      await this.storage.delete([...old.keys()]);
      meta.n -= old.size;
    }
    await this.storage.put("logmeta", meta);
  }

  /* Tageszaehler vergangener Tage werden beim ersten Aufruf eines neuen
     Tages entfernt. Sie sind danach wertlos und enthalten nur Hashes. */
  async sweep(day) {
    const last = await this.storage.get("sweep");
    if (last === day) return;
    for (const prefix of ["u:", "r:"]) {
      const old = await this.storage.list({ prefix, limit: 1000 });
      const stale = [...old.keys()].filter((k) => k.slice(prefix.length, prefix.length + 10) !== day);
      if (stale.length) await this.storage.delete(stale);
    }
    await this.storage.put("sweep", day);
  }

  /* Der Lernbericht: Was wollen Nutzer wissen, das es noch nicht gibt? */
  async report(limit) {
    const now = this.now(), limits = limitsFrom(this.env);
    const got = await this.storage.get(["t", "m:" + monthKey(now), "d:" + dayKey(now)]);
    const logs = [...(await this.storage.list({ prefix: "l:", reverse: true, limit: LOG_KEEP })).values()];
    const byStatus = {}, wishes = new Map();
    for (const l of logs) {
      byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      for (const m of l.missing || []) {
        const key = m.wish.toLowerCase();
        const w = wishes.get(key) || { wish: m.wish, type: m.type, count: 0, examples: [] };
        w.count += 1;
        if (w.examples.length < 3) w.examples.push(l.question);
        wishes.set(key, w);
      }
    }
    return {
      generatedAt: new Date(now).toISOString(),
      spend: { totalUsd: (got.get("t") || { usd: 0 }).usd, monthUsd: (got.get("m:" + monthKey(now)) || { usd: 0 }).usd,
        todayQuestions: (got.get("d:" + dayKey(now)) || { llm: 0 }).llm },
      limits: { ...limits, apiKeyPresent: !!this.env.ANTHROPIC_API_KEY, botCheck: !!this.env.TURNSTILE_SECRET },
      logged: logs.length,
      byStatus,
      missingData: [...wishes.values()].sort((a, b) => b.count - a.count).slice(0, 100),
      notUnderstood: logs.filter((l) => l.status === "unclear" || l.status === "gap" || l.status === "error").slice(0, limit)
        .map((l) => ({ at: l.at, question: l.question, status: l.status, error: l.error })),
      recent: logs.slice(0, limit).map((l) => ({ at: l.at, question: l.question, status: l.status, source: l.source, fields: l.fields, supertrader: l.supertrader })),
    };
  }
}
