import test from 'node:test';
import assert from 'node:assert/strict';
import {parseYaml,YamlSubsetError} from './helpers/workflow-yaml.mjs';

const P=s=>parseYaml(s.replace(/^\n/,''));
const loud=(text,re)=>assert.throws(()=>P(text),e=>e instanceof YamlSubsetError&&(!re||re.test(e.message)),text);

test('Mappings, Sequenzen, kompakte Eintraege, Kommentare, on-Schluessel',()=>{
 assert.deepEqual(P(`
# Kopf
name: Demo   # Kommentar
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      flag:
        type: boolean
        default: false
jobs:
  a:
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.ref }}
      - name: Zwei
        id: two
        run: echo "x:y" # kein Wert
      -   run: ls
      - plain item
      -
        nested: true
    list:
    - same
    - indent
`),{name:'Demo',on:{push:{branches:['main']},workflow_dispatch:{inputs:{flag:{type:'boolean',default:false}}}},
 jobs:{a:{steps:[{uses:'actions/checkout@v4',with:{ref:'${{ github.ref }}'}},{name:'Zwei',id:'two',run:'echo "x:y"'},{run:'ls'},'plain item',{nested:true}],list:['same','indent']}}});
});

test('Skalartypen: Zahlen, bool, null, Quotes, Escapes',()=>{
 assert.deepEqual(P(`
a: 35
b: 3.10
c: true
d: False
e: null
f: ~
g:
h: '22'
i: "tab\\there"
j: 'it''s'
k: "a # b"
l: https://example.org/x?y=1#z
m: \${{ a == 'x' && b }}
neg: -5
ver: v1.2.3
`),{a:35,b:3.1,c:true,d:false,e:null,f:null,g:null,h:'22',i:'tab\there',j:"it's",k:'a # b',l:'https://example.org/x?y=1#z',m:"${{ a == 'x' && b }}",neg:-5,ver:'v1.2.3'});
});

test('Block-Skalare | und > mit Chomping, leere Zeilen, Heredoc-Einrueckung',()=>{
 const doc=P(`
lit: |
  a
    b

  c

keep: |+
  x

strip: |-
  y
fold: >
  one
  two

  three
    more
  four
foldstrip: >-
  p
  q
cmd: |
  cat <<'EOF'
    indented
  EOF
after: z
`);
 assert.equal(doc.lit,'a\n  b\n\nc\n');
 assert.equal(doc.keep,'x\n\n');
 assert.equal(doc.strip,'y');
 assert.equal(doc.fold,'one two\nthree\n  more\nfour\n');
 assert.equal(doc.foldstrip,'p q');
 assert.equal(doc.cmd,"cat <<'EOF'\n  indented\nEOF\n");
 assert.equal(doc.after,'z');
 assert.deepEqual(P(`
- |
  in seq
- >-
  folded
  text
- last
`),['in seq\n','folded text','last']);
 assert.equal(P(`
a: >-
  x \${{ y == 'z' }} &&
  (w)
b: 1
`).a,"x ${{ y == 'z' }} && (w)");
});

test('Flow-Listen und -Maps, auch mehrzeilig',()=>{
 assert.deepEqual(P(`
a: [1, 'b', "c", d e, [x, z], {k: v}]
b: []
c: {}
d: ['p/**', 'q',
     'r', # Kommentar
     's']
e: {x: 1, w: [2]}
`),{a:[1,'b','c','d e',['x','z'],{k:'v'}],b:[],c:{},d:['p/**','q','r','s'],e:{x:1,w:[2]}});
});

test('Fuehrendes --- und Windows-Zeilenenden',()=>{
 assert.deepEqual(parseYaml('---\r\na: 1\r\nb:\r\n  - x\r\n'),{a:1,b:['x']});
});

test('Laut statt still: nicht unterstuetzte Konstrukte werfen YamlSubsetError',()=>{
 loud('a: &x 1\nb: *x\n',/Anker|Skalaranfang/);
 loud('a: !!str 1\n',/Skalaranfang/);
 loud('a:\n  <<: b\n',/Merge|Anker/);
 loud('? a\n: b\n',/Skalaranfang|komplex|Mapping|Doppelpunkt/);
 loud('a: |2\n   x\n',/Block-Skalar-Kopf/);
 loud('a: plain\n  continued\n',/unerwartete Einrueckung|mehrzeilig/);
 loud('a: "open\nb: 1\n',/mehrzeilig/);
 loud('a: [1, 2\n',/nicht beendet|Flow/);
 loud('a: 1\na: 2\n',/doppelter Schluessel/);
 loud('a: 1\n---\nb: 2\n',/Dokument|Zeile/);
 loud('a: yes\n',/mehrdeutig/);
 loud('a: off\n',/mehrdeutig/);
 loud('a: 2026-10-14\n',/mehrdeutig/);
 loud('a: 12:30\n',/mehrdeutig/);
 loud('a: 0123\n',/mehrdeutig/);
 loud('a: 1_000\n',/mehrdeutig/);
 loud('a: .inf\n',/mehrdeutig/);
 loud('a: x: y\n',/Doppelpunkt/);
 loud('a:\n\tb: 1\n',/Tab/);
 loud('- - a\n',/verschachtelte/);
 loud('a: "x\\qy"\n',/Escape/);
 loud('a: {x: 1\n',/nicht beendet|Flow/);
 loud('yes: 1\n',/mehrdeutiger Schluessel/);
 loud('a: "x" y\n',/unerwartet/);
 loud('a: [*x]\n',/Anker/);
});

test('Wirft auch bei falsch eingerueckter Folgezeile statt zu raten',()=>{
 loud('a:\n  b: 1\n   c: 2\n',/Einrueckung|Mapping|Doppelpunkt|mehrzeilig/);
});

test('Das echte Pages-Workflow-YAML ist in der Teilmenge parsebar',async()=>{
 const {loadYamlFile}=await import('./helpers/workflow-yaml.mjs');
 const {fileURLToPath}=await import('node:url');
 const wf=loadYamlFile(fileURLToPath(new URL('../../../.github/workflows/pages-release.yml',import.meta.url)));
 assert.equal(typeof wf.name,'string');assert.ok(wf.on&&wf.jobs['company-intelligence-live']);
 assert.equal(wf.on.workflow_dispatch.inputs.company_intelligence_off.type,'boolean');
});
