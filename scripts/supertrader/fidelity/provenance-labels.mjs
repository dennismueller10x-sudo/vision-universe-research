// Supertrader Migration Phase 1 – Beschriftung der R15-Herkunftsklassen und Produktklassen für Registry und Oberfläche.
// Eine Quelle für Label, Ton und Klartext; build.mjs schreibt sie nach registry.json (provenance_classes, product_classes),
// die Oberfläche liest sie von dort – keine zweite Liste im Browsercode.
import { PROVENANCE as P, PRODUCT_CLASS as C } from './taxonomy.mjs';

// tone: good | info | warn | bad | mute (entspricht den st-tag-Farben der Oberfläche)
export const PROVENANCE_LABELS = Object.freeze({
  [P.ORIGINAL]: { label: 'Original', tone: 'good', plain: 'Steht so in einer Quelle des Traders.' },
  [P.ORIGINAL_INTERPRETATION]: { label: 'Original, VU-Lesart', tone: 'good', plain: 'Die Regel stammt vom Trader; für den Code musste Vision Universe eine Lesart wählen.' },
  [P.VU_FORMALIZATION]: { label: 'VU-Formalisierung', tone: 'info', plain: 'Eine qualitative Idee des Traders, von Vision Universe in eine messbare Regel übersetzt (Zahlen sind VU).' },
  [P.VU_OWN]: { label: 'VU-eigen', tone: 'warn', plain: 'Regel von Vision Universe. Sie steht in keiner Quelle der Methode.' },
  [P.FOREIGN_RULE]: { label: 'Fremdregel', tone: 'bad', plain: 'Die Regel stammt aus einer anderen Methode oder von einem Dritten und ist keine Regel dieses Traders.' },
  [P.NOT_PUBLIC]: { label: 'Nicht öffentlich reproduzierbar', tone: 'mute', plain: 'Der Trader nennt die Regel, aber Wortlaut oder Daten sind nicht zugänglich.' },
  [P.UNRESOLVED]: { label: 'Herkunft ungeklärt', tone: 'bad', plain: 'Keine Fundstelle. Die Regel darf nicht als Regel des Traders gelten.' },
});

// Rangfolge der Strenge: bei gemischten Regeln gilt die strengste enthaltene Klasse.
export const PROVENANCE_ORDER = Object.freeze([P.UNRESOLVED, P.FOREIGN_RULE, P.VU_OWN, P.NOT_PUBLIC, P.VU_FORMALIZATION, P.ORIGINAL_INTERPRETATION, P.ORIGINAL]);

export const PRODUCT_CLASS_LABELS = Object.freeze({
  [C.REPLICATION]: { label: 'Replication', tone: 'good', plain: 'Bildet die Methode des Traders in allen Kernbereichen ab (Einstieg, Ausstieg, Positionsgröße, Portfolio, Risiko; bei Fundamentalmethoden auch die Fundamentalauswahl). Heute erfüllt keine Version diese Bedingung.' },
  [C.VU_ADAPTATION]: { label: 'VU Adaptation', tone: 'info', plain: 'Vision-Universe-Anpassung einer Trader-Methode: übernommene Kernideen, mechanisch umgesetzt, mit eigenen Annahmen und fehlenden Bausteinen. Nicht die Methode des Traders.' },
  [C.VU_NATIVE]: { label: 'VU Native', tone: 'info', plain: 'Eigene Strategie von Vision Universe nach öffentlich beschriebenen Regeln Dritter. Keine Trader-Methode.' },
});

// Kurzbeschreibung der Kernbereiche für die Fidelity-Daten je Strategie.
export const FIDELITY_AREA_LABELS = Object.freeze({
  entry: 'Einstieg', exit: 'Ausstieg', sizing: 'Positionsgröße', portfolio: 'Portfolio', fundamental: 'Fundamentalauswahl', marketRegime: 'Marktumfeld',
});
