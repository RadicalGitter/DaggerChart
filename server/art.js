import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PUBLIC = path.join(ROOT, "public");
const fromRoot = (value, fallback) => {
  const selected = value || fallback;
  return path.isAbsolute(selected) ? selected : path.join(ROOT, selected);
};
const DEFAULT_WORKFLOWS = {
  portrait: fromRoot(
    process.env.COMFYUI_CHARACTER_WORKFLOW,
    path.join("docs", "comfyui", "workflows", "Qwen2.1-Fantasy-portrait.json")
  ),
  scenic: fromRoot(
    process.env.COMFYUI_SCENIC_WORKFLOW,
    path.join("docs", "comfyui", "workflows", "Vessarin Scene Cards.json")
  )
};
const TOKEN_PATTERN = /\{\{([a-z_]+)\}\}/gi;
const IMAGE_LIMIT = 32 * 1024 * 1024;
const MODIFIER_VALUES = new Set([-1, 0, 1, 2]);
const PORTRAIT_STYLES = Object.freeze({
  style1: { sampler: "euler_ancestral", scheduler: "sgm_uniform" }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanId = (value) => String(value || "art").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "art";
const compactToken = (value, limit = 300) => String(value || "").trim().slice(0, limit);
const modifierValue = (value) => MODIFIER_VALUES.has(Number(value)) ? Number(value) : 0;

function applySamplerModifiers(graph, stepsModifier, cfgModifier) {
  const stepOffset = [-3, -2, -1, 0, 1, 2, 3].includes(Number(stepsModifier)) ? Number(stepsModifier) : 0;
  const cfgOffset = modifierValue(cfgModifier) * 0.1;
  for (const node of Object.values(graph)) {
    if (!node?.inputs || typeof node.inputs !== "object") continue;
    if (typeof node.inputs.steps === "number" && Number.isFinite(node.inputs.steps)) {
      node.inputs.steps = Math.max(1, Math.round(node.inputs.steps + stepOffset));
    }
    if (typeof node.inputs.cfg === "number" && Number.isFinite(node.inputs.cfg)) {
      node.inputs.cfg = Math.max(0, Math.round((node.inputs.cfg + cfgOffset) * 100) / 100);
    }
  }
  return graph;
}

function applyPortraitStyle(graph, style) {
  // Legacy requests may retain the removed Style 2; use the authored pair.
  if (style === null || style === undefined || style === "" || style === "workflow" || style === "style2") return graph;
  const selected = PORTRAIT_STYLES[String(style)];
  if (!selected) throw new Error("Choose Standard or Alternative style.");
  let applied = false;
  for (const node of Object.values(graph)) {
    if (!node?.inputs || typeof node.inputs !== "object") continue;
    if (!Object.hasOwn(node.inputs, "sampler_name") || !Object.hasOwn(node.inputs, "scheduler")) continue;
    node.inputs.sampler_name = selected.sampler;
    node.inputs.scheduler = selected.scheduler;
    applied = true;
  }
  if (!applied) throw new Error("The portrait workflow has no sampler and scheduler controls.");
  return graph;
}

function branchReachesLlm(graph, input, seen = new Set()) {
  if (!Array.isArray(input) || input.length < 1) return false;
  const id = String(input[0]);
  if (seen.has(id)) return false;
  seen.add(id);
  const node = graph[id];
  if (!node) return false;
  if (/^llms?\b/i.test(String(node.class_type || ""))) return true;
  return Object.values(node.inputs || {}).some((value) => branchReachesLlm(graph, value, new Set(seen)));
}

function applyPromptEmbellishment(graph, enabled) {
  for (const node of Object.values(graph)) {
    if (node?.class_type !== "LazySwitchKJ" || typeof node?.inputs?.switch !== "boolean") continue;
    const trueUsesLlm = branchReachesLlm(graph, node.inputs.on_true);
    const falseUsesLlm = branchReachesLlm(graph, node.inputs.on_false);
    if (trueUsesLlm === falseUsesLlm) continue;
    node.inputs.switch = enabled ? trueUsesLlm : !trueUsesLlm;
  }
  // Native Qwen exports have a TextGenerate branch without a lazy switch.
  if (!enabled) {
    for (const node of Object.values(graph)) {
      if (node?.class_type !== "Simple String Combine (WLSH)") continue;
      const generated = graph[node.inputs.addition?.[0]];
      if (generated?.class_type === "TextGenerate") {
        const brief = graph[generated.inputs.prompt?.[0]];
        // The adviser receives prefix + raw brief; the final combiner already
        // supplies that prefix, so bypass to the raw brief without duplicating it.
        const sharesPrefix = brief?.class_type === "Simple String Combine (WLSH)"
          && JSON.stringify(brief.inputs.input_string) === JSON.stringify(node.inputs.input_string);
        node.inputs.addition = sharesPrefix ? brief.inputs.addition : generated.inputs.prompt;
      }
    }
  }
  return graph;
}

function referenceBranches(graph) {
  return Object.entries(graph).flatMap(([id, node]) => {
    if (node?.class_type !== "ComfySwitchNode") return [];
    const loaderId = node.inputs.on_true?.[0];
    if (graph[loaderId]?.class_type !== "LoadImagesFromURL") return [];
    const encoders = Object.values(graph).filter((candidate) => candidate?.class_type === "TextEncodeQwenImage21"
      && Object.values(candidate.inputs).some((input) => Array.isArray(input) && String(input[0]) === id));
    return encoders.length ? [{ id, node, loaderId, encoders }] : [];
  });
}

function applyReferenceImage(graph, url) {
  const branches = referenceBranches(graph);
  if (url && !branches.length) throw new Error("This portrait workflow does not support a reference image.");
  for (const { id, node, loaderId, encoders } of branches) {
    node.inputs.switch = Boolean(url);
    graph[loaderId].inputs.url = url;
    // Disconnect the absent image so a fresh portrait never tries to load a URL.
    if (!url) for (const encoder of encoders) {
      for (const [key, input] of Object.entries(encoder.inputs)) {
        if (Array.isArray(input) && String(input[0]) === id) delete encoder.inputs[key];
      }
    }
  }
  if (url) {
    for (const node of Object.values(graph)) {
      if (node?.class_type !== "TextGenerate") continue;
      const system = graph[node.inputs.system_prompt?.[0]];
      if (system?.class_type === "PrimitiveStringMultiline") {
        system.inputs.value = "Write concise image-editing instructions for an existing fantasy portrait from the user's request. Preserve the subject's identity, face, distinctive features, composition and visual style unless the request explicitly changes them. Describe only the requested changes. Do not invent a new character, clothing, equipment, background or history. Output only the editing instructions.";
      }
    }
    for (const node of Object.values(graph)) {
      if (node?.class_type !== "Simple String Combine (WLSH)") continue;
      const prefix = graph[node.inputs.input_string?.[0]];
      if (prefix?.class_type === "Wildcard Processor") {
        prefix.inputs.prompt = "Edit the supplied fantasy portrait. Keep the same character, face, distinctive features, framing and art style. Preserve everything except the changes explicitly requested below.";
      }
    }
  }
  return graph;
}

function referenceImageValue(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (source.length > 2048) throw new Error("The reference image link is too long.");
  if (/^\/(?:generated\/art\/portrait|portraits)\//.test(source)) {
    let decoded;
    try { decoded = decodeURIComponent(source); } catch { throw new Error("Invalid reference image link."); }
    if (decoded.includes("\\") || decoded.split("/").some((part) => part === "." || part === "..")
      || !/\.(png|jpe?g|webp)$/i.test(decoded)) throw new Error("Choose a local portrait or an HTTP(S) image link.");
    return source;
  }
  let url;
  try { url = new URL(source); } catch { throw new Error("Choose a local portrait or an HTTP(S) image link."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Choose a local portrait or an HTTP(S) image link.");
  }
  return url.href;
}

function workflowGraph(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("The workflow is not a ComfyUI API graph.");
  const nodes = Object.entries(value);
  if (!nodes.length || nodes.some(([, node]) => !node || typeof node.class_type !== "string" || !node.inputs || typeof node.inputs !== "object")) {
    throw new Error("Export this workflow with ComfyUI's Save (API Format) command.");
  }
  return value;
}

function ensurePromptToken(graph) {
  const raw = JSON.stringify(graph);
  if (raw.includes("{{prompt}}") || raw.includes("{{positive_prompt}}")) return true;
  const promptNodes = Object.values(graph).filter((node) =>
    node?.class_type === "PrimitiveStringMultiline"
    && /^prompt$/i.test(String(node?._meta?.title || "").trim())
    && typeof node?.inputs?.value === "string"
  );
  if (promptNodes.length !== 1) return false;
  promptNodes[0].inputs.value = "{{prompt}}";
  return true;
}

function replaceTokens(value, tokens) {
  if (Array.isArray(value)) return value.map((item) => replaceTokens(item, tokens));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTokens(item, tokens)]));
  }
  if (typeof value !== "string") return value;
  const exact = value.match(/^\{\{([a-z_]+)\}\}$/i);
  if (exact && Object.hasOwn(tokens, exact[1].toLowerCase())) return tokens[exact[1].toLowerCase()];
  return value.replace(TOKEN_PATTERN, (match, name) => Object.hasOwn(tokens, name.toLowerCase()) ? String(tokens[name.toLowerCase()]) : match);
}

