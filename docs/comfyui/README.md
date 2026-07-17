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
   - `Vesserin Portraits.json` (the default portrait graph)
   - `docs/comfyui/scenic-api-workflow.json`
3. Put `{{prompt}}` in the workflow's positive text input. The app substitutes
   this token in the parsed graph, so node IDs may change freely.
4. Ensure the graph ends in at least one `SaveImage`-style output. The app
   collects up to four returned images and chooses the first one for the
   character or place.

The checked-in `Vesserin Portraits.json` is the production portrait graph. Its
neutral sampler is Steps `10`, CFG `0.8`, and its latent frame is `1104 × 1472`.
The earlier `waidrin-portraits-workflow.json` remains a UI-format visual
reference and is not used by the server.

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

The creator exposes only four relative sampler choices: `-1`, `+0`, `+1`, and
`+2`. `+0` is the default and recommended choice for both controls. Steps are
whole-number offsets from the graph's authored value. CFG is deliberately a
tenth-point offset: `+1` changes `0.8` to `0.9`, not `1.8`. Unsupported values
fall back to `+0` at the server boundary.

The creator also exposes two deliberately nontechnical rendering choices.
**Style 1** sets the graph's sampler/scheduler pair to `euler` / `ays+`;
**Style 2** sets it to `dpmpp_3m_sde_gpu` / `beta`. The exact pair is archived
with each attempt, and **Go again** reuses it.

The default portrait source is `1104 × 1472`. Both dimensions are divisible by
16 and exactly match the client's 3:4 portrait frame. Current clients display
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
ordinary generation reuse the currently selected attempt's seed. The internal
LLM remains free to rewrite its structured character description, so a fixed
seed can still produce a new interpretation.

## Local configuration

ComfyUI defaults to `http://127.0.0.1:5090`. Override paths or the address in
the gitignored `.env.local` when needed:

```dotenv
COMFYUI_URL=http://127.0.0.1:5090
COMFYUI_CHARACTER_WORKFLOW=Vesserin Portraits.json
COMFYUI_SCENIC_WORKFLOW=docs/comfyui/scenic-api-workflow.json
COMFYUI_TIMEOUT_MS=180000
```

The GM editor disables request controls until the corresponding file parses as
an API graph and includes a prompt token. Generated files are copied into
`public/generated/art/`, which is gitignored, and served back through stable
local URLs. Prompts remain in the entity record even when ComfyUI is offline,
so a failed request can be retried without rewriting it.
