# Results: accountability evidence in the AgentAlphaXiv release

| Item | Value |
|---|---|
| Run | 2026-11-20 16:05 UTC |
| Protocol | `../PROTOCOL.md` v0.1, SHA-256 `d029d8eb…` |
| Data | `alphaXiv/AgentAlphaXiv` revision `cc892aab`, the same before and after the download |
| Row counts | All five tables match the dataset card: 896 / 916 / 1,352 / 9,052 / 82,805. Every row ID is unique. |
| Access | datasets-server `/rows` API (protocol deviation 1) |
| Detail | Every measure is in `measures.json`; the score table is `question_table.csv` |

## Scores (rule in protocol section 5)

| # | Question | Score | Evidence in the public records |
|---|---|---|---|
| 1 | Which agent acted? | **P** | Chat: the platform assigns a sender ID to 100% of 9,052 messages. Papers: authors are a free-text field. 944 of 951 author strings use the platform's agent names; 7 do not. |
| 2 | Was the identity verified? | **N** | No column records verification or its level. |
| 3 | On whose behalf? | **P** | Only a lab pseudonym. The release replaced operator accounts with lab pseudonyms (31 labs) and redacted names and emails, so the mapping exists at the platform but is not public. The pseudonym is missing for 10.3% of agents (92) and 5.8% of messages. |
| 4 | Which credential or token? | **N** | No column. |
| 5 | Was the action authorised, under which policy? | **N** | No column. |
| 6 | Which tool and version? | **P** | No tool or version column. At version level, 63.5% of versions (858 of 1,352) list an environment file and 92.3% list an agent trace, but only as file paths; which tool and version served which action is not recorded. Opening the files could describe their content but could not change the score: per-action tool versions are not a field of the record. |
| 7 | What action, with what outcome? | **A** | Publication time for 100% of versions; text and time for 100% of messages. A change summary exists for 67.3% of versions. |
| 8 | Can records be linked? | **A** | 100% of artifacts and versions resolve to a study. 100% of messages have a room or channel. Chat messages have no study field; only 31.7% (2,865) mention a study or version ID in their text. |
| 9 | Is the record tamper-evident? | **P** | 100% of artifacts have a well-formed SHA-256. Only 5.0% of versions (68 of 1,352) carry a git commit. The record log itself is not signed or hash-chained, and none of the 1,840 released files is a signature or signed manifest. |
| 10 | Who writes the record? | **P** | The platform assigns IDs and timestamps, but the content (text, author strings, self-labels) is written by the agents. No column distinguishes human from agent actions. |

## Compared with the stated expectation (protocol section 2)

- **Content questions.**
  - Action and correlation are **A**, as expected.
  - Integrity is **P**, not A. File hashes exist, but by the pre-set rule an unsigned log cannot score A.
- **Actor questions**, all as expected:
  - verified, credential and decision are **N**;
  - agent, principal and recorder are **P**.
- **Summary:** the public records show well *what* was done and *how records link*. They show *who* only as a platform account. They do not show *on whose authority* or *whether it was allowed*.
- **This agrees with the technical report.** The report says that the rule against manual assistance "relied on participant disclosure rather than technical enforcement". No column in the release could tell a human action from an agent action.

## Self-declared identity in chat (M3)

- **1,183 messages (13.1%) start with a bracketed label.**
  - 129 contain the sender's own platform name.
  - 9 name a different agent and not the sender.
  - The rest use informal names, such as "Agent B", that cannot be checked against the platform.
- **The 9 cross-label messages** are listed in `review_cross_label_messages.csv`. On a first reading all 9 name the **addressee** ("Agent D -> Agent C / Cedar-…", "@Aspen-…", "Correction to my message … to Agent …"). None looks like impersonation. The maintainer confirmed this on 2026-11-21.

## Manual review (protocol section 9)

- **Column scans M7 and M8 found no column for:**
  - actor type;
  - verification;
  - credential;
  - permission, policy or decision;
  - tool version.
- **Every N was re-checked against the full column list** (`all_columns.json`). No field with an unexpected name records principal, credential, decision or verification.
- **Confirmed by the maintainer on 2026-11-21:** the scores above and the reading of the 9 cross-label messages (all name the addressee; no impersonation).

## Limits

- **One research platform.** The results do not generalise to other agent systems.
- **Public release only.** Operator accounts were deliberately replaced by lab pseudonyms for privacy. So the *principal* gap partly reflects the release, not necessarily the platform's internal logs. This tension between privacy and accountability is itself a finding to report.
- **Bracketed labels (M3)** are a simple convention test. Informal labels are not counted as impersonation.

## Data and attribution

- **Data:** alphaXiv/AgentAlphaXiv (Hugging Face), revision `cc892aab`, snapshot of 17 Nov 2026, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). The tables were analysed without modification. The derived counts and scores are ours.
- **Report:** R. Ahmad et al., "A Society of AI Scientists", alphaXiv 2611.society-ai-scientists, November 2026.
