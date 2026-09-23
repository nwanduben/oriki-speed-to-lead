#!/usr/bin/env python3
"""Create (or update) the Joy agent in ElevenLabs.

Builds the payloads with `node scripts/setup-elevenlabs.mjs --dry-run` (single
source of truth) and sends them with el_api, which copes with flaky local DNS.
Ids are saved in agent/deployed.json so re-running updates in place.
"""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
from env import load
from el_api import call

root = os.path.join(os.path.dirname(__file__), '..')
e, cfg = load(), json.load(open(os.path.join(root, 'n8n/config.json')))
env = dict(os.environ, N8N_BASE_URL='https://qr4v3tgj.rcld.app', TOOL_SECRET=cfg['TOOL_SECRET'],
           TRANSFER_NUMBER=e.get('TRANSFER_NUMBER', ''))
payload = json.loads(subprocess.run(['node', os.path.join(root, 'scripts/setup-elevenlabs.mjs'), '--dry-run'],
                                    env=env, capture_output=True, text=True, check=True).stdout)

ids_path = os.path.join(root, 'agent/deployed.json')
ids = json.load(open(ids_path)) if os.path.exists(ids_path) else {}

def upsert_tool(key, body):
    if key in ids:
        s, r = call('PATCH', f"/v1/convai/tools/{ids[key]}", body)
    else:
        s, r = call('POST', '/v1/convai/tools', body)
        if s < 300: ids[key] = r['id']
    print(key, s, '' if s < 300 else r)
    if s >= 300: sys.exit(1)

upsert_tool('score_lead_tool_id', payload['scoreLeadTool'])
upsert_tool('book_tool_id', payload['bookTool'])

agent = payload['agent']
agent['conversation_config']['agent']['prompt']['tool_ids'] = [ids['score_lead_tool_id'], ids['book_tool_id']]
if 'agent_id' in ids:
    s, r = call('PATCH', f"/v1/convai/agents/{ids['agent_id']}", agent)
else:
    s, r = call('POST', '/v1/convai/agents/create', agent)
    if s < 300: ids['agent_id'] = r['agent_id']
print('agent', s, '' if s < 300 else r)
json.dump(ids, open(ids_path, 'w'), indent=2)
