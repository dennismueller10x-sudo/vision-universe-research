import base64
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from domain_prepare import DOMAIN, DomainPreparation, prepare_domain, seal
from prepare import Blocked


class DomainTests(unittest.TestCase):
    def test_write_scope_excludes_sends_contacts_authentication_and_other_domains(self):
        with patch.dict("os.environ", {"BREVO_API_KEY": "synthetic-only"}):
            c = DomainPreparation()
            for method, path, body in (("POST", "/smtp/email", {}), ("POST", "/contacts", {}),
                 ("PUT", "/senders/domains/"+DOMAIN+"/authenticate", None),
                 ("POST", "/senders/domains", {"name":"example.invalid"}),
                 ("GET", "/senders/domains/example.invalid", None)):
                with self.assertRaises(Blocked): c.call(method, path, body)

    def test_missing_matching_active_sender_blocks_registration(self):
        class Fake:
            def call(self, method, path):
                return {"/account": {"plan": [{"type":"free"}]},
                        "/senders": {"senders":[{"email":"synthetic@example.invalid", "active":True}]}}[path]
        with patch("domain_prepare.seal", return_value={}):
            with self.assertRaises(Blocked): prepare_domain(Fake())

    def test_seal_roundtrip_and_tampering_rejection(self):
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public = key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
        original = {"domain":"example.invalid", "dns_records":{"brevo_code":{"value":"synthetic-private-dns"}}}
        with patch("domain_prepare.Path.read_bytes", return_value=public): result=seal(original)
        sealed = base64.b64decode(result["sealed_key"])
        symmetric = key.decrypt(sealed, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=None))
        nonce = base64.b64decode(result["nonce"]); ciphertext=base64.b64decode(result["ciphertext"])
        self.assertEqual(json.loads(AESGCM(symmetric).decrypt(nonce,ciphertext,b"VU-Brevo-DNS-20261010")),original)
        self.assertNotIn("synthetic-private-dns",json.dumps(result))
        with self.assertRaises(Exception): AESGCM(symmetric).decrypt(nonce,ciphertext[:-1]+bytes([ciphertext[-1]^1]),b"VU-Brevo-DNS-20261010")


if __name__ == "__main__": unittest.main()
