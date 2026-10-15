#!/usr/bin/env bash
# Browser-Abhaengigkeiten fuer die Live-QA (pages-release.yml, Job company-intelligence-live).
# Gleicher Ablauf beim ersten Versuch und bei der begrenzten Wiederholung (retry-live-qa.mjs). Veraendert keinen Produktions- oder R2-Zustand.
set -e
npm install --prefix /tmp/ci-live --no-audit --no-fund playwright@1.55.0
node scripts/company_intelligence/install-browser-deps.mjs /tmp/ci-live/node_modules/.bin/playwright
