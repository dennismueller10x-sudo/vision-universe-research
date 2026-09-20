/* =========================================================================
   vision-universe-social — src/approval.js
   DAS TOR DES APPROVAL CENTERS

   -------------------------------------------------------------------------
   WAS HIER ENTSCHIEDEN WIRD — UND WAS AUSDRUECKLICH NICHT
   -------------------------------------------------------------------------

   Hier entscheidet sich, WER hereinkommt. Nicht, was er sieht, und nicht,
   was daraufhin passiert. Die Warteschlange, die Karte und der Weg zur
   Veroeffentlichung kommen aus Bausteinen, die es bereits gibt:

     die kanonische Zustandsmaschine  social/engines/owner-decision.js
     der Veroeffentlichungspfad       handlePublish in index.js

   Das Approval Center baut keine zweite Warteschlange und keine zweite
   Veroeffentlichung. Es ist die Owner-Oberflaeche VOR einem bewiesenen
   Pfad, nicht neben ihm.

   -------------------------------------------------------------------------
   WARUM DIESE ROUTEN VOR DEM ADMIN-TOR LIEGEN
   -------------------------------------------------------------------------

   Der Router in index.js stellt `requireAdmin` vor alles, was nach dem
   OAuth-Callback kommt. Das ist richtig fuer Endpunkte, die von
   Skripten und Workflows aufgerufen werden — und unbrauchbar fuer einen
   Browser: `requireAdmin` liest nur `Authorization: Bearer` und `?key=`,
   und ein Telefon kann weder das eine mitschicken noch das andere
   benutzen, ohne den Schluessel in die Adresszeile zu schreiben.

   Deshalb liegen `/approval*` VOR diesem Tor und bringen ihr EIGENES
   mit: `requireOwnerSession`. Vor heisst hier nicht offener, sondern
   anders verschlossen.

   DIE WICHTIGE FOLGE, UND SIE IST BEABSICHTIGT: die Sitzung oeffnet
   ausschliesslich `/approval*`. Sie kann `/social/meta/*` nicht
   erreichen — nicht weil es verboten waere, sondern weil `requireAdmin`
   gar kein Cookie liest. Ein Cookie, das den Admin-Schluessel ersetzt,
   waere eine Rechteausweitung durch eine Bequemlichkeit; ein Cookie, das
   nur eine Tuer oeffnet, ist eine Tuer.

   -------------------------------------------------------------------------
   FAIL CLOSED
   -------------------------------------------------------------------------

   Jeder Pfad unter `/approval`, der hier nicht ausdruecklich genannt
   ist, endet verschlossen — nicht bei der 404 des allgemeinen Routers.
   Eine 404 hinter einem Tor sagt "diesen Weg gibt es nicht"; eine 404
   VOR dem Tor saegt daran, ohne es zu merken, und jede kuenftige Route
   unter /approval waere bis zu ihrer eigenen Pruefung offen.
   ========================================================================= */

import {
  createSession, sessionFromRequest, clearSessionCookie, timingSafeEqual
} from "./session.js";
import {
  signInPage, approvalResponse, landingPage, alterInWorten, candidatePage
} from "./approval-ui.js";
import {
  readQueue, readDecision, recordDecision, settleDecision
} from "./store.js";
import { contentHash } from "./redact.js";

const MIN_ADMIN_KEY_LENGTH = 32;

/* ------------------------------------------------------------------ */
/* Das Tor                                                             */
/* ------------------------------------------------------------------ */

/**
 * Prueft die Owner-Sitzung.
 *
 * @returns { ok: true } oder { ok: false, reason, response }
 *
 * `response` ist bewusst schon fertig: ein Aufrufer, der selbst
 * entscheiden muesste, was eine fehlende Sitzung bedeutet, koennte es
 * auch vergessen.
 */
export async function requireOwnerSession(request, env, options = {}) {
  const sitzung = await sessionFromRequest(request, env, options);
  if (sitzung.valid) return { ok: true, reason: null };

  /* Der Grund faerbt nur den Satz auf der Anmeldeseite. Er sagt nichts
     darueber, ob es etwas zu sehen gaebe. */
  const grund = sitzung.reason === "expired" ? "expired"
    : sitzung.reason === "noSession" ? "noSession"
    : "invalid";

  return {
    ok: false,
    reason: sitzung.reason,
    /* Eine abgelaufene oder verfaelschte Sitzung wird beim Abweisen
       geloescht. Sonst traegt der Browser sie bei jedem Versuch weiter
       mit, und der Owner sieht dieselbe Seite, ohne zu verstehen,
       warum seine Anmeldung nicht greift. */
    response: signInPage(grund, sitzung.reason === "noSession"
      ? {} : { "set-cookie": clearSessionCookie() })
  };
}

/* ------------------------------------------------------------------ */
/* Die Anmeldung                                                       */
/* ------------------------------------------------------------------ */

