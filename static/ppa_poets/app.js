import Graph from "https://cdn.jsdelivr.net/npm/graphology@0.25.4/dist/graphology.esm.min.js";
import Sigma from "https://cdn.jsdelivr.net/npm/sigma@3.0.2/dist/sigma.esm.min.js";
import { parse } from "https://cdn.jsdelivr.net/npm/graphology-gexf@0.10.1/+esm";

// ---------- helpers ----------
function normLabel(s) {
  return (s || "").toString().trim().toLowerCase();
}

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg || "";
}

function escapeHtml(s) {
  return (s ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function rgbFromVizColor(c) {
  // graphology-gexf may give {r,g,b} or a string; normalize to CSS
  if (!c) return null;
  if (typeof c === "string") return c;
  if (typeof c === "object" && c.r != null) return `rgb(${c.r},${c.g},${c.b})`;
  return null;
}

function setDetails(node, attrs) {
  const el = document.getElementById("details");
  if (!node) { el.innerHTML = ""; return; }

  const qid = node;
  // Depending on the parser build, attributes can be keyed by:
  // - Gephi internal ids (d2/d7/...) OR
  // - attribute titles (poet_name/cohort/...) OR
  // - special title-cased fields (Degree)
  const name = attrs.poet_name ?? attrs.d2 ?? attrs.label ?? node;
  const cohort = attrs.cohort ?? attrs.d7 ?? "";
  const birth = attrs.birth_year ?? attrs.d3 ?? "";
  const eligible = attrs.eligible_year ?? attrs.d4 ?? "";
  const entry = attrs.entry_year ?? attrs.d5 ?? "";
  const degree = attrs.degree ?? attrs.Degree ?? "";

  el.innerHTML = `
    <div><strong>${escapeHtml(name)}</strong></div>
    <div><span class="k">QID:</span> ${escapeHtml(qid)}</div>
    ${cohort ? `<div><span class="k">Cohort:</span> ${escapeHtml(cohort)}</div>` : ""}
    ${birth !== "" ? `<div><span class="k">Birth year:</span> ${escapeHtml(birth)}</div>` : ""}
    ${eligible !== "" ? `<div><span class="k">Eligible year:</span> ${escapeHtml(eligible)}</div>` : ""}
    ${entry !== "" ? `<div><span class="k">Entry year:</span> ${escapeHtml(entry)}</div>` : ""}
    ${degree !== "" ? `<div><span class="k">Degree:</span> ${escapeHtml(degree)}</div>` : ""}
  `;
}

// ---------- main ----------
try {
  setStatus("Loading graph…");

  // ---------- load & parse GEXF ----------
  const gexfText = await fetch("./poets.gexf").then(r => {
    if (!r.ok) throw new Error(`Failed to load poets.gexf: ${r.status} ${r.statusText}`);
    return r.text();
  });

  const graph = parse(Graph, gexfText);
  setStatus(`Loaded ${graph.order.toLocaleString()} nodes, ${graph.size.toLocaleString()} edges`);

// ---------- normalize node attrs for Sigma ----------
graph.forEachNode((node, attrs) => {
  if (!attrs.label) graph.setNodeAttribute(node, "label", node);

  // Positions: your file has <viz:position x="..." y="...">, usually parsed into attrs.x/attrs.y.
  // Fallback: check attrs.viz.position
  if (typeof attrs.x !== "number" || typeof attrs.y !== "number") {
    const v = attrs.viz || {};
    const px = v.position?.x;
    const py = v.position?.y;
    graph.setNodeAttribute(node, "x", (typeof px === "number") ? px : Math.random());
    graph.setNodeAttribute(node, "y", (typeof py === "number") ? py : Math.random());
  }

  // Size: use Gephi viz size if present (often parsed into attrs.size; fallback attrs.viz.size)
  if (typeof attrs.size !== "number") {
    const v = attrs.viz || {};
    const vs = v.size;
    if (typeof vs === "number") graph.setNodeAttribute(node, "size", vs);
    else {
      const d = (attrs.degree != null) ? Number(attrs.degree) : graph.degree(node);
      graph.setNodeAttribute(node, "size", Math.max(2, Math.sqrt(d)));
    }
  }

  // Color: use Gephi viz:color (often parsed into attrs.color; fallback attrs.viz.color)
  if (!attrs.color) {
    const v = attrs.viz || {};
    const c = rgbFromVizColor(v.color);
    graph.setNodeAttribute(node, "color", c || "#666");
  }

  // Degree (from your GEXF attribute id="degree")
  const rawDegree = (attrs.degree ?? attrs.Degree);
  const d = (rawDegree != null) ? Number(rawDegree) : graph.degree(node);
  graph.setNodeAttribute(node, "degree", d);
});

// Light edge defaults (readability)
graph.forEachEdge((edge, attrs) => {
  if (typeof attrs.size !== "number") graph.setEdgeAttribute(edge, "size", 0.5);
  if (!attrs.color) graph.setEdgeAttribute(edge, "color", "rgba(0,0,0,0.07)");
});

// ---------- render ----------
const container = document.getElementById("container");
if (!container) throw new Error("Missing #container element");
const renderer = new Sigma(graph, container, { renderEdgeLabels: false, zIndex: true });

// ---------- base style caches (so reducers can override safely) ----------
const baseNodeColor = new Map();
const baseNodeSize = new Map();
graph.forEachNode((n, a) => {
  baseNodeColor.set(n, a.color);
  baseNodeSize.set(n, a.size);
});

// ---------- state ----------
let selectedNode = null;
let selectedNeighborhood = null; // Set<string> | null
let minDegree = 0;

function setSelected(node) {
  selectedNode = node;
  selectedNeighborhood = node ? new Set([node, ...graph.neighbors(node)]) : null;
  if (node) setDetails(node, graph.getNodeAttributes(node));
  else setDetails(null, {});
  renderer.refresh();
}

renderer.on("clickNode", ({ node }) => {
  setSelected(node);
});
renderer.on("clickStage", () => {
  setSelected(null);
});

// ---------- degree slider filter (reducers) ----------
const slider = document.getElementById("minDegree");
const sliderVal = document.getElementById("minDegreeVal");

renderer.setSetting("nodeReducer", (node, data) => {
  const d = data.degree ?? 0;
  if (d < minDegree) return { ...data, hidden: true };

  if (!selectedNeighborhood) return data;

  const inN = selectedNeighborhood.has(node);
  if (node === selectedNode) {
    return {
      ...data,
      color: "#111",
      size: (baseNodeSize.get(node) ?? data.size) * 1.45,
      zIndex: 2,
      forceLabel: true,
    };
  }
  if (inN) {
    return {
      ...data,
      color: baseNodeColor.get(node) ?? data.color,
      size: (baseNodeSize.get(node) ?? data.size) * 1.15,
      zIndex: 1,
    };
  }
  return {
    ...data,
    color: "rgba(180,180,180,0.20)",
    label: "",
    zIndex: 0,
  };
});

renderer.setSetting("edgeReducer", (edge, data) => {
  const s = graph.source(edge);
  const t = graph.target(edge);
  const ds = graph.getNodeAttribute(s, "degree");
  const dt = graph.getNodeAttribute(t, "degree");
  if (ds < minDegree || dt < minDegree) return { ...data, hidden: true };

  if (!selectedNeighborhood) return data;

  const keep = selectedNeighborhood.has(s) && selectedNeighborhood.has(t);
  if (keep) return { ...data, color: "rgba(0,0,0,0.18)", hidden: false };
  return { ...data, hidden: true };
});

slider.addEventListener("input", () => {
  minDegree = parseInt(slider.value, 10);
  sliderVal.textContent = String(minDegree);

  if (selectedNode) {
    const d = graph.getNodeAttribute(selectedNode, "degree");
    if (d < minDegree) setSelected(null);
  }
  renderer.refresh();
});

// Set slider max from data
let maxDeg = 0;
graph.forEachNode((n) => { maxDeg = Math.max(maxDeg, graph.getNodeAttribute(n, "degree") || 0); });
slider.max = String(maxDeg);
slider.value = "0";
sliderVal.textContent = "0";

// ---------- search box ----------
const search = document.getElementById("search");

// label index: normalized label -> node ids (array, to avoid overwriting duplicates)
const labelToNodes = new Map();
graph.forEachNode((node, attrs) => {
  const lab = normLabel(attrs.label);
  if (!lab) return;
  const arr = labelToNodes.get(lab);
  if (arr) arr.push(node);
  else labelToNodes.set(lab, [node]);
});

// optional autocomplete list
const poetList = document.getElementById("poet-list");
if (poetList) {
  const labels = [];
  graph.forEachNode((node, attrs) => {
    const lab = attrs.label;
    if (lab) labels.push(lab);
  });
  labels.sort((a, b) => a.localeCompare(b));
  poetList.innerHTML = labels.slice(0, 5000).map(l => `<option value="${escapeHtml(l)}"></option>`).join("");
}

function findNodeByQuery(q) {
  if (!q) return null;

  // Allow searching by QID / node id
  if (graph.hasNode(q)) return q;

  // Exact label match
  const exact = labelToNodes.get(q);
  if (exact?.length) return exact[0];

  // Prefer startsWith, then includes
  for (const [lab, nodes] of labelToNodes.entries()) {
    if (lab.startsWith(q)) return nodes[0];
  }
  for (const [lab, nodes] of labelToNodes.entries()) {
    if (lab.includes(q)) return nodes[0];
  }
  return null;
}

function runSearch() {
  const q = normLabel(search.value);
  const node = findNodeByQuery(q);
  if (!node) return;

  // If filtered out, reset filter for simplicity
  const d = graph.getNodeAttribute(node, "degree") || 0;
  if (d < minDegree) {
    minDegree = 0;
    slider.value = "0";
    sliderVal.textContent = "0";
  }

  setSelected(node);

  // zoom
  const { x, y } = graph.getNodeAttributes(node);
  renderer.getCamera().animate({ x, y, ratio: 0.25 }, { duration: 600 });
}

// Trigger search on Enter, and on explicit selection from datalist
search.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  runSearch();
});
search.addEventListener("change", () => {
  runSearch();
});
} catch (e) {
  // If *anything* goes wrong, show it on the page (so we don't get silent blank canvas)
  setStatus("Error (see details below)");
  const details = document.getElementById("details");
  if (details) details.innerHTML = `<div><strong>Error:</strong> ${escapeHtml(e?.stack || e?.message || String(e))}</div>`;
  throw e;
}
