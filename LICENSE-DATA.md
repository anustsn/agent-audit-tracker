# Data licence

The files in `data/` are licensed under the Creative Commons Attribution 4.0 International licence (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/
- Curated: `sources.json`, `fields.json`, `classification.json`, `quality.json`, `document_facts.json`, `observations.json`, `findings.json` and `site.json`.
- Imported: `requirements.json` (see the exception below).
- Generated: `status.json`, `references.json`, `changes.json`, `ratings_log.json` and `bundle.js`. `references.json` holds citation metadata from the IETF Datatracker (document names, titles, states), not document text.

Attribution: Anutsetsen Enkhzorigt, Agent Audit Tracker, https://github.com/anustsn/agent-audit-tracker

Exception: `requirements.json` is derived from the [agent-telemetry-coverage](https://github.com/anustsn/agent-telemetry-coverage) dataset, which is licensed CC BY-SA 4.0 because it is derived from the OWASP documents. `requirements.json` is therefore licensed CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ . It holds only requirement unit identifiers and risk titles, not requirement text. `bundle.js` embeds a copy of it; that part of `bundle.js` is under the same CC BY-SA 4.0 terms.

The tracked documents are not copied here. Each keeps its own licence and terms; follow the links. Field and attribute names are quoted only as short identifiers.