/**
 * Liest den Schluessel aus dem RUMPF — nie aus der URL.
 *
 * Zwei Formen, weil zwei Aufrufer: das Formular des Telefons schickt
 * `application/x-www-form-urlencoded`, ein Test oder ein Skript
 * schickt JSON. Beide legen den Wert in den Rumpf; keine legt ihn in
 * die Adresszeile.
 */
async function schluesselAusRumpf(request) {
  const typ = String(request.headers.get("content-type") || "").toLowerCase();
  try {
    if (typ.includes("application/json")) {
      const body = await request.json();
      return String((body && body.adminKey) || "").trim();
    }
    const form = await request.formData();
    return String(form.get("adminKey") || "").trim();
  } catch (err) {
    return "";
  }
}

/**
 * Tauscht den Admin-Schluessel gegen eine Sitzung.
 *
 * Dass der Schluessel im Rumpf steht und nicht in der URL, ist kein
 * Stilfrage: eine Adresszeile landet im Verlauf, im Screenshot, im
 * Zugriffsprotokoll des Proxys und in jedem Referrer, den die Seite je
 * erzeugt. Ein Rumpf landet in keinem davon.
 */
export async function handleApprovalSession(request, env, options = {}) {
  const erwartet = env.VU_SOCIAL_ADMIN_KEY;

  /* Ohne konfigurierten Schluessel gibt es keine Anmeldung — und
     ausdruecklich auch keinen Notzugang. Ein Worker ohne Schluessel ist
     zu, nicht offen. */
  if (!erwartet || String(erwartet).length < MIN_ADMIN_KEY_LENGTH) {
    return approvalResponse("Nicht konfiguriert", `
<h1>Nicht konfiguriert</h1>
<p class="leise">Auf diesem Worker ist kein Owner-Schluessel hinterlegt.
Ohne ihn gibt es keine Anmeldung und keine Freigabe.</p>`, 503);
  }

  const gegeben = await schluesselAusRumpf(request);

  if (!gegeben || !timingSafeEqual(gegeben, String(erwartet))) {
    /* Keine Auskunft darueber, ob der Schluessel fehlte oder falsch
       war — und keine darueber, ob etwas wartet. */
    return signInPage("wrongKey");
  }

  const sitzung = await createSession(erwartet, options);

  /* 303 und nicht 200: nach einem POST soll im Browser eine GET-Adresse
     stehen. Sonst bietet ein Neuladen an, das Formular noch einmal zu
     senden — mit dem Schluessel darin. */
  return new Response(null, {
    status: 303,
    headers: {
      location: "/approval",
      "set-cookie": sitzung.cookie,
      "cache-control": "no-store, private",
      "referrer-policy": "no-referrer"
    }
  });
}

/** Beendet die Sitzung auf diesem Geraet. */
export function handleApprovalLogout() {
  return signInPage("signedOut", { "set-cookie": clearSessionCookie() });
}

/* ------------------------------------------------------------------ */
/* Der Router unter /approval                                          */
/* ------------------------------------------------------------------ */

/**
 * @returns Response, oder null wenn der Pfad nicht hierher gehoert.
 *
 * Null heisst "nicht meine Route" und NICHT "nicht gefunden": der
 * Aufrufer laeuft dann weiter durch den normalen Router. Alles, was mit
 * `/approval` beginnt, beantwortet diese Funktion selbst — auch das,
 * was es nicht gibt.
 */
