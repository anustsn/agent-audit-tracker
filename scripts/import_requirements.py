#!/usr/bin/env python3
"""Build data/requirements.json from a copy of the agent-telemetry-coverage dataset.

Standard library only. Usage, from the repository root:
    python3 -I scripts/import_requirements.py <path to agent-telemetry-coverage> [version]

It copies only identifiers: for each monitoring signal (S01..S34), the OWASP requirement units that
need it (unit id, list, risk id and risk title) and the signal's OpenTelemetry coverage code.
No requirement text is copied.
"""
import csv
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIST_SOURCE = {"OWASP-ASI-2026": "owasp-asi", "OWASP-MCP-2025": "owasp-mcp"}


def clean_risk(name):
    name = re.sub(r"^MCP\d{2}:\d{4}\s*[-–]\s*", "", name or "")
    return " ".join(name.split())


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = pathlib.Path(sys.argv[1])
    version = sys.argv[2] if len(sys.argv) > 2 else ""
    if not version:
        m = re.search(r"^version:\s*(\S+)", (src / "CITATION.cff").read_text(encoding="utf-8"), re.M)
        version = m.group(1) if m else "unknown"
    extracted = {r["unit_id"]: r for r in csv.DictReader(open(src / "data/units_extracted.csv", encoding="utf-8"))}
    coded = list(csv.DictReader(open(src / "data/units_coded.csv", encoding="utf-8")))
    signals = list(csv.DictReader(open(src / "data/signals_coded.csv", encoding="utf-8")))

    out = {}
    for s in signals:
        out[s["signal_id"]] = {"name": s["signal"], "layer": s["layer"],
                               "otel_coverage": s["coverage"] + (("-" + s["p_type"]) if s.get("p_type") else ""),
                               "units": []}
    for u in coded:
        if u.get("screen") != "INC":
            continue
        e = extracted.get(u["unit_id"], {})
        for sid in (u.get("signals") or "").split(";"):
            sid = sid.strip()
            if sid in out:
                out[sid]["units"].append({"unit": u["unit_id"], "source": LIST_SOURCE.get(e.get("framework"), ""),
                                          "risk_id": e.get("risk_id", ""), "risk": clean_risk(e.get("risk_name", ""))})
    data = {
        "about": "Which OWASP requirement units need each monitoring signal, and how well the OpenTelemetry GenAI conventions cover the signal. Identifiers only; read the requirement text in the OWASP documents.",
        "provenance": {
            "dataset": "agent-telemetry-coverage",
            "version": version,
            "url": "https://github.com/anustsn/agent-telemetry-coverage",
            "files": ["data/units_extracted.csv", "data/units_coded.csv", "data/signals_coded.csv"],
            "note": "Single-coder coding (v0.1). Second-coder adjudication for v0.2 is pending; counts may change.",
            "coverage_codes": "C covered; P partial (a: opt-in content only, b: part of the signal, c: attribute exists but not used by GenAI/MCP/A2A); N not covered."
        },
        "signals": out,
    }
    path = ROOT / "data" / "requirements.json"
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    n = sum(len(v["units"]) for v in out.values())
    print(f"wrote {path.relative_to(ROOT)}: {len(out)} signals, {n} unit links, dataset version {version}")


if __name__ == "__main__":
    main()
