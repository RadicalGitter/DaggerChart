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
  portrait: fromRoot(process.env.COMFYUI_CHARACTER_WORKFLOW, "Vesserin Portraits.json"),
  scenic: fromRoot(process.env.COMFYUI_SCENIC_WORKFLOW, path.join("docs", "comfyui", "scenic-api-workflow.json"))
};
const TOKEN_PATTERN = /\{\{([a-z_]+)\}\}/gi;
const IMAGE_LIMIT = 32 * 1024 * 1024;
const MODIFIER_VALUES = new Set([-1, 0, 1, 2]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanId = (value) => String(value || "art").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "art";
const compactToken = (value, limit = 300) => String(value || "").trim().slice(0, limit);
const modifierValue = (value) => MODIFIER_VALUES.has(Number(value)) ? Number(value) : 0;

function applySamplerModifiers(graph, stepsModifier, cfgModifier) {
  const stepOffset = modifierValue(stepsModifier);
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

function workflowGraph(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("The workflow is not a ComfyUI API graph.");
  const nodes = Object.entries(value);
  if (!nodes.length || nodes.some(([, node]) => !node || typeof node.class_type !== "string" || !node.inputs || typeof node.inputs !== "object")) {
    throw new Error("Export this workflow with ComfyUI's Save (API Format) command.");
  }
  return value;
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
  for (const output of Object.values(historyEntry?.outputs || {})) {
    for (const image of output?.images || []) {
      if (image?.filename) images.push({
        filename: String(image.filename),
        subfolder: String(image.subfolder || ""),
        type: String(image.type || "output")
      });
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
      const raw = JSON.stringify(graph);
      if (!raw.includes("{{prompt}}") && !raw.includes("{{positive_prompt}}")) {
        return { ready: false, file: path.basename(file), reason: "prompt-token-missing" };
      }
      return { ready: true, file: path.basename(file), reason: null };
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

  loadWorkflow(kind, tokens) {
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
    const raw = JSON.stringify(graph);
    if (!raw.includes("{{prompt}}") && !raw.includes("{{positive_prompt}}")) {
      throw new Error(`Add {{prompt}} to the ${kind} workflow's positive text input.`);
    }
    return replaceTokens(graph, tokens);
  }

  async comfy(pathname, options = {}, timeoutMs = 8_000) {
    try {
      return await this.fetch(new URL(pathname, this.baseUrl), {
        ...options,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      throw new Error("The portrait workshop could not reach ComfyUI.");
    }
  }

  async request({
    kind, entityId, prompt, negativePrompt = "", seed, width, height, stepsModifier = 0, cfgModifier = 0,
    primaryColor = "", secondaryColor = "", tags = [], armor = "", mainHand = "", offHand = ""
  }) {
    if (kind !== "portrait" && kind !== "scenic") throw new Error("Unknown art workflow.");
    const positive = String(prompt || "").trim();
    const negative = String(negativePrompt || "").trim();
    if (!positive) throw new Error("Write an image prompt first.");
    if (positive.length > 6_000 || negative.length > 4_000) throw new Error("That image prompt is too long.");

    const hasSeed = seed !== null && seed !== undefined && seed !== "" && Number.isSafeInteger(Number(seed));
    const numericSeed = hasSeed ? Number(seed) : crypto.randomInt(0, 2_147_483_647);
    const defaults = kind === "portrait" ? { width: 960, height: 1280 } : { width: 1216, height: 832 };
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
    const graph = applySamplerModifiers(this.loadWorkflow(kind, tokens), stepsModifier, cfgModifier);
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
