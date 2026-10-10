# Evidence fixtures

The AAPL, NVDA and MSFT consumer fixtures are small selections of actual normalized SEC quarterly facts from repository commit `18bc2dddfaebcf3ec97079364f1203c2c09f83cb`, inspected on 2026-10-01. Their original schema, units, fiscal labels, filing identifiers and source metadata are retained. Pinning them makes non-calendar fiscal-period tests reproducible when production datasets advance.

`ROOT-events.xml` is a reduced response from the first-party public event RSS at <https://ir.joinroot.com/rss/events.xml>, inspected on 2026-10-01. It retains event headlines, links, identifiers and feed dates, without article bodies. It verifies that event dates come from explicit event evidence rather than RSS publication dates.

Live sources change. These fixtures test historical evidence; the opt-in `probe` command tests current source accessibility and produces a separate run/health report. Neither can establish universal source coverage.

`management-content-metadata.json` contains reduced issuer-hosted Q4 FinancialReport service responses retrieved on 2026-10-03 from three unrelated validated IR sites. Only document labels, public links and fiscal grouping fields remain. They exercise presentations, company transcripts, prepared remarks and earnings webcast links without storing the underlying copyrighted documents. Vendor grouping dates deliberately do not become publication/call dates. The coverage-phase evidence file records aggregate counts and a bounded review sample, never the operational ledger or HTTP caches.

Phase 2 metadata fixtures were retrieved on 2026-10-02. `phase2-provenance.json` identifies reduced Root, Affirm, Alphabet and Intel first-party feeds (three headlines/URLs/timestamps each, no descriptions or article bodies). `platform-metadata.json` retains only provider-identifying script/link attributes from two unrelated GCS issuers and two unrelated STOCKPR/Equisolve issuers. These validate generic adapters and fingerprints rather than company-specific scrapers. `phase2-validation.json` records aggregate measurements and validation limits; it contains no credentials, private caches or mirrored articles.
