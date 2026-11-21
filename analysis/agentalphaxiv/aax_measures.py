"""Measures M1-M8 for the AgentAlphaXiv accountability case study (see PROTOCOL.md).

Pure pandas. Reads nothing from disk or the network; the notebook loads the tables
and passes them in as DataFrames. No dataset code is executed.
"""
import json
import re

import pandas as pd

REVISION = "cc892aab131be3872283e1a778af663382315817"
TABLES = ["agents", "studies", "versions", "messages", "artifacts"]
NAME_TOKEN = re.compile(r"\b([A-Z][a-z]+-[0-9A-F]{8})\b")
SELF_LABEL = re.compile(r"^\s*\[([^\]]{1,200})\]")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")
THRESHOLD = 0.95

# Column-name tokens for M7 (actor type) and M8 (authority). Matches are reviewed by hand.
ACTOR_TOKENS = ["human", "operator", "actor", "is_agent", "role", "manual"]
AUTHORITY_TOKENS = {
    "verified": ["verif", "attest", "trust"],
    "credential": ["credential", "token", "key", "scope", "secret"],
    "decision": ["permission", "policy", "authoriz", "authoris", "approv", "decision", "allow"],
    "tool": ["tool", "tool_version", "schema"],
}


def tables_url(name, revision=REVISION):
    return (f"https://huggingface.co/datasets/alphaXiv/AgentAlphaXiv/resolve/"
            f"{revision}/data/{name}.parquet")


def share(mask):
    n = int(len(mask))
    return {"n": n, "k": int(mask.sum()), "share": (float(mask.mean()) if n else None)}


def non_null(series):
    s = series.astype(object)
    s = s.map(lambda v: None if (isinstance(v, str) and v.strip() in ("", "None", "nan")) else v)
    return s.notna()


def as_list(value):
    """studies/versions.authors may be a list, an array or a string like "['A', 'B']"."""
    if value is None:
        return []
    if isinstance(value, float) and pd.isna(value):
        return []
    if isinstance(value, str):
        v = value.strip()
        if v.startswith("[") and v.endswith("]"):
            inner = v[1:-1].strip()
            if not inner:
                return []
            return [p.strip().strip("'\"") for p in re.split(r"',\s*'|\",\s*\"", inner)]
        return [v]
    try:
        return [str(x) for x in list(value)]
    except TypeError:
        return [str(value)]


def m1_coverage(tables, columns):
    out = {}
    for table, col in columns:
        df = tables[table]
        out[f"{table}.{col}"] = share(non_null(df[col])) if col in df.columns else {"missing_column": True}
    return out


def m2_author_attribution(studies, agents):
    names = set(agents["display_name"].dropna().str.strip().str.lower())
    tokens = set()
    for n in agents["display_name"].dropna():
        tokens.update(NAME_TOKEN.findall(n))
    per_study = []
    for authors in studies["authors"]:
        lst = as_list(authors)
        linked = [a.strip().lower() in names or any(t in tokens for t in NAME_TOKEN.findall(a)) for a in lst]
        if not lst:
            per_study.append("no_authors")
        elif all(linked):
            per_study.append("all_linked")
        elif any(linked):
            per_study.append("some_linked")
        else:
            per_study.append("none_linked")
    counts = pd.Series(per_study).value_counts().to_dict()
    n = len(per_study)
    return {"n_studies": n, "counts": {k: int(v) for k, v in counts.items()},
            "share_none_linked": (counts.get("none_linked", 0) / n if n else None)}


def m3_self_labels(messages, agents):
    all_tokens = set()
    for n in agents["display_name"].dropna():
        all_tokens.update(NAME_TOKEN.findall(n))
    with_label = own = cross = 0
    for text, sender in zip(messages["text"], messages["sender_name"]):
        if not isinstance(text, str):
            continue
        m = SELF_LABEL.match(text)
        if not m:
            continue
        with_label += 1
        label = m.group(1)
        sender_tokens = set(NAME_TOKEN.findall(sender)) if isinstance(sender, str) else set()
        label_tokens = set(NAME_TOKEN.findall(label))
        if sender_tokens & label_tokens:
            own += 1
        elif (label_tokens & all_tokens) - sender_tokens:
            cross += 1
    n = int(len(messages))
    return {"n_messages": n, "with_self_label": with_label,
            "label_contains_own_name": own, "label_names_other_agent_only": cross,
            "share_with_label": (with_label / n if n else None)}


def m4_lab_nulls(tables):
    return {t: share(~non_null(tables[t]["lab"])) for t in ("agents", "messages", "studies")
            if "lab" in tables[t].columns}


def m5_integrity(artifacts, versions):
    sha = artifacts["sha256"].astype(str).str.lower().str.match(HEX64)
    commit = versions["repository_commit"].astype(str).str.lower().str.match(HEX40)
    return {"artifacts_sha256_wellformed": share(sha), "versions_git_commit_wellformed": share(commit)}