export async function routeApproval(request, url, env, options = {}) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/approval" && !path.startsWith("/approval/")) return null;

  const methode = request.method;

  /* --------------------------------------------------- Ohne Sitzung */

  if (path === "/approval/session") {
    if (methode !== "POST") {
      /* Ein GET auf die Anmeldung ist kein Fehler, sondern der
         haeufigste Weg hierher: jemand laedt nach dem Abmelden neu.
         Er bekommt das Formular. */
      return signInPage("noSession");
    }
    return await handleApprovalSession(request, env, options);
  }

  if (path === "/approval/logout") {
    /* Nur POST. Ein GET waere ueber ein fremdes Bild ausloesbar — das
       ist harmlos gegenueber einer Freigabe, aber es ist trotzdem
       jemand anderes, der den Owner abmeldet. */
    if (methode !== "POST") return signInPage("noSession");
    return handleApprovalLogout();
  }

  /* ---------------------------------------------------- Mit Sitzung */

  const tor = await requireOwnerSession(request, env, options);
  if (!tor.ok) return tor.response;

  if (path === "/approval") {
    if (methode !== "GET") {
      return approvalResponse("Nicht erlaubt", `
<h1>Nicht erlaubt</h1>
<p class="leise">Diese Adresse wird gelesen, nicht beschrieben.</p>`, 405);
    }
    return await handleApprovalIndex(request, url, env, options);
  }

  /* ------------------------------------------------- Ein einzelner Beitrag */

  /* -------------------------------------------------------------------
     `cand_` und nicht irgendein Wort

     Der erste Anlauf nahm jeden Namen als Kandidatenkennung. Damit war
     /approval/queue eine Karte - und der Waechter, der dort eine 404
     erwartete, bekam eine Seite. Zwei Bedeutungen fuer denselben
     Namensraum, und der Router konnte sie nicht auseinanderhalten.

     Die Kennung hat eine Form: make-publish-candidate.mjs baut sie als
     "cand_" + Datum + Hash. Daran laesst sich die Unterscheidung
     festmachen, statt an einer Liste reservierter Woerter, die beim
     naechsten Endpunkt jemand zu ergaenzen vergisst.
     ------------------------------------------------------------------- */
  const aktion = path.match(/^\/approval\/(cand_[A-Za-z0-9_.-]+)\/(approve|publish|reject)$/);
  if (aktion) {
    /* Nur POST. Ein GET waere ueber einen untergeschobenen Link
       ausloesbar, und das Ergebnis waere ein oeffentlicher Beitrag.
       Dass das Sitzungscookie SameSite=Strict traegt, ist die zweite
       Linie - nicht die einzige. */
    if (methode !== "POST") {
      return approvalResponse("Nicht erlaubt", `
<h1>Nicht erlaubt</h1>
<p class="leise">Eine Entscheidung wird gesendet, nicht aufgerufen — ein Link
duerfte sie nicht ausloesen koennen.</p>`, 405);
    }
    if (aktion[2] === "approve") return await handleApprove(aktion[1], request, env);
    if (aktion[2] === "publish") {
      return await handlePublishDecision(aktion[1], request, env, options);
    }
    return await handleReject(aktion[1], request, env);
  }

  const karte = path.match(/^\/approval\/(cand_[A-Za-z0-9_.-]+)$/);
  if (karte) {
    if (methode !== "GET") {
      return approvalResponse("Nicht erlaubt", `
<h1>Nicht erlaubt</h1>
<p class="leise">Diese Adresse wird gelesen, nicht beschrieben.</p>`, 405);
    }
    return await handleApprovalCandidate(karte[1], env, options);
  }

  /* Alles Weitere unter /approval ist noch nicht gebaut — und bleibt
     bis dahin verschlossen statt durchzufallen. */
  return approvalResponse("Nicht gefunden", `
<h1>Nicht gefunden</h1>
<p class="leise">Diese Adresse gehoert nicht zum Approval Center.</p>`, 404);
}

/**
 * Die Karte eines Kandidaten.
 *
 * Sie zeigt NUR, was in der aktiven Schlange steht. Ein Kandidat, der
 * inzwischen entschieden, abgeloest oder zurueckgehalten wurde, ist
 * aus der naechsten Projektion verschwunden - und diese Adresse
 * antwortet dann, dass er nicht mehr wartet. Nicht mit 404: die Seite
 * gab es, und dem Owner ist mit "gibt es nicht" weniger geholfen als
 * mit "wartet nicht mehr".
 */
async function handleApprovalCandidate(candidateId, env, options = {}) {
  const schlange = env.VU_SOCIAL_KV ? await readQueue(env) : null;
  if (!schlange) return landingPage({ anzahl: null });

  /* Ist er schon entschieden, ist die Karte die falsche Antwort: der
     Owner bekaeme zwei Knoepfe fuer etwas, das er bereits entschieden
     hat. §9 - der zweite Druck erzeugt keinen zweiten Beitrag, und der
     zweite Blick keine zweite Gelegenheit dazu. */
  const entschieden = await readDecision(env, candidateId);
  if (entschieden) return entscheidungsSeite(entschieden);

  const posten = schlange.items || [];
  const stelle = posten.findIndex((i) => i.candidateId === candidateId);

  if (stelle === -1) {
    /* Steht er in der Schlange der Maschine, nur ohne Datensatz? Dann
       ist das eine andere Auskunft als "nicht mehr da". */
    const offen = (schlange.unresolved || [])
      .find((u) => u.candidateId === candidateId);
    if (offen) {
      return approvalResponse("Nicht lesbar", `
<h1>Dieser Beitrag laesst sich hier nicht zeigen.</h1>
<p class="leise">Er steht in der Warteschlange, aber sein Datensatz ist nicht
vollstaendig uebertragen worden. Eine Freigabe braucht den vollstaendigen
Beitrag — sonst gaebe sie etwas frei, das niemand gesehen hat.</p>
<p><a class="zurueck" href="/approval">Zurueck zur Uebersicht</a></p>`, 409);
    }
    return approvalResponse("Nicht mehr in der Warteschlange", `
<h1>Dieser Beitrag wartet nicht mehr.</h1>
<p class="leise">Er wurde inzwischen entschieden, abgeloest oder zurueckgehalten.
Es ist nichts schiefgegangen — der Stand hat sich geaendert.</p>
<p><a class="zurueck" href="/approval">Zurueck zur Uebersicht</a></p>`, 409);
  }

  return candidatePage(posten[stelle],
    { nummer: stelle + 1, von: schlange.activeCount },
    null);
}