function outputImages(historyEntry) {
  const images = [];
  const seen = new Set();
  for (const output of Object.values(historyEntry?.outputs || {})) {
    for (const image of output?.images || []) {
      // PreviewImage reports a temporary copy of the saved image too.
      if (!image?.filename || (image.type && image.type !== "output")) continue;
      const saved = {
        filename: String(image.filename),
        subfolder: String(image.subfolder || ""),
        type: String(image.type || "output")
      };
      const key = JSON.stringify(saved);
      if (seen.has(key)) continue;
      seen.add(key);
      images.push(saved);
    }
  }
  return images;
}

function extensionFor(filename, contentType) {
  const ext = path.extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return ext === ".jpeg" ? ".jpg" : ext;
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("jpeg")) return ".jpg";
  return ".png";
}

export class ArtUnavailableError extends Error {
  constructor(reason) {
    super("Portrait generation is unavailable right now. Ask Oscar at the start of the session. You can add or regenerate your portrait later.");
    this.statusCode = 503;
    this.errorKey = "portrait.unavailable";
    this.reason = reason;
  }
}

export class ArtWorkshop {
  constructor(options = {}) {
    this.baseUrl = new URL(options.baseUrl || process.env.COMFYUI_URL || "http://127.0.0.1:5090/");
    this.workflows = { ...DEFAULT_WORKFLOWS, ...(options.workflows || {}) };
    this.publicRoot = options.publicRoot || DEFAULT_PUBLIC;
    this.fetch = options.fetchImpl || globalThis.fetch;
    this.timeoutMs = Number(options.timeoutMs || process.env.COMFYUI_TIMEOUT_MS) || 180_000;
    this.pollMs = Number(options.pollMs) || 700;
  }

