"""Offline test suite for the SEC Financial Data Core.

No test in this package makes a network request. Real SEC validation runs in
.github/workflows/update-sec-fundamentals.yml against data.sec.gov.
"""
import logging

# Keep expected retry/backoff warnings out of the test output.
logging.getLogger("vu").setLevel(logging.CRITICAL)