/* ------------------------------------------------------------------ */

/* -------------------------------------------------------------------------
   AB WANN EIN STAND ALT IST

   Der Orchestrator laeuft zweimal taeglich. Ein Stand, der aelter ist
   als das, kann keinen Lauf gesehen haben - dann ist entweder der
   Scheduler stehengeblieben oder die Uebertragung gescheitert.

   Vierzehn Stunden lassen einem Lauf Luft, ohne einen ausgefallenen zu
   uebersehen.
   ------------------------------------------------------------------------- */
const STAND_ALT_MS = 14 * 60 * 60 * 1000;

/**
 * Die Startseite hinter der Anmeldung.
 *
 * Sie LIEST die Projektion und rechnet nichts nach. `anzahl` ist
 * `activeCount` aus der kanonischen Zustandsmaschine - nicht die Laenge
 * der Kartenliste. Die beiden koennen auseinanderfallen, und dann ist
 * genau das die Nachricht, die der Owner braucht.
 */
async function handleApprovalIndex(request, url, env, options = {}) {
  const schlange = env.VU_SOCIAL_KV ? await readQueue(env) : null;

  if (!schlange) {
    /* KEINE UEBERTRAGUNG ist nicht KEINE WARTESCHLANGE. Die beiden als
       dasselbe anzuzeigen waere die bequemste Luege dieser Oberflaeche:
       sie saehe aus wie Ruhe und waere Blindheit. */
    return landingPage({ anzahl: null });
  }

  const jetzt = options.now === undefined ? Date.now() : options.now;
  const gebaut = Date.parse(schlange.generatedAt);
  const alterMs = Number.isNaN(gebaut) ? null : jetzt - gebaut;

  /* -----------------------------------------------------------------
     WAS SEIT DER UEBERTRAGUNG ENTSCHIEDEN WURDE

     §11 verlangt, dass ein veroeffentlichter Beitrag aus der aktiven
     Schlange verschwindet. Die Projektion weiss davon nichts - sie ist
     vom letzten Orchestratorlauf, und der war vor der Entscheidung.

     Ihn stehenzulassen hiesse, dem Owner einen Beitrag als wartend zu
     zeigen, den er gerade freigegeben hat. Ihn abzuziehen ist keine
     zweite Rechnung: die Maschine sagt "wartend, Stand generatedAt",
     und der Worker kennt seither getroffene Entscheidungen. Dieselbe
     Definition, neuere Tatsachen.

     Gesagt wird es trotzdem - siehe `soeben` in approval-ui.js. */
  /* Gefragt wird je Eintrag der Schlange, nicht die ganze Ablage. Der
     erste Anlauf las ALLE Entscheidungen, die es je gab - das sind
     heute eine Handvoll und in einem Jahr einige hundert, und jede
     haette bei jedem Seitenaufruf einen KV-Lesevorgang gekostet.

     Entscheidungen werden nie geloescht (sie sind der Beleg), also
     waechst diese Liste dauerhaft. Die Schlange nicht: sie ist ein
     Jetzt-Zustand mit wenigen Eintraegen. An ihr zu haengen statt an
     der Ablage kostet, was es kosten muss. */
  const alle = schlange.items || [];
  const entscheidungen = await Promise.all(
    alle.map((i) => readDecision(env, i.candidateId)));
  const offen = alle.filter((i, n) => !entscheidungen[n]);
  const abgezogen = alle.length - offen.length;

  return landingPage({
    anzahl: Math.max(0, schlange.activeCount - abgezogen),
    soebenEntschieden: abgezogen,
    items: offen.map((i) => ({
      candidateId: i.candidateId,
      thema: i.anzeige && i.anzeige.thema ? i.anzeige.thema.value : null,
      hook: i.anzeige && i.anzeige.hook ? i.anzeige.hook.value : null
    })),
    held: schlange.held || [],
    decided: schlange.decided || [],
    alter: alterMs === null ? null : alterInWorten(alterMs),
    veraltet: alterMs !== null && alterMs > STAND_ALT_MS
  });
}

export { STAND_ALT_MS };

export { MIN_ADMIN_KEY_LENGTH };

