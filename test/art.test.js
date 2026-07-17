import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ArtWorkshop } from "../server/art.js";

const apiGraph = {
  "1": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", pigments: "{{primary_color}} / {{secondary_color}}", tags: "{{portrait_tags}}", equipment: "{{armor}}; {{main_hand}}; {{off_hand}}" } },
  "2": { class_type: "EmptyLatentImage", inputs: { width: "{{width}}", height: "{{height}}", seed: "{{seed}}" } },
  "3": { class_type: "SaveImage", inputs: { filename_prefix: "{{filename_prefix}}", images: ["2", 0] } },
  "4": { class_type: "KSamplerAdvanced", inputs: { steps: 10, cfg: 0.8, sampler_name: "euler", scheduler: "ays+", latent_image: ["2", 0] } }
};

test("ArtWorkshop hydrates an API graph and collects its saved image", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "settlement-art-"));
  const workflow = path.join(root, "portrait.json");
  await fs.writeFile(workflow, JSON.stringify(apiGraph));
  let queued = null;
  const server = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/prompt") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      queued = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ prompt_id: "job-1" }));
      return;
    }
    if (req.url === "/history/job-1") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ "job-1": { outputs: { "3": { images: [{ filename: "result.png", subfolder: "", type: "output" }] } } } }));
      return;
    }
    if (req.url.startsWith("/view?")) {
      res.setHeader("Content-Type", "image/png");
      res.end(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });

  const workshop = new ArtWorkshop({
    baseUrl: `http://127.0.0.1:${server.address().port}/`,
    workflows: { portrait: workflow, scenic: workflow },
    publicRoot: root,
    pollMs: 1,
    timeoutMs: 1_000
  });
  const result = await workshop.request({
    kind: "portrait", entityId: "pc_one", prompt: "A watchful ranger", seed: 42,
    stepsModifier: 1, cfgModifier: 1, style: "style2",
    primaryColor: "#617044", secondaryColor: "#c96f72", tags: ["weathered", "gentle"],
    armor: "Gambeson", mainHand: "Longbow", offHand: "Dagger"
  });

  assert.equal(queued.prompt["1"].inputs.text, "A watchful ranger");
  assert.equal(queued.prompt["2"].inputs.width, 1104);
  assert.equal(queued.prompt["2"].inputs.height, 1472);
  assert.equal(queued.prompt["2"].inputs.seed, 42);
  assert.equal(queued.prompt["4"].inputs.steps, 11);
  assert.equal(queued.prompt["4"].inputs.cfg, 0.9);
  assert.equal(queued.prompt["4"].inputs.sampler_name, "dpmpp_3m_sde_gpu");
  assert.equal(queued.prompt["4"].inputs.scheduler, "beta");
  assert.equal(queued.prompt["1"].inputs.pigments, "#617044 / #c96f72");
  assert.equal(queued.prompt["1"].inputs.tags, "weathered, gentle");
  assert.equal(queued.prompt["1"].inputs.equipment, "Gambeson; Longbow; Dagger");
  assert.equal(result.url.startsWith("/generated/art/portrait/pc_one-"), true);
  assert.equal((await fs.stat(path.join(root, result.url))).size, 8);

  await workshop.request({
    kind: "portrait", entityId: "pc_two", prompt: "A patient guardian", seed: 43, style: "style1"
  });
  assert.equal(queued.prompt["4"].inputs.sampler_name, "euler");
  assert.equal(queued.prompt["4"].inputs.scheduler, "ays+");

  await assert.rejects(
    workshop.request({ kind: "portrait", entityId: "pc_three", prompt: "A quiet scholar", style: "style3" }),
    /Style 1 or Style 2/
  );
});

test("ArtWorkshop identifies UI-format and tokenless workflows before queueing", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "settlement-art-status-"));
  const workflow = path.join(root, "ui-workflow.json");
  await fs.writeFile(workflow, JSON.stringify({ nodes: [], links: [] }));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const workshop = new ArtWorkshop({ workflows: { portrait: workflow }, publicRoot: root });
  const status = workshop.workflowStatus("portrait");
  assert.equal(status.ready, false);
  assert.match(status.reason, /API graph|API Format/);
});
