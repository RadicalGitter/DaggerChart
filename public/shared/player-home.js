import { t } from "/shared/i18n.js";

const params = new URLSearchParams(location.search);
const route = location.pathname.replace(/\/+$/, "") || "/";
const excludedRoutes = new Set(["/", "/login", "/player", "/gm", "/board", "/screen"]);

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

  const home = document.createElement("a");
  home.className = `player-home${route.startsWith("/tome") ? " player-home-context-tome" : ""}`;
  home.href = "/player";
  home.setAttribute("aria-label", t("player.hub.root"));
  home.title = t("player.hub.root");
  home.innerHTML = `<span aria-hidden="true">⌂</span><strong>${t("player.hub.views")}</strong>`;
  document.body.append(home);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installPlayerHome, { once: true });
else installPlayerHome();
