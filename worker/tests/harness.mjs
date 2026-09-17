/* =========================================================================
   VISION UNIVERSE — worker/tests/harness.mjs

   Eine Cloudflare-Laufzeit aus Pappe.

   WARUM SIE NOETIG IST

   Die echte Laufzeit bringt WebSocketPair, eine Response mit Status 101
   und ein Durable Object mit Wecker mit. Node bringt nichts davon mit -
   `new Response(null, {status: 101})` wirft dort sogar. Ohne diese
   Attrappe waere jeder Test dieser Dateien ein Deployment.

   WAS SIE BEWUSST NICHT TUT

   Sie ahmt kein Verhalten nach, das geprueft werden soll. Der
   Subscription Manager, der Budgetwaechter, die Kerzenschicht und der
   Tiingo-Leser laufen hier im Original. Aus Pappe sind nur die drei
   Dinge, die die Plattform stellt: Steckdose, Uhr und Briefkasten.
   ========================================================================= */

/* --------------------------------------------------------------- Sockets */

export function machePaar() {
  const a = macheSocket("client");
  const b = macheSocket("server");
  a._peer = b; b._peer = a;
  return [a, b];
}

export function macheSocket(name) {
  const hoerer = { message: [], close: [], error: [], open: [] };
  return {
    name,
    accepted: false,
    geschlossen: false,
    empfangen: [],            /* was bei DIESEM Socket ankam, schon geparst */
    roh: [],
    _peer: null,
    accept() { this.accepted = true; },
    addEventListener(typ, fn) { (hoerer[typ] || (hoerer[typ] = [])).push(fn); },
    send(daten) {
      if (this.geschlossen) throw new Error("send auf geschlossenem Socket");
      if (this._peer) this._peer.zustellen(daten);
    },
    /* Von aussen: eine Nachricht kommt bei diesem Socket an. */
    zustellen(daten) {
      this.roh.push(daten);
      try { this.empfangen.push(JSON.parse(daten)); } catch (err) { this.empfangen.push(daten); }
      (hoerer.message || []).forEach((fn) => fn({ data: daten }));
    },
    fehler(info) { (hoerer.error || []).forEach((fn) => fn(info || {})); },
    close(code, grund) {
      if (this.geschlossen) return;
      this.geschlossen = true;
      (hoerer.close || []).forEach((fn) => fn({ code: code || 1000, reason: grund || "" }));
      if (this._peer && !this._peer.geschlossen) this._peer.close(code, grund);
    },
    /* Was zuletzt hier ankam, nach Operation gefiltert. */
    mit(op) { return this.empfangen.filter((n) => n && n.op === op); },
    letzte(op) { const l = this.mit(op); return l.length ? l[l.length - 1] : null; }
  };
}

/* ------------------------------------------------------------- Plattform */

class PappResponse {
  constructor(koerper, init) {
    init = init || {};
    this.status = init.status === undefined ? 200 : init.status;
    this.ok = this.status >= 200 && this.status < 300;
    this.webSocket = init.webSocket || null;
    const kopf = new Map();
    Object.keys(init.headers || {}).forEach((k) => kopf.set(k.toLowerCase(), init.headers[k]));
    this.headers = { get: (k) => (kopf.has(String(k).toLowerCase()) ? kopf.get(String(k).toLowerCase()) : null),
                     has: (k) => kopf.has(String(k).toLowerCase()) };
    this._koerper = koerper;
  }
  async json() { return JSON.parse(this._koerper); }
  async text() { return String(this._koerper); }
}

let installiert = false;

export function installiereLaufzeit() {
  if (installiert) return;
  installiert = true;
  globalThis.Response = PappResponse;
  globalThis.WebSocketPair = function () {
    const [a, b] = machePaar();
    return { 0: a, 1: b };
  };
}

export function anfrage(url, koepfe, methode) {
  const k = new Map();
  Object.keys(koepfe || {}).forEach((n) => k.set(n.toLowerCase(), koepfe[n]));
  return {
    url,
    method: methode || "GET",
    headers: { get: (n) => (k.has(String(n).toLowerCase()) ? k.get(String(n).toLowerCase()) : null) }
  };
}

