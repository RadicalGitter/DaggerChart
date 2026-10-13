import { t } from "/shared/i18n.js";

const params = new URLSearchParams(location.search);
const route = location.pathname.replace(/\/+$/, "") || "/";
// GM surfaces and the hub itself never carry the way home.
const excludedRoutes = new Set(["/", "/login", "/player", "/gm", "/board", "/screen", "/gm-remote", "/music"]);

function isEmbedded() {
  if (params.get("embed") === "1") return true;
  try { return window.self !== window.top; } catch { return true; }
}

function installPlayerHome() {
  if (isEmbedded() || excludedRoutes.has(route) || document.querySelector(".player-home")) return;

  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "/shared/player-home.css";
  document.head.append(style);

  // Pages reserve room under the ribbon by route (see player-home.css).
  document.body.dataset.homeRoute = route.split("/")[1] || "";

  const home = document.createElement("a");
  home.className = "player-home";
  home.href = "/player";
  home.title = t("player.home");
  home.innerHTML = `<span class="ph-plate">
    <span class="ph-lozenge" aria-hidden="true"></span>
    <span class="ph-glyph" aria-hidden="true">⌂</span>
    <strong>${t("player.home")}</strong>
    <span class="ph-lozenge" aria-hidden="true"></span>
  </span>`;
  document.body.append(home);
}

// The floating corner controls (Party and Notes bottom-left, the bug
// bottom-right) sit over the page. Rather than move them, give pages that
// scroll a little trailing room so their last lines can be scrolled clear.
// Pages that fit the viewport are left exactly as they are.
function keepCornersClear() {
  // Rules scrolls inside its own panes; those get padding in player-home.css.
  if (isEmbedded() || excludedRoutes.has(route) || route.startsWith("/rules")) return;
  const spacer = document.createElement("div");
  spacer.className = "corner-clearance";
  spacer.setAttribute("aria-hidden", "true");
  const update = () => {
    const root = document.scrollingElement || document.documentElement;
    const scrolls = root.scrollHeight - (spacer.isConnected ? spacer.offsetHeight : 0) > window.innerHeight + 1;
    if (scrolls && !spacer.isConnected) document.body.append(spacer);
    if (!scrolls && spacer.isConnected) spacer.remove();
  };
  new ResizeObserver(update).observe(document.body);
  window.addEventListener("resize", update);
  update();
}

function install() {
  installPlayerHome();
  keepCornersClear();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
