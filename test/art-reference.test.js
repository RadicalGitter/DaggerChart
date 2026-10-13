import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ArtWorkshop } from "../server/art.js";

const workflow = fileURLToPath(new URL("../docs/comfyui/workflows/Qwen2.1-Fantasy-portrait.json", import.meta.url));

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "settlement-art-reference-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = [];
  let queued;
  const art = new ArtWorkshop({ publicRoot: root, workflows: { portrait: workflow }, fetchImpl: async (url, options) => {
    calls.push(url.pathname);
    if (url.pathname === "/system_stats") return Response.json({ system: {}, devices: [] });
    if (url.pathname === "/upload/image") {
      assert.equal(options.body.get("type"), "input");
      assert.equal(options.body.get("image").type, "image/png");
      assert.equal(options.body.get("image").size, 8);
      return Response.json({ name: "uploaded.png", subfolder: "portraits" });
    }
    if (url.pathname === "/prompt") {
      queued = JSON.parse(options.body).prompt;
      return Response.json({ prompt_id: "dummy" });
    }
    if (url.pathname === "/history/dummy") return Response.json({ dummy: { outputs: {
      preview: { images: [{ filename: "preview.png", type: "temp" }] },
      saved: { images: [{ filename: "dummy.png", type: "output" }] },
      repeated: { images: [{ filename: "dummy.png", type: "output" }] }
    } } });
    if (url.pathname === "/view") {
      assert.equal(url.searchParams.get("type"), "output");
      return new Response(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { "Content-Type": "image/png" } });
    }
    throw new Error("Unexpected generator route");
  } });
  return { art, root, calls, queued: () => queued };
}

const request = { kind: "portrait", entityId: "dummy", prompt: "Change only the cloak to green.", seed: 42, style: "workflow" };

test("Qwen steps default to 22 and accept the full three-step variation", async (t) => {
  const { art, queued } = await fixture(t);
  for (const stepsModifier of [-3, -2, -1, 0, 1, 2, 3]) {
    await art.request({ ...request, stepsModifier });
    assert.equal(queued()["516"].inputs.steps, 22 + stepsModifier);
    assert.equal(queued()["516"].inputs.cfg, 1);
  }
  await art.request({ ...request, stepsModifier: 4 });
  assert.equal(queued()["516"].inputs.steps, 22);
});

test("standard and alternative Qwen styles share sgm_uniform with different Euler samplers", async (t) => {
  const { art, queued } = await fixture(t);
  for (const [style, sampler] of [["workflow", "euler"], ["style1", "euler_ancestral"]]) {
    await art.request({ ...request, style });
    assert.equal(queued()["516"].inputs.sampler_name, sampler);
    assert.equal(queued()["516"].inputs.scheduler, "sgm_uniform");
    assert.equal(queued()["516"].inputs.steps, 22);
    assert.equal(queued()["516"].inputs.cfg, 1);
  }
});

test("a saved portrait and its preview produce one archived output", async (t) => {
  const { art, calls } = await fixture(t);
  const result = await art.request(request);
  assert.equal(result.urls.length, 1);
  assert.equal(result.url, result.urls[0]);
  assert.equal(calls.filter((route) => route === "/view").length, 1);
});

