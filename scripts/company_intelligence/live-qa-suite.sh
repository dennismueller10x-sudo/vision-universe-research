#!/usr/bin/env bash
# Aktuelle Live-Abnahme der Produktion (bisher inline im Schritt "Actual production hash, access, stock and mobile acceptance").
# Gleicher Ablauf beim ersten Versuch und bei der begrenzten Wiederholung (retry-live-qa.mjs); Berichte unter "$RUNNER_TEMP".
# Rein lesend gegenueber Produktion: kein R2-Schreiben, kein Gate, kein GOOD-Zeiger.
set -e
# Kein Bericht eines frueheren Laufs darf die Klassifikation beeinflussen.
rm -f "$RUNNER_TEMP/live-fast/report.json"
if [ "$FULL_ACCEPTANCE" != true ]; then
  node scripts/company_intelligence/live-production-qa.mjs --routine --out "$RUNNER_TEMP/live-fast"
  exit 0
fi
node scripts/company_intelligence/protected-hydration-qa.mjs
node scripts/company_intelligence/live-production-qa.mjs --out "$RUNNER_TEMP/live-fast"
universe=$(node --input-type=module -e 'import {runtimeCandidate} from "./scripts/company_intelligence/runtime-candidate.mjs";console.log((await runtimeCandidate()).manifest.scope==="PER_ISSUER_ELIGIBILITY")')
if [ "$universe" = true ]; then
  node scripts/company_intelligence/refresh-qa.mjs --live --out "$RUNNER_TEMP/live-universe.json"
  exit 0
fi
node scripts/company_intelligence/discover-beta-qa.mjs --url https://research.visionuniverse.de --candidate docs/company-intelligence/full-data-release-candidate.json --production --phase actual --out "$RUNNER_TEMP/live-cohort"
node scripts/company_intelligence/discover-beta-qa.mjs --url https://research.visionuniverse.de --candidate docs/company-intelligence/full-data-release-candidate.json --production --phase dark --out "$RUNNER_TEMP/live-dark"
node scripts/company_intelligence/consumer-experience-qa.mjs --version after --out "$RUNNER_TEMP/live-v2"
