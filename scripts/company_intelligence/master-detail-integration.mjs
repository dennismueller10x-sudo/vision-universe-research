/* Only the reviewed existing-renderer mount and honest presence wording.
   Any other Discover logic, price, chart or capability change fails this check. */
export function masterDetailIntegrationOnly(before,after){
 let normalized=after;
 const edits=[
  ['    if (intelligenceDispose) { intelligenceDispose(); intelligenceDispose = null; }\n',''],
  ['    // The same approved issuer experience also belongs on the existing Master\n    // detail path. Price-series availability is independent of SEC/IR content.\n    if (global.VUCompanyIntelligenceStock) intelligenceDispose = global.VUCompanyIntelligenceStock.mount(root, inst.symbol);\n    var intelligenceModules = global.VUCompanyIntelligenceRollout?.eligibility?.[inst.symbol]?.modules || {};\n',''],
  ['["Geschäftszahlen", caps.HAS_FUNDAMENTALS || intelligenceModules.financials,','["Geschäftszahlen", caps.HAS_FUNDAMENTALS,'],
  ['"Angezeigt werden nur vorhandene, freigegebene Informationen. Fehlende Kennzahlen " +\n        "oder Kursreihen werden nicht ersetzt."','"Diese Seite zeigt ausschließlich, was über den Titel bekannt ist. Für Kennzahlen, " +\n        "Verlaufsbild und Einordnung braucht es Daten, die für diesen Titel nicht ausgeliefert " +\n        "werden — sie werden hier nicht ersetzt."']
 ];
 for(const [added,prior] of edits){if(!normalized.includes(added))return false;normalized=normalized.replace(added,prior);}
 return normalized===before;
}
