#!/usr/bin/env python3
"""Refresh the status of every tracked document and rebuild data/bundle.js.

Standard library only. Run from the repository root:
    python3 -I scripts/update_status.py

Reads  data/sources.json, data/fields.json (both curated), data/classification.json, data/quality.json,
       data/document_facts.json, data/requirements.json (optional), data/status.json and data/references.json (previous run)
Writes data/status.json, data/references.json, data/changes.json, data/ratings_log.json, data/bundle.js

Layers: status.json and references.json hold document facts from registries; classification.json and fields.json hold
the researcher's classification; quality.json holds the evidence-quality assessment. They are never merged.

Sources of status:
- IETF Datatracker JSON (https://datatracker.ietf.org/doc/<name>/doc.json and the relateddocument API)
- RFC Editor JSON for published RFCs (https://www.rfc-editor.org/rfc/rfc<n>.json): obsoleted-by and updated-by
- IETF archive text of draft revisions (https://www.ietf.org/archive/id/<name>-<rev>.txt), used only to
  compare the revision that was read with the current one
- GitHub REST API (pull requests, issues, latest commit, compare). If GITHUB_TOKEN is set (it is inside
  GitHub Actions), it is sent only to api.github.com, as an unredirected header (never forwarded on a redirect).

Provenance written for re-verification: the archive URL and SHA-256 of each Internet-Draft text that was read
(and of the current revision), full commit SHAs for repositories, the build (source commit, workflow run, SHA-256
of every curated data file), and a log of every change to the researcher's ratings (data/ratings_log.json).

Downloaded text is treated as data: it is only searched for the identifiers listed in data/fields.json
and for section headings. Nothing from it is executed.
"""
import datetime as dt
import difflib
import hashlib
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UA = "agent-audit-tracker (+https://github.com/anustsn/agent-audit-tracker)"
DISCOVERY_KEYWORDS = re.compile(r"agent|audit|evidence|authori[sz]|identity|provenance|oversight|decision|receipt", re.I)
MAX_DISCOVERED = 80
MAX_TEXT = 3_000_000
MAX_LIST = 40
RETRY_CODES = (403, 422, 429, 500, 502, 503)


