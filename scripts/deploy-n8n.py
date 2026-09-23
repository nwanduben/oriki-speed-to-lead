#!/usr/bin/env python3
"""Push the built workflows (n8n/build/*.json) to n8n and activate them.

Creates each workflow the first time (ids saved in n8n/deployed.json), then
updates it in place on later runs. Run `node scripts/build-n8n.mjs` first.
Needs N8N_API_KEY in .env.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from n8n_api import call

root = os.path.join(os.path.dirname(__file__), '..')
ids_path = os.path.join(root, 'n8n/deployed.json')
ids = json.load(open(ids_path)) if os.path.exists(ids_path) else {}
FIELDS = ('name', 'nodes', 'connections', 'settings')

for f in ['n8n/build/lead-intake.json', 'n8n/build/agent-tools-and-postcall.json']:
    w = json.load(open(os.path.join(root, f)))
    body = {k: w[k] for k in FIELDS}
    if f in ids:
        s, r = call('PUT', f'/workflows/{ids[f]}', body)
    else:
        s, r = call('POST', '/workflows', body)
        if s < 300:
            ids[f] = r['id']
    print('save', f, s, '' if s < 300 else r)
    if s < 300:
        s, r = call('POST', f'/workflows/{ids[f]}/activate')
        print('activate', f, s, '' if s < 300 else r)

json.dump(ids, open(ids_path, 'w'), indent=2)
