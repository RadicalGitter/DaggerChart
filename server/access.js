// Optional GM gate. Player pages and PC selection remain open on trust.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import express from "express";

const COOKIE = "settlement-access";
const AGE = 7 * 24 * 60 * 60;
const same = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
};
export function hashGmPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

const playerReads = [
  /^\/api\/screen\/adventure-map\/[a-z0-9_-]+$/i,
  /^\/api\/(table|reference|rules|party|lore|screen|stream|art\/status|items\/consumables|llm-credits)$/,
  /^\/api\/party\/[^/]+(?:\/(shadow|presentation|rule-pins|class-choice|portrait-workshop))?$/,
  /^\/api\/character-drafts(?:\/[^/]+)?$/,
  /^\/api\/messages$/,
  /^\/api\/journal-doodles\/[^/]+$/,
  /^\/api\/music\/(themes\/[^/]+|songs\/[^/]+\/audio)$/,
  /^\/api\/cartography(?:\/images\/[^/]+)?$/
];
const playerWrites = {
  POST: [
    /^\/api\/party\/[^/]+\/portrait-workshop$/,
    /^\/api\/(party|notes|messages|feedback|telemetry\/batch|rolls\/duality|llm-credits\/request|gm-notifications\/screen-requests)$/,
    /^\/api\/art\/portrait(?:\/suggest)?$/,
    /^\/api\/party\/[^/]+\/(class-choice|domain-cards|portrait|shadow\/invoke|sheet-beauty\/(commit|restore)|background\/(suggest|spark|weave)|presentation\/activate|personas|presentation\/[^/]+\/portrait|inventory|inventory\/[^/]+\/use)$/,
    /^\/api\/sessions\/[^/]+\/perspectives$/,
    /^\/api\/music\/themes\/[^/]+\/(generate|publish)$/,
    /^\/api\/cartography\/sheets(?:\/[^/]+\/(submit|notes))?$/
  ],
  PUT: [
    /^\/api\/party\/[^/]+\/portrait-workshop$/,
    /^\/api\/party\/[^/]+(?:\/(name|background|conditions|equipment|experiences|shadow|rule-pins|inventory\/[^/]+|beastforms\/[^/]+))?$/,
    /^\/api\/(character-drafts\/[^/]+|notes\/[^/]+|messages\/read|journal-doodles\/[^/]+\/[^/]+)$/,
    /^\/api\/music\/themes\/[^/]+\/identity$/,
    /^\/api\/cartography\/sheets\/[^/]+(?:\/(ink|notes\/[^/]+))?$/
  ],
  DELETE: [
    /^\/api\/(character-drafts|notes)\/[^/]+$/,
    /^\/api\/party\/[^/]+\/(inventory|personas)\/[^/]+$/,
    /^\/api\/cartography\/sheets\/[^/]+(?:\/notes\/[^/]+)?$/
  ]
};

export function requiresGm(method, pathname) {
  if (/^\/(gm(?:-remote)?|board|music)(\/|$)/.test(pathname)) return true;
  if (!pathname.startsWith("/api/")) return false;
  const patterns = method === "GET" || method === "HEAD" ? playerReads : playerWrites[method] || [];
  return !patterns.some((pattern) => pattern.test(pathname));
}

const words = {
  en: { title: "A place at the table",
    gm: "Keeper access", password: "GM password", enter: "Open the ledger", wrong: "That password did not match.",
    wait: "Too many attempts. Try again in 15 minutes.", back: "Return to your character" },
  sv: { title: "En plats vid bordet",
    gm: "Spelledarens ingång", password: "Spelledarens lösenord", enter: "Öppna liggaren", wrong: "Lösenordet stämde inte.",
    wait: "För många försök. Försök igen om 15 minuter.", back: "Tillbaka till din rollperson" }
};
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeNext = (s) => /^\/(?!\/)[a-z0-9/_?=&%.-]*$/i.test(String(s)) ? s : "/gm/";

