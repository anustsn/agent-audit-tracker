# Accountability evidence in an autonomous agent society

**Case study:** applying the Agent Audit Tracker's ten evidence questions to the public AgentAlphaXiv release.

| Item | Value |
|---|---|
| Status | **v0.1, used as drafted. On 2026-11-20 the maintainer agreed the ten questions (see `../questions_nist_crosswalk.csv`) and asked for the run. Frozen from this version on.** |
| Data | Hugging Face `alphaXiv/AgentAlphaXiv`, revision `cc892aab131be3872283e1a778af663382315817` (2026-11-20), CC BY 4.0 |
| Questions | The ten evidence questions in `data/fields.json` of this repository |
| Change rule | After approval, this file is frozen. Any later change is listed under "Deviations" with a date and reason. |

## 1. Question

To what extent can an external auditor answer the ten evidence questions from the **public records** of a real multi-agent research platform?

The platform's internal logs are not available. This study is only about what an outsider can see in the public release.

## 2. Expectation, stated before analysis

- **Content questions are well supported** by the public records:
  - *action*: what was done;
  - *correlation*: can records be linked;
  - *integrity*: can changes be detected.
- **Actor questions are weakly supported or not supported:**
  - *agent* (for authorship);
  - *verified*;
  - *principal*;
  - *credential*;
  - *decision*;
  - *recorder*.

**What would contradict this:** a public column that records verified identity, the responsible principal, the credential used, or an authorisation decision for most records. If such a column exists, the expectation is wrong. That result is reported the same way.

## 3. What was known before this protocol was written

- The schema of the tables (column names) and one sample row per table were inspected on 2026-11-20.
- The dataset card was read:
  - operators were replaced by lab pseudonyms;
  - names, emails, keys, IPs and usernames were redacted;
  - credential and config files were dropped.
- The technical report ("A Society of AI Scientists", alphaXiv 2611.society-ai-scientists) states two relevant points:
  - compliance with the rule against manual assistance "relied on participant disclosure rather than technical enforcement";
  - operator scripts uploaded placeholder stubs.

## 4. Data used

Only these tables, read at the pinned revision:

| Table | Rows (card) | Used for |
|---|---|---|
| `agents` | 896 | agent IDs, display names, lab |
| `studies` | 916 | free-text author strings, lab |
| `versions` | 1,352 | publication time, change summary, git commit |
| `messages` | 9,052 | sender ID, sender name, self-labels in text, room or channel |
| `artifacts` | 82,805 | file hashes (sha256), kind, project link |

**Not used:**
- `paper_texts`, `posts`, `rooms`;
- PDFs;
- the 6.3 GB artifact archives.

**Ethics:**
- No code from the dataset is executed.
- No attempt is made to reverse redactions or to identify operators or people.
- Only counts and shares are reported, with no quoted personal data.

## 5. Scoring rule for each question (fixed before analysis)

| Score | Meaning |
|---|---|
| **A: answerable** | A public column records the answer. The value is assigned by the platform, not self-declared free text. The column is filled for ≥ 95% of the relevant records. |
| **P: partial** | A column exists, but at least one of these holds: it is self-declared or free text, it covers < 95% of records, it answers only part of the question, or it identifies a group (such as a lab pseudonym) rather than the responsible party. |
| **N: not answerable** | No public column records the answer. |

**Integrity:**
- **A** requires record-level signatures or a hash chain over the records themselves.
- Hashes of attached files without a signed or chained log score **P**.

## 6. Question-to-column mapping (to be confirmed by the maintainer)

This mapping is a researcher classification. It is not a statement about what the platform logs internally.

| Question | Columns checked | Measure |
|---|---|---|
| agent: which agent acted? | `messages.sender_agent_id`; `studies.authors`, `versions.authors` | M1, M2 |
| verified: was identity verified, at what level? | any verification or attestation column | M8 |
| principal: on whose behalf? | `lab` in `agents`, `messages`, `studies` | M1, M4 |
| credential: which credential or token? | any credential, key or scope column | M8 |
| decision: was the action authorised, under which policy? | any permission, policy or approval column | M8 |
| tool: which tool, which version or schema hash? | `artifacts.kind` (environment-type files); any tool or version column | M1, M8 |
| action: what action, with what outcome? | `versions.published_at`, `versions.change_summary`; `messages.text`, `messages.sent_at` | M1 |
| correlation: can records be linked? | `project_id` links; `messages.room_id` / `channel` | M6 |
| integrity: is the record tamper-evident? | `artifacts.sha256`, `versions.repository_commit` | M5 |
| recorder: who writes the record? | platform-assigned IDs and timestamps vs self-declared fields; any actor-type column | M3, M7 |

## 7. Measures

All measures are computed by code. The same input gives the same output.

- **M1. Coverage:** the share of non-null values for each mapped column.
- **M2. Author attribution.** For each study, are its author strings linked to platform agents?
  - Linked: an author string equals an `agents.display_name` (case-insensitive, trimmed), or contains a platform name token (`Word-XXXXXXXX`) that exists in `agents`.
  - Study-level result: all linked / some linked / none linked.
- **M3. Self-declared identity in chat.**
  - Count the messages whose text starts with a bracketed label `[...]`.
  - Among these, count where the label contains the sender's own name token.
  - Separately, count where the label contains a different agent's name token and not the sender's own (cross-label cases).
- **M4. Group-level attribution:** the share of null `lab` values in `agents`, `messages` and `studies`.
- **M5. Integrity material:**
  - the share of artifacts with a well-formed sha256 (64 hex characters);
  - the share of versions with a git commit (40 hex characters).
- **M6. Linkability:**
  - the share of artifacts and versions whose `project_id` resolves to a study;
  - the share of messages with a room or channel.
- **M7. Actor type:** do any columns, in any table, distinguish human from agent actions? (Column-name scan; matches are reviewed by hand.)
- **M8. Authority columns:** do any columns name a verification, credential, permission, policy, approval or decision? (Column-name scan; matches are reviewed by hand.)

## 8. Outputs

All outputs go in `results/`:
- `question_table.csv`: each question with its score (A, P or N), the columns checked and the measure values;
- `measures.json`: every measure, with the dataset revision and run time;
- the notebook `accountability_case_study.ipynb`, runnable in Google Colab.

## 9. Limits

- This is a single research platform. The results do not generalise to other agent systems.
- Only the public release is studied. The release deliberately removed operator information, so a missing principal may come from the release rather than from the platform.
- The column-name scans (M7, M8) can miss fields with unexpected names. Every match and every N score is reviewed by hand.

## 10. Deviations

1. **2026-11-20, data access method (no effect on the measures).** The tables were read through the Hugging Face datasets-server `/rows` API as JSON, because the analysis machine has no parquet reader and installing one is not allowed. These are the same rows as the parquet files of the same dataset revision. The dataset revision was checked before and after the download. The Colab notebook remains the reference way to reproduce the run from the parquet files.
