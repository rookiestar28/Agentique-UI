export const navigationRouteSchemaVersion = "agentique.navigationRoute.v1";

export const fallbackNavigationKey = "library";

export const navigationKeys = [
  "library",
  "import",
  "verify",
  "preview",
  "graph",
  "run",
  "handoff",
  "settings"
];

const navigationKeySet = new Set(navigationKeys);

export function normalizeNavigationKey(value) {
  return typeof value === "string" && navigationKeySet.has(value)
    ? value
    : fallbackNavigationKey;
}

export function readNavigationHash(locationLike) {
  const hash = typeof locationLike?.hash === "string" ? locationLike.hash : "";
  return normalizeNavigationKey(hash.replace(/^#/, ""));
}

export function createNavigationHash(key) {
  return `#${normalizeNavigationKey(key)}`;
}

export function writeNavigationHash(historyLike, key) {
  if (typeof historyLike?.replaceState !== "function") {
    return;
  }
  historyLike.replaceState(null, "", createNavigationHash(key));
}
