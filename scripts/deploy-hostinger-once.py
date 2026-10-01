"""Deploy the tested static bundle to the existing Hostinger site only.

The FTP password arrives RSA-OAEP encrypted for this run's ephemeral key.
The private key and decrypted password never enter the repository or artifacts.
TLS is verified before credentials are used. No DNS or Vercel changes.
"""
from __future__ import annotations

import base64
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path
import re
import socket
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

REPO = os.environ['GITHUB_REPOSITORY']
BRANCH = os.environ['GITHUB_REF_NAME']
RUN = os.environ['GITHUB_RUN_ID']
TOKEN = os.environ['GH_TOKEN']
IP = '77.37.37.212'
USER = 'u417089017.metropolis.cherrymoney.co.uk'
SITE = 'https://metropolis.cherrymoney.co.uk'
ROOT = '/public_html'
WEB = Path(os.environ['RUNNER_TEMP']) / 'web'
RUNTIME = 'deploy-runtime'
CREDENTIAL_PATH = f'{RUNTIME}/credentials-{RUN}.json'
STATUS_PATH = f'{RUNTIME}/status.json'


def api(path, method='GET', payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        'https://api.github.com/repos/' + REPO + '/' + path,
        data=data, method=method,
        headers={'Authorization': 'Bearer ' + TOKEN,
                 'Accept': 'application/vnd.github+json',
                 'X-GitHub-Api-Version': '2022-11-28',
                 'Content-Type': 'application/json',
                 'User-Agent': 'Cherry-Hostinger-Deployment'})
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)


def read_repo_file(path):
    try:
        item = api('contents/' + path + '?ref=' + urllib.parse.quote(BRANCH, safe=''))
        return item, json.loads(base64.b64decode(item['content']))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None, None
        raise


def publish(stage, **details):
    item, _ = read_repo_file(STATUS_PATH)
    document = {'stage': stage, 'run_id': RUN, 'branch': BRANCH,
                'site': SITE, 'time_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                **details}
    body = {'message': 'ops: Hostinger deployment ' + stage,
            'branch': BRANCH,
            'content': base64.b64encode(json.dumps(document, indent=2).encode()).decode()}
    if item:
        body['sha'] = item['sha']
    api('contents/' + STATUS_PATH, 'PUT', body)
    print('Deployment stage:', stage, flush=True)


def remove_encrypted_credential():
    try:
        item, _ = read_repo_file(CREDENTIAL_PATH)
        if item:
            api('contents/' + CREDENTIAL_PATH, 'DELETE',
                {'message': 'ops: remove consumed encrypted one-time credential',
                 'sha': item['sha'], 'branch': BRANCH})
    except Exception:
        # Ciphertext is useless after the run-specific private key is destroyed.
        print('Encrypted credential cleanup deferred; no plaintext was stored.', flush=True)


def tls_connect(name):
    client = ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=25)
    client.connect(IP, 21)
    client.host = name  # Name verified by TLS, connection remains at the supplied IP.
    client.auth()
    return client


def discover_tls_name():
    try:
        client = tls_connect(IP)
        certificate_hash = hashlib.sha256(client.sock.getpeercert(binary_form=True)).hexdigest()
        client.close()
        return IP, certificate_hash
    except ssl.SSLCertVerificationError:
        pass

    # Certificate inspection ONLY: no password or USER command is sent here.
    probe = subprocess.run(
        ['openssl', 's_client', '-starttls', 'ftp', '-connect', IP + ':21', '-showcerts'],
        input='', capture_output=True, text=True, timeout=30)
    match = re.search(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----',
                      probe.stdout, re.S)
    if not match:
        raise RuntimeError('Hostinger did not present an inspectable FTPS certificate.')
    info = subprocess.run(['openssl', 'x509', '-noout', '-subject', '-ext', 'subjectAltName'],
                          input=match.group(0), capture_output=True, text=True, check=True)
    names = [n for n in re.findall(r'DNS:([^,\s]+)', info.stdout) if '*' not in n]
    try:
        reverse_name, aliases, _ = socket.gethostbyaddr(IP)
        names = [reverse_name, *aliases, *names]
    except OSError:
        pass
    names.append('metropolis.cherrymoney.co.uk')
    suffixes = ('.main-hosting.eu', '.hstgr.io', '.hstgr.cloud', '.hostinger.com', '.hostinger.io')
    for name in dict.fromkeys(n.lower().rstrip('.') for n in names):
        if name != 'metropolis.cherrymoney.co.uk' and not name.endswith(suffixes):
            continue
        try:
            addresses = {row[4][0] for row in socket.getaddrinfo(name, 21)}
            if IP not in addresses:
                continue
            client = tls_connect(name)
            fingerprint = hashlib.sha256(client.sock.getpeercert(binary_form=True)).hexdigest()
            client.close()
            return name, fingerprint
        except (OSError, ssl.SSLError, ftplib.Error):
            continue
    raise RuntimeError('Could not establish hostname-verified FTPS. No credentials were sent.')


