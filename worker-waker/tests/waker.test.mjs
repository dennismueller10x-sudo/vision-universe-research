/* =========================================================================
   DER WECKER AUF DEM PRUEFSTAND

   Ein Wecker, der zu oft klingelt, ist ein Trigger-Sturm. Einer, der
   still ausfaellt, ist schlimmer als keiner - weil niemand merkt, dass er
   fehlt. Beide Faelle stehen hier, jeder mit Gegenprobe.

   Seit dem Wechsel auf die GitHub App kommt ein dritter dazu: einer,
   der sich falsch ausweist. Die Kette Schluessel -> JWT -> Installation
   -> Token hat vier Stellen, an denen sie brechen kann, und eine
   Fehlermeldung "401" sagt an keiner davon, welche es war. Deshalb wird
   hier nicht nur geprueft, DASS ein JWT entsteht, sondern dass es mit
   dem oeffentlichen Schluessel VERIFIZIERBAR ist - eine Signatur, die
   niemand nachrechnet, ist nur eine Bytefolge in der richtigen Laenge.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrivateKey } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { wecke } = await import(join(root, "worker-waker", "src", "index.mjs"));
const App = await import(join(root, "worker-waker", "src", "github-app.mjs"));

const REPO = "eigner/repo";
const APP_ID = "5023229";
const INSTALLATION = 77441122;
const TOKEN = "ghs_nurFuerDenTest";

/* --- Ein echtes Schluesselpaar, einmal fuer alle Tests ------------------ */

const paar = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true, ["sign", "verify"]
);
const pkcs8Bytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", paar.privateKey));

function alsPem(bytes, etikett) {
  const b64 = Buffer.from(bytes).toString("base64").replace(/(.{64})/g, "$1\n");
  return "-----BEGIN " + etikett + "-----\n" + b64 + "\n-----END " + etikett + "-----\n";
}

const PEM_PKCS8 = alsPem(pkcs8Bytes, "PRIVATE KEY");
/* Genau das Format, das GitHub beim Erzeugen eines App-Schluessels
   ausliefert - und genau das, das WebCrypto nicht direkt liest. */
const PEM_PKCS1 = createPrivateKey({ key: PEM_PKCS8, format: "pem" })
  .export({ type: "pkcs1", format: "pem" }).toString();

function umgebung(zusatz) {
  return Object.assign({
    GITHUB_REPO: REPO, GITHUB_APP_ID: APP_ID, GITHUB_APP_PRIVATE_KEY: PEM_PKCS8
  }, zusatz || {});
}

/* --- Doppelgaenger ----------------------------------------------------- */

/* Der vollstaendige Weg der App: Installation, Token, Lagebild,
   Dispatch. Wer eine dieser Antworten weglaesst, prueft den Fall, dass
   sie ausbleibt. */
function appAntworten(zusatz) {
  return [
    { enthaelt: "/repos/" + REPO + "/installation", json: { id: INSTALLATION } },
    { enthaelt: "access_tokens",
      json: { token: TOKEN, expires_at: new Date(Date.now() + 3600000).toISOString() } }
  ].concat(zusatz || []);
}

function netz(antworten) {
  const gerufen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    gerufen.push({ url: String(url), method: (opts && opts.method) || "GET",
                   headers: (opts && opts.headers) || {}, body: opts && opts.body });
    const treffer = antworten.find((a) => String(url).includes(a.enthaelt));
    if (!treffer) throw new Error("unerwarteter Aufruf: " + url);
    return {
      ok: treffer.ok !== false,
      status: treffer.status || (treffer.ok === false ? 500 : 200),
      json: async () => treffer.json || {}
    };
  };
  App.zuruecksetzen();
  return { gerufen, zurueck: () => { globalThis.fetch = original; App.zuruecksetzen(); } };
}

function protokoll() {
  const zeilen = [];
  const original = console.log;
  console.log = (z) => zeilen.push(String(z));
  return { zeilen, zurueck: () => { console.log = original; } };
}

/* --- Der Weg des Weckers ------------------------------------------------ */

