import { t } from "/shared/i18n.js";
import { playerFeatureEnabled } from "/shared/player-features.js";

const SKINS = {
  cinder: {
    tray: "#321e21",
    hope: { background: "#caa95b", foreground: "#251b12", outline: "#f4df9e", material: "metal" },
    fear: { background: "#712f3c", foreground: "#f3e2cf", outline: "#281117", material: "metal" }
  },
  moon: {
    tray: "#18252b",
    hope: { background: "#c7d8d3", foreground: "#17333a", outline: "#ffffff", material: "glass" },
    fear: { background: "#263d59", foreground: "#edf1e8", outline: "#0d1723", material: "glass" }
  },
  verdigris: {
    tray: "#17322d",
    hope: { background: "#8dbda8", foreground: "#102b26", outline: "#d8efe1", material: "metal" },
    fear: { background: "#335f56", foreground: "#f0e2c5", outline: "#10231f", material: "metal" }
  }
};

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function routePcId() {
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "character" || !parts[1]) return null;
  try { return decodeURIComponent(parts[1]); } catch { return parts[1]; }
}

function selectedPcId() {
  return routePcId()
    || localStorage.getItem("settlement-pc")
    || localStorage.getItem("settlement-journal-pc")
    || null;
}

function secureD12() {
  const values = new Uint32Array(1);
  const limit = 0x100000000 - (0x100000000 % 12);
  do { crypto.getRandomValues(values); } while (values[0] >= limit);
  return (values[0] % 12) + 1;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function colorSet(name, colors) {
  return {
    name,
    foreground: colors.foreground,
    background: colors.background,
    outline: colors.outline,
    texture: "none",
    material: colors.material
  };
}

function resultValue(result) {
  const value = result?.sets?.[0]?.rolls?.[0]?.value;
  if (!Number.isInteger(value) || value < 1 || value > 12) throw new Error("Invalid physical die result.");
  return value;
}

function withTimeout(promise, ms = 9000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("The physical dice did not settle.")), ms))
  ]);
}