test("Qwen CFG choices change the authored value in tenths and embellishment preserves illustration", async (t) => {
  const { art, queued } = await fixture(t);
  for (const [cfgModifier, expected] of [[-1, 0.9], [0, 1], [1, 1.1], [2, 1.2]]) {
    await art.request({ ...request, cfgModifier });
    assert.equal(queued()["516"].inputs.cfg, expected);
    assert.match(queued()["774"].inputs.value, /# Image Prompt Rewriting Expert/);
    assert.doesNotMatch(queued()["774"].inputs.value, /Achieving Photorealism|shot on 35mm lens/);
  }
});

test("native Qwen embellishment bypass leaves no output dependency on TextGenerate and resets each request", async (t) => {
  const { art } = await fixture(t);
  const reachableFromOutputs = (graph) => {
    const reached = new Set();
    const visit = (id) => {
      if (reached.has(id) || !graph[id]) return;
      reached.add(id);
      for (const input of Object.values(graph[id].inputs || {})) {
        if (Array.isArray(input)) visit(String(input[0]));
      }
    };
    for (const [id, node] of Object.entries(graph)) {
      if (/^Save.?Images?\b/.test(node.class_type)) visit(id);
    }
    return reached;
  };
  const direct = art.loadWorkflow("portrait", { prompt: request.prompt }, false);
  const embellished = art.loadWorkflow("portrait", { prompt: request.prompt }, true);
  const directNodes = reachableFromOutputs(direct);
  assert.ok(directNodes.size > 0);
  assert.ok(directNodes.has("538"));
  assert.ok(!directNodes.has("526"));
  assert.ok(reachableFromOutputs(embellished).has("526"));
  assert.deepEqual(direct["768"].inputs.addition, ["538", 0]);
  assert.deepEqual(embellished["768"].inputs.addition, ["526", 0]);
  assert.deepEqual(embellished["526"].inputs.prompt, ["785", 0]);
  assert.deepEqual(embellished["785"].inputs.input_string, ["535", 0]);
  assert.deepEqual(embellished["785"].inputs.addition, ["538", 0]);
  for (const graph of [direct, embellished]) {
    assert.match(graph["535"].inputs.prompt, /hand-painted character portrait/);
    assert.match(graph["535"].inputs.prompt, /painterly brushwork/);
    assert.match(graph["535"].inputs.prompt, /detailed, believable anatomy/);
    assert.doesNotMatch(graph["535"].inputs.prompt, /deliberately simplified/);
    assert.match(graph["535"].inputs.prompt, /Strict waist-up portrait crop/);
  }
  assert.equal(embellished["528"].inputs.clip_name, "qwen3vl_8b_int8_convrot.safetensors");
  assert.equal(embellished["453"].inputs.clip_name, "qwen3vl_8b_nvfp4.safetensors");
  assert.match(embellished["774"].inputs.value, /four to five hundred words/);
  assert.match(embellished["774"].inputs.value, /## Step 8/);
  assert.doesNotMatch(embellished["774"].inputs.value, /<\|im_start\|>|<\|im_end\|>/);
});

test("Qwen generates fresh without a reference and hydrates native prompt, seeds and negative prompt", async (t) => {
  const fixtureData = await fixture(t);
  const { art, calls, queued } = fixtureData;
  assert.equal(art.workflowStatus("portrait").referenceImage, true);
  await art.request({ ...request, negativePrompt: "No text", embellishPrompt: false });
  const graph = queued();
  assert.equal(graph["538"].inputs.prompt, request.prompt);
  assert.equal(graph["769"].inputs.seed, 42);
  assert.equal(graph["526"].inputs["sampling_mode.seed"], 42);
  assert.equal(graph["452"].inputs.negative_prompt, "No text");
  assert.equal(graph["783"].inputs.switch, false);
  assert.equal(Object.hasOwn(graph["452"].inputs, "images.image_1"), false);
  assert.deepEqual(graph["768"].inputs.addition, ["538", 0]);
  assert.equal(graph["516"].inputs.steps, 22);
  assert.equal(graph["516"].inputs.cfg, 1);
  assert.equal(graph["516"].inputs.scheduler, "sgm_uniform");
  assert.equal(graph["511"].inputs.megapixels, 2);
  assert.ok(!calls.includes("/upload/image"));
});

test("Qwen edits from an image hyperlink, enables node 783, and preserves reference conditioning", async (t) => {
  const { art, calls, queued } = await fixture(t);
  await art.request({ ...request, referenceImageUrl: "https://example.test/portrait.png" });
  const graph = queued();
  assert.equal(graph["781"].inputs.url, "https://example.test/portrait.png");
  assert.equal(graph["783"].inputs.switch, true);
  assert.deepEqual(graph["452"].inputs["images.image_1"], ["783", 0]);
  assert.equal(graph["511"].inputs.megapixels, 2);
  assert.deepEqual(graph["768"].inputs.addition, ["526", 0]);
  assert.match(graph["774"].inputs.value, /Preserve the subject's identity/);
  assert.match(graph["535"].inputs.prompt, /Edit the supplied fantasy portrait/);
  assert.ok(!calls.includes("/upload/image"));
});

test("local baselines upload to ComfyUI and become URLs reachable by its image loader", async (t) => {
  const { art, root, calls, queued } = await fixture(t);
  const relative = "/generated/art/portrait/kept.png";
  await fs.mkdir(path.join(root, "generated/art/portrait"), { recursive: true });
  await fs.writeFile(path.join(root, relative), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  await art.request({ ...request, referenceImageUrl: relative });
  assert.deepEqual(calls.slice(0, 3), ["/system_stats", "/upload/image", "/prompt"]);
  const url = new URL(queued()["781"].inputs.url);
  assert.equal(url.origin, art.baseUrl.origin);
  assert.equal(url.searchParams.get("filename"), "uploaded.png");
  assert.equal(url.searchParams.get("subfolder"), "portraits");
  assert.equal(url.searchParams.get("type"), "input");
});

test("invalid, missing and unsupported references fail before a portrait is queued", async (t) => {
  for (const referenceImageUrl of ["file:///private.png", "javascript:alert(1)", "/generated/art/portrait/%2e%2e/private.png", "/generated/art/portrait/%5cprivate.png", "https://user:password@example.test/image.png", "/generated/art/portrait/missing.png"]) {
    const { art, calls } = await fixture(t);
    await assert.rejects(art.request({ ...request, referenceImageUrl }));
    assert.ok(!calls.includes("/prompt"));
  }
  const { art, root, calls } = await fixture(t);
  const legacy = path.join(root, "legacy.json");
  await fs.writeFile(legacy, JSON.stringify({ "1": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}" } } }));
  art.workflows.portrait = legacy;
  await assert.rejects(art.request({ ...request, referenceImageUrl: "https://example.test/image.png" }), /does not support/);
  assert.equal(calls.length, 0);
});
