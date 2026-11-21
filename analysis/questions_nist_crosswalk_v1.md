# The ten evidence questions and NIST SP 800-53

**Purpose:** show the authoritative basis of each of the tracker's ten evidence questions (`data/fields.json`).

The questions are defined by the researcher. This crosswalk checks each one against NIST SP 800-53, a public control catalogue.

| Item | Value |
|---|---|
| Source | NIST SP 800-53 Rev. 5.2.0, OSCAL catalog, `usnistgov/oscal-content` commit `5006f18c8047643eaa70e35dd0d20a58bcc41856` (2026-10-22) |
| File SHA-256 | `64ca6b4161de51ab6af098a7d101d326f14c95e1abf721396cd8a049e8115eeb` |
| Scope | Control statements only (not discussion or assessment text) |
| Status | **Checked by the maintainer on 2026-11-20: all ten rows agreed** (column `anu_check` in the CSV). |

The excerpts are taken from the catalog, and every one was checked against the catalog text. NIST SP 800-53 is a work of the US government.

## How each link is classified

| Link | Meaning |
|---|---|
| **Direct** | A control statement requires audit records to contain this information, or to be generated or protected in this respect. |
| **Indirect** | A control requires the underlying capability (identify, authenticate, authorise, inventory), but no control statement requires recording it for each event. |
| **None** | No control statement found. |

## Results

| # | Question | Link | NIST controls | Why |
|---|---|---|---|---|
| 1 | Which agent acted? | **Direct** | AU-3(f), IA-9 | AU-3 requires "Identity of any individuals, subjects, or objects/entities associated with the event". |
| 2 | Was the identity verified, and at what level? | Indirect | IA-2, IA-8, IA-9, AU-10(1), AU-10(2) | Authentication is required, and AU-10(1) binds a producer identity "to [strength of binding]". No control requires the record to state how identity was verified. |
| 3 | On whose behalf? | Indirect | IA-2, IA-8, AU-10, AC-6 | IA-2 requires associating a user's identification "with processes acting on behalf of those users". No control requires the record to name both the acting process and the principal. |
| 4 | Which credential or token? | Indirect | IA-5, AU-10(3) | Authenticators must be managed and protected. Recording which credential was used for each event is not required. |
| 5 | Was the action authorised, and under which policy? | Indirect | AC-3, AC-6, AC-6(9), AU-2 | Authorisations must be enforced. Logging the decision and the policy is left to the organisation's chosen event types. |
| 6 | Which tool, and which version? | Indirect | CM-8, SR-4, CM-14, AU-3(d) | Inventory and provenance are required. The component version is not a required field of each record. |
| 7 | What action, with what outcome? | **Direct** | AU-3(a),(e), AC-6(9) | "What type of event occurred" and "Outcome of the event". |
| 8 | Can records be linked? | **Direct** (time, place) / Indirect (session) | AU-3(b),(c), AU-6(3), AU-16 | Time and place are required fields. A session or workflow identifier is not. |
| 9 | Is the record tamper-evident? | **Direct** | AU-9, AU-9(3), AU-10 | Protect audit information from modification. Cryptographic integrity is an enhancement. |
| 10 | Who writes the record? | Indirect | AU-12, AU-9(2) | The system generates the records and, as an enhancement, stores them on a separate system. No control addresses a subject that records its own actions. |

## Summary

- **Every question has a NIST basis.** None is classified "None", so the question set has an authoritative grounding.
- **Directly required content:** questions 1, 7, 8 (time, place) and 9. These are the classic audit-record fields.
- **Indirect:** questions 2–6 and 10, which are the agent-specific questions.
  - NIST requires the capability: authenticate, associate identity with processes acting on behalf of users, enforce authorisations, keep an inventory.
  - It does not require that capability to be recorded in each audit record.
- **The words used:** NIST speaks of "processes acting on behalf of" users (IA-2, IA-8, AC-6, AU-10, AC-16). No control statement uses the word "delegation".

## How to check (maintainer)

For each row in `questions_nist_crosswalk.csv`:
1. Open the control in NIST SP 800-53 Rev. 5 (https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final), or in the pinned OSCAL file (https://github.com/usnistgov/oscal-content/blob/5006f18c8047643eaa70e35dd0d20a58bcc41856/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json).
2. Confirm that the excerpt matches the control statement.
3. Confirm that the link type (Direct or Indirect) follows the rules above.
4. Write `agree`, or `disagree: <reason>`, in `anu_check`.

## Correction

An earlier draft note said "no NIST control covers acting on someone's behalf". That was wrong:
- IA-2, IA-8, AC-6 and AU-10 all refer to "processes acting on behalf of" users.

The accurate statement is narrower:
- the capability is required;
- recording both the acting process and the principal in each audit record is not.
