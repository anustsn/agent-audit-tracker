# Agent Audit Tracker

**Which standards and drafts let an auditor answer: which AI agent acted, on whose behalf, with which credential and tool version, and was it allowed?**

This is an audit-evidence tracker and a research instrument, not a monitoring dashboard: it does not show what agents are doing. It does not publish research findings either; those appear only as links to published work. It shows:
- **specification status:** which evidence fields the documents specify, as rated by the researcher;
- **provenance:** which revision each rating was made at;
- **references:** how the documents cite each other, per revision;
- **review:** what has to be re-read after a new revision.

**Current version: catalogue.** Only document facts are published: status, revisions, citations, related drafts and their provenance. The researcher's ratings (the specification-status matrix and the question view) are switched off in `data/site.json` (`"show_ratings": false`) and no ratings are in the data yet. They will be added only from the maintainer's own reading, labelled as one researcher's reading. The tracker is maintained by one person. In place of a second reviewer:
- the rules are stated in Method;
- every change is recorded in the data history;
- errors can be reported as GitHub issues.

If the project grows, a second rater and an agreement measure would be added.

It tracks:
- the OpenTelemetry GenAI semantic conventions and related proposals;
- IETF Internet-Drafts on agent identity, authorisation evidence and audit records;
- the NIST NCCoE agent identity and authorisation project;
- the OWASP lists that state the monitoring requirements;
- the audit controls the evidence supports.
- status only, without ratings: OAuth Token Exchange (RFC 8693), DPoP (RFC 9449), the SCITT architecture (RFC 9943), the MCP and A2A specifications, NIST SP 800-53 (through OSCAL), and EU AI Act Articles 12 and 26(6) (checked by hand).

The set of tracked areas is fixed for now. New documents are added only within these areas, and status-only tracking is preferred to new ratings, so that the tracker stays maintainable by one person. ISO/IEC 42001 and the NIST AI RMF are out of scope: they set organisation-level requirements, not evidence for individual agent actions.

Live page: `https://anustsn.github.io/agent-audit-tracker/`

## Three kinds of information, kept apart
The page never presents the researcher's classification as a requirement of a standard. Every section and detail is labelled with one of these layers:

| Layer | What it is | Files |
|---|---|---|
| **Document fact** | Stated by a document or its registry, with a revision or pointer: status, revisions, citations, identifiers as written, requirement levels quoted from the text, declared stability | `status.json`, `references.json` (generated), `document_facts.json` (by hand) |
| **Researcher classification** | The researcher's evidence questions, specification-status ratings, roles, document-type labels, maturity normalisation, coding links and links found by reading (Verified / Pending) | `fields.json`, `classification.json`, `requirements.json` |
| **Evidence quality** | How far an auditor could rely on a field or record format: origin as specified, integrity. "Not established" means not yet assessed, not absent | `quality.json` |

A fourth label, **Automatic check**, marks heuristics computed by the update script (the revision comparison).

## What is on the page
Items marked *(ratings mode)* are hidden in the current catalogue version (`"show_ratings": false`); they appear only when ratings are switched on.

- **Observations.** Three tiers kept apart:
  - descriptive statistics, computed from the data each time the page loads;
  - researcher observations, dated notes that are marked when the figures they were based on change;
  - research findings, listed only as links to published work with a citable identifier.
- **Provenance.** Everything needed to check the data again:
  - the archive URL and SHA-256 of each Internet-Draft and RFC text (fetched and hashed automatically; whether a text was read is recorded separately), and full commit SHAs for repositories;
  - the build (source commit, workflow run, SHA-256 of every curated file);
  - *(ratings mode)* who rated and which sections were read, a log of every change to a rating, and step-by-step instructions to re-verify a rating.
- **Overview.** Tracked documents; documents updated in the 30 days before the last check; current references to drafts that have since been replaced; related drafts found. *(ratings mode)* Questions rated explicit at a current revision (and how many more an older read would add); documents needing review.
- *(ratings mode)* **Audit question view.** For one of the researcher's evidence questions:
  - the OWASP requirement units linked to it by coding;
  - telemetry fields and other documents, as rated, grouped by role;
  - what is missing at current revisions;
  - where it is not specified versus not reviewed.
- *(ratings mode)* **Review queue.** Newer revisions (with the automatic revision check), unread documents, cells rated "to check", current references to replaced drafts, failed status checks.
- *(ratings mode)* **Specification status.** The matrix: evidence questions × documents. Six statuses: explicitly specified, partially specified, referenced externally, to check, not specified (read, not defined), not reviewed (nobody checked). Cells are never created in advance; a missing cell is shown as not reviewed. Filters by question, document and status.
- *(ratings mode)* **Provenance.** For each matrix column: document type, the revision read, the date, how it was read, the current revision and where the status came from.
- **References between documents.** Citations recorded by the IETF Datatracker per revision: the revision that was read and the current one, never mixed, with the differences. Normative and informative citations are separated. Process references (RFC 2119, RFC 8174, BCP 14) are hidden by default and counted. Links to documents outside the Datatracker (MCP, A2A, in-toto) are listed separately as links found by reading, each with a pointer and a verification state. A normative reference is a citation type; it does not mean that one document implements the other.
- **Tracked documents.** Type (from the registry where one exists, otherwise a researcher label), roles (researcher, several allowed), version, state as reported with the researcher's maturity normalisation, and declared stability kept separate.
- **Recent changes** and **related drafts to review** (active drafts that cite a tracked draft; not reviewed).
- **Search and export.** The search box filters every table. Exports: references (CSV, both revision views), related drafts, all data (JSON, with the layer of each file); *(ratings mode)* matrix (CSV, one row per cell, columns prefixed by layer) and review queue. Links of the form `#doc=ietf-aat`, `#cell=ietf-aat/credential` and `#question=credential` open a detail panel directly.