function install() {
  if (new URLSearchParams(location.search).get("embed") === "1" || document.querySelector(".duality-tools")) return;

  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "/shared/duality-dice.css";
  document.head.append(style);

  const root = document.createElement("div");
  root.className = `duality-tools${location.pathname.startsWith("/tome") ? " duality-context-tome" : ""}`;
  root.hidden = true;
  root.innerHTML = `
    <button class="duality-trigger" type="button" aria-expanded="false" aria-controls="duality-tray">
      <span class="duality-trigger-die" aria-hidden="true">12</span><strong>${esc(t("player.dice.open"))}</strong>
    </button>
    <section class="duality-tray" id="duality-tray" role="dialog" aria-labelledby="duality-title" hidden>
      <header class="duality-head">
        <div><span class="duality-kicker" id="duality-character"></span><h2 id="duality-title">${esc(t("player.dice.title"))}</h2></div>
        <button class="duality-close" type="button" aria-label="${esc(t("player.dice.close"))}" title="${esc(t("player.dice.close"))}">×</button>
      </header>
      <div class="duality-stage" data-skin="cinder">
        <img class="duality-imprint duality-imprint-shadow" alt="" hidden>
        <img class="duality-imprint duality-imprint-light" alt="" hidden>
        <div class="duality-die-field is-hope">
          <span class="duality-die-label">${esc(t("player.dice.hope"))}</span>
          <div class="duality-engine" id="duality-hope-engine"></div>
          <div class="duality-fallback-die" aria-hidden="true">?</div>
        </div>
        <div class="duality-die-field is-fear">
          <span class="duality-die-label">${esc(t("player.dice.fear"))}</span>
          <div class="duality-engine" id="duality-fear-engine"></div>
          <div class="duality-fallback-die" aria-hidden="true">?</div>
        </div>
        <output class="duality-result" aria-live="polite" hidden></output>
      </div>
      <div class="duality-controls">
        <div class="duality-modifier" role="group" aria-label="${esc(t("player.dice.modifier"))}">
          <span>${esc(t("player.dice.modifier"))}</span>
          <button type="button" data-modifier="-1" aria-label="${esc(t("player.dice.modifier"))} −1">−</button>
          <output>0</output>
          <button type="button" data-modifier="1" aria-label="${esc(t("player.dice.modifier"))} +1">+</button>
        </div>
        <div class="duality-skins" role="group" aria-label="${esc(t("player.dice.skin"))}">
          ${Object.keys(SKINS).map((skin) => `<button type="button" data-skin="${skin}" aria-label="${esc(t(`player.dice.skin.${skin}`))}" title="${esc(t(`player.dice.skin.${skin}`))}"><span></span><span></span></button>`).join("")}
        </div>
        <span class="duality-status" role="status"></span>
        <button class="duality-roll" type="button"><span class="duality-roll-icon" aria-hidden="true">12</span>${esc(t("player.dice.roll"))}</button>
      </div>
    </section>`;
  document.body.append(root);

  const trigger = root.querySelector(".duality-trigger");
  const tray = root.querySelector(".duality-tray");
  const stage = root.querySelector(".duality-stage");
  const status = root.querySelector(".duality-status");
  const result = root.querySelector(".duality-result");
  const rollButton = root.querySelector(".duality-roll");
  const modifierOutput = root.querySelector(".duality-modifier output");
  const fallbackDice = [...root.querySelectorAll(".duality-fallback-die")];
  let currentPcId = null;
  let identity = null;
  let modifier = 0;
  let rolling = false;
  let DiceBox = null;
  let engines = null;
  let engineLoad = null;
  let resizeFrame = null;
  let skin = SKINS[localStorage.getItem("settlement-dice-skin")] ? localStorage.getItem("settlement-dice-skin") : "cinder";

  function renderModifier() {
    modifierOutput.textContent = signed(modifier);
    for (const button of root.querySelectorAll("[data-modifier]")) {
      const delta = Number(button.dataset.modifier);
      button.disabled = rolling || modifier + delta < -20 || modifier + delta > 20;
    }
  }

  function renderSkin() {
    stage.dataset.skin = skin;
    stage.style.setProperty("--tray-tone", SKINS[skin].tray);
    for (const button of root.querySelectorAll("[data-skin]")) {
      const selected = button.dataset.skin === skin;
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = rolling;
    }
  }

  function setBusy(value) {
    rolling = value;
    rollButton.disabled = value;
    root.classList.toggle("is-rolling", value);
    renderModifier();
    renderSkin();
  }

  async function loadIdentity() {
    if (!currentPcId) return null;
    const response = await fetch("/api/table");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || t("player.dice.error"));
    identity = (body.identities || []).find((pc) => pc.id === currentPcId) || null;
    if (!identity) throw new Error(t("player.dice.error"));
    root.querySelector("#duality-character").textContent = identity.name || "";
    for (const image of root.querySelectorAll(".duality-imprint")) {
      image.hidden = !identity.portrait;
      if (identity.portrait) image.src = identity.portrait;
      else image.removeAttribute("src");
    }
    return identity;
  }

  async function createEngines() {
    if (engines) return engines;
    if (engineLoad) return engineLoad;
    engineLoad = (async () => {
      try {
        const module = await import("/vendor/dice-box-threejs/dice-box-threejs.es.js");
        DiceBox = module.default;
        const makeEngine = async (selector, side) => {
          const colors = SKINS[skin][side];
          const engine = new DiceBox(selector, {
            sounds: false,
            shadows: true,
            strength: 1.25,
            gravity_multiplier: 430,
            light_intensity: 0.95,
            color_spotlight: 0xfff1d1,
            theme_surface: "default",
            theme_material: colors.material,
            theme_customColorset: colorSet(`vesserin-${skin}-${side}`, colors)
          });
          await engine.initialize();
          // The upstream initializer passes full dimensions into a half-scale
          // camera calculation. Re-measuring without that argument aligns the
          // physical walls with the visible canvas.
          engine.setDimensions();
          return engine;
        };
        const [hope, fear] = await Promise.all([
          makeEngine("#duality-hope-engine", "hope"),
          makeEngine("#duality-fear-engine", "fear")
        ]);
        engines = { hope, fear };
        root.classList.add("has-physics");
        root.classList.remove("uses-fallback");
        return engines;
      } catch (error) {
        console.warn("Physical dice unavailable; using the local fallback.", error);
        root.classList.add("uses-fallback");
        return null;
      } finally {
        engineLoad = null;
      }
    })();
    return engineLoad;
  }

  async function applySkin() {
    renderSkin();
    if (!engines) return;
    await Promise.all(Object.entries(engines).map(async ([side, engine]) => {
      const colors = SKINS[skin][side];
      engine.theme_customColorset = colorSet(`vesserin-${skin}-${side}`, colors);
      engine.theme_material = colors.material;
      await engine.loadTheme({ colorset: "white", texture: "none", material: colors.material });
      engine.clearDice();
    }));
  }

  async function physicsRoll() {
    const ready = await createEngines();
    if (!ready) throw new Error("Physics unavailable.");
    const [hopeResult, fearResult] = await Promise.all([
      withTimeout(ready.hope.roll("1d12")),
      withTimeout(ready.fear.roll("1d12"))
    ]);
    return { hope: resultValue(hopeResult), fear: resultValue(fearResult) };
  }

  async function fallbackRoll() {
    root.classList.add("uses-fallback");
    const values = [secureD12(), secureD12()];
    fallbackDice.forEach((die) => { die.textContent = "?"; die.classList.remove("is-tossing"); });
    await new Promise((resolve) => requestAnimationFrame(() => {
      fallbackDice.forEach((die) => die.classList.add("is-tossing"));
      setTimeout(resolve, 900);
    }));
    fallbackDice.forEach((die, index) => { die.classList.remove("is-tossing"); die.textContent = String(values[index]); });
    return { hope: values[0], fear: values[1] };
  }

  function renderResult(roll) {
    const outcome = t(`player.dice.outcome.${roll.outcome}`);
    result.className = `duality-result is-${roll.outcome}`;
    result.innerHTML = `<span><small>${esc(t("player.dice.hope"))}</small><b>${roll.hope}</b></span><strong>${roll.total}</strong><span><small>${esc(t("player.dice.fear"))}</small><b>${roll.fear}</b></span><em>${esc(outcome)}${roll.modifier ? ` · ${esc(signed(roll.modifier))}` : ""}</em>`;
    result.hidden = false;
  }

  async function castDice() {
    if (rolling) return;
    setBusy(true);
    result.hidden = true;
    status.classList.remove("is-error");
    status.textContent = t("player.dice.rolling");
    try {
      if (!identity || identity.id !== currentPcId) await loadIdentity();
      let faces;
      try { faces = await physicsRoll(); }
      catch { faces = await fallbackRoll(); }
      const response = await fetch("/api/rolls/duality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pcId: currentPcId, ...faces, modifier })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t("player.dice.error"));
      renderResult(body);
      status.textContent = "";
    } catch (error) {
      status.classList.add("is-error");
      status.textContent = error.message || t("player.dice.error");
    } finally {
      setBusy(false);
    }
  }

  function closeTray({ restoreFocus = true } = {}) {
    tray.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.body.classList.remove("duality-tray-open");
    if (!currentPcId || !playerFeatureEnabled("dice")) root.hidden = true;
    if (restoreFocus && !trigger.hidden) trigger.focus();
  }

  async function openTray() {
    if (!playerFeatureEnabled("dice")) return;
    window.dispatchEvent(new CustomEvent("settlement:close-notes"));
    tray.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.body.classList.add("duality-tray-open");
    status.textContent = "";
    try {
      await loadIdentity();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await createEngines();
    } catch (error) {
      status.classList.add("is-error");
      status.textContent = error.message || t("player.dice.error");
    }
    rollButton.focus();
  }

  function refresh() {
    const next = selectedPcId();
    if (next !== currentPcId) identity = null;
    currentPcId = next;
    const enabled = playerFeatureEnabled("dice");
    trigger.hidden = !enabled;
    root.hidden = !currentPcId || (!enabled && tray.hidden);
    if (!currentPcId) closeTray({ restoreFocus: false });
  }

  trigger.addEventListener("click", () => tray.hidden ? void openTray() : closeTray());
  root.querySelector(".duality-close").addEventListener("click", () => closeTray());
  rollButton.addEventListener("click", () => void castDice());
  for (const button of root.querySelectorAll("[data-modifier]")) button.addEventListener("click", () => {
    modifier = Math.max(-20, Math.min(20, modifier + Number(button.dataset.modifier)));
    renderModifier();
  });
  for (const button of root.querySelectorAll("[data-skin]")) button.addEventListener("click", async () => {
    if (rolling || !SKINS[button.dataset.skin]) return;
    skin = button.dataset.skin;
    localStorage.setItem("settlement-dice-skin", skin);
    await applySkin();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !tray.hidden) closeTray();
  });
  window.addEventListener("storage", (event) => {
    if (["settlement-pc", "settlement-journal-pc"].includes(event.key)) refresh();
  });
  window.addEventListener("settlement:identity", refresh);
  window.addEventListener("settlement:player-features", refresh);
  window.addEventListener("settlement:close-dice", () => closeTray({ restoreFocus: false }));
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const engine of Object.values(engines || {})) engine.setDimensions();
    }));
  });
  renderModifier();
  renderSkin();
  refresh();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
