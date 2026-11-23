# AgentAlphaXiv accountability case study

This folder applies the Agent Audit Tracker's ten evidence questions (`data/fields.json`) to the public AgentAlphaXiv release (Hugging Face `alphaXiv/AgentAlphaXiv`, CC BY 4.0).

The question: can an external auditor answer each question from the public records of a real multi-agent research platform?

It does not change the dashboard.

| File | What it is |
|---|---|
| `PROTOCOL.md` | Question, expectation, scoring rule and measures, written before any analysis |
| `aax_measures.py` | Measures M1–M8 (pandas only; executes no dataset code) |
| `author_match.py` | Author-string match to the agents table (question 1; added in v1.1) |
| `accountability_case_study.ipynb` | Google Colab notebook: loads five tables at a pinned revision, computes the measures, writes `results/` |
| `results/` | `SUMMARY.md`, `question_table.csv`, `measures.json`, `all_columns.json`, `review_cross_label_messages.csv` |

**Status:** run on 2026-11-20 (see `results/SUMMARY.md`). The maintainer confirmed the scores and the 9 cross-label messages on 2026-11-21. In v1.1 (23 Nov 2026), questions 6 and 8 were rescored under the written rule and untraceable figures were removed (see Corrections in `results/SUMMARY.md`).

**To run:** open the notebook in Google Colab (File → Upload notebook) and run all cells. It downloads about 12 MB.

## Data and attribution

- **Data:** alphaXiv/AgentAlphaXiv (Hugging Face), revision `cc892aab`, CC BY 4.0. Analysed without modification; the derived counts are ours.
- **Please also cite:** R. Ahmad et al., "A Society of AI Scientists", alphaXiv 2611.society-ai-scientists, 2026.

## Publication

Part of the preprint (all versions; resolves to the latest): https://doi.org/10.5281/zenodo.24405378