/* =========================================================================
   DIE ENTSCHEIDUNG

   -------------------------------------------------------------------------
   WAS HIER NEU IST - UND WAS AUSDRUECKLICH NICHT
   -------------------------------------------------------------------------

   NEU ist die Owner-UX: zwei Knoepfe, eine Rueckfrage, eine
   Ergebnisseite.

   NICHT NEU ist alles, was danach passiert. Der Weg hinaus ist
   `publishCore` - derselbe, den /social/meta/publish seit dem ersten
   Beitrag geht, mit denselben zwei Erlaubnissen, demselben
   nachgerechneten Abdruck, demselben Anspruch, derselben
   Bildpruefung, derselben Idempotenz. Diese Datei ruft ihn auf. Sie
   baut ihn nicht nach.

   -------------------------------------------------------------------------
   DREI ABDRUECKE, DREI VERSCHIEDENE FRAGEN
   -------------------------------------------------------------------------

   Der Abdruck wird auf diesem Weg dreimal angefasst, und das ist kein
   Ueberschuss - jedes Mal wird etwas anderes beantwortet:

     1. Der Abdruck AUS DEM FORMULAR gegen den in der Schlange.
        Frage: ist der Tab, aus dem geklickt wurde, noch aktuell?
        Faengt: der Browser von gestern (§8).

     2. Der Abdruck NACHGERECHNET aus der gespeicherten Sendung gegen
        den in der Schlange.
        Frage: ist der Eintrag im Speicher unveraendert?
        Faengt: ein veraenderter Datensatz zwischen Uebertragung und
        Klick.

     3. Der Abdruck NACHGERECHNET aus dem, was TATSAECHLICH gesendet
        wird - in publishCore.
        Frage: geht wirklich das hinaus, was freigegeben wurde?
        Faengt: jeden Fehler auf dem Weg dorthin.

   Die dritte ist die einzige, die wirklich zaehlt. Die ersten beiden
   erlauben eine verstaendliche Antwort, bevor ein Anspruch angemeldet
   und eine Graph-Anfrage gestellt ist.
   ========================================================================= */

/* -------------------------------------------------------------------------
   DIE BETRIEBSZUSTAENDE (§12)

   Sie sagen etwas ueber den VERSAND und nichts ueber den BEITRAG. Ein
   Beitrag, der wegen eines abgelaufenen Tokens nicht hinausging, ist
   kein schlechter Beitrag - er ist ein nicht gesendeter. Keiner dieser
   Zustaende darf je in ein Lernen einfliessen.
   ------------------------------------------------------------------------- */
const BETRIEB = {
  STALE_CANDIDATE: {
    titel: "Dieser Beitrag wurde inzwischen aktualisiert.",
    text: "Was hier angezeigt wurde, ist nicht mehr der aktuelle Stand. Es wurde " +
      "nichts veroeffentlicht. Bitte die Uebersicht neu laden."
  },
  ASSET_NOT_REACHABLE: {
    titel: "Das Bild ist nicht erreichbar.",
    text: "Der Beitrag wurde NICHT veroeffentlicht. Das liegt am Bild, nicht am " +
      "Beitrag — die Freigabe bleibt moeglich, sobald das Bild wieder abrufbar ist."
  },
  AUTH_EXPIRED: {
    titel: "Die Verbindung zu Instagram besteht nicht mehr.",
    text: "Der Beitrag wurde NICHT veroeffentlicht. Die Verbindung muss erneuert " +
      "werden; am Beitrag liegt es nicht."
  },
  META_PUBLISH_FAILED: {
    titel: "Instagram hat den Beitrag nicht angenommen.",
    text: "Es wurde nichts veroeffentlicht. Der Versuch ist festgehalten und kann " +
      "wiederholt werden, sobald die Ursache behoben ist."
  },
  PUBLISH_UNCERTAIN: {
    titel: "Unklar, ob der Beitrag entstanden ist.",
    text: "Die Freigabe bei Instagram ist fehlgeschlagen, nachdem der Beitrag " +
      "abgeschickt war. Ob er existiert, weiss niemand ohne nachzusehen — deshalb " +
      "wird hier NICHT erneut gesendet."
  },
  QUALITY_GATE_FAILED: {
    titel: "Dieser Beitrag hat ein Qualitaetstor nicht bestanden.",
    text: "Er ist nicht freigebbar. Das ist eine Aussage ueber die Pruefung, nicht " +
      "ueber seine zu erwartende Wirkung."
  },
  PAYLOAD_TAMPERED: {
    titel: "Der gespeicherte Beitrag passt nicht zu seinem Abdruck.",
    text: "Es wurde nichts veroeffentlicht. Der naechste Orchestratorlauf traegt " +
      "einen frischen Stand ein."
  },
  NOT_PUBLISHABLE: {
    titel: "Dieser Beitrag laesst sich nicht senden.",
    text: "Es fehlt etwas, das zum Senden gebraucht wird. Es wurde nichts " +
      "veroeffentlicht."
  }
};

/**
 * Die serverseitige Nachpruefung vor jeder Entscheidung.
 *
 * Sie laeuft VOR der Rueckfrage und noch einmal VOR dem Senden. Der
 * Zustand kann sich zwischen beiden aendern, und die zweite Pruefung
 * ist die, die zaehlt.
 */
