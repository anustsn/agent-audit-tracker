"""Match study author strings to the released agents table (AgentAlphaXiv).

Added in preprint v1.1 (23 Nov 2026) to make the question-1 count reproducible.

Input: a directory of datasets-server /rows JSON pages named
<table>_<offset>.json (tables `agents` and `studies`, revision cc892aab).
Run: python3 -I author_match.py <dir>

strict = the author string equals an agent display name, or contains an
         agent token (Name-XXXXXXXX) that exists in the agents table
loose  = strict, plus any agent-style token not found in the agents table
Executes no dataset code; prints counts and masked name shapes only.
"""
import glob
import json
import os
import re
import sys
from collections import Counter

d = sys.argv[1]


def load(name):
    rows = []
    files = glob.glob(os.path.join(d, name + "_*.json"))
    files.sort(key=lambda p: int(re.search(r"_(\d+)\.json$", p).group(1)))
    for f in files:
        rows += [r["row"] for r in json.load(open(f))["rows"]]
    return rows


agents, studies = load("agents"), load("studies")
NAME = re.compile(r"\b([A-Z][a-z]+-[0-9A-F]{8})\b")
ANY = re.compile(r"[A-Z][a-z]+-[0-9A-Fa-f]{8}")
names = {a["display_name"].strip().lower() for a in agents if a.get("display_name")}
tokens = set()
for a in agents:
    if a.get("display_name"):
        tokens.update(NAME.findall(a["display_name"]))

unlinked = Counter()
loose = total = 0
for s in studies:
    for a in s["authors"]:
        total += 1
        ok = a.strip().lower() in names or any(t in tokens for t in NAME.findall(a))
        if not ok:
            unlinked[a] += 1
        if ok or ANY.search(a):
            loose += 1
strict = total - sum(unlinked.values())
print(f"author strings: {total}; strict match: {strict}; loose (any agent-style name): {loose}; other: {total - loose}")
for k, v in unlinked.most_common(40):
    print(v, repr(re.sub(r"[0-9A-Fa-f]{8}", "<HEX8>", k)[:60]))