def http_get(path):
    url = SITE + path
    sep = '&' if '?' in url else '?'
    req = urllib.request.Request(url + sep + 'deploy_check=' + RUN,
                                 headers={'Cache-Control': 'no-cache',
                                          'User-Agent': 'Cherry-Deployment-Check'})
    with urllib.request.urlopen(req, timeout=25) as response:
        return response.status, response.read()


def graphql_check():
    try:
        req = urllib.request.Request(SITE + '/graphql/',
                                     data=b'{"query":"{ __typename }"}',
                                     headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=25) as response:
            value = json.load(response)
            return response.status == 200 and value.get('data', {}).get('__typename') == 'query_root'
    except Exception:
        return False


def remote_read(client, path):
    output = io.BytesIO()
    try:
        client.retrbinary('RETR ' + path, output.write)
        return output.getvalue()
    except ftplib.error_perm as exc:
        if str(exc).startswith('550'):
            return None
        raise


def mkdirs(client, absolute):
    parts = absolute.strip('/').split('/')
    current = ''
    for part in parts:
        current += '/' + part
        try:
            client.mkd(current)
        except ftplib.error_perm:
            previous = client.pwd()
            client.cwd(current)  # Do not hide permission errors as 'already exists'.
            client.cwd(previous)


def atomic_write(client, path, content):
    mkdirs(client, str(Path(path).parent))
    temp = path + '.deploy-' + RUN + '.tmp'
    client.storbinary('STOR ' + temp, io.BytesIO(content))
    if remote_read(client, temp) != content:
        raise RuntimeError('Upload integrity check failed for ' + path)
    client.rename(temp, path)


def deploy(password, tls_name, fingerprint):
    client = tls_connect(tls_name)
    if hashlib.sha256(client.sock.getpeercert(binary_form=True)).hexdigest() != fingerprint:
        client.close()
        raise RuntimeError('FTPS certificate changed during this deployment; upload stopped.')
    client.login(USER, password)
    client.prot_p()
    client.set_pasv(True)
    client.cwd(ROOT)  # Fail closed; never guess another website document root.
    original_listing = client.nlst()
    gql_before = graphql_check()
    associations = {}
    for path in ['.well-known/apple-app-site-association', '.well-known/assetlinks.json']:
        existing = remote_read(client, ROOT + '/' + path)
        if existing is not None:
            associations[path] = existing
    if not associations:
        raise RuntimeError('Expected mobile passkey association files not found; root identity requires review.')
    if not any(b'uk.co.cherrymoney.metropolis' in value for value in associations.values()):
        raise RuntimeError('Passkey files do not identify the Metropolis app; wrong root suspected.')

    files = {str(p.relative_to(WEB)): p.read_bytes() for p in WEB.rglob('*') if p.is_file()}
    if 'index.html' not in files or not any(p.startswith('_expo/') for p in files):
        raise RuntimeError('The tested artifact is missing its HTML or JavaScript assets.')
    permitted = {'index.html', 'favicon.ico', 'metadata.json'}
    selected = {path: content for path, content in files.items()
                if path in permitted or path.startswith('_expo/')}
    # Existing .well-known, .htaccess, and graphql files are intentionally never overwritten.
    ordered = sorted(selected, key=lambda p: (p == 'index.html', p))
    backup_root = '/.cherry-deployment-backups/' + RUN
    mkdirs(client, backup_root)
    originals = {}
    installed = []
    placeholder_moved = False
    try:
        publish('uploading', tls_hostname=tls_name, source_run_id=36842563695,
                source_commit='231124115ed632fb65b3a10000e2b403f738ea07',
                files=ordered, graphql_before=gql_before,
                preserved=['.htaccess', 'graphql/', '.well-known/'])
        for path in ordered:
            originals[path] = remote_read(client, ROOT + '/' + path)
            if originals[path] is not None:
                target = backup_root + '/' + path
                mkdirs(client, str(Path(target).parent))
                client.storbinary('STOR ' + target, io.BytesIO(originals[path]))
            atomic_write(client, ROOT + '/' + path, selected[path])
            installed.append(path)
            print('Uploaded and verified:', path, flush=True)

        # Hostinger's default.php can take precedence. Move ONLY the recognised placeholder.
        status, live = http_get('/')
        if live != selected['index.html']:
            default = remote_read(client, ROOT + '/default.php')
            if default and b'hostinger' in default.lower() and (
                b'You Are All Set to Go' in default or b'upload your website files' in default.lower()
            ):
                client.rename(ROOT + '/default.php', backup_root + '/default.php')
                placeholder_moved = True
            for attempt in range(6):
                status, live = http_get('/')
                if live == selected['index.html']:
                    break
                time.sleep(5)
        if status != 200 or live != selected['index.html']:
            raise RuntimeError('Root URL did not return the uploaded index.html; rolling back.')
        checks = {'root_http_200': True, 'root_matches_tested_build': True}
        for path, content in selected.items():
            code, body = http_get('/' + path)
            if code != 200 or hashlib.sha256(body).digest() != hashlib.sha256(content).digest():
                raise RuntimeError('Live asset check failed: ' + path)
        checks['all_static_assets_match'] = True
        for path, original in associations.items():
            if remote_read(client, ROOT + '/' + path) != original:
                raise RuntimeError('Passkey association changed unexpectedly: ' + path)
            code, body = http_get('/' + path)
            if code != 200 or json.loads(body) != json.loads(original):
                raise RuntimeError('Public passkey association check failed: ' + path)
        checks['passkey_files_unchanged'] = True
        checks['graphql'] = graphql_check()
        if gql_before and not checks['graphql']:
            raise RuntimeError('Existing GraphQL health check regressed; rolling back.')
        checks['htaccess_and_graphql_untouched'] = True
        publish('deployed', checks=checks, uploaded_files=installed,
                source_run_id=36842563695,
                source_commit='231124115ed632fb65b3a10000e2b403f738ea07',
                backup_path=backup_root, placeholder_moved=placeholder_moved,
                note='No payments executed. Interactive passkey/payment testing remains a user action.')
    except Exception:
        print('Restoring previous front-end files.', flush=True)
        for path in reversed(installed):
            old = originals[path]
            if old is not None:
                atomic_write(client, ROOT + '/' + path, old)
            else:
                try:
                    client.delete(ROOT + '/' + path)
                except ftplib.Error:
                    pass
        if placeholder_moved:
            client.rename(backup_root + '/default.php', ROOT + '/default.php')
        raise
    finally:
        client.close()


