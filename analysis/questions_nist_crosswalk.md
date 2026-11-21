# The ten evidence questions and NIST SP 800-53 (v2)

**Purpose:** show the authoritative basis of each of the tracker's ten evidence questions (`data/fields.json`).

The questions are defined by the researcher. This crosswalk checks each one against NIST SP 800-53, a public control catalogue.

| Item | Value |
|---|---|
| Source | NIST SP 800-53 Rev. 5.2.0, OSCAL catalog, `usnistgov/oscal-content` commit `5006f18c8047643eaa70e35dd0d20a58bcc41856` (2026-10-22) |
| File SHA-256 | `64ca6b4161de51ab6af098a7d101d326f14c95e1abf721396cd8a049e8115eeb` |
| Scope | Control statements only. Guidance is mentioned only where noted. |
| Status | **v2, agreed by the maintainer on 2026-11-20** (column `anu_check` in the CSV). v1 is kept as `questions_nist_crosswalk_v1.*`. |

The excerpts are taken from the catalog, and every one was checked against the catalog text. NIST SP 800-53 is a work of the US government.

## How each link is classified

| Link | Meaning |
|---|---|
| **Direct** | A control statement requires audit records to contain this information, or to be generated or protected in this respect. |
| **Indirect** | A control requires the underlying capability (identify, authenticate, authorise, isolate, inventory), but no control statement requires recording it for each event. |
| **None** | No control statement found. |

## Results

| # | Question | Link | Main NIST controls |
|---|---|---|---|
| 1 | Which agent acted? | **Direct** | AU-3(d),(f); IA-9; IA-13 |
| 2 | Was the identity verified, and at what level? | Indirect | IA-9; IA-13, IA-13(2); IA-12(a) for the human principal only |
| 3 | On whose behalf? | Indirect | IA-2; IA-8; AU-3(d),(f); AU-10; SA-8(22) |
| 4 | Which credential or token? | Indirect | IA-5; IA-13(2); AU-10(3) (narrow) |
| 5 | Was the action authorised, under which policy? | **Direct** for the outcome (narrow cases); Indirect for the decision and policy | AU-3(e); AC-6(9); AC-3(10); AC-3; AC-24; AU-3(1) |
| 6 | Which tool, which version? | Indirect | CM-8; SR-4; CM-14; AU-3(d) |
| 7 | What action, with what outcome? | **Direct** | AU-3(a),(e); AC-6(9) |
| 8 | Can records be linked? | **Direct** for time order; Indirect for session or workflow linkage | AU-3(b),(c); AU-8; AU-12(1); SC-23(3); AU-14 |
| 9 | Is the record tamper-evident? | **Direct** | AU-9(a),(b); AU-9(3); AU-7(b) |
| 10 | Who writes the record? | **Direct** for separate storage; Indirect for independent generation | AU-9(2); AU-12(a); SC-7(15); AU-9(4) |

The CSV holds the verbatim excerpts and the reason for each row.

## Summary

- **Every question has a NIST basis.** None is classified "None".
- **Directly required content:**
  - which agent (as a subject);
  - action and outcome;
  - time order;
  - protection against modification;
  - separate storage.
- **Indirect** (the capability is required, but recording it for each event is not):
  - how identity was verified;
  - the principal;
  - the credential or token used;
  - the authorisation decision and policy;
  - the tool version;
  - session or workflow linkage;
  - whether the record is generated independently of the actor.
- **The principal (the key wording):**
  - No control explicitly requires every audit record to name both the acting process and the principal on whose behalf it acted.
  - AU-3(d),(f) and AU-10 come closest. AU-10 applies only to organisation-selected actions, and can be met by signatures or receipts rather than log fields.
  - IA-2 and IA-8 require the user-to-process association to exist, but not to be logged.
  - No control statement uses the word "delegation". NIST's phrase is "processes acting on behalf of" users.
- **Outcome is not authorisation.** A successful action by an over-privileged agent is not evidence that it was authorised.
- **IA-13 is the most agent-relevant identity control.** It is the only one that names non-person entities (NPE) and token verification.
- **How Indirect items become required:** AU-3(1) lets an organisation require additional content in its audit records. This is how an organisation can make any Indirect item mandatory for its own systems.
- **Limits:**
  - Several Direct ratings rest on enhancements whose values the organisation sets (frequency, tolerance, which actions).
  - Allocation to NIST baselines was not checked.

## Review history

| Version | What happened |
|---|---|
| v1 (2026-11-20) | First draft. Agreed by the maintainer. |
| Second review | Independent and blind-first. 7 of 10 rows agreed. The reviewer flagged Q5, Q8 and Q10, and two weak citations (Q2, Q4). |
| Third review | Independent, adjudicating the proposed changes. Recorder independence changed from None to Indirect (SC-7(15), AU-9(4)). IA-13 and IA-13(2) added. Time order separated from linkage (AU-8, AU-12(1)). "Outcome is not authorisation" added. The principal wording made more precise. |
| v2 (2026-11-20) | All changes applied. Every quote re-checked against the catalog. Agreed by the maintainer. |

**An earlier claim was corrected.** It said "no NIST control covers acting on someone's behalf". That was wrong: IA-2, IA-8, AC-6 and AU-10 refer to "processes acting on behalf of" users. The accurate statement is the one under "The principal" above.
