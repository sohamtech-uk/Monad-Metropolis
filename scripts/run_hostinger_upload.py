"""Upload only to the supplied Hostinger IP over fully verified FTPS.

The server presents Hostinger's shared CA-issued hstgr.io certificate.
The workflow validates the selected source run before invoking this uploader.
"""
import hashlib
import importlib.util
import os
from pathlib import Path
import re

source_run = os.environ.get('SOURCE_RUN_ID', '36842563695')
source_commit = os.environ.get('SOURCE_COMMIT', '231124115ed632fb65b3a10000e2b403f738ea07')
if not source_run.isdigit() or not re.fullmatch('[0-9a-f]{40}', source_commit):
    raise ValueError('Invalid tested artifact provenance')

spec = importlib.util.spec_from_file_location(
    'hostinger_deployment', Path(__file__).with_name('deploy-hostinger-once.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
original_publish = module.publish


def publish_with_provenance(stage, **details):
    details['source_run_id'] = int(source_run)
    details['source_commit'] = source_commit
    return original_publish(stage, **details)


def verified_hostinger_identity():
    client = module.tls_connect('hstgr.io')
    try:
        fingerprint = hashlib.sha256(client.sock.getpeercert(binary_form=True)).hexdigest()
        return 'hstgr.io', fingerprint
    finally:
        client.close()


module.publish = publish_with_provenance
module.discover_tls_name = verified_hostinger_identity
module.main()
