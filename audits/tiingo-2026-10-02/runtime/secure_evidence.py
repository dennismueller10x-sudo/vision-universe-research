#!/usr/bin/env python3
"""Encrypt diagnostic artifacts; only authenticated decryption writes plaintext.

The existing TIINGO_API_KEY remains in the environment, never in arguments/logs.
OpenSSL PBKDF2/AES-256-CBC provides confidentiality; a separately derived HMAC
authenticates ciphertext before decryption. This module never calls the provider.
"""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import subprocess

ITERATIONS = 200000
DOMAIN = b'vision-universe-tiingo-audit-auth-v1\0'


def key(salt):
    password = os.environ.get('TIINGO_API_KEY')
    if not password:
        raise ValueError('TIINGO_API_KEY is required; it is never printed')
    return hashlib.pbkdf2_hmac('sha256', password.encode(), DOMAIN + salt, ITERATIONS)


def crypt(source, target, decrypt=False):
    command = ['openssl', 'enc', '-aes-256-cbc', '-md', 'sha256', '-pbkdf2', '-iter', str(ITERATIONS),
               '-in', str(source), '-out', str(target), '-pass', 'env:TIINGO_API_KEY']
    command += ['-d'] if decrypt else ['-salt']
    result = subprocess.run(command, capture_output=True)
    if result.returncode:
        target.unlink(missing_ok=True)
        raise ValueError('Evidence encryption/decryption failed')


def encrypt(source, target):
    salt = secrets.token_bytes(32)
    auth_key = key(salt)
    crypt(source, target)
    body = target.read_bytes()
    target.with_name(target.name + '.auth.json').write_text(json.dumps({
        'schemaVersion': 1, 'cipher': 'OpenSSL AES-256-CBC PBKDF2 SHA256',
        'hmac': 'HMAC-SHA256, independent domain and salt',
        'iterations': ITERATIONS, 'authSalt': salt.hex(),
        'ciphertextSha256': hashlib.sha256(body).hexdigest(),
        'mac': hmac.new(auth_key, body, hashlib.sha256).hexdigest()}, indent=2) + '\n')


def decrypt(source, target):
    metadata = json.loads(source.with_name(source.name + '.auth.json').read_text())
    if metadata['schemaVersion'] != 1 or metadata['iterations'] != ITERATIONS:
        raise ValueError('Unsupported evidence envelope')
    body = source.read_bytes()
    actual = hmac.new(key(bytes.fromhex(metadata['authSalt'])), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(actual, metadata['mac']):
        raise ValueError('Evidence authentication failed; no plaintext written')
    crypt(source, target, decrypt=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['encrypt', 'decrypt'])
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    args = parser.parse_args()
    (encrypt if args.operation == 'encrypt' else decrypt)(args.source, args.target)
    print(json.dumps({'operation': args.operation, 'completed': True, 'providerRequests': 0}))