async function pruefeFreigabe(schlange, candidateId, fingerprint) {
  if (!schlange) return { ok: false, zustand: "STALE_CANDIDATE" };

  const eintrag = (schlange.items || []).find((i) => i.candidateId === candidateId);
  if (!eintrag) return { ok: false, zustand: "STALE_CANDIDATE" };

  /* 1. Der Tab. Ein alter Browser darf niemals einen neueren
     Kandidaten freigeben - auch dann nicht, wenn die Kennung stimmt. */
  if (!fingerprint || fingerprint !== eintrag.contentHash) {
    return { ok: false, zustand: "STALE_CANDIDATE", eintrag };
  }

  /* 2. Der Speicher. Der Abdruck der gespeicherten Sendung, frisch
     gerechnet. */
  const nachgerechnet = await contentHash({
    contentId: eintrag.payload.contentId,
    imageUrl: eintrag.payload.imageUrl,
    caption: eintrag.payload.caption
  });
  if (nachgerechnet !== eintrag.contentHash) {
    return { ok: false, zustand: "PAYLOAD_TAMPERED", eintrag };
  }

  if (!eintrag.payload.contentId || !eintrag.payload.imageUrl) {
    return { ok: false, zustand: "NOT_PUBLISHABLE", eintrag };
  }
  if (!/^https:\/\//.test(String(eintrag.payload.imageUrl))) {
    return { ok: false, zustand: "ASSET_NOT_REACHABLE", eintrag };
  }

  /* 3. Das Qualitaetstor. NICHT_ANWENDBAR ist kein Durchfallen - die
     Pruefung misst Text auf der Flaeche, und ein generatives Bild
     traegt laut Brief keinen. NICHT_BESTANDEN ist eines. */
  if (eintrag.guete && eintrag.guete.zustand === "NICHT_BESTANDEN") {
    return { ok: false, zustand: "QUALITY_GATE_FAILED", eintrag };
  }

  return { ok: true, zustand: null, eintrag };
}

/** Der Betriebszustand zu einer Antwort des Veroeffentlichungspfads. */
function zustandAus(antwort) {
  if (!antwort || typeof antwort !== "object") return "META_PUBLISH_FAILED";
  if (antwort.uncertain) return "PUBLISH_UNCERTAIN";
  if (antwort.stage === "imageCheck") return "ASSET_NOT_REACHABLE";
  if (antwort.error === "imageNotReachable" || antwort.error === "imageNotAnImage") {
    return "ASSET_NOT_REACHABLE";
  }
  if (antwort.error === "notConnected") return "AUTH_EXPIRED";
  if (antwort.error === "approvalMismatch") return "STALE_CANDIDATE";
  /* Meta meldet ein abgelaufenes Token als Code 190. Das ist ein
     Verbindungsproblem und kein Beitragsproblem. */
  if (antwort.meta && (antwort.meta.code === 190 || antwort.meta.type === "OAuthException")) {
    return "AUTH_EXPIRED";
  }
  return "META_PUBLISH_FAILED";
}

/** Liest das Formular - nie die Adresszeile. */
async function ausFormular(request) {
  const typ = String(request.headers.get("content-type") || "").toLowerCase();
  try {
    if (typ.includes("application/json")) return await request.json();
    const form = await request.formData();
    const out = {};
    for (const [k, v] of form.entries()) out[k] = String(v);
    return out;
  } catch (err) {
    return {};
  }
}

export { BETRIEB, pruefeFreigabe, zustandAus };

/* ------------------------------------------------------------------ */
/* Freigeben                                                           */
/* ------------------------------------------------------------------ */

/**
 * Schritt 1: die Rueckfrage.
 *
 * Sie ist kein Hoeflichkeitsdialog. Zwischen Karte und Rueckfrage wird
 * nachgeprueft, und zwischen Rueckfrage und Senden noch einmal - der
 * Zustand kann sich dazwischen aendern. Und sie zeigt denselben Text
 * und dasselbe Bild noch einmal: wer bestaetigt, soll bestaetigen, was
 * er bestaetigt.
 */
async function handleApprove(candidateId, request, env) {
  const formular = await ausFormular(request);
  const schlange = env.VU_SOCIAL_KV ? await readQueue(env) : null;

  const schon = await readDecision(env, candidateId);
  if (schon) return entscheidungsSeite(schon);

  const befund = await pruefeFreigabe(schlange, candidateId, formular.fingerprint);
  if (!befund.ok) return betriebsSeite(befund.zustand, candidateId);

  const i = befund.eintrag;
  return approvalResponse("Wirklich freigeben?", `
<h1>Wirklich veroeffentlichen?</h1>
<p class="leise">Danach steht dieser Beitrag oeffentlich auf Instagram. Das laesst
sich von hier aus nicht zurueckholen.</p>

<figure>
  <img src="${escape(i.payload.imageUrl)}" alt="" width="1080" height="1350">
</figure>
<p class="caption">${escape(i.payload.caption === null || i.payload.caption === undefined
  ? "" : i.payload.caption)}</p>

<form method="POST" action="/approval/${escape(candidateId)}/publish">
  <input type="hidden" name="fingerprint" value="${escape(i.contentHash)}">
  <button type="submit">Ja, veroeffentlichen</button>
</form>
<p><a class="zurueck" href="/approval/${escape(candidateId)}">Nein, zurueck</a></p>`);
}

