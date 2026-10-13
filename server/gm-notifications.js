import { randomUUID } from "node:crypto";
import { loadJson, saveJson } from "./store.js";

const FILE = "gm-notifications.json";
const MAX_NOTIFICATIONS = 200;
const VALID_STATUSES = new Set(["pending", "approved", "dismissed"]);
const data = loadJson(FILE, { notifications: [] });
if (!Array.isArray(data.notifications)) data.notifications = [];

const clean = (value, limit = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);

function persistNotifications() {
  data.notifications = data.notifications
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
    .slice(0, MAX_NOTIFICATIONS);
  saveJson(FILE, data);
}

export function gmNotificationsView() {
  return data.notifications.map((notification) => structuredClone(notification));
}

export function notificationById(id) {
  return data.notifications.find((notification) => notification.id === id) || null;
}

export function createScreenRequest(pc, input, projection) {
  const source = input?.source || {};
  const createdAt = new Date().toISOString();
  const notification = {
    id: `notice_${randomUUID()}`,
    kind: "screen-request",
    status: "pending",
    title: `${clean(pc.name, 80) || "A player"} asks to show something`,
    summary: clean(source.label || projection.caption || projection.title || "Untitled", 180),
    actor: { pcId: pc.id, name: clean(pc.name, 80) },
    source: {
      kind: projection.type,
      route: clean(source.route, 300),
      label: clean(source.label, 180)
    },
    payload: { projection: structuredClone(projection) },
    change: null,
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null
  };
  data.notifications.unshift(notification);
  persistNotifications();
  return structuredClone(notification);
}

export function resolveNotification(id, status) {
  if (!VALID_STATUSES.has(status) || status === "pending") throw new Error("Choose approve or dismiss.");
  const notification = notificationById(id);
  if (!notification) throw new Error("No such GM notification.");
  if (notification.status !== "pending") throw new Error("That request has already been handled.");
  notification.status = status;
  notification.updatedAt = new Date().toISOString();
  notification.resolvedAt = notification.updatedAt;
  persistNotifications();
  return structuredClone(notification);
}
