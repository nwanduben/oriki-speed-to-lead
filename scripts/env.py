# Reads .env tolerantly (spaces, quotes) without printing values.
import os
def load(path=os.path.join(os.path.dirname(__file__), '..', '.env')):
    out = {}
    for line in open(path):
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        k, v = line.split('=', 1)
        out[k.strip()] = v.strip().strip('"').strip("'").strip()
    return out
