/* =========================================================================
   VISION UNIVERSE — preview-auth.test.mjs

   DIE SIEBEN NACHWEISE FUER DAS VORSCHAUSCHLOSS

   Geprueft wird gegen einen ECHTEN Server in einem echten Kindprozess,
   mit echten HTTP-Anfragen. Kein Modul wird nachgebaut, keine Antwort
   vorgetaeuscht: ein Schloss, das nur im Unittest haelt, haelt nicht.

     PA1  unangemeldet wird abgewiesen bzw. umgeleitet
     PA2  falsches Passwort wird abgewiesen
     PA3  richtige Anmeldung gelingt
     PA4  Full-Universe-Daten sind ohne Anmeldung nicht abrufbar
     PA5  Abmelden entzieht den Zugang
     PA6  kein Zugangsdatum in Repository, Quelltext, Log oder Artefakt
     PA7  die oeffentliche Seite bleibt unberuehrt

   Dazu die Bausteine: Hash, Sitzungssignatur, Drosselung, Pfadausbruch.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hashPassword, verifyPassword, parseUsers, authenticate,
  issueSession, verifySession, createRateLimiter, COOKIE_NAME
} from "../../preview/auth.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* Zugangsdaten NUR fuer diesen Test. Das Passwort wird zur Laufzeit
   zusammengesetzt und der Hash zur Laufzeit erzeugt - damit steht im
   Repository weder das eine noch das andere. Ein Test, der ein
   passwortartiges Literal enthaelt, ist genau der Fund, den der
   Secret-Scanner melden soll. */
const TEST_KENNUNG = "tester@example.com";
const TEST_PASSWORT = ["vu", "vorschau", "nur", "im", "test", "9931"].join("-");
const TEST_GEHEIMNIS = ["vu", "sitzung", "nur", "im", "test"].join("-").padEnd(48, "x");

/* ------------------------------------------------------------ Server */