export function tableAccess(env = process.env) {
  const key = env.TABLE_SESSION_KEY;
  const passwordHash = env.TABLE_GM_PASSWORD_HASH;
  if (!key && !passwordHash) return (_req, _res, next) => next();
  if (!key || key.length < 32
    || !/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(passwordHash || "")) {
    throw new Error("Incomplete table access configuration. Refusing to start without the access gate.");
  }
  const router = express.Router();
  const signature = (body) => createHmac("sha256", key).update(body).digest("base64url");
  const cookie = (req, res, role) => {
    const body = `${role}.${Math.floor(Date.now() / 1000) + AGE}`;
    res.cookie(COOKIE, `${body}.${signature(body)}`, { httpOnly: true, sameSite: "strict",
      secure: req.secure || req.get("x-forwarded-proto") === "https", maxAge: AGE * 1000, path: "/" });
  };
  const roleOf = (req) => {
    const raw = (req.get("cookie") || "").split(";").map((p) => p.trim()).find((p) => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || "";
    const [role, expiry, mac, extra] = raw.split(".");
    if (extra || role !== "gm" || !/^\d+$/.test(expiry || "") || Number(expiry) <= Date.now() / 1000) return "player";
    return same(mac, signature(`${role}.${expiry}`)) ? role : "player";
  };
  const language = (req) => req.query.lang === "sv" || (req.query.lang !== "en" && /^sv\b/i.test(req.get("accept-language") || "")) ? "sv" : "en";
  const page = (req, res, { message = "", status = 200 } = {}) => {
    const lang = language(req), t = words[lang];
    res.status(status).type("html").send(`<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t.title}</title>
      <style>body{background:#171914;color:#ede4ce;font:18px Georgia,serif;margin:0;display:grid;min-height:100dvh;place-items:center}main{max-width:420px;margin:24px;padding:28px;border:1px solid #6a6048}h1{font-size:1.6rem}a{color:#dcc48d}input,button{font:inherit;padding:12px;box-sizing:border-box;width:100%;margin:10px 0}button{background:#6c4935;color:#fff;border:1px solid #a38b60;cursor:pointer}p{line-height:1.5}.error{color:#f3b8a7}nav{font-size:.85rem}</style>
      <main><nav><a href="?lang=en">English</a> · <a href="?lang=sv">Svenska</a></nav><h1>${t.gm}</h1>
      <p class="error" role="alert">${escape(message)}</p>
      <form method="post" action="/access/gm?lang=${lang}"><input type="hidden" name="next" value="${escape(safeNext(req.query.next))}"><label for="password">${t.password}</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button>${t.enter}</button></form><a href="/login/">${t.back}</a></main>
      <script>
      const form = document.querySelector('form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('button');
        button.disabled = true;
        try {
          const response = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams(new FormData(form)) });
          const result = await response.json();
          if (response.ok) location.assign(result.next);
          else document.querySelector('[role=alert]').textContent = result.error;
        } catch {
          document.querySelector('[role=alert]').textContent = ${JSON.stringify(lang === "sv" ? "Anslutningen misslyckades. Försök igen." : "Connection failed. Try again.")};
        } finally { button.disabled = false; }
      });
      </script></html>`);
  };
  // Bound password guesses globally without retaining IP addresses.
  let attempts = 0, resetAt = 0;
  router.use((req, res, next) => {
    res.set({ "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" });
    res.set("Cache-Control", "private, no-store");
    let pathname;
    try { pathname = decodeURIComponent(req.path).toLowerCase().replace(/\/$/, "") || "/"; }
    catch { return res.sendStatus(400); }
    if (/[\\\0]/.test(pathname) || pathname.includes("//") || pathname.split("/").some((p) => p === "." || p === "..")) return res.sendStatus(400);
    req.accessPath = pathname;
    req.tableRole = roleOf(req);
    // Browsers must originate writes on this host; non-browser API calls still
    // need the signed session cookie. No trust in arbitrary forwarded hosts.
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      if (req.get("sec-fetch-site") === "cross-site") return res.sendStatus(403);
      if (origin) {
        try { if (new URL(origin).host !== req.get("host")) return res.sendStatus(403); }
        catch { return res.sendStatus(403); }
      }
    }
    next();
  });
  router.get("/access/gm", (req, res) => page(req, res));
  router.post("/access/gm", express.urlencoded({ extended: false, limit: "2kb" }), (req, res) => {
    const t = words[language(req)];
    const json = req.get("accept") === "application/json";
    const fail = (status, message) => json ? res.status(status).json({ error: message }) : page(req, res, { message, status });
    if (Date.now() > resetAt) { attempts = 0; resetAt = Date.now() + 15 * 60 * 1000; }
    if (attempts >= 8) { res.set("Retry-After", "900"); return fail(429, t.wait); }
    attempts++;
    const [salt, expected] = passwordHash.split(":");
    const supplied = scryptSync(String(req.body.password || "").slice(0, 256), salt, 32).toString("hex");
    if (!same(supplied, expected)) return fail(401, t.wrong);
    attempts = 0;
    cookie(req, res, "gm");
    if (json) return res.json({ next: safeNext(req.body.next) });
    res.redirect(303, safeNext(req.body.next));
  });
  router.use((req, res, next) => {
    if (requiresGm(req.method, req.accessPath) && req.tableRole !== "gm") {
      if (req.accessPath.startsWith("/api/")) return res.status(403).json({ error: "Unlock Keeper access first.", login: "/access/gm" });
      return res.redirect(303, `/access/gm?next=${encodeURIComponent(req.originalUrl)}`);
    }
    next();
  });
  return router;
}

// Run after JSON parsing. Player-accessible endpoints with shared GM payloads
// must not accept administrative fields or forge correspondence from the GM.
export function protectPlayerWrites(req, res, next) {
  if (req.tableRole !== "player") return next();
  const route = req.accessPath;
  if ((route === "/api/messages" && req.method === "POST" && req.body.from !== "player")
    || (route === "/api/messages/read" && req.method === "PUT" && req.body.side !== "player")) {
    return res.status(403).json({ error: "Keeper access required." });
  }
  if (/^\/api\/party\/[^/]+$/.test(route) && req.method === "PUT") {
    const allowed = new Set(["hp", "stress", "hope", "armorMarked", "domainCards"]);
    if (Object.keys(req.body).some((key) => !allowed.has(key))) return res.status(403).json({ error: "Use the dedicated player controls, or unlock Keeper access." });
  }
  next();
}