/* ------------------------------------------------------------------ Uhr */

export function uhrwerk(start) {
  let t = start;
  let seq = 0;
  const offen = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) { const id = ++seq; offen.set(id, { at: t + (ms || 0), fn }); return id; },
    clearTimeout(id) { offen.delete(id); },
    setInterval(fn, ms) { return this.setTimeout(fn, ms); },
    clearInterval(id) { this.clearTimeout(id); },
    /* Die Zeit laeuft in Schritten, und faellige Wecker feuern dabei -
       in der Reihenfolge, in der sie faellig sind, nicht in der, in der
       sie gestellt wurden. */
    vor(ms) {
      const ziel = t + ms;
      for (;;) {
        let naechster = null;
        for (const [id, e] of offen) {
          if (e.at <= ziel && (naechster === null || e.at < offen.get(naechster).at)) naechster = id;
        }
        if (naechster === null) break;
        const e = offen.get(naechster);
        offen.delete(naechster);
        t = e.at;
        e.fn();
      }
      t = ziel;
    },
    offeneTimer() { return offen.size; }
  };
}

/* ------------------------------------------------- Durable Object State */

export function papierZustand(uhr) {
  let wecker = null;
  return {
    storage: {
      setAlarm(wann) { wecker = wann; return Promise.resolve(); },
      getAlarm() { return Promise.resolve(wecker); },
      deleteAlarm() { wecker = null; return Promise.resolve(); }
    },
    alarmZeit() { return wecker; },
    uhr
  };
}

/* --------------------------------------------------------- Anbieterseite */

/**
 * Ein fetch, das statt einer Antwort einen Socket liefert - so wie
 * Cloudflare es bei einem Upgrade tut.
 *
 * Der zurueckgegebene Griff sammelt alle Anmeldungen und erlaubt es,
 * Kurse von aussen hereinzugeben.
 */
export function anbieter(opts) {
  opts = opts || {};
  const griff = {
    verbindungen: 0,
    /* Womit der Link den Aufbau versucht hat. Cloudflare nimmt fuer ein
       Upgrade kein wss:// entgegen, und das ist von aussen nicht zu
       sehen - also wird es hier festgehalten. */
    urls: [],
    anmeldungen: [],        /* jede Nachricht, die der Link geschickt hat */
    sockets: [],
    aktuell: null,
    /* Ein Kurs, wie Stufe 6 ihn liefert: kein Typfeld, drei Felder. */
    kurs(symbol, preis, zeit) {
      if (!this.aktuell) throw new Error("kein offener Anbietersocket");
      this.aktuell.zustellen(JSON.stringify({
        messageType: "A",
        service: "iex",
        data: [new Date(zeit).toISOString(), String(symbol).toLowerCase(), preis]
      }));
    },
    herzschlag() {
      if (this.aktuell) this.aktuell.zustellen(JSON.stringify({ messageType: "H" }));
    },
    abbruch(code) { if (this.aktuell) this.aktuell.close(code || 1006, "abbruch"); },
    tickers() {
      const letzte = this.anmeldungen.filter((n) => n.eventName === "subscribe");
      return letzte.length ? letzte[letzte.length - 1].eventData.tickers : [];
    }
  };
  const fetchImpl = async (url) => {
    griff.urls.push(String(url));
    if (opts.verweigern) return new PappResponse("kein Upgrade", { status: 400 });
    griff.verbindungen++;
    const s = macheSocket("provider");
    /* Was der Link sendet, landet im Griff - der Anbieter ist hier nur
       ein Notizblock. */
    s.send = (daten) => { try { griff.anmeldungen.push(JSON.parse(daten)); } catch (e) { griff.anmeldungen.push(daten); } };
    griff.sockets.push(s);
    griff.aktuell = s;
    return new PappResponse(null, { status: 101, webSocket: s });
  };
  griff.fetch = fetchImpl;
  return griff;
}
