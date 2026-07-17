export function normalizeRuleText(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

export function prepareRuleNodes(corpus) {
  const nodes = Array.isArray(corpus?.nodes) ? corpus.nodes : [];
  return nodes.map((node) => ({
    ...node,
    _search: {
      title: normalizeRuleText(node.title),
      path: normalizeRuleText((node.path || []).join(" ")),
      body: normalizeRuleText(node.body),
      keywords: (node.keywords || []).map(normalizeRuleText)
    }
  }));
}

function rankRule(node, query) {
  const text = node._search;
  if (text.title.startsWith(query)) return 0;
  if (text.title.includes(query)) return 1;
  if (text.keywords.some((keyword) => keyword.includes(query))) return 2;
  if (text.path.includes(query)) return 3;
  if (text.body.includes(query)) return 4;
  return null;
}

export function searchRuleNodes(nodes, query) {
  const clean = normalizeRuleText(query);
  if (!clean) return [...nodes].sort((a, b) => a.title.localeCompare(b.title));
  return nodes
    .map((node) => ({ node, score: rankRule(node, clean) }))
    .filter((result) => result.score !== null)
    .sort((a, b) => a.score - b.score || a.node.title.localeCompare(b.node.title))
    .map((result) => result.node);
}