test("WK-1 ohne Schluessel wird nichts ausgeloest, und der Wecker sagt es", async () => {
  const p = protokoll();
  const n = netz([]);
  try {
    const r = await wecke({ GITHUB_REPO: REPO, GITHUB_APP_ID: APP_ID });
    assert.equal(r.ok, false);
    assert.equal(r.grund, "keinSchluessel");
    assert.equal(n.gerufen.length, 0, "ohne Schluessel darf kein Netzaufruf passieren");
    assert.ok(p.zeilen.some((z) => /keinSchluessel/.test(z)),
              "ein stiller Leerlauf waere schlimmer als gar kein Wecker");
  } finally { n.zurueck(); p.zurueck(); }
});

test("WK-2 laeuft schon ein Block, wird nicht geweckt", async () => {
  const p = protokoll();
  const n = netz(appAntworten([
    { enthaelt: "/runs?status=in_progress", json: { total_count: 1 } }
  ]));
  try {
    const r = await wecke(umgebung());
    assert.equal(r.grund, "bereitsWach");
    assert.ok(!n.gerufen.some((g) => g.url.endsWith("/dispatches")),
              "ein zweiter Block waere ein Trigger-Sturm mit Wartezimmer");
  } finally { n.zurueck(); p.zurueck(); }
});

test("WK-3 Gegenprobe: laeuft keiner, wird geweckt", async () => {
  const p = protokoll();
  const n = netz(appAntworten([
    { enthaelt: "/runs?status=in_progress", json: { total_count: 0 } },
    { enthaelt: "/dispatches", json: {} }
  ]));
  try {
    const r = await wecke(umgebung());
    assert.equal(r.grund, "geweckt");
    const d = n.gerufen.find((g) => g.url.endsWith("/dispatches"));
    assert.ok(d, "es haette gedispatcht werden muessen");
    assert.equal(d.method, "POST");
    assert.match(d.body, /"ref":"main"/, "workflow_dispatch braucht einen Ref");
    assert.equal(d.headers.authorization, "Bearer " + TOKEN,
                 "gedispatcht wird mit dem Installationstoken, nicht mit dem JWT");
  } finally { n.zurueck(); p.zurueck(); }
});

test("WK-4 bei unbekannter Lage wird geweckt, nicht geschwiegen", async () => {
  /* Die sichere Richtung: ein ueberfluessiger Block endet in Sekunden,
     ein ausgefallener Takt kostet eine Stunde Stillstand. */
  const p = protokoll();
  const n = netz(appAntworten([
    { enthaelt: "/runs?status=in_progress", ok: false, status: 403 },
    { enthaelt: "/dispatches", json: {} }
  ]));
  try {
    const r = await wecke(umgebung());
    assert.equal(r.grund, "geweckt");
    assert.ok(p.zeilen.some((z) => /lageUnbekannt/.test(z)));
  } finally { n.zurueck(); p.zurueck(); }
});

test("WK-5 ein fehlgeschlagenes Wecken wird gemeldet, nicht verschluckt", async () => {
  const p = protokoll();
  const n = netz(appAntworten([
    { enthaelt: "/runs?status=in_progress", json: { total_count: 0 } },
    { enthaelt: "/dispatches", ok: false, status: 401 }
  ]));
  try {
    const r = await wecke(umgebung());
    assert.equal(r.ok, false);
    assert.equal(r.grund, "http401");
    assert.ok(p.zeilen.some((z) => /weckenFehlgeschlagen/.test(z)));
  } finally { n.zurueck(); p.zurueck(); }
});

test("WK-6 weder Schluessel noch Token landen im Protokoll", async () => {
  const p = protokoll();
  const n = netz(appAntworten([
    { enthaelt: "/runs?status=in_progress", json: { total_count: 0 } },
    { enthaelt: "/dispatches", json: {} }
  ]));
  try {
    await wecke(umgebung());
    const text = p.zeilen.join("\n");
    assert.ok(!text.includes(TOKEN), "Cloudflare-Protokolle sind lesbar");
    assert.ok(!/Bearer/.test(text));
    assert.ok(!text.includes("PRIVATE KEY"), "ein Schluessel gehoert in kein Protokoll");
    /* Und keine einzelne Zeile des PEM, auch nicht abgeschnitten. */
    for (const zeile of PEM_PKCS8.split("\n").filter((z) => z.length > 40)) {
      assert.ok(!text.includes(zeile.slice(0, 40)), "Schluesselmaterial im Protokoll");
    }
  } finally { n.zurueck(); p.zurueck(); }
});

