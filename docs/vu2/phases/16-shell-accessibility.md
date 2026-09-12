# Phase 16 — shell orientation and keyboard access

Base PR78 head59aaa3e5648e7e3d52e1a95834adba669faea0de. Active Master §§9,13,55–58,63–65,83: coherent navigation, responsive experience and keyboard access. Existing experience contract applies; no new research or audit.

Owned: vu2/experience.js/css, scripts/vu2/browser-qa.mjs, this pack and execution ledger. No product/data/provider contracts change.

Implementation: Research location remains marked in professional subviews, exact primary routes use aria-current=page. Skip link targets focusable main. Search announces result count and repeated command shortcut retains the query; native modal containment and return focus remain intact. Tablet navigation receives a complete second row. Comparison definitions use compact spacing with44px disclosure targets.

Acceptance: keyboard-only skip/search/close/return focus on1440 and390; all six primary routes visible at768 without overflow; desktop/mobile Compare still readable. Existing36 browser checks preserved plus2 keyboard and3 tablet cases. Syntax checks targeted; Browser/Quant/SEC CI at phase gate. No provider/full-universe tests needed.

Rollback: revert this additive shell commit. No storage migration, public rollout or changed entitlement.
