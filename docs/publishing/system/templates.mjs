// Vorlagen für wiederkehrende Seitentypen. Eine neue Ausgabe ändert nur inhalt/*.json, nie diese Datei.
//
// Vorlage "aktie" (Titelthema-Aktie oder Einzelanalyse), Felder in inhalt/<id>.json:
//   t          Ticker für den Datenkasten (VUM.box)
//   ressort    Ressortzeile, z. B. "Titelthema · Aktie 1 von 7"
//   run        Kopfzeilen-Rubrik, z. B. "Titelthema" oder "Analyse"
//   bild       Bilddatei in img/ (KI-Bild wird gekennzeichnet; "ki": false für Fotos/Screens)
//   titel      Überschrift (kurz, max. ca. 45 Zeichen)
//   unterzeile Einstieg, 1–2 Sätze
//   absaetze   3–5 Absätze, zusammen ca. 1.300–1.900 Zeichen (getestet: kurz, mittel, lang)
//   zitat, zitatVon   wörtliches Zitat (übersetzt) mit Sprecher und Fundstelle
//   kasten     HTML für den zweiten Kasten unten (Termine, Fakten); "kastenHell": true für hellen Kasten
//   dunkel     true: Zitatkarte schwarz statt neongrün
const esc = (s) => String(s ?? '');

function aktie(c) {
  const p = (c.absaetze || []).map((x) => `<p>${esc(x)}</p>`).join('');
  return `<section class="page imgtop">
  <div class="img" style="left:0;right:0;top:0;height:74mm;background-image:linear-gradient(0deg,rgba(0,0,0,.72),rgba(0,0,0,0) 60%),url(img/${c.bild})"></div>
  ${c.ki === false ? '' : '<span class="ki" style="top:14mm;right:14mm">KI-Bild</span>'}
  <div data-run="${esc(c.run || 'Titelthema')}"></div>
  <div style="position:absolute;left:14mm;right:14mm;top:44mm;color:#fff">
    <span class="ressort" style="background:var(--lime);color:#000">${esc(c.ressort)}</span>
    <div class="hx" style="margin-top:2.5mm;font-size:29pt;max-width:178mm">${esc(c.titel)}</div>
  </div>
  <div class="pad tpl-aktie" style="top:80mm">
    <div class="sub">${esc(c.unterzeile)}</div>
    <div class="tpl-grid">
      <div class="body tpl-text">${p}</div>
      <div><div data-k="box-${c.t}"></div></div>
    </div>
    <div class="tpl-unten">
      <div class="card ${c.dunkel ? 'ink' : 'lime'}"><div class="bigq" style="font-size:12.5pt">„${esc(c.zitat)}“</div><div class="xs" style="margin-top:2mm">${esc(c.zitatVon)}</div></div>
      ${c.kasten ? `<div class="card ${c.kastenHell ? '' : 'ink'}">${c.kasten}</div>` : ''}
    </div>
  </div>
  <div data-foot></div>
</section>
<script>VUM.k('box-${c.t}',()=>VUM.box('${c.t}',{h:70}));</script>`;
}

const VORLAGEN = { aktie };
export function renderTemplate(name, inhalt, seite) {
  const f = VORLAGEN[name];
  if (!f) throw new Error(`Seite ${seite.id}: unbekannte Vorlage „${name}“`);
  return f(inhalt);
}
