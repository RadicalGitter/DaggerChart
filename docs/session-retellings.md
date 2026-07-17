# Session perspectives and retellings

The session chronicler turns player perspectives and a GM summary into a
reviewed campaign chronicle entry. It never publishes model output directly.

## Local configuration

Put the Anthropic API key in the gitignored `.env.local` at the repository
root:

```text
ANTHROPIC_API_KEY=your-key-here
```

`RETELL_MODEL` is optional. The default is `claude-opus-4-8`:

```text
RETELL_MODEL=claude-opus-4-8
```

Restart the server after changing `.env.local`. The key is read only by
`server/retell.js`; it is never persisted in campaign JSON or returned to a
browser.

## Table workflow

1. The GM opens **Sessions**, marks the characters who attended, and presses
   **The session ends**.
2. Each chosen player finds a prompt under the **Chronicle** bookmark in their
   journal. They can revise their own perspective while the session is
   gathering.
3. The GM sees completion seals, writes a factual summary and a separate point
   of emphasis, then presses **Send to the chronicler**.
4. The returned account remains private in **awaiting review**. The GM edits
   and saves it before pressing **Enter it into the chronicle**.
5. Publication creates the normal campaign-scoped published log entry, so the
   account appears in the existing table Chronicle and in the journal archive.

An interrupted request returns to `failed` on the next boot and can be sent
again. Missing keys, provider rejection, timeouts, and exhausted retries leave
the session unpublished.

## Audience boundary

The model prompt is built from an explicit list of player-known fields:

- the GM factual summary and point of emphasis;
- the chosen participants' submitted perspectives; and
- earlier **published** retellings from the same campaign.

It does not consume `gmView()`, hidden fields, unpublished ledger entries,
other campaigns, or event-table data. Before publication, a player receives
only their own perspective, participant names with completion booleans, and a
coarse workflow status. Other perspectives, the GM fields, provider errors,
and the draft retelling stay GM-only.

## Provider behavior

`server/retell.js` calls the Anthropic Messages API directly with no SDK. The
request has a 60-second timeout and retries once after a 429 or 5xx response.
The prompt template is exported as `RETELL_SYSTEM_PROMPT` so tone changes have
one source of truth. Earlier history is bounded: recent accounts remain in
full while older accounts are reduced to their first paragraph when needed.
