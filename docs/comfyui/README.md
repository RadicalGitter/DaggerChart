# ComfyUI art workshop

The server can generate art for player characters, wider-world people, and
places through a local ComfyUI instance. Player characters and people share
the portrait workflow; places use the scenic workflow.

The creator can also ask Anthropic for one prose suggestion before generation.
That writing aid uses `ANTHROPIC_API_KEY` and defaults to `RETELL_MODEL`; set
`PORTRAIT_SUGGEST_MODEL` to give it a separate model. The request contains only
the current character's player-known identity, visual tags, colors, included
equipment, and current portrait prose. It is never applied until the player
presses **Use this prose**.

## Install the workflows

1. In ComfyUI, enable developer options and export each finished workflow with
   **Save (API Format)**. A normal UI workflow export cannot be queued by the
   API.
2. Put the API graphs here:
   - `docs/comfyui/workflows/Qwen2.1-Fantasy-portrait.json`
   - `docs/comfyui/workflows/Vessarin Scene Cards.json`
3. Put `{{prompt}}` in the workflow's positive text input. The app substitutes
   this token in the parsed graph, so node IDs may change freely. As a fallback,
   the adapter also recognizes one `PrimitiveStringMultiline` input titled
   `Prompt`, which is how the scenic graph exposes its request text.
4. Ensure the graph ends in at least one `SaveImage`-style output. The app
   collects up to four returned images and chooses the first one for the
   character or place.

Only saved (`output`) images are collected; temporary preview copies are
excluded, and repeated file descriptors are deduplicated. This keeps the
Qwen graph's preview and save branches from creating duplicate Folk attempts.

The checked-in graphs under `docs/comfyui/workflows/` are the production API
graphs. The portrait graph is adapted from the owner's root
`Qwen2.1-Fantasy-portrait.json`, which remains unchanged. Its neutral sampler
is Steps `22`, CFG `1`, `euler` / `sgm_uniform`, with a 3:4 frame at two
megapixels chosen by `ResolutionSelector`. The earlier `Vessarin Portraits.json`
remains available as a legacy API graph. The earlier
`waidrin-portraits-workflow.json` remains a UI-format visual reference and is
not used by the server.

## Optional tokens

Any string input may contain these tokens. A field containing only a numeric
token receives a number rather than a string.

| Token | Portrait default | Scenic default |
|---|---:|---:|
| `{{prompt}}` or `{{positive_prompt}}` | request text | request text |
| `{{negative_prompt}}` | empty | empty |
| `{{seed}}` | random | random |
| `{{width}}` | 1104 | 1536 |
| `{{height}}` | 1472 | 864 |
| `{{filename_prefix}}` | generated entity prefix | generated entity prefix |
| `{{primary_color}}` | class pigment, when supplied | empty |
| `{{secondary_color}}` | favorite-color accent, when supplied | empty |
| `{{portrait_tags}}` | selected visual tags | empty |
| `{{armor}}` | selected armor, unless excluded | empty |
| `{{main_hand}}` | selected primary weapon, unless excluded | empty |
| `{{off_hand}}` | selected offhand item, unless excluded | empty |

Workflows may keep their own fixed dimensions, sampler, model, LoRAs, and
other controls simply by omitting those tokens.

Steps offer offsets from `-3` through `+3`, with `+0` recommended. The default
Qwen graph uses 22 steps, giving a range of 19-25. CFG retains its four choices:
`-1`, `+0`, `+1`, and `+2`, with `+0` recommended. Steps are
whole-number offsets from the graph's authored value. CFG is deliberately a
tenth-point offset: `+1` changes `1` to `1.1`. Unsupported values
fall back to `+0` at the server boundary.

The creator defaults to **Standard style**, preserving the graph's authored
sampler/scheduler pair (`euler` / `sgm_uniform` in the default Qwen graph). **Alternative style** is the remaining alternative, setting
the pair to `euler_ancestral` / `sgm_uniform`. Saved requests for the removed Style 2 fall back
to Standard style when resumed or retried. Each attempt archives its choice.

**Automatically embellish prompt** controls the graph's LLM-assisted prompt
branch and defaults on. For the native Qwen graph, turning it off bypasses
`TextGenerate` and sends the request straight into the prompt combiner.
Text generation uses `qwen3vl_8b_int8_convrot.safetensors` at CLIPLoader node 528
with the owner's supplied Image Prompt Rewriting Expert system template.
Node 785 combines the fixed style/crop prefix with the raw brief before node
526 rewrites it; node 768 combines the prefix with the rewritten result.
Both the prefix and system instructions explicitly require a waist-up crop,
with legs and feet outside the frame. The embellishment bypass retains the
raw brief and one prefix without introducing a graph cycle.
Its outer chat role markers are omitted because `TextGenerate` applies the
chat template itself. The image encoder at node 453 keeps its existing CLIP.
The fixed generation prefix supplies detailed, subtly painted fantasy style,
muted earthy colors, waist-up framing and a plain gradient. The adviser
template targets roughly 400-500 words with no maximum word-count rule.
Editing uses the adapter's specialized instructions and preserves the
baseline's existing style unless the request explicitly changes it.
The owner's root export is untouched.
For legacy graphs, the adapter traces which side of each `LazySwitchKJ`
actually reaches an `LLMs Chat` node, so it remains correct if a workflow export
swaps `on_true` and `on_false`. Turning it off sends the assembled prompt through
the graph's direct branch. Portrait attempts and scene records retain that choice.

The default portrait source has a 3:4 aspect ratio, matching the client's
portrait frame. The `{{width}}`/`{{height}}` token defaults remain `1104 × 1472`
for compatible custom graphs; the Qwen graph retains its own 2MP resolution selector for generation and editing.
The adapter does not replace it with the legacy token dimensions.
Current clients display
that source directly and let CSS size the frame. With five players this is
acceptable on the local table; if the portrait library grows, generate cached
3:4 derivatives on the server rather than repeatedly resampling the full
source in every browser.