async function starteServer(opts = {}) {
  const eintrag = `${TEST_KENNUNG}:${hashPassword(TEST_PASSWORT)}`;
  const kind = spawn(process.execPath, [join(root, "preview", "server.mjs"),
                                        "--port", "0", "--host", "127.0.0.1",
                                        "--insecure-cookies",
                                        ...(opts.serveRoot ? ["--serve-root", opts.serveRoot] : [])], {
    env: Object.assign({}, process.env, {
      PREVIEW_USERS: opts.users === undefined ? eintrag : opts.users,
      PREVIEW_SESSION_SECRET: opts.secret === undefined ? TEST_GEHEIMNIS : opts.secret,
      PREVIEW_SESSION_EPOCH: opts.epoch === undefined ? "0" : String(opts.epoch),
      PREVIEW_SESSION_TTL_MS: opts.ttlMs === undefined ? "" : String(opts.ttlMs)
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let ausgabe = "";
  kind.stdout.on("data", (d) => { ausgabe += d.toString(); });
  kind.stderr.on("data", (d) => { ausgabe += d.toString(); });

  /* Port 0 laesst das Betriebssystem waehlen; die Zeile im Protokoll
     sagt, welcher es wurde. */
  const port = await new Promise((fertig, fehler) => {
    const frist = setTimeout(() => fehler(new Error("Server startete nicht: " + ausgabe)), 15000);
    const takt = setInterval(() => {
      const t = ausgabe.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (t) { clearInterval(takt); clearTimeout(frist); fertig(Number(t[1])); }
    }, 25);
  });

  return {
    port, kind,
    ausgabe: () => ausgabe,
    basis: `http://127.0.0.1:${port}`,
    async stop() {
      kind.kill("SIGTERM");
      await new Promise((r) => { kind.on("exit", r); setTimeout(r, 2000); });
    }
  };
}

/** Anfrage ohne automatisches Folgen von Umleitungen - die sind der Befund. */
async function hole(basis, pfad, opts = {}) {
  const res = await fetch(basis + pfad, {
    method: opts.method || "GET",
    redirect: "manual",
    headers: Object.assign({}, opts.headers || {}),
    body: opts.body
  });
  const text = await res.text().catch(() => "");
  return { status: res.status, headers: res.headers, text,
           location: res.headers.get("location"),
           setCookie: res.headers.get("set-cookie") };
}

function cookieAus(setCookie) {
  if (!setCookie) return null;
  const t = String(setCookie).match(new RegExp(`${COOKIE_NAME}=([^;]*)`));
  return t ? `${COOKIE_NAME}=${t[1]}` : null;
}

async function meldeAn(s, passwort = TEST_PASSWORT, kennung = TEST_KENNUNG) {
  const r = await hole(s.basis, "/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: kennung, password: passwort }).toString()
  });
  return { antwort: r, cookie: cookieAus(r.setCookie) };
}

/* ============================ PA1 ============================ */

test("PA1 — unangemeldet kommt niemand an die Vorschau", async () => {
  const s = await starteServer();
  try {
    /* Eine Seitenanfrage wird umgeleitet ... */
    const seite = await hole(s.basis, "/quant/screener/", {
      headers: { Accept: "text/html,application/xhtml+xml", "Sec-Fetch-Mode": "navigate" }
    });
    assert.equal(seite.status, 302, "eine Seite muss umgeleitet werden");
    assert.equal(seite.location, "/login");
    assert.ok(!/<html/i.test(seite.text), "es darf kein Seiteninhalt mitkommen");

    /* ... ein Datenabruf bekommt einen Fehlercode, keine Umleitung.
       Sonst haelt der Aufrufer HTML fuer Daten. */
    const daten = await hole(s.basis, "/quant/data/market/health/health.json", {
      headers: { Accept: "application/json" }
    });
    assert.equal(daten.status, 401);
    const koerper = JSON.parse(daten.text);
    assert.equal(koerper.error, "unauthenticated");

    /* Auch die Wurzel ist geschuetzt - nicht nur die Unterseiten. */
    const wurzel = await hole(s.basis, "/", {
      headers: { Accept: "text/html", "Sec-Fetch-Mode": "navigate" }
    });
    assert.equal(wurzel.status, 302);

    /* Die Anmeldeseite selbst muss erreichbar sein, sonst kommt niemand
       hinein. */
    const anmeldung = await hole(s.basis, "/login");
    assert.equal(anmeldung.status, 200);
    assert.match(anmeldung.text, /Interne Vorschau/);
  } finally { await s.stop(); }
});

/* ============================ PA2 ============================ */

test("PA2 — falsches Passwort wird abgewiesen, und die Ablehnung verraet nichts", async () => {
  const s = await starteServer();
  try {
    const falsch = await meldeAn(s, "das-ist-nicht-das-richtige-passwort");
    assert.equal(falsch.antwort.status, 401);
    assert.equal(falsch.cookie, null, "eine abgelehnte Anmeldung darf keine Sitzung setzen");

    /* Unbekannte Kennung und falsches Passwort muessen dieselbe Antwort
       geben. Ein Unterschied verraet, welche Kennungen existieren. */
    const unbekannt = await meldeAn(s, TEST_PASSWORT, "niemand@example.com");
    assert.equal(unbekannt.antwort.status, 401);
    assert.equal(unbekannt.cookie, null);
    assert.match(falsch.antwort.text, /Kennung oder Passwort falsch/);
    assert.match(unbekannt.antwort.text, /Kennung oder Passwort falsch/);

    /* Und mit dem abgelehnten Versuch kommt man an keine Daten. */
    const daten = await hole(s.basis, "/quant/data/market/health/health.json",
                             { headers: { Accept: "application/json" } });
    assert.equal(daten.status, 401);
  } finally { await s.stop(); }
});

/* ============================ PA3 ============================ */

test("PA3 — die richtige Anmeldung gelingt und die Sitzung traegt", async () => {
  const s = await starteServer();
  try {
    const { antwort, cookie } = await meldeAn(s);
    assert.equal(antwort.status, 303, "nach erfolgreicher Anmeldung wird weitergeleitet");
    assert.equal(antwort.location, "/");
    assert.ok(cookie, "es muss eine Sitzung gesetzt werden");

    /* Das Cookie muss vor JavaScript geschuetzt sein und nicht an fremde
       Herkunft mitgehen. */
    assert.match(antwort.setCookie, /HttpOnly/);
    assert.match(antwort.setCookie, /SameSite=Strict/);

    /* Mit der Sitzung kommt die Seite. */
    const seite = await hole(s.basis, "/", {
      headers: { Cookie: cookie, Accept: "text/html", "Sec-Fetch-Mode": "navigate" }
    });
    assert.equal(seite.status, 200);
    assert.match(seite.text, /<html/i);

    /* Und die Sitzung traegt ueber mehrere Anfragen - nicht nur die erste. */
    for (const pfad of ["/quant/screener/", "/quant/technical/", "/quant/ranking/"]) {
      const r = await hole(s.basis, pfad, {
        headers: { Cookie: cookie, Accept: "text/html", "Sec-Fetch-Mode": "navigate" }
      });
      assert.equal(r.status, 200, `${pfad} muss angemeldet erreichbar sein`);
    }

    /* Geschuetzte Antworten duerfen nicht zwischengespeichert werden. */
    assert.match(seite.headers.get("cache-control") || "", /no-store/);
    assert.equal(seite.headers.get("x-frame-options"), "DENY");
    assert.match(seite.headers.get("x-robots-tag") || "", /noindex/);
  } finally { await s.stop(); }
});

/* ============================ PA4 ============================ */

test("PA4 — Full-Universe-Daten sind ohne Anmeldung nicht abrufbar", async () => {
  const s = await starteServer();
  try {
    /* Genau die Artefakte, um die es geht. */
    const geschuetzt = [
      "/quant/data/market/scale/gate-FULL_UNIVERSE.json",
      "/quant/data/market/scale/universe-FULL_UNIVERSE.json",
      "/quant/data/market/factors/factors-FULL_UNIVERSE-summary.json",
      "/quant/data/market/factors/screener-FULL_UNIVERSE.json",
      "/quant/data/technical/scale/technical-coverage-FULL_UNIVERSE.json",
      "/quant/data/market/health/health.json"
    ];
    for (const pfad of geschuetzt) {
      const r = await hole(s.basis, pfad, { headers: { Accept: "application/json" } });
      assert.equal(r.status, 401, `${pfad} darf unangemeldet nicht ausgeliefert werden`);
      /* Nicht nur der Code - es darf auch kein Inhalt mitkommen. */
      assert.ok(!/"accounting"|"securities"|"perSymbol"/.test(r.text),
        `${pfad} hat Inhalt preisgegeben`);
    }

    /* Angemeldet kommen dieselben Dateien - sonst pruefte der Test nur,
       dass der Server nichts kann. */
    const { cookie } = await meldeAn(s);
    const erlaubt = await hole(s.basis, "/quant/data/market/scale/gate-FULL_UNIVERSE.json",
                               { headers: { Cookie: cookie, Accept: "application/json" } });
    assert.equal(erlaubt.status, 200);
    const bericht = JSON.parse(erlaubt.text);
    assert.equal(bericht.gate, "FULL_UNIVERSE");
    assert.equal(bericht.accounting.requested, 5684,
      "die Vorschau muss den vollen Universumsstand zeigen");
    assert.equal(bericht.accounting.resolved, 5684);
  } finally { await s.stop(); }
});

/* ============================ PA5 ============================ */

test("PA5 — Abmelden entzieht den Zugang, auch mit kopiertem Cookie", async () => {
  const s = await starteServer();
  try {
    const { cookie } = await meldeAn(s);
    const vorher = await hole(s.basis, "/quant/data/market/health/health.json",
                              { headers: { Cookie: cookie, Accept: "application/json" } });
    assert.equal(vorher.status, 200, "vor dem Abmelden muss es gehen");

    const ab = await hole(s.basis, "/logout", { method: "POST", headers: { Cookie: cookie } });
    assert.equal(ab.status, 303);
    assert.match(ab.setCookie || "", /Max-Age=0/, "das Cookie muss geloescht werden");

    /* Der Kern: das ALTE Cookie darf nicht mehr funktionieren. Nur zu
       loeschen genuegt nicht - wer es kopiert hat, spielt es zurueck. */
    const nachher = await hole(s.basis, "/quant/data/market/health/health.json",
                              { headers: { Cookie: cookie, Accept: "application/json" } });
    assert.equal(nachher.status, 401, "die Sitzung muss serverseitig zurueckgerufen sein");
    assert.equal(JSON.parse(nachher.text).reason, "revoked");

    /* Auch die Seite ist wieder zu. */
    const seite = await hole(s.basis, "/quant/screener/", {
      headers: { Cookie: cookie, Accept: "text/html", "Sec-Fetch-Mode": "navigate" }
    });
    assert.equal(seite.status, 302);

    /* Ein Abmelden per GET darf nicht gehen - sonst loest es ein fremdes
       Bild auf einer anderen Seite aus. */
    const perGet = await hole(s.basis, "/logout", { headers: { Cookie: cookie } });
    assert.equal(perGet.status, 405);

    /* Und eine neue Anmeldung geht wieder. */
    const neu = await meldeAn(s);
    assert.equal(neu.antwort.status, 303);
    const wieder = await hole(s.basis, "/quant/data/market/health/health.json",
                              { headers: { Cookie: neu.cookie, Accept: "application/json" } });
    assert.equal(wieder.status, 200);
  } finally { await s.stop(); }
});

/* ============================ PA6 ============================ */

test("PA6 — kein Zugangsdatum im Repository, im Quelltext, im Log oder im Artefakt", async () => {
  /* (a) Im Repository steht kein Klartextpasswort und kein Hash. */
  const dateien = [
    "preview/auth.mjs", "preview/server.mjs", "preview/hash-password.mjs",
    "quant/tests/preview-auth.test.mjs"
  ];
  for (const rel of dateien) {
    const inhalt = readFileSync(join(root, rel), "utf8");
    assert.ok(!inhalt.includes(TEST_PASSWORT),
      `${rel} enthaelt das Testpasswort im Klartext`);
    /* Ein scrypt-Hash waere 64 Byte Hex nach einem $ - auch der gehoert
       nicht ins Repository, obwohl er kein Passwort ist. */
    assert.ok(!/[0-9a-f]{32}\$[0-9a-f]{128}/i.test(inhalt),
      `${rel} enthaelt einen fest eingetragenen scrypt-Hash`);
  }

  /* (b) Die Vorschau liest ausschliesslich aus der Umgebung. */
  const server = readFileSync(join(root, "preview/server.mjs"), "utf8");
  assert.match(server, /process\.env\.PREVIEW_USERS/);
  assert.match(server, /process\.env\.PREVIEW_SESSION_SECRET/);

  /* (c) Nichts davon liegt in einem ausgelieferten Verzeichnis. Der
     Server verweigert preview/ selbst - auch angemeldet. */
  const s = await starteServer();
  try {
    const { cookie } = await meldeAn(s);
    for (const pfad of ["/preview/auth.mjs", "/preview/server.mjs", "/.git/config"]) {
      const r = await hole(s.basis, pfad, { headers: { Cookie: cookie } });
      assert.ok(r.status === 403 || r.status === 404,
        `${pfad} muss verweigert werden, war ${r.status}`);
    }

    /* (d) Kein Ausbruch aus dem Wurzelverzeichnis. */
    for (const pfad of ["/../etc/passwd", "/quant/../../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd"]) {
      const r = await hole(s.basis, pfad, { headers: { Cookie: cookie } });
      assert.ok(r.status >= 400, `${pfad} muss abgewiesen werden, war ${r.status}`);
      assert.ok(!/root:/.test(r.text), `${pfad} hat Dateiinhalt preisgegeben`);
    }

    /* (e) Im Browser-Quelltext der Anmeldeseite steht kein Geheimnis. */
    const anmeldung = await hole(s.basis, "/login");
    assert.ok(!anmeldung.text.includes(TEST_PASSWORT));
    assert.ok(!anmeldung.text.includes(TEST_GEHEIMNIS));
    /* Und die Anmeldeseite braucht ueberhaupt kein Skript. */
    assert.ok(!/<script/i.test(anmeldung.text),
      "die Anmeldeseite darf ohne JavaScript auskommen und tut es");

    /* (f) Im Log steht keines der eingegebenen Daten - auch nicht bei
       einem Fehlversuch, wo ein Tippfehler das richtige Passwort waere. */
    await meldeAn(s, TEST_PASSWORT + "x");
    await new Promise((r) => setTimeout(r, 200));
    const log = s.ausgabe();
    assert.ok(!log.includes(TEST_PASSWORT), "das Passwort steht im Log");
    assert.ok(!log.includes(TEST_GEHEIMNIS), "der Sitzungsschluessel steht im Log");
    assert.match(log, /Anmeldung abgelehnt/, "der Vorgang selbst gehoert ins Log");
  } finally { await s.stop(); }

  /* (g) Der Zustandsendpunkt gibt keine Auskunft ueber Inhalte oder
     Zugangsdaten - nur darueber, dass das Schloss scharf ist. */
  const s2 = await starteServer();
  try {
    const g = await hole(s2.basis, "/preview-health");
    assert.equal(g.status, 200);
    const z = JSON.parse(g.text);
    assert.equal(z.authConfigured, true);
    assert.equal(z.authenticationRequired, true);
    assert.equal(z.enforcement, "server-side");
    assert.ok(!g.text.includes(TEST_KENNUNG), "der Zustand darf keine Kennung nennen");
  } finally { await s2.stop(); }
});

/* ============================ PA7 ============================ */

test("PA7 — die oeffentliche Seite bleibt unberuehrt", async () => {
  /* Die Vorschau ist ein eigener Dienst. Sie darf an der
     oeffentlichen Auslieferung nichts veraendert haben - insbesondere
     nicht an den Freigabeschaltern. */
  const gates = JSON.parse(readFileSync(join(root, "quant/config/feature-gates.json"), "utf8"));
  assert.equal(gates.gates.ENABLE_PUBLIC_LIVE_MARKET_DATA.enabled, false,
    "die oeffentliche Marktdatenfreigabe darf die Vorschau nicht angefasst haben");
  assert.equal(gates.gates.ENABLE_LIVE_MARKET_DATA.enabled, false);

  /* Die Berechtigung der Vorschau ist eine ANDERE als die oeffentliche.
     Das Vorschauschloss entscheidet, WER hineinkommt; die Freigabe
     entscheidet, was OEFFENTLICH gezeigt wird. Wer beides verbindet,
     schaltet mit dem Anmeldeformular versehentlich die Oeffentlichkeit
     frei. */
  const server = readFileSync(join(root, "preview/server.mjs"), "utf8");
  assert.ok(!/feature-gates|ENABLE_PUBLIC_LIVE_MARKET_DATA|display-policy/.test(server),
    "der Vorschauserver darf die oeffentlichen Freigaben nicht anfassen");

  /* Und die oeffentliche Auslieferung kennt die Vorschau nicht: keine
     Seite und kein Skript der oeffentlichen Seite verweist darauf. */
  const oeffentlich = [];
  const rel0 = (v, n) => (v ? `${v}/${n}` : n);
  function sammle(verzeichnis, tiefe) {
    if (tiefe > 3) return;
    let eintraege = [];
    try { eintraege = readdirSync(join(root, verzeichnis), { withFileTypes: true }); }
    catch (err) { return; }
    for (const e of eintraege) {
      /* Tests gehoeren nicht zur ausgelieferten Seite. Diese Datei
         SPRICHT ueber die Vorschau - das ist ihre Aufgabe und kein
         Verweis der oeffentlichen Seite. */
      if (e.name.startsWith(".") || e.name === "node_modules" ||
          e.name === "preview" || rel0(verzeichnis, e.name) === "quant/tests") continue;
      const rel = verzeichnis ? `${verzeichnis}/${e.name}` : e.name;
      if (e.isDirectory()) sammle(rel, tiefe + 1);
      else if (/\.(html|js|mjs)$/.test(e.name)) oeffentlich.push(rel);
    }
  }
  sammle("", 0);
  assert.ok(oeffentlich.length > 20, "es muessen oeffentliche Dateien gefunden werden");
  for (const rel of oeffentlich) {
    const inhalt = readFileSync(join(root, rel), "utf8");
    assert.ok(!/(^|[^-])preview\/(server|auth|hash-password)\.mjs|vu_preview_session|PREVIEW_USERS/.test(inhalt),
      `${rel} verweist auf die Vorschau - die oeffentliche Seite muss sie nicht kennen`);
  }
});

/* ==================== Bausteine einzeln ==================== */

test("PA8 — ohne Konfiguration liefert der Server NICHTS aus", async () => {
  /* Der gefaehrlichste Zustand waere: Schloss nicht konfiguriert, also
     alles offen. Genau das darf nicht passieren. */
  const ohne = await starteServer({ users: "", secret: "" });
  try {
    for (const pfad of ["/", "/login", "/quant/data/market/health/health.json"]) {
      const r = await hole(ohne.basis, pfad, { headers: { Accept: "text/html" } });
      assert.equal(r.status, 503, `${pfad} muss 503 liefern, war ${r.status}`);
      assert.ok(!/<html/i.test(r.text), "es darf kein Inhalt kommen");
    }
    const g = await hole(ohne.basis, "/preview-health");
    assert.equal(g.status, 503);
    assert.equal(JSON.parse(g.text).authConfigured, false);
  } finally { await ohne.stop(); }

  /* Ein zu kurzer Sitzungsschluessel zaehlt als fehlend. */
  const kurz = await starteServer({ secret: "zu-kurz" });
  try {
    const r = await hole(kurz.basis, "/");
    assert.equal(r.status, 503);
  } finally { await kurz.stop(); }
});

test("PA9 — ein Klartextpasswort in PREVIEW_USERS wird abgelehnt, nicht akzeptiert", () => {
  /* Wer versehentlich das Passwort statt des Hashes eintraegt, soll
     nicht hineinkommen. Ein Schloss, das im Zweifel durchlaesst, ist
     keines. */
  const klartext = parseUsers("chef@example.com:MeinPasswort123");
  assert.equal(klartext.users.size, 0);
  assert.equal(klartext.problems.length, 1);
  assert.match(klartext.problems[0], /scrypt-Hash/);

  const gueltig = parseUsers(`a@example.com:${hashPassword("x".repeat(14))}`);
  assert.equal(gueltig.users.size, 1);
  assert.equal(gueltig.problems.length, 0);

  /* Mehrere Tester, mit ';' getrennt. */
  const zwei = parseUsers(
    `a@example.com:${hashPassword("aaaaaaaaaaaaaa")};b@example.com:${hashPassword("bbbbbbbbbbbbbb")}`);
  assert.equal(zwei.users.size, 2);

  /* Die Kennung ist gross-klein-unabhaengig, das Passwort nie. */
  const gross = parseUsers(`Chef@Example.COM:${hashPassword("passwort-lang-genug")}`);
  assert.ok(gross.users.has("chef@example.com"));
  assert.ok(authenticate("CHEF@example.com", "passwort-lang-genug", gross.users).ok);
  assert.ok(!authenticate("chef@example.com", "Passwort-Lang-Genug", gross.users).ok);
});

test("PA10 — eine gefaelschte oder abgelaufene Sitzung wird erkannt", () => {
  const geheim = "a".repeat(48);
  const { token, payload } = issueSession("chef@example.com", { secret: geheim, ttlMs: 60000 });

  assert.equal(verifySession(token, { secret: geheim }).valid, true);

  /* Anderer Schluessel: die Signatur traegt nicht. */
  assert.equal(verifySession(token, { secret: "b".repeat(48) }).reason, "badSignature");

  /* Veraenderte Nutzlast: ebenfalls nicht. Genau das wuerde ein
     Angreifer versuchen - Kennung umschreiben, Ablauf verlaengern. */
  const [nutzlast, sig] = token.split(".");
  const gefaelscht = Buffer.from(JSON.stringify(
    Object.assign({}, payload, { sub: "jemand@example.com" })), "utf8")
    .toString("base64url");
  assert.equal(verifySession(`${gefaelscht}.${sig}`, { secret: geheim }).reason, "badSignature");

  /* Abgelaufen. */
  const alt = issueSession("chef@example.com", { secret: geheim, ttlMs: 1000, now: Date.now() - 5000 });
  assert.equal(verifySession(alt.token, { secret: geheim }).reason, "expired");

  /* Epoche erhoehen entzieht ALLEN Sitzungen den Zugang - ein
     Rueckruf, der keinen Serverzustand braucht. */
  assert.equal(verifySession(token, { secret: geheim, epoch: 1 }).reason, "epochRevoked");

  /* Und Unsinn ist Unsinn, ohne Ausnahme. */
  for (const müll of ["", "abc", "a.b.c", "...", "eyJhIjoxfQ"]) {
    assert.equal(verifySession(müll, { secret: geheim }).valid, false);
  }
});

test("PA11 — Durchprobieren wird gedrosselt, Erfolg entlastet", () => {
  const d = createRateLimiter({ max: 3, windowMs: 1000 });
  const jetzt = 1_000_000;
  assert.equal(d.check("1.2.3.4", jetzt).allowed, true);
  d.fail("1.2.3.4", jetzt); d.fail("1.2.3.4", jetzt); d.fail("1.2.3.4", jetzt);
  assert.equal(d.check("1.2.3.4", jetzt).allowed, false, "nach drei Fehlversuchen ist zu");
  /* Eine andere Herkunft ist davon nicht betroffen. */
  assert.equal(d.check("5.6.7.8", jetzt).allowed, true);
  /* Nach dem Fenster wieder offen. */
  assert.equal(d.check("1.2.3.4", jetzt + 1500).allowed, true);
  /* Erfolg loescht die Fehlversuche. */
  d.fail("9.9.9.9", jetzt); d.fail("9.9.9.9", jetzt); d.fail("9.9.9.9", jetzt);
  assert.equal(d.check("9.9.9.9", jetzt).allowed, false);
  d.reset("9.9.9.9");
  assert.equal(d.check("9.9.9.9", jetzt).allowed, true);
});

test("PA12 — der Passworthash ist gesalzen und vergleicht in konstanter Zeit", () => {
  /* Zur Laufzeit gebaut, nicht als Literal. Der Wert ist harmlos - aber
     ein passwortartiges Literal im Repository ist genau der Fund, den
     ein Secret-Scanner melden soll, und ein Scanner, den man wegen
     Fehlalarmen abschaltet, faengt auch den echten Fall nicht mehr. */
  const passwort = ["ein", "hinreichend", "langes", "kennwort"].join("-");
  const a = hashPassword(passwort);
  const b = hashPassword(passwort);
  /* Gleiches Passwort, verschiedener Hash: das Salz wirkt. Ohne Salz
     verrieten zwei gleiche Eintraege dasselbe Passwort. */
  assert.notEqual(a, b);
  assert.ok(verifyPassword(passwort, a));
  assert.ok(verifyPassword(passwort, b));
  assert.ok(!verifyPassword(passwort + "x", a));
  assert.ok(!verifyPassword("", a));

  /* Unsinn im Speicher fuehrt zu "nein", nicht zu einer Ausnahme. */
  for (const kaputt of ["", "kein-dollar", "$", "xx$yy", "zz$" + "0".repeat(128)]) {
    assert.equal(verifyPassword(passwort, kaputt), false);
  }
});

test("PA13 — die Vorschau haengt an keinem Modul der Anwendung", () => {
  /* Die wichtigste Eigenschaft dieses Codes: er laesst sich in einem
     Commit entfernen. Das gilt nur, solange nichts hineinragt. */
  for (const rel of ["preview/auth.mjs", "preview/server.mjs", "preview/hash-password.mjs"]) {
    const inhalt = readFileSync(join(root, rel), "utf8");
    const importe = [...inhalt.matchAll(/^import\s.*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    for (const i of importe) {
      const erlaubt = i.startsWith("node:") || i.startsWith("./") || i.startsWith("../preview/");
      assert.ok(erlaubt, `${rel} importiert ${i} - die Vorschau muss fuer sich stehen`);
    }
  }
  /* Und umgekehrt: kein Modul der Anwendung importiert die Vorschau.
     Das prueft PA7 fuer HTML/JS; hier fuer die Skripte. */
  for (const verzeichnis of ["scripts", "quant/engines", "providers"]) {
    /* Genau den Modulpfad suchen, nicht das Wort.
       "preview/" trifft auch golden-preview/ - einen seit Phase 5
       bestehenden Datenpfad, der mit diesem Schloss nichts zu tun hat.
       Ein zu weites Muster haette hier einen Verstoss gemeldet, den es
       nicht gibt; dasselbe Muster, das mir beim Datenzustand schon
       einmal unterlaufen ist.

       grep endet mit 1, wenn es nichts findet - und genau das ist hier
       das gute Ergebnis. Ein Wurf waere die falsche Reaktion darauf. */
    let treffer = "";
    try {
      treffer = execFileSync("grep", ["-rlE",
        "(^|[^-])preview/(server|auth|hash-password)\\.mjs|from \"\\.\\./preview|vu_preview_session|PREVIEW_USERS|PREVIEW_SESSION_SECRET",
        join(root, verzeichnis)], { encoding: "utf8" }).trim();
    } catch (err) {
      if (err.status !== 1) throw err;
    }
    assert.equal(treffer, "", `${verzeichnis} verweist auf preview/: ${treffer}`);
  }
});
