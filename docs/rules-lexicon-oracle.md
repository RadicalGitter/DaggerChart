# Rules Lexicon Oracle (scoped)

- Status: proposed scope
- Date: 2026-07-23
- Upstream mechanism: Kode-CLI `docs/product/32_frontier_agent_token_economy.md`
  (WS2 — resident context/lexicon oracle) and the checkpointed branch-inference work.

## Intent

Hold the daggerchart rules corpus **resident in a local model's KV** and answer
small lookups without loading source into an agent's context. daggerchart is a
**consumer** of the resident-oracle mechanism defined upstream; this note records
its identified uses so the surface can be designed against real queries.

## Identified uses

- **Rules lookup** (first use): resolve a specific rule / adversary stat / system
  interaction by querying the resident lexicon over the almanac, adversary
  sources, and systems docs — small question in, small authoritative answer out,
  with a citation back to the source doc.
- (Further surfaces TBD — e.g. consistency checks across the corpus, "what
  references X", cartography/almanac cross-lookups.)

## Notes

- The corpus is large and mostly static between sessions — a good fit for a
  resident, checkpointed KV oracle rather than repeated file ingestion.
- Answers must cite the source doc; the oracle proposes, canon stays in the docs.
- Exact query surface and integration point are open; design them against a real
  list of lookups actually performed while working on daggerchart.