class HttpsOnlyRedirect(urllib.request.HTTPRedirectHandler):
    """Follow redirects only to https URLs."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlparse(newurl).scheme != "https":
            raise urllib.error.HTTPError(newurl, code, "refused redirect to a non-https URL", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


OPENER = urllib.request.build_opener(HttpsOnlyRedirect())


def fetch(url, accept):
    if urllib.parse.urlparse(url).scheme != "https":
        raise ValueError("only https URLs are fetched")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    token = os.environ.get("GITHUB_TOKEN")
    if token and urllib.parse.urlparse(url).hostname == "api.github.com":
        # Unredirected: urllib copies ordinary headers to a redirect target, which could be another host.
        req.add_unredirected_header("Authorization", "Bearer " + token)
    for attempt in range(3):
        try:
            with OPENER.open(req, timeout=60) as resp:
                body = resp.read(MAX_TEXT + 1)
            if len(body) > MAX_TEXT:
                raise ValueError(f"response larger than {MAX_TEXT} bytes: {url}")
            return body
        except urllib.error.HTTPError as e:
            if e.code in RETRY_CODES and attempt < 2:
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except urllib.error.URLError:
            if attempt < 2:
                time.sleep(5 * (attempt + 1))
                continue
            raise


def get_json(url):
    return json.loads(fetch(url, "application/json").decode("utf-8"))


def get_text(url):
    return fetch(url, "text/plain").decode("utf-8", errors="replace")


# ---------------------------------------------------------------- status

def ietf_status(name):
    d = get_json(f"https://datatracker.ietf.org/doc/{urllib.parse.quote(name)}/doc.json")
    group = d.get("group") or {}
    out = {
        "version": "-" + str(d.get("rev", "")),
        "rev": str(d.get("rev", "")),
        "updated": (d.get("time") or "")[:10],
        "expires": (d.get("expires") or "")[:10],
        "state": d.get("state") or "",
        "group": group.get("acronym") or "",
        "group_type": group.get("type") or "",
        "title": d.get("title") or "",
        "doc_type": "WG Internet-Draft" if group.get("type") == "WG" else "Individual Internet-Draft",
        "doc_type_source": "IETF Datatracker (group type)",
    }
    if out["state"] == "Replaced":
        rel = get_json("https://datatracker.ietf.org/api/v1/doc/relateddocument/?" + urllib.parse.urlencode(
            {"target__name": name, "relationship__slug": "replaces", "format": "json"}))
        succ = [o.get("source", "").rstrip("/").split("/")[-1] for o in rel.get("objects", [])]
        out["replaced_by"] = [s for s in succ if s]
    return out


def rfc_status(number):
    """Published RFCs do not change; what can change is whether they are obsoleted or updated."""
    d = get_json(f"https://www.rfc-editor.org/rfc/rfc{int(number)}.json")
    lvl = (d.get("status") or "").title()
    return {"version": f"RFC {int(number)}", "state": "Published", "std_level": lvl,
            "published": d.get("pub_date") or "", "updated": "",
            "obsoleted_by": [str(x).strip() for x in d.get("obsoleted_by") or [] if str(x).strip()],
            "updated_by": [str(x).strip() for x in d.get("updated_by") or [] if str(x).strip()],
            "title": d.get("title") or "", "doc_type": "RFC" + (f" ({lvl})" if lvl else ""), "doc_type_source": "RFC Editor"}


def ietf_citing(name):
    """Drafts whose references include `name` (normative, informative or other reference types only)."""
    names, offset = set(), 0
    while True:
        rel = get_json("https://datatracker.ietf.org/api/v1/doc/relateddocument/?" + urllib.parse.urlencode(
            {"target__name": name, "format": "json", "limit": 200, "offset": offset}))
        objs = rel.get("objects", [])
        for o in objs:
            if o.get("relationship", "").rstrip("/").split("/")[-1] not in REL_NAMES:
                continue                          # skip replaces, possibly-replaces and other non-citations
            src = o.get("source", "").rstrip("/").split("/")[-1]
            if src.startswith("draft-"):
                names.add(src)
        if not (rel.get("meta") or {}).get("next") or not objs or offset > 2000:
            return names
        offset += len(objs)


def github_status(track):
    repo = track["repo"]
    t = track["type"]
    if t == "github_pr":
        d = get_json(f"https://api.github.com/repos/{repo}/pulls/{track['number']}")
        state = "merged" if d.get("merged") else d.get("state", "")
        if d.get("draft") and state == "open":
            state = "open (draft)"
        return {"version": state, "state": state, "updated": (d.get("updated_at") or "")[:10],
                "updated_full": d.get("updated_at") or "", "title": d.get("title") or ""}
    if t == "github_issue":
        d = get_json(f"https://api.github.com/repos/{repo}/issues/{track['number']}")
        labels = [l.get("name", "") for l in d.get("labels", [])]
        return {"version": d.get("state", ""), "state": d.get("state", ""), "labels": labels,
                "comments": d.get("comments", 0), "updated": (d.get("updated_at") or "")[:10],
                "title": d.get("title") or ""}
    if t == "github_repo":
        try:
            q = {"per_page": 1}
            if track.get("path"):
                q["path"] = track["path"]          # only changes to this folder count
            d = get_json(f"https://api.github.com/repos/{repo}/commits?" + urllib.parse.urlencode(q))
            c = d[0]
            return {"version": c["sha"][:7], "sha": c["sha"][:7], "state": "latest commit",
                    "updated": c["commit"]["committer"]["date"][:10],
                    "message": c["commit"]["message"].splitlines()[0][:120]}
        except urllib.error.HTTPError:
            d = get_json(f"https://api.github.com/repos/{repo}")
            return {"version": "pushed " + (d.get("pushed_at") or "")[:10], "state": "repository activity",
                    "updated": (d.get("pushed_at") or "")[:10]}
    raise ValueError("unknown track type " + t)


# ---------------------------------------------------------------- references (document facts)

REL_NAMES = {"refnorm": "normative", "refinfo": "informative", "refold": "reference (old type)", "refunk": "reference (type unknown)"}
PROCESS_REFS = ["rfc2119", "rfc8174", "bcp14"]


def _parse_refs(rel):
    seen = set()
    for o in rel.get("objects", []):
        t = o.get("relationship", "").rstrip("/").split("/")[-1]
        if t not in REL_NAMES:
            continue
        seen.add((o.get("target", "").rstrip("/").split("/")[-1], REL_NAMES[t]))
    return [{"target": a, "type": b} for a, b in sorted(seen)]


def refs_current(name):
    return _parse_refs(get_json("https://datatracker.ietf.org/api/v1/doc/relateddocument/?" + urllib.parse.urlencode(
        {"source__name": name, "format": "json", "limit": 500})))


def refs_at(name, rev):
    return _parse_refs(get_json("https://datatracker.ietf.org/api/v1/doc/relateddochistory/?" + urllib.parse.urlencode(
        {"source__doc__name": name, "source__rev": rev, "format": "json", "limit": 500})))


def target_info(name):
    d = get_json(f"https://datatracker.ietf.org/doc/{urllib.parse.quote(name)}/doc.json")
    out = {"title": d.get("title") or "", "state": d.get("state") or "", "std_level": d.get("std_level") or "",
           "group": (d.get("group") or {}).get("acronym") or "", "rev": str(d.get("rev") or "")}
    if out["state"] == "Replaced":
        rel = get_json("https://datatracker.ietf.org/api/v1/doc/relateddocument/?" + urllib.parse.urlencode(
            {"target__name": name, "relationship__slug": "replaces", "format": "json"}))
        out["replaced_by"] = [o.get("source", "").rstrip("/").split("/")[-1] for o in rel.get("objects", [])]
    return out


def build_references(sources, fields, status, prev, now):
    """References of each tracked Internet-Draft, at the revision that was read and at the current revision."""
    out = {"checked_at": now, "process_refs": PROCESS_REFS,
           "about": "Citations recorded by the IETF Datatracker for each tracked Internet-Draft. 'read' is the revision the matrix was read at, "
                    "'current' the latest revision. A normative reference is a citation type; it does not mean that one document implements the other.",
           "documents": {}, "targets": {}}
    names = set()
    for s in sources["sources"]:
        tr = s["track"]
        if tr["type"] != "ietf":
            continue
        cur = status["sources"].get(s["id"], {})
        v = (fields["mappings"].get(s["id"], {}) or {}).get("verified") or {}
        entry = {"error": ""}
        try:
            entry["current"] = {"doc": f"{tr['name']}-{cur.get('rev', '')}", "refs": refs_current(tr["name"])}
            if v.get("rev"):
                rname = v.get("name") or tr["name"]
                if rname == tr["name"] and v["rev"] == cur.get("rev"):
                    entry["read"] = {"doc": entry["current"]["doc"], "refs": entry["current"]["refs"]}
                else:
                    entry["read"] = {"doc": f"{rname}-{v['rev']}", "refs": refs_at(rname, v["rev"])}
            else:
                entry["read"] = None
        except Exception as e:
            entry = dict((prev.get("documents") or {}).get(s["id"], {}))
            entry["error"] = f"{type(e).__name__}: {e}"[:200]
        out["documents"][s["id"]] = entry
        for k in ("current", "read"):
            for r in (entry.get(k) or {}).get("refs", []):
                names.add(r["target"])
    old_t = prev.get("targets") or {}
    for n in sorted(names):
        o = old_t.get(n)
        if o and (n.startswith(("rfc", "bcp", "std"))) and not o.get("error"):
            out["targets"][n] = o          # published documents do not change; reuse
            continue
        try:
            out["targets"][n] = target_info(n)
        except Exception as e:
            out["targets"][n] = dict(o or {}, error=f"{type(e).__name__}: {e}"[:120])
    return out


# ---------------------------------------------------------------- revision comparison

PAGE_NOISE = re.compile(r"^(Internet-Draft\s|RFC \d+\s{2,}|.*\[Page \d+\]\s*$)")
HEADING = re.compile(r"^(?:\d+(?:\.\d+)*\.|Appendix [A-Z](?:\.\d+)*\.)\s+(\S.{1,100})$")


def id_pattern(ident):
    return re.compile(r"(?<![\w.-])" + re.escape(ident) + r"(?![\w-]|\.\w)")


def norm_lines(text):
    out = []
    for ln in text.replace("\r", "").split("\n"):
        ln = ln.replace("\f", "").rstrip()
        if not ln.strip() or PAGE_NOISE.match(ln):
            continue
        out.append(" ".join(ln.split()))
    return out


def headings(text):
    found = []
    for ln in text.replace("\r", "").replace("\f", "").split("\n"):
        m = HEADING.match(ln.rstrip())
        if m and not re.search(r"\.{3,}\s*\d+$", m.group(1)):
            found.append(" ".join(m.group(1).split()))
    return found


def staleness(mapping, cur, track):
    """Return (state, previous label, current label)."""
    v = mapping.get("verified") or {}
    read = {k: x for k, x in v.items() if k != "read_on"}
    if not read:
        return "unread", "", ""
    if track.get("type") == "ietf":
        old = f"{v.get('name') or track['name']}-{v.get('rev', '')}"
        new = f"{track['name']}-{cur.get('rev', '')}"
        return ("current" if old == new else "stale"), old, new
    if "sha" in v:
        a, b = str(v["sha"]).lower(), str(cur.get("sha") or "").lower()
        same = bool(a and b) and (a.startswith(b) or b.startswith(a))
        return ("current" if same else "stale"), v["sha"], cur.get("sha", "")
    if "updated" in v:
        new = cur.get("updated_full", "")
        return ("current" if v["updated"] == new else "stale"), v["updated"], new
    return "current", "", ""


def field_checks(cells, old_text, new_text, changed_text):
    """For every cell with identifiers: occurrences before/after and whether a changed line mentions it."""
    out = {}
    for row, cell in cells.items():
        ids = cell.get("ids") or []
        if not ids:
            continue
        res = []
        for ident in ids:
            p = id_pattern(ident)
            res.append({
                "id": ident,
                "old": len(p.findall(old_text)) if old_text is not None else None,
                "new": len(p.findall(new_text)) if new_text is not None else None,
                "in_changed_lines": bool(p.search(changed_text)),
            })
        out[row] = res
    return out


def compare_ietf(old, new, cells):
    a_text = get_text(f"https://www.ietf.org/archive/id/{old}.txt")
    b_text = get_text(f"https://www.ietf.org/archive/id/{new}.txt")
    a, b = norm_lines(a_text), norm_lines(b_text)
    added, removed = [], []
    for i, ln in enumerate(difflib.unified_diff(a, b, lineterm="", n=0)):
        if i < 2 or ln.startswith("@@"):          # the first two lines are the ---/+++ file headers
            continue
        if ln.startswith("+"):
            added.append(ln[1:])
        elif ln.startswith("-"):
            removed.append(ln[1:])
    ha, hb = headings(a_text), headings(b_text)
    sa, sb = set(ha), set(hb)
    return {
        "compare_url": "https://author-tools.ietf.org/iddiff?" + urllib.parse.urlencode({"url1": old, "url2": new}),
        "method": "Plain text of both revisions from the IETF archive; page headers ignored; identifiers matched as whole words.",
        "lines_added": len(added),
        "lines_removed": len(removed),
        "sections_added": [h for h in hb if h not in sa][:MAX_LIST],
        "sections_removed": [h for h in ha if h not in sb][:MAX_LIST],
        "fields": field_checks(cells, " ".join(a), " ".join(b), "\n".join(added + removed)),
    }


def compare_github_repo(repo, old, new, cells):
    d = get_json(f"https://api.github.com/repos/{repo}/compare/{urllib.parse.quote(old)}...{urllib.parse.quote(new)}")
    files = d.get("files") or []
    changed = []
    for f in files:
        for ln in (f.get("patch") or "").split("\n"):
            if ln.startswith("+") or ln.startswith("-"):     # GitHub patches have no file header lines
                changed.append(ln[1:])
    return {
        "compare_url": f"https://github.com/{repo}/compare/{old}...{new}",
        "method": "GitHub compare API; identifiers searched in the changed lines of the diff only.",
        "commits": d.get("ahead_by", 0),
        "files_changed": [f"{f.get('status', '')}: {f.get('filename', '')}" for f in files][:MAX_LIST],
        "files_total": len(files),
        "fields": field_checks(cells, None, None, "\n".join(changed)),
    }


def compare_github_pr(repo, number, since):
    commits = get_json(f"https://api.github.com/repos/{repo}/pulls/{number}/commits?per_page=100")
    newer = [c for c in commits if (c.get("commit", {}).get("committer", {}).get("date") or "") > since]
    return {
        "compare_url": f"https://github.com/{repo}/pull/{number}/files",
        "method": "GitHub API; commits added to the pull request after the date it was read. Identifiers are not checked automatically.",
        "commits": len(newer),
        "commit_messages": [(c["commit"]["message"].splitlines() or [""])[0][:120] for c in newer][:MAX_LIST],
        "fields": {},
    }


def review(source, mapping, cur, prev_review, now):
    track = source["track"]
    state, old, new = staleness(mapping, cur, track)
    out = {"state": state, "from": old, "to": new}
    if state != "stale":
        return out
    if prev_review and prev_review.get("from") == old and prev_review.get("to") == new \
            and not prev_review.get("error") and prev_review.get("ids_key") == ids_key(mapping):
        return prev_review
    cells = mapping.get("cells") or {}
    try:
        if track["type"] == "ietf":
            out.update(compare_ietf(old, new, cells))
        elif track["type"] == "github_repo":
            out.update(compare_github_repo(track["repo"], old, new, cells))
        elif track["type"] == "github_pr":
            out.update(compare_github_pr(track["repo"], track["number"], old))
        out["error"] = ""
    except Exception as e:
        out["error"] = f"{type(e).__name__}: {e}"[:200]
    out["checked_at"] = now
    out["ids_key"] = ids_key(mapping)
    return out


def ids_key(mapping):
    return json.dumps({r: c.get("ids") or [] for r, c in sorted((mapping.get("cells") or {}).items())}, sort_keys=True)


# ---------------------------------------------------------------- provenance for re-verification

def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def ietf_text_record(doc, prev, url=None):
    """Archive URL and SHA-256 of one Internet-Draft revision or RFC. Archived texts do not change, so reuse."""
    if prev and prev.get("doc") == doc and prev.get("sha256"):
        return prev
    url = url or f"https://www.ietf.org/archive/id/{urllib.parse.quote(doc)}.txt"
    b = fetch(url, "text/plain")
    return {"doc": doc, "url": url, "sha256": sha256_bytes(b), "bytes": len(b),
            "fetched_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def full_commit(repo, short, prev):
    if prev and prev.get("short") == short and prev.get("sha"):
        return prev
    d = get_json(f"https://api.github.com/repos/{repo}/commits/{urllib.parse.quote(short)}")
    return {"short": short, "sha": d["sha"], "url": f"https://github.com/{repo}/tree/{d['sha']}",
            "date": d["commit"]["committer"]["date"]}


def build_texts(sources, fields, status, prev_texts):
    """What exactly was read, and what is current: URL plus SHA-256 (drafts) or full commit SHA (repositories)."""
    out = {}
    for s in sources["sources"]:
        if s["track"]["type"] == "manual":
            continue
        tr, cur = s["track"], status["sources"].get(s["id"], {})
        v = (fields["mappings"].get(s["id"], {}) or {}).get("verified") or {}
        old = prev_texts.get(s["id"], {})
        e = {"error": ""}
        try:
            if tr["type"] == "rfc":
                n = int(tr["number"])
                e["current"] = ietf_text_record(f"rfc{n}", old.get("current"), f"https://www.rfc-editor.org/rfc/rfc{n}.txt")
            elif tr["type"] == "ietf":
                if v.get("rev"):
                    e["read"] = ietf_text_record(f"{v.get('name') or tr['name']}-{v['rev']}", old.get("read"))
                if cur.get("rev"):
                    e["current"] = ietf_text_record(f"{tr['name']}-{cur['rev']}", old.get("current"))
            elif tr["type"] == "github_repo":
                if v.get("sha"):
                    e["read"] = full_commit(tr["repo"], v["sha"], old.get("read"))
                if cur.get("sha"):
                    e["current"] = full_commit(tr["repo"], cur["sha"], old.get("current"))
            elif tr["type"] == "github_issue":
                e["current"] = {"url": f"https://github.com/{tr['repo']}/issues/{tr['number']}", "updated": cur.get("updated", "")}
            elif tr["type"] == "github_pr":
                d = get_json(f"https://api.github.com/repos/{tr['repo']}/pulls/{tr['number']}")
                e["current"] = {"head_sha": (d.get("head") or {}).get("sha", ""), "url": f"https://github.com/{tr['repo']}/pull/{tr['number']}",
                                "updated": d.get("updated_at") or ""}
                if v.get("updated"):
                    e["read"] = {"as_of": v["updated"], "url": f"https://github.com/{tr['repo']}/pull/{tr['number']}",
                                 "note": "The pull request was read as of this update time; its head commit at that time was not recorded."}
        except Exception as ex:
            e = dict(old)
            e["error"] = f"{type(ex).__name__}: {ex}"[:200]
        out[s["id"]] = e
    return out


def tracker_version():
    m = re.search(r"^version:\s*(\S+)", (ROOT / "CITATION.cff").read_text(encoding="utf-8"), re.M) if (ROOT / "CITATION.cff").exists() else None
    return m.group(1) if m else "unknown"


def build_info(now):
    curated = ["sources.json", "fields.json", "classification.json", "quality.json", "document_facts.json", "requirements.json",
               "observations.json", "findings.json", "site.json"]
    hashes = {}
    for f in curated:
        path = DATA / f
        if path.exists():
            hashes[f] = sha256_bytes(path.read_bytes())
    env = os.environ
    repo, run, server = env.get("GITHUB_REPOSITORY", ""), env.get("GITHUB_RUN_ID", ""), env.get("GITHUB_SERVER_URL", "https://github.com")
    return {"generated_at": now, "tracker_version": tracker_version(),
            "source_commit": env.get("GITHUB_SHA", ""), "repository": repo,
            "run_id": run, "run_url": f"{server}/{repo}/actions/runs/{run}" if repo and run else "",
            "where": "GitHub Actions" if env.get("GITHUB_ACTIONS") == "true" else "local run",
            "curated_sha256": hashes}


def rating_key(c):
    return {"status": c.get("status"), "note_sha256": sha256_bytes((c.get("text") or "").encode("utf-8"))[:16],
            "ids": c.get("ids") or [], "where": c.get("where") or ""}


def update_ratings_log(fields, prev_snapshot, log, today, version):
    """Record every change to the researcher's ratings. The snapshot lives in status.json; the log is append-only."""
    snap = {}
    for col, m in (fields.get("mappings") or {}).items():
        v = m.get("verified") or {}
        rated_at = "-".join(x for x in [v.get("name") or "", v.get("rev") or ""] if x) or v.get("sha") or v.get("updated") or ""
        for row, c in (m.get("cells") or {}).items():
            k = f"{col}/{row}"
            old = (prev_snapshot or {}).get(k)
            cur = dict(rating_key(c), rated_at=rated_at)
            cur["first_seen"] = (old or {}).get("first_seen") or (m.get("verified") or {}).get("read_on") or today
            cur["added_in"] = (old or {}).get("added_in") or version
            snap[k] = cur
            if prev_snapshot is None:
                continue
            if old is None:
                log.append({"date": today, "cell": k, "change": "rated", "old": None, "new": c.get("status"), "rated_at": rated_at, "version": version})
                continue
            for field, label in (("status", "status changed"), ("note_sha256", "note revised"), ("ids", "identifiers changed"),
                                 ("where", "location changed"), ("rated_at", "re-rated at another revision")):
                if old.get(field) != cur.get(field):
                    log.append({"date": today, "cell": k, "change": label,
                                "old": old.get(field) if field != "note_sha256" else None,
                                "new": cur.get(field) if field != "note_sha256" else None,
                                "rated_at": rated_at, "version": version})
    if prev_snapshot is not None:
        for k in prev_snapshot:
            if k not in snap:
                log.append({"date": today, "cell": k, "change": "rating removed", "old": prev_snapshot[k].get("status"), "new": None,
                            "rated_at": prev_snapshot[k].get("rated_at"), "version": version})
    elif snap:
        log.append({"date": today, "cell": "*", "change": f"baseline: {len(snap)} rated cells recorded", "old": None, "new": None,
                    "rated_at": "", "version": version})
    return snap, log


