# Phase 11 — personal Watchlist experience

Base: PR73 15df15248bf9ad6ce8e178f8a1ae265530a60e2d. Main remains533245e. State: IMPLEMENTED; review/browser gate pending.

## Active requirements
Master §§8,14,46,67: personal exploration, shared intelligence, honest changes, no production mocks. Architecture Delta Watchlist/Portfolio ADAPT. Existing snapshot-based legacy workspace remains accessible; no feature deletion.

## Owned files and contracts
quant/api/watchlist-workspace.js defines explicit ticker selection, empty first use, validated versioned local persistence and projection. Product service applies existing approved universe plus raw quote policy; no provider JSON in UI. vu2/experience.js/css and index.html provide responsive editor, evidence and per-ticker Signals handoff. Targeted tests and existing browser QA are extended.

## Acceptance criteria
- Add/remove/save/reload personal selection; no auto-seeded positions, unknown tickers retained as unavailable.
- Same values/definitions as Stock and Screener, no new score or formula.
- Missing source does not erase selection. Invalid saved data is not automatically overwritten.
- Existing vu.quant.watchlist.v1 remains untouched and directly reachable. No ambiguous import of generated demo selection as user intent.
- Existing derived grant never authorizes raw quote. No new public display set.
- Distinguish current trend state from historical transition. No push service, realtime/PIT or background monitoring claim.
- Desktop1440 and Mobile390 render/inspect, editable journey including unavailable selection and Signals context.

## Tests and rollback
23 focused service/storage tests PASS. Browser QA adds Watchlist journey to existing suite (32 view/width checks). Broader Quant/SEC gates at PR publication. No provider backfill. Revert this additive phase to restore legacy links; both browser storage keys remain intact.