def main():
    with tempfile.TemporaryDirectory(prefix='cherry-hostinger-') as temporary:
        key_path = Path(temporary) / 'run-key.pem'
        subprocess.run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:3072',
                        '-out', str(key_path)], check=True, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL)
        key_path.chmod(0o600)
        public_key = subprocess.run(['openssl', 'pkey', '-in', str(key_path), '-pubout'],
                                    check=True, capture_output=True, text=True).stdout
        try:
            tls_name, fingerprint = discover_tls_name()
            publish('awaiting_encrypted_credential', tls_hostname=tls_name,
                    certificate_sha256=fingerprint, public_key_pem=public_key,
                    credential_path=CREDENTIAL_PATH,
                    source_run_id=36842563695)
            envelope = None
            for _ in range(84):
                _, envelope = read_repo_file(CREDENTIAL_PATH)
                if envelope:
                    break
                time.sleep(5)
            if not envelope:
                raise RuntimeError('Timed out awaiting the encrypted run credential; no upload attempted.')
            if str(envelope.get('run_id')) != RUN:
                raise RuntimeError('Credential envelope belongs to a different run.')
            ciphertext = base64.b64decode(envelope['ciphertext'], validate=True)
            result = subprocess.run(
                ['openssl', 'pkeyutl', '-decrypt', '-inkey', str(key_path),
                 '-pkeyopt', 'rsa_padding_mode:oaep', '-pkeyopt', 'rsa_oaep_md:sha256',
                 '-pkeyopt', 'rsa_mgf1_md:sha256'],
                input=ciphertext, check=True, capture_output=True)
            credential = json.loads(result.stdout)
            if credential.get('host') != IP or credential.get('username') != USER:
                raise RuntimeError('Credential is not scoped to the requested Hostinger account.')
            if str(credential.get('run_id')) != RUN or time.time() > credential['expires_at']:
                raise RuntimeError('Credential expired or has the wrong run identifier.')
            password = credential['password']
            # GitHub redacts this value from any subsequent accidental exception/log output.
            print('::add-mask::' + password.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A'))
            remove_encrypted_credential()
            deploy(password, tls_name, fingerprint)
        except Exception as exc:
            publish('failed', error=type(exc).__name__ + ': ' + str(exc),
                    note='Check workflow logs. Upload is rolled back when a post-upload check fails.')
            raise
        finally:
            remove_encrypted_credential()


if __name__ == '__main__':
    main()