  workflowStatus(kind) {
    const file = this.workflows[kind];
    if (!file || !fs.existsSync(file)) return { ready: false, file: path.basename(file || ""), reason: "missing" };
    try {
      const graph = workflowGraph(JSON.parse(fs.readFileSync(file, "utf8")));
      if (!ensurePromptToken(graph)) {
        return { ready: false, file: path.basename(file), reason: "prompt-token-missing" };
      }
      return { ready: true, file: path.basename(file), reason: null, referenceImage: referenceBranches(graph).length > 0 };
    } catch (error) {
      return { ready: false, file: path.basename(file), reason: error.message };
    }
  }

  status() {
    return {
      endpoint: this.baseUrl.origin,
      workflows: {
        portrait: this.workflowStatus("portrait"),
        scenic: this.workflowStatus("scenic")
      }
    };
  }

  async availability(kind = "portrait") {
    if (!this.workflowStatus(kind).ready) return { ready: false, reason: "workflow-unavailable" };
    try {
      // This read checks the API without submitting a graph or loading models.
      const response = await this.comfy("system_stats", {}, 2_000);
      if (!response.ok) return { ready: false, reason: "generator-offline" };
      const stats = await response.json();
      if (!stats?.system || !Array.isArray(stats.devices)) return { ready: false, reason: "generator-offline" };
      return { ready: true, reason: null };
    } catch {
      return { ready: false, reason: "generator-offline" };
    }
  }

