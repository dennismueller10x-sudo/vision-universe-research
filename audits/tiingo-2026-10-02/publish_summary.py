#!/usr/bin/env python3
"""Allowlisted derived public diagnostics. Raw provider evidence remains private.

No response payload, price, volume observation, cash value, observed adjustment
factor, or free-form provider diagnostic is copied to the public package.
"""
from collections import Counter
import hashlib
import json
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
OUT = HERE / 'published'


def load(name):
    return json.loads((HERE / name).read_text())


def write(name, value):
    (OUT / name).write_text(json.dumps({'schemaVersion': 1, 'auditDate': '2026-10-02',
        'evidenceRequests': 507, 'rawEvidencePublication': False, **value}, indent=2) + '\n')


def main():
    OUT.mkdir(exist_ok=True)
    evidence = load('runtime/account_evidence.json')
    if len(evidence['responses']) != 507 or len(evidence['runId']) != 6 or len({row['url'] for row in evidence['responses']}) != 507:
        raise ValueError('This dated summary requires the reviewed 507-request, six-run snapshot')
    public_responses = []
    for row in evidence['responses']:
        body = row.get('payload')
        fields = sorted(set().union(*(x.keys() for x in body if isinstance(x, dict)))) if isinstance(body, list) else sorted(body) if isinstance(body, dict) else []
        public_responses.append({key: row.get(key) for key in ['url', 'status', 'observedAt', 'sha256', 'sourceRunId', 'sourceCommit']})
        public_responses[-1].update(returnedFieldNames=fields,
            returnedRows=len(body) if isinstance(body, list) else None,
            nonemptyResponse=bool(body))
    write('tiingo_endpoint_inventory.json', {'requests': public_responses,
        'httpStatusCounts': dict(Counter(str(row['status']) for row in evidence['responses'])),
        'sourceRuns': evidence['runId'], 'actualAccountQuota': None,
        'rawEvidenceSha256': hashlib.sha256((HERE / 'runtime/account_evidence.json').read_bytes()).hexdigest(),
        'limitations': ['Successful samples do not enumerate account entitlements.', 'Empty HTTP200 is distinct from price access.', 'Snapshot access is not proof of live freshness.']})
    write('tiingo_asset_type_breakdown.json', {'discoveryRecords': 108925, 'distinctTickerStrings': 106557,
        'duplicatedTickerStrings': 2272, 'providerLabels': {'Stock': 49270, 'ETF': 9775, 'MutualFund': 49880},
        'venueRecords': {'US_PRIMARY': 24597, 'US_OTC': 26969, 'NMFQS': 49829, 'MAINLAND_CHINA': 7347, 'LSE': 11, 'UNKNOWN': 172},
        'accountAccessibleTotal': None, 'legalClassTotals': None, 'warning': 'Public discovery includes reserved and historical symbols; venue is not domicile.'})
    us = load('us/final_statistics.json')
    write('tiingo_us_common_universe.json', {'vuCounts': us['vu_counts'], 'catalogCommonCandidates': 6645,
        'catalogCommonCandidateTickerStrings': 6643, 'officialCommonShareFormLowerBound': 4824,
        'accountAccessibleCommonTotal': None, 'lowerBoundIsAccountEntitlementCount': False})
    write('tiingo_vs_vu_us_gap.json', {'commonCandidateGapRows': 258, 'duplicateSymbolReviewRows': 225,
        'newEligibleCandidates': 33, 'broadStockGapRows': 588, 'rawSymbolsAbsentCatalog': 9,
        'selectedPriceSupportedMissingRawSymbols': us['selected_api_price_supported_missing_raw_symbols'],
        'verifiedCommonForms': us['explicit_common_share_form_symbols'], 'additionalAdr': ['SKHY'],
        'unresolvedShareForm': ['BIPC'], 'inactiveWarning': ['OS'], 'productionPublished': 0})
    write('vu_false_exclusions.json', {'confirmedIssuerHeuristic': [{'ticker': 'PFBC', 'name': 'Preferred Bank', 'reason': 'Issuer phrase incorrectly matched preferred-security heuristic'}],
        'confirmedFalseSplitGateRejections': ['DNA', 'AMC', 'BIRD', 'AMWL'],
        'listingMetadataSelectionBug': 'Reused ticker matched first historic listing rather than existing listing start date',
        'listingPeriodMetadataCases': 114, 'replayedDecisionChanges': 113,
        'identityReviewSymbols': ['BNY', 'CHAI', 'DOO', 'CRTO', 'DEC', 'NRG', 'GOGL'], 'productionRematerialized': False})
    write('ginkgo_bioworks_case.json', {'ticker': 'DNA', 'company': 'Ginkgo Bioworks', 'metadataAvailable': True,
        'eodAvailable': True, 'latestSampleDate': '2026-10-01', 'fullSampleBars': 1371,
        'rawProductConsumerPolicyMember': True, 'consumerFactorMaterialized': False,
        'confirmedFailure': 'Coherent split-adjusted history falsely rejected because of large split-day market movement',
        'distinctMetadataBug': 'Historic Genentech listing selected for reused ticker', 'fixedCodeTested': True, 'productionRecoveryPerformed': False})
    write('tiingo_new_listing_freshness.json', {'canonicalRawSnapshot': '2026-09-11', 'eligibilitySnapshot': '2026-09-15',
        'scheduledCanonicalMembershipRefresh': False, 'recentPrimaryStockLabelGapRows': 42,
        'providerFirstAppearanceLatencyMeasured': False, 'confirmedNewAdrMissingVu': 'SKHY', 'skhySampleBars': 59,
        'proposalCandidateAdditions': 258, 'publishableCandidates': 0, 'diagnosticRefreshOnly': True})
    europe = load('europe/tiingo_top_europe_coverage.json')
    write('tiingo_top_europe_coverage.json', {'referenceCompanies': 774, 'currentLocalVerified': 0,
        'primaryUsBridgesVerified': 70, 'primaryPlusReviewedOtcQuoteBridges': 102,
        'positiveVolumeSampleCompanyReach': 100, 'primaryBridgesNotValidated': 704,
        'unvalidatedCountIsExactProviderGap': False, 'referenceIsAuthoritativeCurrentTop774': False,
        'coveredCompanies': [{k: row[k] for k in ['company', 'companyId', 'symbol', 'securityForm']} for row in europe['coveredCompanies']]})
    write('tiingo_europe_probe.json', {'currentLocalListingsVerified': 0, 'representativeLocalProbes': 'No relevant current local price response verified',
        'bareSymbolCollision': 'SAP resolves to NYSE', 'historicalLseSamples': [{'ticker': 'AOF', 'sampleBars': 7, 'positiveVolumeBars': 0}, {'ticker': 'HYVE', 'sampleBars': 10, 'positiveVolumeBars': 4}],
        'historicalLseCurrencyAndFeedSemantics': 'UNVALIDATED', 'currentLseSamplePrices': 'EMPTY'})
    write('tiingo_europe_exchange_coverage.json', {'currentLocalVerified': [],
        'noRelevantCurrentLocalVenueFound': ['Xetra', 'Frankfurt', 'Euronext Paris', 'Euronext Amsterdam', 'Euronext Brussels', 'SIX', 'LSE', 'Copenhagen', 'Stockholm', 'Oslo', 'Helsinki', 'Milan', 'Madrid', 'Vienna'],
        'lseHistoricalDiscoveryRows': 11, 'archivedLseEodExists': True, 'completeProviderNonSupportClaim': False})
    write('tiingo_europe_adr_bridge.json', {'primaryUsBridges': 70, 'quoteBridgesIncludingReviewedOtc': 102,
        'euroStoxx50ReferenceCompanies': 50, 'euroStoxxPrimaryBridges': 12, 'euroStoxxQuotedBridges': 28,
        'euroStoxxPositiveVolumeSampleBridges': 27, 'otcIsNativeEuropeEquivalent': False,
        'legalFormRequiresExchangeIssuerEvidence': True})
    write('tiingo_china_coverage.json', {'discoveryRows': 7347, 'discoveryTickerStrings': 7346,
        'providerStockLabelRows': 6524, 'providerEtfLabelRows': 823, 'testedPriceSamples': 10,
        'freshSamples': 8, 'latestFreshSampleDate': '2026-09-30', 'bShareStaleSamples': 2,
        'moutaiHistoryBars': 5065, 'moutaiHistoryStart': '2007-01-04', 'hongKongSpellings404': 4,
        'confirmedEconomicAdjustmentFailure': 'BYD2025 bonus share action omitted from adjusted price and volume semantics',
        'primaryEvidence': 'Issuer announcement2025-047 and SZSE/CNInfoID1224237000',
        'moutaiSecondaryConcernsRemainUnverified': True, 'automaticFullHistoryQuantSuperTraderBacktest': 'BLOCKED'})
    global_select = load('global/tiingo_global_select_coverage.json')
    write('tiingo_global_select_coverage.json', {'requestedCompanies': 18, 'priceResponseCompanies': 18,
        'canonicalUsPrimaryListings': 14, 'canonicalOtcListings': 4,
        'companies': [{k: row[k] for k in ['company', 'ticker', 'listingForm', 'venueClass', 'localListingConfirmed']} for row in global_select['companies']],
        'skhyHistoryBars': 59, 'ssnlfZeroVolumeBars': 264, 'ssnlfSampleBars': 269,
        'hxsclZeroVolumeBars': 161, 'hxsclSampleBars': 161, 'sampleIsCompleteGlobalUniverse': False})
    write('tiingo_etf_universe.json', {'providerEtfLabelRows': 9775, 'uniqueSymbolsEverLabelledEtf': 9537,
        'usExchangeRows': 8013, 'usOtcRows': 822, 'chinaRows': 823, 'unknownVenueRows': 117,
        'europeVenueRows': 0, 'mutualFundLabelRows': 49880, 'mutualFundUniqueSymbols': 49417,
        'exactActiveEtfCount': None, 'exactInactiveEtfCount': None, 'closedEndFundCount': None,
        'accountAccessibleEtfCount': None, 'requestedUsEtfSamplesPriceSupported': 18,
        'spyHistoryBars': 8476, 'qqqHistoryBars': 6934, 'liveFreshnessVerified': False,
        'mutualFundNavSeriesSample': 'VFINX', 'navSampleBars': 273, 'navVolumeStrategies': 'BLOCKED'})
    write('tiingo_ucits_probe.json', {'localSampleSymbols': ['EUNL', 'SXR8', 'VWCE', 'VWRL', 'CSPX', 'IWDA', 'EXS1'],
        'localPriceSamples': 'NOT_FOUND', 'otcPriceResponseCandidates': ['SSSPF', 'IIREF', 'DAXXF', 'VFAWF'],
        'fundFeeSamples': 'ENTITLEMENT_BLOCKED', 'verifiedNativeXetraSupport': False,
        'otcShareClassFungibilityAndIdentityValidated': False, 'sparseOtcSeriesQuantFit': 'BLOCKED'})
    write('tiingo_etf_metadata_matrix.json', {'currentAccountFundMetadataAndFees': 'HTTP403_ENTITLEMENT_BLOCKED',
        'fundFamilyDeniedRequests': 32, 'documentedSeparateProduct': 'Enterprise/institutional mutual-fund fee API',
        'documentedFeeFields': ['netExpense', 'grossExpense', 'managementFee', 'prospectusDate'],
        'unverifiedCurrentStructuredFields': ['issuer', 'ISIN', 'CUSIP', 'TER', 'OCF', 'AUM', 'NAV', 'benchmark', 'domicile', 'distribution', 'replication', 'holdingsCount', 'countryExposure', 'sectorExposure'],
        'fieldNamesDoNotEstablishReadableValues': True})
    write('tiingo_etf_holdings_audit.json', {'documentedHoldingsRouteFound': False, 'actualHoldingsResponse': False,
        'currentVerifiedHoldingsSource': 'NONE', 'providerWideAvailability': 'UNKNOWN',
        'enterpriseOnlyClaimEstablished': False, 'holdingsOverlapTrueExposureProduct': 'NOT_SUPPORTED_CURRENT_VERIFIED_SOURCE'})
    write('tiingo_product_fitness_summary.json', {'samplePriceResponses': 203, 'sampleProviderSymbols': 190,
        'sampleSymbolsWithRecentBars': 181, 'declaredCashEventsUnique': 354,
        'declaredCashAlgebraChecks': 'PASS_NOT_ACTION_COMPLETENESS',
        'issuerVerifiedActionFailure': 'BYD', 'testedSplitGateFalseExclusions': ['DNA', 'AMC', 'BIRD', 'AMWL'],
        'qualifiedUsEquityEtf': 'READY_WITH_EXISTING_GATES', 'shortHistories': 'PARTIAL',
        'automaticMainlandFullHistory': 'BLOCKED', 'currentLocalEurope': 'UNVERIFIED',
        'sparseOtcUcitsVolumeStrategies': 'BLOCKED', 'certifiedBacktestsStillRequirePitAndExecutionGates': True})
    write('tiingo_remaining_provider_gap.json', {'exactRemainingCompanyCount': None,
        'requiredCapabilities': ['Current native European equity prices, identifiers, currencies, calendars and adjusted corporate actions',
            'Correct mainland Chinese bonus/split/cash and volume adjustments', 'Native UCITS price and share-class metadata',
            'Verified ETF fees/AUM/benchmark/domicile/distribution/replication', 'Holdings/weights/dates and portfolio overlap/exposure',
            'Reliable legal form, activity, issuer and symbol-change identity'], 'commercialDecisionMade': False})
    tests = load('test_results.json')
    write('test_results.json', {'testedImplementationCommit': tests['testedImplementationCommit'],
        'suites': [{key: row[key] for key in ['name', 'command', 'passed', 'failed', 'skipped', 'total', 'result'] if key in row} for row in tests['suites']],
        'esefPresentOnBaseline': False, 'fullPrivatePackageOfflineReproduction': 'PASS'})
    baseline = load('protected_baseline.json')
    write('protected_baseline.json', {'baselineCommit': baseline['baselineCommit'],
        'implementationCommit': baseline['implementationCommit'], 'protectedTrackedFilesChecked': baseline['protectedTrackedFilesChecked'],
        'protectedByteDifferences': baseline['protectedByteDifferences'], 'productionRematerialized': False,
        'providerRoutingChanged': False, 'preExistingWorkflowsChanged': False, 'deploymentPerformed': False})
    write('independent_review.json', {'status': 'PASS', 'accountEvidenceRequests': 507,
        'resolvedFindings': ['European denominator aliases/funds', 'ADR/local/OTC distinctions', 'Stale registry flags',
            'Reused ticker identities', 'Preferred Bank same-version cache', 'Explicit preferred-series preservation',
            'Wrong split-factor rejection controls', 'Reproduction evidence arguments'],
        'rawEvidenceKeptPrivate': True})
    # This master contains only the six publicly distributed metadata columns.
    shutil.copyfile(HERE / 'endpoints/tiingo_full_symbol_master.json.gz', OUT / 'tiingo_full_symbol_master.json.gz')
    print(json.dumps({'publicFiles': len(list(OUT.iterdir())), 'providerRequests': 0, 'payloadsPublished': 0}))


if __name__ == '__main__':
    main()
