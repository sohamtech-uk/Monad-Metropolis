"""Verify Hostinger's shared FTPS service identity at the user-supplied IP.

Hostinger's FTP server presents a CA-issued certificate for hstgr.io and
*.hstgr.io, not for the numeric hosting IP. The destination remains exactly
77.37.37.212. Certificate-chain, expiry, and hostname verification stay enabled.
No credentials are sent until this verified TLS connection succeeds.
"""
import hashlib
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'hostinger_deployment', Path(__file__).with_name('deploy-hostinger-once.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def verified_hostinger_identity():
    client = module.tls_connect('hstgr.io')
    try:
        fingerprint = hashlib.sha256(client.sock.getpeercert(binary_form=True)).hexdigest()
        return 'hstgr.io', fingerprint
    finally:
        client.close()


module.discover_tls_name = verified_hostinger_identity
module.main()