  loadWorkflow(kind, tokens, embellishPrompt = true) {
    const file = this.workflows[kind];
    if (!file || !fs.existsSync(file)) {
      throw new Error(`The ${kind} API workflow is not installed yet.`);
    }
    let graph;
    try {
      graph = workflowGraph(JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (error) {
      throw new Error(`The ${kind} workflow cannot be used: ${error.message}`);
    }
    if (!ensurePromptToken(graph)) {
      throw new Error(`Add {{prompt}} to the ${kind} workflow's positive text input.`);
    }
    return applyPromptEmbellishment(replaceTokens(graph, tokens), embellishPrompt !== false);
  }

  async comfy(pathname, options = {}, timeoutMs = 8_000) {
    try {
      return await this.fetch(new URL(pathname, this.baseUrl), {
        ...options,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      throw new ArtUnavailableError("generator-offline");
    }
  }

  async referenceUrl(source) {
    if (!source || !source.startsWith("/")) return source;
    const root = fs.realpathSync(this.publicRoot);
    let file;
    try { file = fs.realpathSync(path.join(root, decodeURIComponent(source))); }
    catch { throw new Error("The reference portrait is no longer available."); }
    if (!file.startsWith(root + path.sep)) throw new Error("Invalid local reference portrait.");
    const size = fs.statSync(file).size;
    if (!size || size > IMAGE_LIMIT) throw new Error("The reference portrait has an invalid size.");
    const ext = path.extname(file).toLowerCase();
    const type = ext === ".webp" ? "image/webp" : /\.jpe?g/.test(ext) ? "image/jpeg" : "image/png";
    const form = new FormData();
    form.append("image", new Blob([fs.readFileSync(file)], { type }), `visseren_reference_${crypto.randomUUID()}${ext}`);
    form.append("type", "input");
    const uploaded = await this.comfy("upload/image", { method: "POST", body: form }, 20_000);
    if (!uploaded.ok) throw new Error("ComfyUI could not receive the reference portrait.");
    const image = await uploaded.json();
    if (!image?.name) throw new Error("ComfyUI did not return a reference portrait filename.");
    return new URL(`view?${new URLSearchParams({ filename: image.name, subfolder: image.subfolder || "", type: "input" })}`, this.baseUrl).href;
  }

  async request({
    kind, entityId, prompt, negativePrompt = "", seed, width, height, stepsModifier = 0, cfgModifier = 0, style,
    primaryColor = "", secondaryColor = "", tags = [], armor = "", mainHand = "", offHand = "", embellishPrompt = true,
    referenceImageUrl = ""
  }) {
    if (kind !== "portrait" && kind !== "scenic") throw new Error("Unknown art workflow.");
    const positive = String(prompt || "").trim();
    const negative = String(negativePrompt || "").trim();
    if (!positive) throw new Error("Write an image prompt first.");
    if (positive.length > 6_000 || negative.length > 4_000) throw new Error("That image prompt is too long.");
    const reference = referenceImageValue(referenceImageUrl);
    if (reference && kind !== "portrait") throw new Error("Reference images are supported only for portraits.");

    const hasSeed = seed !== null && seed !== undefined && seed !== "" && Number.isSafeInteger(Number(seed));
    const numericSeed = hasSeed ? Number(seed) : crypto.randomInt(0, 2_147_483_647);
    const defaults = kind === "portrait" ? { width: 1104, height: 1472 } : { width: 1536, height: 864 };
    const tokens = {
      prompt: positive,
      positive_prompt: positive,
      negative_prompt: negative,
      seed: numericSeed,
      width: Number.isInteger(Number(width)) ? Number(width) : defaults.width,
      height: Number.isInteger(Number(height)) ? Number(height) : defaults.height,
      filename_prefix: `visseren_${kind}_${cleanId(entityId)}`,
      primary_color: compactToken(primaryColor, 32),
      secondary_color: compactToken(secondaryColor, 32),
      portrait_tags: compactToken(Array.isArray(tags) ? tags.slice(0, 20).join(", ") : tags),
      armor: compactToken(armor),
      main_hand: compactToken(mainHand),
      off_hand: compactToken(offHand)
    };
    const graph = applySamplerModifiers(this.loadWorkflow(kind, tokens, embellishPrompt), stepsModifier, cfgModifier);
    if (kind === "portrait") applyPortraitStyle(graph, style);
    if (reference && !referenceBranches(graph).length) throw new Error("This portrait workflow does not support a reference image.");
    const availability = await this.availability(kind);
    if (!availability.ready) throw new ArtUnavailableError(availability.reason);
    if (kind === "portrait") applyReferenceImage(graph, await this.referenceUrl(reference));
    const clientId = crypto.randomUUID();
    const queued = await this.comfy("prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graph, client_id: clientId })
    });
    if (!queued.ok) throw new Error("ComfyUI rejected the workflow. Check its API graph and installed nodes.");
    const queuedBody = await queued.json();
    const promptId = queuedBody.prompt_id;
    if (!promptId) throw new Error("ComfyUI did not return a prompt identifier.");

    const deadline = Date.now() + this.timeoutMs;
    let historyEntry = null;
    while (Date.now() < deadline) {
      const response = await this.comfy(`history/${encodeURIComponent(promptId)}`);
      if (!response.ok) throw new Error("ComfyUI's history could not be read.");
      const history = await response.json();
      historyEntry = history[promptId] || null;
      if (historyEntry) {
        const images = outputImages(historyEntry);
        if (images.length) break;
        if (historyEntry.status?.completed) throw new Error("The workflow completed without a saved image.");
      }
      await sleep(this.pollMs);
    }
    const images = outputImages(historyEntry);
    if (!images.length) throw new Error("The portrait workshop timed out before an image was saved.");

    const folder = path.join(this.publicRoot, "generated", "art", kind);
    fs.mkdirSync(folder, { recursive: true });
    const urls = [];
    for (const [index, image] of images.slice(0, 4).entries()) {
      const query = new URLSearchParams(image);
      const response = await this.comfy(`view?${query.toString()}`, {}, 20_000);
      if (!response.ok) throw new Error("ComfyUI saved an image but it could not be collected.");
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) throw new Error("ComfyUI returned a non-image output.");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > IMAGE_LIMIT) throw new Error("The generated image has an invalid size.");
      const ext = extensionFor(image.filename, contentType);
      const filename = `${cleanId(entityId)}-${Date.now()}-${index + 1}${ext}`;
      fs.writeFileSync(path.join(folder, filename), bytes);
      urls.push(`/generated/art/${kind}/${filename}`);
    }
    return { url: urls[0], urls, seed: numericSeed, promptId };
  }
}

export const artWorkshop = new ArtWorkshop();