The default scenic source is `1536 × 864` (16:9), matching the projector and
the library preview frame without a second crop. The scene workbench attaches
every image to an existing canonical Place, preserves all returned variants,
and can cast the first variant after generation succeeds. Its compiled tag
direction remains editable before the request is sent.

Every creator result is retained in the unfinished draft with the exact request
snapshot and generated seed. The normal UI never prints that seed. **Go again**
replays an archived request with its seed, while **Fix the image seed** makes
ordinary generation reuse the currently selected attempt's seed. The native
Qwen graph uses that seed for image sampling, wildcard processing and prompt
expansion. Changing the brief or settings can still change the result; exact
image reproducibility also depends on the backend.

## Generate and edit portraits

The creator has a **Generate / Edit** toggle. Generate makes a fresh portrait.
Edit starts with the selected portrait, or an HTTP(S) image link pasted into
the baseline field, and treats the prose as instructions for changes.

`referenceImageUrl` is the optional portrait API input. The adapter sets node
`781` (`LoadImagesFromURL`) to that image's URL and node `783`
(`ComfySwitchNode`) to `true`. Without a reference it resets the switch to
`false` and disconnects the absent image from the Qwen encoder. Local URLs
under `/generated/art/portrait/` or `/portraits/` are checked against the
public directory and uploaded to ComfyUI's `/upload/image`; the loader then
uses a ComfyUI `/view` URL. Remote links must use HTTP(S), without embedded
credentials. No player address or Tailscale URL is needed for local references.

Editing preserves the existing identity and style in the prompt prefix. If
embellishment is enabled, its system instruction expands only the requested
changes instead of inventing a new portrait.

Each creator edit is a preview until **Keep changes** or **Discard changes**.
Keep accepts the image and makes it the next baseline. Discard leaves the
accepted portrait and baseline intact. **Restore original** returns to the
generated image at the start of that edit chain. A fresh generation starts a
new chain; the archive retains all previous attempts and each edit's exact
reference and original URL. Choosing an archived portrait restores its chain.
The pending preview, accepted baseline and original survive draft autosave;
an unresolved edit must be kept or discarded before advancing to review.

## Portraits after character creation

Click the portrait (or empty portrait frame) on the player hub, field sheet,
or Tome's Character spread to open `/portrait/?pc=<id>`. This reuses the
creator's portrait controls in a portrait-only view: it has no wizard navigation,
signature step, character-creation request, or access to unfinished drafts.
An existing portrait opens in Edit mode; an empty frame opens in Generate mode.

The dedicated `GET/PUT/POST /api/party/:id/portrait-workshop` contract serves
one active character's whitelisted portrait context and archive, saves art
preferences, generates a pending preview, and applies explicit Keep, Discard,
Restore original, or archived-portrait selection actions. Both new paintings
and edits remain pending until Keep. Keeping updates only the portrait and its
workshop records; stats, inventory, appearance pigments and other character
data are preserved. Accepted changes broadcast to the existing player surfaces.
The original and pending preview persist in `portraitWorkshop` on the PC,
surviving page reloads and server restarts. Stale review IDs and a changed
accepted portrait cannot overwrite a newer choice. Retired PCs and archived
campaigns cannot open or mutate the workshop.

The workshop remains public on the same trusted-seat basis as existing player
controls, even while the GM gate is enabled. Its GET is private/no-store;
general player payloads do not include prompts, seeds, attempts or previews.
Portrait prose suggestions charge the chosen PC's existing writing credits.

## Local configuration

ComfyUI defaults to `http://127.0.0.1:5090`. Override paths or the address in
the gitignored `.env.local` when needed:

```dotenv
COMFYUI_URL=http://127.0.0.1:5090
COMFYUI_CHARACTER_WORKFLOW=docs/comfyui/workflows/Qwen2.1-Fantasy-portrait.json
COMFYUI_SCENIC_WORKFLOW=docs/comfyui/workflows/Vessarin Scene Cards.json
COMFYUI_TIMEOUT_MS=180000
```

The GM editor disables request controls until the corresponding file parses as
an API graph and includes a prompt token. Generated files are copied into
`public/generated/art/`, which is gitignored, and served back through stable
local URLs. Prompts remain in the entity record even when ComfyUI is offline,
so a failed request can be retried without rewriting it.

## Portrait availability

Vesserin never starts ComfyUI. Start it separately when portraits are wanted.
A running ComfyUI can load the workflow's models when a job executes. Players
can generate portraits whenever ComfyUI is available, without a GM page open.
This applies to creator, canonical PC, and alternate-presentation portraits;
NPC and scenic tools retain their ordinary GM access requirement.

`GET /api/art/status` retains local workflow validity in `workflows` and reports
current portrait availability in `generation`. It checks ComfyUI's read-only
`/system_stats` with a two-second timeout. This check never queues a workflow
or loads a model. Generation requests check availability before submitting.

An unavailable portrait request returns HTTP 503 with
`errorKey: "portrait.unavailable"` and reason `generator-offline`.
The creator and alternate-portrait studio translate the message into EN/SV:
ask Oscar at session start, then add or regenerate the portrait later.
The creator can proceed without a portrait; prompts and existing portraits
remain available. Connection loss during submission uses the same fallback.

Verification uses synthetic ComfyUI responses and scratch campaign data:
`test/art-availability.test.js`, `test/art.test.js`, `test/art-reference.test.js`,
`test/portrait-review.test.js`, and
`test/http-play-readiness.test.js`. No test submits a real generation request.