/* --- Fall 15: Zero Cost ------------------------------------------------ */

/* Der erste Anlauf dieser beiden Pruefungen fiel an den eigenen
   Kommentaren: "Kein Durable Object", "Kein Tiingo-Schluessel", "kein
   WebSocket" stehen dort als ERKLAERUNG, warum etwas fehlt - und eine
   Textsuche kann eine Erklaerung nicht von einer Konfiguration
   unterscheiden. Dieselbe Falle wie bei SS-17 im September. Gesucht wird
   deshalb im entkommentierten Text, und WK-10 beweist, dass das
   Entkommentieren wirkt. */
function ohneKommentare(text, stil) {
  if (stil === "toml") {
    return text.split("\n").filter((z) => !/^\s*#/.test(z)).join("\n");
  }
  return text.replace(/\/\*[\s\S]*?\*\//g, "")
             .split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");
}

function quelltexte() {
  return ["index.mjs", "github-app.mjs"].map((datei) => ({
    datei,
    text: ohneKommentare(readFileSync(join(root, "worker-waker", "src", datei), "utf8"), "js")
  }));
}

test("WK-7 der Wecker aktiviert nichts Kostenpflichtiges", () => {
  const toml = ohneKommentare(readFileSync(join(root, "worker-waker", "wrangler.toml"), "utf8"), "toml");
  for (const verboten of ["durable_objects", "kv_namespaces", "r2_buckets",
                          "d1_databases", "usage_model", "TIINGO"]) {
    assert.ok(!toml.includes(verboten), verboten + " gehoert nicht in einen Wecker");
  }
  assert.match(toml, /crons\s*=/, "ohne Cron ist es kein Wecker");
});

test("WK-8 der Wecker holt keine Kurse", () => {
  for (const { datei, text } of quelltexte()) {
    for (const verboten of ["tiingo", "api.tiingo.com", "websocket", "WebSocket", "DurableObject"]) {
      assert.ok(!text.includes(verboten),
                "er ist ein Wecker, keine zweite Pipeline - " + datei + " enthaelt: " + verboten);
    }
  }
  assert.ok(quelltexte().some((q) => q.text.includes("api.github.com")),
            "er spricht genau mit einem Dienst");
});

test("WK-10 Gegenprobe: das Entkommentieren versteckt nur Kommentare", () => {
  assert.equal(ohneKommentare("# usage_model = x\nname = \"a\"", "toml").trim(), 'name = "a"');
  assert.ok(ohneKommentare("/* DurableObject */\nconst a = 1;", "js").includes("const a = 1;"));
  assert.ok(!ohneKommentare("/* DurableObject */\nconst a = 1;", "js").includes("DurableObject"));
  /* Und das Entscheidende: echter Code wird NICHT versteckt. */
  assert.ok(ohneKommentare("const x = new DurableObject();", "js").includes("DurableObject"));
  assert.ok(ohneKommentare("usage_model = \"unbound\"", "toml").includes("usage_model"));
});

test("WK-9 der Cron des Weckers und der Takt des Taktgebers passen zusammen", () => {
  const toml = readFileSync(join(root, "worker-waker", "wrangler.toml"), "utf8");
  const m = /crons\s*=\s*\[\s*"([^"]+)"/.exec(toml);
  assert.ok(m, "kein Cron gefunden");
  assert.match(m[1], /^\*\/5 /, "der Wecker muss mindestens so oft nachsehen wie der Zieltakt");
});

/* --- Die GitHub App ------------------------------------------------------ */

async function pruefeJwt(jwt) {
  const teile = jwt.split(".");
  assert.equal(teile.length, 3, "ein JWT hat drei Teile");
  const entpacke = (t) => JSON.parse(
    Buffer.from(t.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  const kopf = entpacke(teile[0]);
  const inhalt = entpacke(teile[1]);
  const signatur = Buffer.from(teile[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const gueltig = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" }, paar.publicKey,
    signatur, new TextEncoder().encode(teile[0] + "." + teile[1]));
  return { kopf, inhalt, gueltig };
}

test("WK-11 das App-JWT ist RS256, traegt die App ID und ist nachrechenbar", async () => {
  const schluessel = await App.importiereSchluessel(PEM_PKCS8);
  assert.ok(schluessel, "PKCS#8 muss lesbar sein");
  const jwt = await App.baueJwt(APP_ID, schluessel, Date.now());
  const { kopf, inhalt, gueltig } = await pruefeJwt(jwt);
  assert.equal(kopf.alg, "RS256");
  assert.equal(kopf.typ, "JWT");
  assert.equal(inhalt.iss, APP_ID, "iss ist die App ID");
  assert.ok(gueltig, "die Signatur muss mit dem oeffentlichen Schluessel aufgehen");
  /* GitHubs harte Grenzen: exp - iat hoechstens 600 s, und iat darf
     nicht in der Zukunft liegen - Cloudflares Uhr ist nicht GitHubs. */
  assert.ok(inhalt.exp - inhalt.iat <= 600, "GitHub lehnt laengere Spannen ab");
  assert.ok(inhalt.iat <= Math.floor(Date.now() / 1000), "iat darf nicht in der Zukunft liegen");
  assert.ok(inhalt.exp > Math.floor(Date.now() / 1000), "ein abgelaufenes JWT waere nutzlos");
});

test("WK-12 GitHubs eigenes Format (PKCS#1) ergibt denselben Schluessel", async () => {
  /* GitHub liefert "BEGIN RSA PRIVATE KEY". WebCrypto liest nur PKCS#8.
     Die Umverpackung hier darf den Schluessel nicht veraendern - sonst
     scheitert die Signatur erst in Produktion, mit einem nichtssagenden
     401 von GitHub. Gegenprobe: beide Wege, dieselbe nachgerechnete
     Signatur. */
  assert.match(PEM_PKCS1, /BEGIN RSA PRIVATE KEY/, "die Vorlage muss PKCS#1 sein");
  const ausPkcs1 = await App.importiereSchluessel(PEM_PKCS1);
  assert.ok(ausPkcs1, "das Format, das GitHub ausliefert, muss gelesen werden");
  const jwt = await App.baueJwt(APP_ID, ausPkcs1, 1758470000000);
  const { gueltig, inhalt } = await pruefeJwt(jwt);
  assert.ok(gueltig, "die Umverpackung hat den Schluessel veraendert");
  assert.equal(inhalt.iss, APP_ID);

  const ausPkcs8 = await App.importiereSchluessel(PEM_PKCS8);
  const a = await App.baueJwt(APP_ID, ausPkcs1, 1758470000000);
  const b = await App.baueJwt(APP_ID, ausPkcs8, 1758470000000);
  assert.equal(a, b, "derselbe Schluessel, dieselbe Zeit - dieselbe Signatur");
});

test("WK-13 Gegenprobe: was kein PEM ist, wird abgewiesen statt geraten", async () => {
  for (const murks of ["", "kein pem", "-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----",
                       "-----BEGIN PRIVATE KEY-----\n!!!nichtbase64!!!\n-----END PRIVATE KEY-----"]) {
    assert.equal(await App.importiereSchluessel(murks), null, "angenommen: " + JSON.stringify(murks.slice(0, 30)));
  }
  /* Und ein PEM, das durch eine Oberflaeche gelaufen ist: \n als Text,
     CRLF, Einrueckung. Ein Schluessel, der an einem Leerzeichen
     scheitert, kostet eine Sitzung Stillstand. */
  const durchgereicht = PEM_PKCS8.replace(/\n/g, "\\n");
  assert.ok(await App.importiereSchluessel(durchgereicht), "\\n-Folgen muessen toleriert werden");
  assert.ok(await App.importiereSchluessel(PEM_PKCS8.replace(/\n/g, "\r\n")), "CRLF muss toleriert werden");
});

test("WK-14 die Installation ID wird ermittelt, nicht konfiguriert", async () => {
  const p = protokoll();
  const n = netz(appAntworten([
    { enthaelt: "/runs?status=in_progress", json: { total_count: 0 } },
    { enthaelt: "/dispatches", json: {} }
  ]));
  try {
    const r = await wecke(umgebung());
    assert.equal(r.grund, "geweckt");
    const frage = n.gerufen.find((g) => g.url.endsWith("/installation"));
    assert.ok(frage, "die Installation muss erfragt werden");
    assert.match(frage.headers.authorization, /^Bearer ey/, "erfragt wird mit dem JWT");
    const tausch = n.gerufen.find((g) => g.url.includes("access_tokens"));
    assert.ok(tausch.url.includes("/app/installations/" + INSTALLATION + "/"),
              "die ermittelte ID muss auch benutzt werden");
    assert.equal(tausch.method, "POST");
    /* Nirgends in der Konfiguration: sonst waere es doch ein Wert von Hand. */
    const toml = readFileSync(join(root, "worker-waker", "wrangler.toml"), "utf8");
    assert.ok(!/INSTALLATION_ID/.test(toml), "die Installation ID gehoert nicht in die Konfiguration");
  } finally { n.zurueck(); p.zurueck(); }
});

test("WK-15 ein gueltiges Token wird wiederverwendet, ein ablaufendes erneuert", async () => {
  const p = protokoll();
  const n = netz(appAntworten([
    { enthaelt: "/runs?status=in_progress", json: { total_count: 0 } },
    { enthaelt: "/dispatches", json: {} }
  ]));
  try {
    await wecke(umgebung());
    const ersteTauschzahl = n.gerufen.filter((g) => g.url.includes("access_tokens")).length;
    assert.equal(ersteTauschzahl, 1);
    await wecke(umgebung());
    assert.equal(n.gerufen.filter((g) => g.url.includes("access_tokens")).length, 1,
                 "ein Token, das noch eine Stunde gilt, wird nicht neu geholt");
    assert.equal(n.gerufen.filter((g) => g.url.endsWith("/installation")).length, 1,
                 "die Installation wird nicht bei jedem Takt neu erfragt");
  } finally { n.zurueck(); p.zurueck(); }

  /* Gegenprobe: laeuft es in zwei Minuten ab, wird geholt. */
  const p2 = protokoll();
  const n2 = netz([
    { enthaelt: "/repos/" + REPO + "/installation", json: { id: INSTALLATION } },
    { enthaelt: "access_tokens",
      json: { token: TOKEN, expires_at: new Date(Date.now() + 120000).toISOString() } },
    { enthaelt: "/runs?status=in_progress", json: { total_count: 0 } },
    { enthaelt: "/dispatches", json: {} }
  ]);
  try {
    await wecke(umgebung());
    await wecke(umgebung());
    assert.equal(n2.gerufen.filter((g) => g.url.includes("access_tokens")).length, 2,
                 "kurz vor Ablauf muss erneuert werden - ein 401 mitten im Takt ist zu spaet");
  } finally { n2.zurueck(); p2.zurueck(); }
});

test("WK-16 jede Stelle, an der die Kette brechen kann, hat einen eigenen Namen", async () => {
  const faelle = [
    { env: { GITHUB_APP_ID: APP_ID, GITHUB_APP_PRIVATE_KEY: PEM_PKCS8 }, netz: [], grund: "keinRepo" },
    { env: { GITHUB_REPO: REPO, GITHUB_APP_PRIVATE_KEY: PEM_PKCS8 }, netz: [], grund: "keineAppId" },
    { env: { GITHUB_REPO: REPO, GITHUB_APP_ID: APP_ID }, netz: [], grund: "keinSchluessel" },
    { env: umgebung({ GITHUB_APP_PRIVATE_KEY: "kaputt" }), netz: [], grund: "schluesselUnlesbar" },
    { env: umgebung(),
      netz: [{ enthaelt: "/installation", ok: false, status: 404 }], grund: "keineInstallation" },
    { env: umgebung(),
      netz: [{ enthaelt: "/repos/" + REPO + "/installation", json: { id: INSTALLATION } },
             { enthaelt: "access_tokens", ok: false, status: 403 }], grund: "keinZugangstoken" }
  ];
  for (const fall of faelle) {
    const p = protokoll();
    const n = netz(fall.netz);
    try {
      const r = await wecke(fall.env);
      assert.equal(r.ok, false, fall.grund + " muesste scheitern");
      assert.equal(r.grund, fall.grund);
      assert.ok(p.zeilen.some((z) => z.includes(fall.grund)),
                fall.grund + " muss im Protokoll stehen - ein stummer Ausfall ist der Ausfall selbst");
    } finally { n.zurueck(); p.zurueck(); }
  }
});

test("WK-17 vom PAT ist nichts uebrig geblieben", () => {
  /* Eine Umstellung, die den alten Weg als Rueckfallebene stehen laesst,
     ist keine Umstellung - sie ist zwei Wege, von denen einer ungetestet
     ist. Der Eigentuemer hat "keine PAT-Loesung mehr" gesagt. */
  const dateien = [
    join(root, "worker-waker", "src", "index.mjs"),
    join(root, "worker-waker", "src", "github-app.mjs"),
    join(root, "worker-waker", "wrangler.toml"),
    join(root, ".github", "workflows", "cloudflare-waker-deploy.yml")
  ];
  for (const datei of dateien) {
    const text = readFileSync(datei, "utf8");
    assert.ok(!/GITHUB_DISPATCH_TOKEN|GH_DISPATCH_TOKEN/.test(text),
              "PAT-Rest in " + datei);
  }
});

test("WK-18 der oeffentliche Zustandspunkt verraet nichts", async () => {
  const modul = await import(join(root, "worker-waker", "src", "index.mjs"));
  const antwort = await modul.default.fetch(
    new Request("https://x/status"), umgebung());
  const text = await antwort.text();
  assert.ok(text.includes("schluesselHinterlegt"), "ob etwas hinterlegt ist, darf er sagen");
  assert.ok(!text.includes("PRIVATE KEY"), "was hinterlegt ist, nicht");
  assert.ok(!text.includes(String(INSTALLATION)));
  assert.ok(!text.includes(TOKEN));
  assert.match(text, /"schluesselHinterlegt":true/);

  const ohne = await modul.default.fetch(
    new Request("https://x/status"), { GITHUB_REPO: REPO, GITHUB_APP_ID: APP_ID });
  assert.match(await ohne.text(), /"schluesselHinterlegt":false/,
               "fehlt der Schluessel, muss man das von aussen sehen koennen");
});

test("WK-19 geweckt wird ueber den Eingang, der zur Berechtigung passt", async () => {
  /* Die App hat Actions read and write - mehr wurde bewusst nicht
     vergeben. repository_dispatch (POST /repos/{repo}/dispatches)
     verlangt aber Contents: write. Haetten wir den genommen, waere der
     Wecker eine Attrappe gewesen: ausgerollt, tickend, und bei jedem
     Takt ein 403. Das faellt in keinem Einheitstest auf, in dem der
     Dispatch nur "ok" antwortet - deshalb steht die Wahl des Eingangs
     hier fest. */
  const p = protokoll();
  const n = netz(appAntworten([
    { enthaelt: "/runs?status=in_progress", json: { total_count: 0 } },
    { enthaelt: "/dispatches", json: {} }
  ]));
  try {
    await wecke(umgebung());
    const d = n.gerufen.find((g) => g.url.endsWith("/dispatches"));
    assert.match(d.url, /\/actions\/workflows\/intraday-pacemaker\.yml\/dispatches$/,
                 "workflow_dispatch (Actions: write), nicht repository_dispatch (Contents: write)");
    assert.ok(!/\/repos\/[^/]+\/[^/]+\/dispatches$/.test(d.url),
              "der repository_dispatch-Pfad wuerde 403 liefern");
    /* Gegenprobe: der Taktgeber hoert auf genau diesen Eingang. */
    const wf = readFileSync(join(root, ".github", "workflows", "intraday-pacemaker.yml"), "utf8");
    assert.match(wf, /workflow_dispatch:/, "der Taktgeber muss workflow_dispatch annehmen");
    const ruecksprung = /inputs:\s*\n([\s\S]*?)\n\s{2}\w/.exec(wf);
    assert.ok(!/required:\s*true/.test(ruecksprung ? ruecksprung[1] : ""),
              "ein Pflichteingabefeld wuerde den Wecker aussperren");
  } finally { n.zurueck(); p.zurueck(); }
});