/**
 * Schritt 2: senden.
 *
 * Die Entscheidung wird VOR dem Senden eingetragen, nicht danach. Ein
 * Absturz zwischen Knopf und Graph-Aufruf hinterlaesst sonst eine
 * Veroeffentlichung, von der niemand weiss, dass sie gewollt war - und
 * der zweite Druck faende nichts vor und sendete erneut.
 *
 * Die Reihenfolge kostet den umgekehrten Fall: eine eingetragene
 * Entscheidung ohne Veroeffentlichung. Der ist sichtbar und
 * reparierbar; der andere waere ein zweiter oeffentlicher Beitrag.
 */
async function handlePublishDecision(candidateId, request, env, options) {
  const formular = await ausFormular(request);
  const schlange = env.VU_SOCIAL_KV ? await readQueue(env) : null;

  const schon = await readDecision(env, candidateId);
  if (schon) {
    /* §9: der zweite Druck erzeugt keinen zweiten Beitrag. Er zeigt,
       was beim ersten herauskam. */
    return entscheidungsSeite(schon);
  }

  const befund = await pruefeFreigabe(schlange, candidateId, formular.fingerprint);
  if (!befund.ok) return betriebsSeite(befund.zustand, candidateId);

  /* Ohne Veroeffentlichungspfad wird nicht veroeffentlicht - und
     ausdruecklich nichts Eigenes gebaut. */
  if (typeof options.publish !== "function") {
    return betriebsSeite("NOT_PUBLISHABLE", candidateId);
  }

  const i = befund.eintrag;
  const jetzt = new Date().toISOString();

  const eingetragen = await recordDecision(env, {
    candidateId,
    contentHash: i.contentHash,
    decision: "APPROVED",
    decidedAt: jetzt,
    decidedBy: "owner"
  });
  if (!eingetragen.ok && eingetragen.reason === "alreadyDecided") {
    return entscheidungsSeite(eingetragen.decision);
  }
  if (!eingetragen.ok) return betriebsSeite("NOT_PUBLISHABLE", candidateId);

  /* ---------------------------------------------------------------
     DER BESTEHENDE WEG

     Dieselbe Funktion, die /social/meta/publish aufruft. Die Freigabe
     nennt den Abdruck; dort wird er ein drittes Mal nachgerechnet -
     aus dem, was TATSAECHLICH gesendet wird. Das ist die Pruefung,
     die zaehlt.
     --------------------------------------------------------------- */
  const antwort = await options.publish({
    contentId: i.payload.contentId,
    imageUrl: i.payload.imageUrl,
    caption: i.payload.caption,
    approval: {
      candidateId,
      approvedBy: "owner",
      approvedAt: jetzt,
      contentHash: i.contentHash
    }
  }, env);

  let ergebnis = null;
  try { ergebnis = await antwort.json(); } catch (err) { ergebnis = null; }

  if (ergebnis && ergebnis.published) {
    const fertig = await settleDecision(env, candidateId, {
      published: true,
      mediaId: ergebnis.mediaId || null,
      permalink: ergebnis.permalink || null,
      publishedAt: ergebnis.timestamp || new Date().toISOString(),
      lastError: null
    });
    return entscheidungsSeite(fertig || {
      candidateId, decision: "APPROVED", published: true,
      mediaId: ergebnis.mediaId, permalink: ergebnis.permalink
    });
  }

  const zustand = zustandAus(ergebnis);
  await settleDecision(env, candidateId, { published: false, lastError: zustand });
  return betriebsSeite(zustand, candidateId);
}

/* ------------------------------------------------------------------ */
/* Ablehnen                                                            */
/* ------------------------------------------------------------------ */

/**
 * Eine Ablehnung braucht einen Grund - und der Grund ist KEINE
 * Leistungsaussage.
 *
 * Der Beitrag wurde nie veroeffentlicht. Er hat keine Reichweite, keine
 * Interaktionsrate, keine Zielerreichung - nicht eine schlechte,
 * sondern gar keine. Der Grund sagt etwas ueber die AUSWAHL des
 * Systems, und genau so wird er weitergereicht.
 */
