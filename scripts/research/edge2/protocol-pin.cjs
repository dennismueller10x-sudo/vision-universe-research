'use strict';
// SHA-256 des eingefrorenen Protokolls docs/research/edge2/PROTOKOLL.json (vor dem ersten Lauf).
module.exports = { PROTOCOL_FILE: 'docs/research/edge2/PROTOKOLL.json', PROTOCOL_SHA256: '435f50f97306a5c2eb34518bed6210da11d04cd40441b71b69cb2b3dc4c2fb49',
  // Blinder KI-Backtest docs/research/edge2/ki/BLIND_PROTOKOLL.json (vor dem Paketbau).
  BLIND_PROTOCOL_FILE: 'docs/research/edge2/ki/BLIND_PROTOKOLL.json', BLIND_PROTOCOL_SHA256: 'b031533d17d508477fbd298091f88d234ddb399e0f5755211afef930055debfe',
  // Ergänzung 1 zum blinden KI-Backtest (Prompt v2, 4–20 Titel), vor der ersten Entscheidung.
  BLIND_AMENDMENT_1_FILE: 'docs/research/edge2/ki/BLIND_ERGAENZUNG_1.json', BLIND_AMENDMENT_1_SHA256: '022e4835250bd5f052ae462461c47146c0038c605a7f360b975e2d8eb4b22d01',
  // Gewinner-DNA docs/research/edge2/dna/PROTOKOLL.json (vor der Lernphase); RULE_FIXED wird nach der Lernphase gepinnt.
  DNA_PROTOCOL_FILE: 'docs/research/edge2/dna/PROTOKOLL.json', DNA_PROTOCOL_SHA256: 'dac560dff4f1061fd0a54d4c7012cf498834007b19d6a7794c47e94ba6bf075e', DNA_RULE_FIXED_SHA256: '8828fb1e912e4a79fd8e4c442c48074bbb6173c78d0bb946348ae2311876a537' };
