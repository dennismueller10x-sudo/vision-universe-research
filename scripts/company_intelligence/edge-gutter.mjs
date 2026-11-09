/* Abstand des Company-Intelligence-Kapitels zum Bildschirmrand (Abnahme discover-beta-qa).
 * Frueher pruefte die Abnahme paddingLeft >= 14 am Kapitel selbst. Seit der VU3-Finalisierung hat das Kapitel bewusst keinen
 * Kasten und kein eigenes padding (company-intelligence/ui/stock-section.css, discover/detail.css); den Rand gibt die
 * Aktienseite. Die Pruefung konnte damit nie bestehen und schloss am 09.11.2026 das Gate (Pages-Lauf 42619189495,
 * discover-beta-qa.mjs:54). Gemessen wird jetzt, worum es geht: Text klebt nicht am Bildschirmrand, links wie rechts.
 * Lokal gemessen (Discover, AAPL): 16 px bei 390/430, 24 px bei 768, 162 px bei 1440. */
export const MIN_EDGE_GUTTER=14;
/** Rein: {left,right,viewport} in CSS-Pixeln -> true, wenn beide Seiten mindestens MIN_EDGE_GUTTER Abstand haben. */
export function edgeGutterOk({left,right,viewport},min=MIN_EDGE_GUTTER){
 if(![left,right,viewport].every(Number.isFinite))return false;
 return left>=min&&viewport-right>=min;
}
