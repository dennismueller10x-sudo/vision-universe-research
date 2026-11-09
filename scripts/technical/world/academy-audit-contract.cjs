/* Independently reviewed semantic expectations. This is deliberately separate from
   content.json and the runtime quiz evaluator. Update only with documented re-review. */
const answers = {
 'struktur-1':'Die Reihenfolge von Hoch und Tief',
 'struktur-2':'Höhere Hochs und höhere Tiefs',
 'struktur-3':'Eine Zone früherer Reaktionen',
 'struktur-4':'Datenstand und Zeitrahmen prüfen',
 'trend-1':'Dieser einzelne Lagefilter ist erfüllt',
 'trend-2':'102',
 'trend-3':'Relativ +5 Prozentpunkte, absolut −5 %',
 'trend-4':'Die definierten Bedingungen sind am Stichtag erfüllt',
 'breakout-1':'Die Erkennung liegt vor, die Bestätigung noch nicht',
 'breakout-2':'Die vorhandene Bestätigungsregel der Formation',
 'breakout-3':'Das Verhältnis zum definierten Vergleichsvolumen',
 'breakout-4':'Bestätigung und spätere Entwicklung getrennt',
 'momentum-1':'Aufwärtstrend und nachlassender Schwung',
 'momentum-2':'Die übliche beschreibende Zone ist erreicht',
 'momentum-3':'+1, obwohl die MACD-Linie unter null liegt',
 'momentum-4':'Sie kann die Auswahl verkleinern oder unverändert lassen',
 'risiko-1':'Die zukünftige Richtung',
 'risiko-2':'6, weil der größte Abstand zählt',
 'risiko-3':'Die Richtung der nächsten Ausweitung',
 'risiko-4':'Eine Annahme unter Ausführungsbedingungen',
 'wechsel-1':'Unsicherheit und beobachtete Strukturbrüche benennen',
 'wechsel-2':'Benannte Vergleichspunkte, Kennzahl und Zeitraum',
 'wechsel-3':'Die vorhandene Musterregel ist an diesem Bar erfüllt',
 'wechsel-4':'Beide samt Zeitraum und Bedeutung festhalten',
 'zeitrahmen-1':'Balken des angegebenen Zeitrahmens',
 'zeitrahmen-2':'Die abgeschlossenen Wochen gemäß bestehender Regel',
 'zeitrahmen-3':'Unterschiedliche Beobachtungsfenster und Zustände',
 'zeitrahmen-4':'Nicht vorhandene Wochenhochs und Wochentiefs',
 'routine-1':'Eine konkret beobachtbare Eigenschaft untersuchen',
 'routine-2':'Alle verbundenen Bedingungen',
 'routine-3':'Als unbekannt, mit Prüfung der Ursache',
 'routine-4':'Beobachtung, Interpretation und offene Fragen'
};
const targetGroups = [
 ['chart','chart','chart','chart'],
 ['trendfolge','trendvorlage','trendfolge','trendvorlage'],
 ['dreiecke','ausbruch','ausbruch','chart'],
 ['momentum','chart','chart','momentum'],
 ['ruhephase','chart','chart','chart'],
 ['trendwende','chart','chart','trendwende'],
 ['zeitrahmen','chart','zeitrahmen','zeitrahmen'],
 ['assistent','kombination','chart','screener']
];
const targets = {chart:'#/chart',trendfolge:'#/assistent/trendfolge',trendvorlage:'#/vorlagen/establishedUptrend',dreiecke:'#/vorlagen',ausbruch:'#/assistent/ausbruch',momentum:'#/assistent/momentum',ruhephase:'#/assistent/ruhephase',trendwende:'#/assistent/trendwende',zeitrahmen:'#/assistent/zeitrahmen',assistent:'#/assistent',kombination:'#/assistent/kombination',screener:'#/screener'};
function audit(c) {
 const errors=[],check=(x,msg)=>{if(!x)errors.push(msg);};
 check(c.lessons.length===Object.keys(answers).length,'semantic coverage');
 const paths=['struktur','trend','breakout','momentum','risiko','wechsel','zeitrahmen','routine'];
 for(const l of c.lessons){
  const selected=l.quiz.choices.find(x=>x.id===l.quiz.answer);
  check(selected && selected.text===answers[l.id],'answer meaning '+l.id);
  const group=paths.indexOf(l.pathId),order=Number(l.id.split('-')[1])-1,expected=targetGroups[group]?.[order];
  check(l.practice.target===expected && c.targets[l.practice.target]?.href===targets[expected],'practice meaning '+l.id);
 }
 const lesson=id=>c.lessons.find(l=>l.id===id).foundations.join(' '),term=id=>c.glossary.find(t=>t.id===id).definition;
 for(const text of [lesson('risiko-2'),term('atr')])check(/größte|Maximum/.test(text),'ATR maximum missing');
 for(const text of [lesson('momentum-3'),term('macd')]){
  check(/EMA 12 minus EMA 26/.test(text),'MACD subtraction');check(/MACD minus Signallinie/.test(text),'histogram subtraction');
 }
 for(const text of [lesson('momentum-2'),term('rsi')])check(/Wilder/.test(text),'RSI smoothing');
 check(/63 beziehungsweise 126/.test(term('rs')) && /minus die von SPY/.test(term('rs')),'RS comparison');
 check(/SMA 200 am Tag, SMA 40 in der Woche und SMA 10 im Monat/.test(lesson('zeitrahmen-1')),'MTF field mapping');
 check(c.lessons.find(l=>l.id==='wechsel-3').glossary.includes('kerzenmuster'),'candle vs geometric pattern');
 // Targeted harmful-claim counterexamples; this is not a universal truth classifier.
 for(const l of c.lessons) {
  const text=l.foundations.join(' ')+' '+l.example.text+' '+l.limits.join(' ');
  check(!/RSI (?:ist|entspricht) (?:die|der|eine) Gewinnwahrscheinlichkeit|beweist einen zukünftigen Kursanstieg|garantiert eine Trefferquote von|mit Sicherheit steigen|Bollinger-Bänder garantieren 95/i.test(text),'unsupported forecast '+l.id);
 }
 return errors;
}
module.exports={answers,targets,targetGroups,audit};
