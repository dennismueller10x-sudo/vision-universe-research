#!/usr/bin/env python3
"""Delivery-only adapter: validate one optional JSON string layer; copy original ciphertext bytes."""
import argparse
import base64
import binascii
import importlib.util
import json
from pathlib import Path
import re

ORIGINAL_MODULE = Path(__file__).with_name('repack-artifact.py')
_spec = importlib.util.spec_from_file_location('current_transport_original_repack', ORIGINAL_MODULE)
_original = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_original)


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('DUPLICATE_CIPHERTEXT_ENVELOPE_KEY')
        result[key] = value
    return result


def approved_file(path, relative):
    if path.is_symlink() or relative.is_absolute() or any(part in ('.', '..') or not re.fullmatch(r'[A-Za-z0-9_.-]+', part) for part in relative.parts):
        raise ValueError('UNAPPROVED_ARTIFACT_PATH')
    if not relative.name.endswith('.sealed.json'):
        return _original_approved_file(path, relative)
    payload = json.loads(path.read_bytes(), object_pairs_hook=_unique_object)
    if isinstance(payload, str):
        # The frozen current exporter quotes encryptForOwner's JSON text once.
        # Validation unwraps it; storage, hashes and ZIP bytes never do.
        payload = json.loads(payload, object_pairs_hook=_unique_object)
    fields = {'schema', 'alg', 'wrappedKey', 'iv', 'tag', 'body'}
    if (not isinstance(payload, dict) or set(payload) != fields
            or payload['schema'] != 'supertrader-sealed-1.0.0'
            or payload['alg'] != 'RSA-OAEP-256+A256GCM+gzip'):
        raise ValueError('CIPHERTEXT_ENVELOPE_REQUIRED')
    for field in ('wrappedKey', 'iv', 'tag', 'body'):
        value = payload[field]
        if not isinstance(value, str) or not value:
            raise ValueError('CIPHERTEXT_FIELD_REQUIRED')
        try:
            base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError('CIPHERTEXT_BASE64_INVALID') from error
    return 'CIPHERTEXT'


_original_approved_file = _original.approved_file
_original.approved_file = approved_file
TARGET_BYTES, MAX_ZIP_BYTES = _original.TARGET_BYTES, _original.MAX_ZIP_BYTES
repack = _original.repack


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(repack(args.input, args.out), sort_keys=True))
    except (ValueError, OSError, json.JSONDecodeError) as error:
        print(json.dumps({'status': 'CURRENT_REPACK_FAILED', 'errorType': type(error).__name__,
                          'code': str(error) if isinstance(error, ValueError) and re.fullmatch(r'[A-Z_]+', str(error)) else 'IO_OR_SCHEMA_ERROR',
                          'deliveryOnly': True, 'performanceCalculated': False}))
        raise SystemExit(2)
