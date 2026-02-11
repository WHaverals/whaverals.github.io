import Graph from "https://cdn.jsdelivr.net/npm/graphology@0.25.4/dist/graphology.esm.min.js";
import Sigma from "https://cdn.jsdelivr.net/npm/sigma@3.0.2/dist/sigma.esm.min.js";
import { parse } from "https://cdn.jsdelivr.net/npm/graphology-gexf@0.10.1/+esm";

// Minimal “load GEXF + render” setup using only Sigma + Graphology (+ graphology-gexf).
function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg || "";
}

try {
  setStatus("Fetching poets.gexf…");

  const gexfText = await fetch("./poets.gexf").then(r => {
    if (!r.ok) throw new Error(`Failed to load poets.gexf: ${r.status} ${r.statusText}`);
    return r.text();
  });

  // Let the browser paint the status before parsing (parsing is synchronous).
  await new Promise((resolve) => requestAnimationFrame(resolve));

  setStatus("Parsing GEXF (this may take a few seconds)…");
  const graph = parse(Graph, gexfText);

  // Ensure sigma-required node attributes exist (fallbacks only)
  graph.forEachNode((node, attrs) => {
    if (typeof attrs.x !== "number" || typeof attrs.y !== "number") {
      graph.setNodeAttribute(node, "x", (typeof attrs.x === "number") ? attrs.x : Math.random());
      graph.setNodeAttribute(node, "y", (typeof attrs.y === "number") ? attrs.y : Math.random());
    }
    if (typeof attrs.size !== "number") graph.setNodeAttribute(node, "size", 2);
    if (!attrs.color) graph.setNodeAttribute(node, "color", "#777");
    if (!attrs.label) graph.setNodeAttribute(node, "label", node);
  });

  graph.forEachEdge((edge, attrs) => {
    if (typeof attrs.size !== "number") graph.setEdgeAttribute(edge, "size", 0.5);
    if (!attrs.color) graph.setEdgeAttribute(edge, "color", "rgba(0,0,0,0.06)");
  });

const container = document.getElementById("container");
  if (!container) throw new Error("Missing #container element");

  // eslint-disable-next-line no-new
  new Sigma(graph, container, { renderEdgeLabels: false });

  setStatus(`Rendered ${graph.order.toLocaleString()} nodes, ${graph.size.toLocaleString()} edges`);
} catch (e) {
  const msg = e?.stack || e?.message || String(e);
  console.error(e);
  setStatus(`Error:\n${msg}`);
  throw e;
}
