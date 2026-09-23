# Minimal n8n public-API client (Cloudflare on this host blocks the default Python user agent).
import sys, json, urllib.request, os
sys.path.insert(0, os.path.dirname(__file__)); from env import load
BASE = 'https://qr4v3tgj.rcld.app/api/v1'
def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'X-N8N-API-KEY': load()['N8N_API_KEY'], 'User-Agent': 'Mozilla/5.0 n8n-client',
                 'Accept': 'application/json', 'Content-Type': 'application/json'})
    try:
        r = urllib.request.urlopen(req, timeout=30); t = r.read(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:500].decode(errors='replace')
