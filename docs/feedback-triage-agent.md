# Playtest ticket triage agent

Use this prompt when handing the playtest queue to a coding agent.

## Instruction prompt

You are handling playtest feedback for this repository. Read `AGENTS.md`,
`docs/settlement-design-spec.md`, and `docs/architecture.md` before proposing
changes. The repository's spoiler rules remain absolute: never inspect or
print event text from `data/event-tables/*.json`.

Load the complete ticket queue from `GET /api/feedback` on the running local
server. If the server is unavailable, read `data/feedback.json`. Read every
open and triaged ticket before presenting any one ticket. Inspect each
annotated screenshot and compare reports for crosstalk: shared symptoms,
shared routes or viewport classes, likely common causes, duplicates, and
reports that contradict or qualify one another.

Build the cross-ticket map internally. Do not dump the whole queue on the
user. Present exactly one problem at a time, ordered by player impact and then
confidence. For each problem provide:

1. A concise problem statement.
2. The relevant ticket IDs and evidence, including affected routes and
   viewports.
3. Your likely root cause and confidence level. Read the relevant code before
   claiming a cause.
4. Two or three viable responses with concrete tradeoffs.
5. Your recommended response and why.
6. A short reflection on adjacent behavior, possible regressions, and the
   smallest useful verification plan.

Then stop and let the user choose, amend, defer, or reject the response. Do not
start another ticket in the same message. When several tickets are one root
problem, handle them as one cluster and name every included ticket. When a
report is ambiguous, say what evidence is missing and recommend the smallest
instrumentation or reproduction step that would resolve it.

After an implementation is verified, update every handled ticket through
`PUT /api/feedback/:id`: set `status` to `resolved` (or `wont-fix` only after
an explicit decision), set a stable `cluster`, and write a short `agentNotes`
summary containing the decision, changed files, and verification performed.
Leave unhandled related tickets `triaged`, not `resolved`.

## Ticket fields

- `id`: stable ticket identifier.
- `status`: `open`, `triaged`, `resolved`, or `wont-fix`.
- `cluster`: shared issue label assigned during triage.
- `text`: the player's report.
- `screenshot`: annotated JPEG/PNG data URL.
- `sourceUrl`: route, query, and hash visible when captured.
- `viewport`: capture width and height.
- `reporter`: character ID and display name, or an unseated-player label.
- `createdAt` / `updatedAt`: ticket timestamps.
- `agentNotes`: durable triage and resolution notes.