async function handleReject(candidateId, request, env) {
  const formular = await ausFormular(request);
  const schlange = env.VU_SOCIAL_KV ? await readQueue(env) : null;

  const schon = await readDecision(env, candidateId);
  if (schon) return entscheidungsSeite(schon);

  const grund = String(formular.reason || "").trim();
  if (!grund) {
    /* Ohne Grund keine Ablehnung. Eine Ablehnung ohne Grund lernt
       nichts - und ein Knopf, der nichts lernt, ist ein Knopf, der
       Arbeit vernichtet. */
    return approvalResponse("Grund fehlt", `
<h1>Was soll besser werden?</h1>
<p class="leise">Ohne diesen Satz ist die Ablehnung nur ein Nein. Mit ihm ist sie
eine Rueckmeldung, aus der die naechste Auswahl besser wird.</p>
<form method="POST" action="/approval/${escape(candidateId)}/reject">
  <input type="hidden" name="fingerprint" value="${escape(formular.fingerprint || "")}">
  <label for="grund">Was soll besser werden?</label>
  <textarea id="grund" name="reason" rows="3" required></textarea>
  <button class="leer" type="submit">Ablehnen</button>
</form>
<p><a class="zurueck" href="/approval/${escape(candidateId)}">Zurueck zum Beitrag</a></p>`,
      400);
  }

  const befund = await pruefeFreigabe(schlange, candidateId, formular.fingerprint);
  /* Eine Ablehnung ist gegenueber den meisten Befunden gutmuetig: sie
     veroeffentlicht nichts. Aber ein VERALTETER Abdruck ist auch hier
     ein Problem - der Owner lehnte sonst eine Fassung ab, die er nicht
     gesehen hat, und die Rueckmeldung ginge an den falschen Text. */
  if (!befund.ok && befund.zustand === "STALE_CANDIDATE") {
    return betriebsSeite("STALE_CANDIDATE", candidateId);
  }

  const eingetragen = await recordDecision(env, {
    candidateId,
    contentHash: befund.eintrag ? befund.eintrag.contentHash : (formular.fingerprint || null),
    decision: "REJECTED",
    reason: grund,
    decidedBy: "owner"
  });
  if (!eingetragen.ok && eingetragen.decision) return entscheidungsSeite(eingetragen.decision);
  if (!eingetragen.ok) return betriebsSeite("NOT_PUBLISHABLE", candidateId);

  return entscheidungsSeite(eingetragen.decision);
}

/* ------------------------------------------------------------------ */

function escape(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Die Ergebnisseite einer Entscheidung. */
function entscheidungsSeite(d) {
  if (d.decision === "REJECTED") {
    return approvalResponse("Abgelehnt", `
<h1>Abgelehnt.</h1>
<p class="leise">Dieser Beitrag geht nicht hinaus. Dein Grund ist festgehalten
und wird in die naechste Auswahl eingerechnet.</p>
<blockquote class="grund">${escape(d.reason)}</blockquote>
<p class="leise">Das ist eine Rueckmeldung zur AUSWAHL, nicht zur WIRKUNG.
Dieser Beitrag wurde nie veroeffentlicht und hat deshalb keine Reichweite —
weder eine schlechte noch eine gute.</p>
<p><a class="zurueck" href="/approval">Zurueck zur Uebersicht</a></p>`);
  }

  if (d.published) {
    /* §11: was daraus geworden ist, mit Beleg. */
    const link = d.permalink
      ? `<p><a class="weiter" href="${escape(d.permalink)}" target="_blank"
             rel="noopener noreferrer">Auf Instagram ansehen</a></p>`
      : `<p class="leise">Ein Permalink liegt nicht vor. Der Beitrag existiert
         trotzdem — die Medien-ID ist der Beleg.</p>`;
    return approvalResponse("Veroeffentlicht", `
<h1>Veroeffentlicht.</h1>
<dl>
  <dt>Zeitpunkt</dt><dd>${escape(d.publishedAt || "—")}</dd>
  <dt>Medien-ID</dt><dd>${escape(d.mediaId || "—")}</dd>
</dl>
${link}
<p><a class="zurueck" href="/approval">Zurueck zur Uebersicht</a></p>`);
  }

  /* Freigegeben, aber nicht hinausgegangen. Die Entscheidung steht;
     der Versand nicht. Die beiden zu vermengen hiesse, dem Owner eine
     Veroeffentlichung zu melden, die es nicht gibt. */
  const b = BETRIEB[d.lastError] || BETRIEB.META_PUBLISH_FAILED;
  return approvalResponse("Freigegeben, nicht gesendet", `
<h1>${escape(b.titel)}</h1>
<p class="leise">Deine Freigabe steht und bleibt stehen. Nur der Versand ist
nicht gelungen.</p>
<p class="leise">${escape(b.text)}</p>
<p><a class="zurueck" href="/approval">Zurueck zur Uebersicht</a></p>`, 502);
}

/** Ein Betriebszustand als Seite. Kein Stacktrace, keine Fehlernummer. */
function betriebsSeite(zustand, candidateId) {
  const b = BETRIEB[zustand] || BETRIEB.META_PUBLISH_FAILED;
  const status = zustand === "STALE_CANDIDATE" || zustand === "PAYLOAD_TAMPERED"
    || zustand === "QUALITY_GATE_FAILED" ? 409 : 502;
  return approvalResponse("Nicht gesendet", `
<h1>${escape(b.titel)}</h1>
<p class="leise">${escape(b.text)}</p>
<p><a class="zurueck" href="/approval">Zurueck zur Uebersicht</a></p>`, status);
}
