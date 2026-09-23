"""Minimal ElevenLabs API client.

Falls back to resolving the host via public DNS (1.1.1.1 / 8.8.8.8) when the
local resolver can't (some routers fail on elevenlabs.io); TLS still verifies
against the real hostname.
"""
import http.client, json, os, socket, ssl, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
from env import load

HOST = 'api.elevenlabs.io'


def _resolve():
    try:
        socket.getaddrinfo(HOST, 443)
        return None  # system DNS works
    except socket.gaierror:
        for server in ('1.1.1.1', '8.8.8.8'):
            out = subprocess.run(['dig', '+short', HOST, f'@{server}'], capture_output=True, text=True).stdout.split()
            ips = [x for x in out if x.replace('.', '').isdigit()]
            if ips:
                return ips[0]
        raise


class _Conn(http.client.HTTPSConnection):
    def __init__(self, ip):
        super().__init__(HOST, 443, timeout=60, context=ssl.create_default_context())
        self._ip = ip

    def connect(self):
        if not self._ip:
            return super().connect()
        sock = socket.create_connection((self._ip, 443), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=HOST)


_IP = _resolve()


def call(method, path, body=None):
    conn = _Conn(_IP)
    headers = {'xi-api-key': load()['ELEVENLABS_API_KEY'], 'Content-Type': 'application/json', 'User-Agent': 'oriki-setup'}
    conn.request(method, path, None if body is None else json.dumps(body), headers)
    r = conn.getresponse()
    text = r.read().decode(errors='replace')
    try:
        return r.status, json.loads(text) if text else None
    except json.JSONDecodeError:
        return r.status, text[:500]