# ---------------------------------------------------------------- main

def load(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def main():
    sources = load(DATA / "sources.json", None)
    fields = load(DATA / "fields.json", None)
    if sources is None or fields is None:
        sys.exit("data/sources.json and data/fields.json are required")
    prev = load(DATA / "status.json", {"sources": {}, "discovered": []})
    changes = load(DATA / "changes.json", [])
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    today = now[:10]

    status = {"checked_at": now, "sources": {}, "reviews": {}, "discovered": []}
    tracked_ietf = set()
    for s in sources["sources"]:
        tr = s["track"]
        old = prev["sources"].get(s["id"], {})
        try:
            if tr["type"] == "ietf":
                tracked_ietf.add(tr["name"])
                cur = ietf_status(tr["name"])
                cur["source"] = "IETF Datatracker API"
            elif tr["type"] == "rfc":
                cur = rfc_status(tr["number"])
                cur["source"] = "RFC Editor"
            elif tr["type"].startswith("github_"):
                cur = github_status(tr)
                cur["source"] = "GitHub REST API"
            else:
                cur = {"version": tr.get("version", ""), "state": "checked by hand", "updated": tr.get("checked", ""),
                       "source": "checked by hand"}
            cur["checked_at"] = now
            cur["error"] = ""
        except Exception as e:  # keep the last good values; record the error
            cur = dict(old)
            cur["error"] = f"{type(e).__name__}: {e}"[:200]
        status["sources"][s["id"]] = cur
        for key in ("version", "state", "replaced_by", "obsoleted_by", "updated_by"):
            if old and key in cur and old.get(key) != cur.get(key) and not cur.get("error"):
                changes.append({"date": today, "id": s["id"], "field": key,
                                "old": old.get(key), "new": cur.get(key)})
        if s.get("matrix"):
            mapping = fields["mappings"].get(s["id"], {})
            status["reviews"][s["id"]] = review(s, mapping, cur, prev.get("reviews", {}).get(s["id"]), now)

    # Discovery: drafts that cite a tracked IETF draft and look relevant.
    found, discovery_errors = {}, []
    for name in sorted(tracked_ietf):
        try:
            for n in ietf_citing(name):
                if n not in tracked_ietf and DISCOVERY_KEYWORDS.search(n):
                    found.setdefault(n, set()).add(name)
        except Exception as e:
            discovery_errors.append(f"{name}: {type(e).__name__}: {e}"[:160])
    prev_disc = {d["name"]: d for d in prev.get("discovered", [])}
    prev_date = (prev.get("checked_at") or now)[:10]
    for n in sorted(found)[:MAX_DISCOVERED]:
        try:
            d = ietf_status(n)
        except Exception as e:
            discovery_errors.append(f"{n}: {type(e).__name__}: {e}"[:160])
            if n in prev_disc:
                status["discovered"].append(prev_disc[n])     # keep the last known entry
            continue
        if d["state"] in ("Replaced", "Expired"):
            continue
        first_seen = prev_disc.get(n, {}).get("first_seen") or (prev_date if n in prev_disc else today)
        status["discovered"].append({"name": n, "title": d["title"], "version": d["version"],
                                     "updated": d["updated"], "state": d["state"], "group": d["group"],
                                     "cites": sorted(found[n]), "first_seen": first_seen,
                                     "url": f"https://datatracker.ietf.org/doc/{urllib.parse.quote(n)}/"})
    if discovery_errors and prev.get("discovered"):
        # A partial failure must not drop drafts or later re-announce them as new: keep the previous list.
        status["discovered"] = prev["discovered"]
    status["discovery_errors"] = discovery_errors
    if prev.get("checked_at") and not discovery_errors:
        for d in status["discovered"]:
            if d["name"] not in prev_disc:
                changes.append({"date": today, "id": d["name"], "field": "new related draft",
                                "old": None, "new": d["version"]})

    references = build_references(sources, fields, status, load(DATA / "references.json", {}), now)
    status["texts"] = build_texts(sources, fields, status, prev.get("texts") or {})
    version = tracker_version()
    ratings_log = load(DATA / "ratings_log.json", [])
    status["ratings_snapshot"], ratings_log = update_ratings_log(fields, prev.get("ratings_snapshot"), ratings_log, today, version)
    (DATA / "ratings_log.json").write_text(json.dumps(ratings_log, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (DATA / "references.json").write_text(json.dumps(references, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (DATA / "status.json").write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (DATA / "changes.json").write_text(json.dumps(changes, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    bundle = {"sources": sources, "fields": fields, "status": status, "changes": changes[-100:],
              "requirements": load(DATA / "requirements.json", None),
              "classification": load(DATA / "classification.json", None),
              "quality": load(DATA / "quality.json", None),
              "document_facts": load(DATA / "document_facts.json", None),
              "observations": load(DATA / "observations.json", None),
              "site": load(DATA / "site.json", {"show_ratings": False}),
              "findings": load(DATA / "findings.json", None),
              "references": references,
              "ratings_log": ratings_log[-300:],
              "build": build_info(now)}
    (DATA / "bundle.js").write_text(
        "/* Generated by scripts/update_status.py. Do not edit by hand. */\nwindow.TRACKER = "
        + json.dumps(bundle, ensure_ascii=False).replace("</", "<\\/") + ";\n", encoding="utf-8")
    errors = [k for k, v in status["sources"].items() if v.get("error")]
    errors += [k + " (comparison)" for k, v in status["reviews"].items() if v.get("error")]
    errors += [k + " (references)" for k, v in references["documents"].items() if v.get("error")]
    errors += [k + " (texts)" for k, v in status["texts"].items() if v.get("error")]
    errors += [f"discovery ({len(discovery_errors)})"] if discovery_errors else []
    errors += [n + " (cited document)" for n, t in references["targets"].items() if t.get("error")]
    if os.environ.get("GITHUB_ACTIONS") == "true":
        for e in errors:
            print(f"::warning title=Update check failed::{e}. Last known values are kept on the page.")
    stale = [k for k, v in status["reviews"].items() if v["state"] == "stale"]
    print(f"checked {len(status['sources'])} sources, {len(status['discovered'])} related drafts; "
          f"re-check: {stale or 'none'}; errors: {errors or 'none'}")


if __name__ == "__main__":
    main()
