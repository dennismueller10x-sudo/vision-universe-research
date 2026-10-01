# Evidence fixtures

The AAPL, NVDA and MSFT consumer fixtures are small selections of actual normalized SEC quarterly facts from repository commit `18bc2dddfaebcf3ec97079364f1203c2c09f83cb`, inspected on 2026-10-01. Their original schema, units, fiscal labels, filing identifiers and source metadata are retained. Pinning them makes non-calendar fiscal-period tests reproducible when production datasets advance.

`ROOT-events.xml` is a reduced response from the first-party public event RSS at <https://ir.joinroot.com/rss/events.xml>, inspected on 2026-10-01. It retains event headlines, links, identifiers and feed dates, without article bodies. It verifies that event dates come from explicit event evidence rather than RSS publication dates.

Live sources change. These fixtures test historical evidence; the opt-in `probe` command tests current source accessibility and produces a separate run/health report. Neither can establish universal source coverage.