## How it is updated
`scripts/update_status.py` uses the Python standard library only.
- **Status** from the IETF Datatracker and the GitHub REST API (`data/status.json`).
- **References** per revision from the Datatracker related-document APIs, with the title and state of each cited document (`data/references.json`).
- **Revision check** when a column was rated at an older revision: IETF archive text or the GitHub compare API; changed lines, section headings, and whether each identifier in `fields.json` (`ids`) still appears or sits in a changed line. It only points to where to read.
- **Discovery** of active drafts that cite a tracked draft, with the date each was first seen.
- It appends to `data/changes.json` and rebuilds `data/bundle.js`, which the page reads.

`.github/workflows/update.yml` runs the script once a week (Mondays at 01:00 UTC), when you press **Run workflow** in the Actions tab, and on every push to `main`. It commits the refreshed data with the built-in `GITHUB_TOKEN` (no other secret is used) and then publishes the site with the GitHub Pages actions in the same run, because commits made with `GITHUB_TOKEN` do not start a Pages build on their own. Set **Settings → Pages → Source** to **GitHub Actions**.

Only document facts are refreshed automatically. The researcher's ratings, roles and quality assessments change only when someone edits the curated files. The **Observations** section is computed in the browser from the published data, so it always matches it.

`data/requirements.json` is imported from a copy of the agent-telemetry-coverage dataset:
```bash
python3 -I scripts/import_requirements.py ../agent-telemetry-coverage
```

Run locally:
```bash
python3 -I scripts/update_status.py
# then open index.html in a browser (no server needed)
```

## Security
- No `innerHTML` or `eval`. All text from the data, including titles written by third parties, is inserted as text.
- Links are limited to `https:` and open with `rel="noopener noreferrer"`.
- A content security policy (`<meta>`) allows scripts and styles from the site itself only, and no network connections.
- No cookies, no browser storage, no analytics, no external resources.
- CSV exports neutralise spreadsheet formulas (CSV injection). A cell whose first non-blank character is `=`, `+`, `-` or `@`, or that starts with a tab, CR or LF, gets a leading `'`. Revision numbers are exported without their leading dash for this reason.
- The update job sends `GITHUB_TOKEN` only to `api.github.com`, as an unredirected header, so it is never forwarded on a redirect.
- The workflow:
  - pins every action to a full commit SHA;
  - starts from no permissions;
  - gives the update job `contents: write` and the publish job `pages: write` and `id-token: write` only.
- Only accounts with write access to the repository can change the data. Every change is in the commit history. Pull requests from forks do not run the workflow.
- Recommended repository settings:
  - restricted default workflow permissions;
  - only actions created by GitHub;
  - two-factor authentication on the maintainer account.

## Scope and limits
- **Coverage.** The page has a table "What this tracker covers", which lists the areas of agent-audit criteria that are tracked, partly tracked, tracked for status only, not tracked or out of scope. The tracker does not audit agents and holds no organisation's evidence.
- **In scope:** audit evidence for individual agent actions: identity, authorisation, tool provenance and record integrity.
- **Out of scope:** runtime monitoring, model evaluation and safety testing.
- **Moving targets.** Internet-Drafts are work in progress and may change or expire. The matrix reflects the revision named in each column, not later ones.
- **Status date.** Status is as of the "last checked" date shown on the page.
- **Requirement links** are researcher coding. They come from single-coder coding (agent-telemetry-coverage v0.1). A second-coder adjudication is pending, so counts may change.
- **Not advice.** Nothing here is legal or compliance advice.
- **Pointers only.** Control references (ISO/IEC 27001, PCI DSS) are pointers only; no standard text is reproduced.
- Please report corrections as GitHub issues.

## Related
- [agent-telemetry-coverage](https://github.com/anustsn/agent-telemetry-coverage): which OWASP agentic and MCP monitoring requirements the OpenTelemetry GenAI conventions can evidence. The signal codes in the matrix (S01 to S34) and the requirement links come from its catalogue.

## Licence
- Code (`scripts/`, `assets/`, `index.html`, workflow): MIT, see [LICENSE](LICENSE).
- Data (`data/`): CC BY 4.0, except `requirements.json` (CC BY-SA 4.0). See [LICENSE-DATA.md](LICENSE-DATA.md).

## Citation
See [CITATION.cff](CITATION.cff).