def m6_linkability(tables):
    study_ids = set(tables["studies"]["project_id"].dropna())
    out = {}
    for t in ("artifacts", "versions"):
        out[f"{t}_project_resolves"] = share(tables[t]["project_id"].isin(study_ids))
    msg = tables["messages"]
    out["messages_room_or_channel"] = share(non_null(msg["room_id"]) | non_null(msg["channel"]))
    return out


def column_scan(tables, tokens):
    hits = []
    for t, df in tables.items():
        for c in df.columns:
            if any(tok in c.lower() for tok in tokens):
                hits.append(f"{t}.{c}")
    return hits


def m7_actor_type(tables):
    return {"columns_matching": column_scan(tables, ACTOR_TOKENS)}


def m8_authority(tables):
    return {q: column_scan(tables, toks) for q, toks in AUTHORITY_TOKENS.items()}


def environment_artifacts(artifacts):
    kinds = artifacts["kind"].astype(str).str.lower()
    paths = artifacts["logical_path"].astype(str).str.lower()
    env = kinds.str.contains("env") | paths.str.contains(
        r"(requirements[^/]*\.txt|environment\.ya?ml|pyproject\.toml|package\.json)$", regex=True)
    return {"kind_values": {k: int(v) for k, v in kinds.value_counts().head(20).items()},
            "environment_like_files": share(env)}


def run_all(tables):
    cov = m1_coverage(tables, [
        ("messages", "sender_agent_id"), ("messages", "sender_name"), ("messages", "text"),
        ("messages", "sent_at"), ("versions", "published_at"), ("versions", "change_summary"),
        ("versions", "authors"), ("studies", "authors"), ("agents", "lab"), ("studies", "lab"),
        ("messages", "lab")])
    return {
        "revision": REVISION,
        "M1_coverage": cov,
        "M2_author_attribution": m2_author_attribution(tables["studies"], tables["agents"]),
        "M3_self_labels": m3_self_labels(tables["messages"], tables["agents"]),
        "M4_lab_nulls": m4_lab_nulls(tables),
        "M5_integrity": m5_integrity(tables["artifacts"], tables["versions"]),
        "M6_linkability": m6_linkability(tables),
        "M7_actor_type": m7_actor_type(tables),
        "M8_authority_columns": m8_authority(tables),
        "tool_environment_files": environment_artifacts(tables["artifacts"]),
    }


def _ok(entry):
    return entry is not None and not entry.get("missing_column") and entry.get("share") is not None \
        and entry["share"] >= THRESHOLD


def score_questions(r):
    """Apply the PROTOCOL.md section 5 rule. Every N and every column-scan hit is reviewed by hand."""
    cov = r["M1_coverage"]
    rows = []

    def add(q, score, basis):
        rows.append({"question": q, "score": score, "basis": basis})

    msg_ok = _ok(cov["messages.sender_agent_id"])
    none_linked = r["M2_author_attribution"]["share_none_linked"] or 0
    add("agent", "P" if msg_ok else "N",
        f"chat sender ID platform-assigned (coverage {cov['messages.sender_agent_id'].get('share')}); "
        f"study authors are free text, none linked for {none_linked:.1%} of studies")
    for q in ("verified", "credential", "decision"):
        hits = r["M8_authority_columns"][q]
        add(q, "N" if not hits else "REVIEW", f"column-name scan hits: {hits or 'none'}")
    add("principal", "P" if any(_ok(cov.get(f"{t}.lab")) for t in ("agents", "studies", "messages")) else "N",
        "lab pseudonym only (group level); operators removed in the release")
    env = r["tool_environment_files"]["environment_like_files"]
    tool_hits = r["M8_authority_columns"]["tool"]
    add("tool", "P" if env["k"] > 0 else ("REVIEW" if tool_hits else "N"),
        f"environment-type files listed: {env['k']}; tool column hits: {tool_hits or 'none'}")
    action_ok = _ok(cov["versions.published_at"]) and _ok(cov["messages.text"]) and _ok(cov["messages.sent_at"])
    add("action", "A" if action_ok else "P", "version publication times and chat text/timestamps")
    link = r["M6_linkability"]
    link_ok = all(_ok(v) for v in link.values())
    add("correlation", "A" if link_ok else "P", "project_id links and room/channel")
    integ = r["M5_integrity"]
    add("integrity", "P" if (integ["artifacts_sha256_wellformed"]["k"] or integ["versions_git_commit_wellformed"]["k"]) else "N",
        "file hashes / git commits present; no signed or chained record log (rule: A needs that)")
    actor = r["M7_actor_type"]["columns_matching"]
    add("recorder", "REVIEW" if actor else "P",
        f"platform assigns IDs and times; content is self-declared; actor-type columns: {actor or 'none'}")
    return pd.DataFrame(rows)


if __name__ == "__main__":
    print(json.dumps({"revision": REVISION, "tables": TABLES}, indent=2))
