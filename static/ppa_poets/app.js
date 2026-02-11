/* global graphology, Sigma */
// UMD loader version (no ESM imports).
// This avoids "Failed to resolve module specifier 'events'" errors caused by
// ESM builds that contain bare Node-style imports.

// Minimal “load GEXF + render” setup using only Sigma + Graphology.
//
// Note: When loading modules directly in the browser (no bundler), some CDNs /
// ESM wrappers of `graphology-gexf` end up pulling in Node-oriented dependencies
// that import bare specifiers like "events", which browsers cannot resolve.
// So we parse GEXF with the browser's native DOMParser (no extra libraries).
(function () {
  function setStatus(msg) {
    const el = document.getElementById("status");
    if (el) el.textContent = msg || "";
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function castValue(v) {
    if (v == null) return v;
    const s = String(v);
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
  }

  async function parseGexfToGraph(GraphCtor, gexfText) {
    setStatus("Parsing GEXF…");
    await nextFrame();

    const doc = new DOMParser().parseFromString(gexfText, "application/xml");
    const parserError = doc.getElementsByTagName("parsererror")[0];
    if (parserError) throw new Error(`Invalid XML/GEXF: ${parserError.textContent || "parsererror"}`);

    // map node attribute id -> title (so we can store as human-readable keys)
    const attrIdToTitle = new Map();
    doc.querySelectorAll('attributes[class="node"] > attribute').forEach((el) => {
      const id = el.getAttribute("id");
      const title = el.getAttribute("title") || id;
      if (id) attrIdToTitle.set(id, title);
    });

    const graphEl = doc.getElementsByTagName("graph")[0];
    const defaultEdgeType = (graphEl && graphEl.getAttribute("defaultedgetype") || "undirected").toLowerCase();
    const graphType = defaultEdgeType === "directed" ? "directed" : "undirected";

    // Use multi graph to avoid failures on duplicates
    const graph = new GraphCtor({ type: graphType, multi: true });

    // Nodes
    const nodeEls = doc.getElementsByTagName("node");
    for (let i = 0; i < nodeEls.length; i++) {
      const n = nodeEls[i];
      const id = n.getAttribute("id");
      if (!id) continue;

      const attrs = {};
      const label = n.getAttribute("label");
      if (label) attrs.label = label;

      // Attributes (<attvalue for="..." value="..."/>)
      const attvalueEls = n.getElementsByTagName("attvalue");
      for (let j = 0; j < attvalueEls.length; j++) {
        const av = attvalueEls[j];
        const k = av.getAttribute("for") || av.getAttribute("id");
        const v = av.getAttribute("value");
        if (!k) continue;
        const title = attrIdToTitle.get(k) || k;
        attrs[title] = castValue(v);
        if (k === "degree") attrs.degree = castValue(v);
      }

      // VIZ module (Gephi exports these)
      const sizeEl = n.getElementsByTagName("viz:size")[0];
      if (sizeEl) {
        const v = sizeEl.getAttribute("value");
        if (v != null) attrs.size = Number(v);
      }
      const posEl = n.getElementsByTagName("viz:position")[0];
      if (posEl) {
        const x = posEl.getAttribute("x");
        const y = posEl.getAttribute("y");
        if (x != null) attrs.x = Number(x);
        if (y != null) attrs.y = Number(y);
      }
      const colorEl = n.getElementsByTagName("viz:color")[0];
      if (colorEl) {
        const r = colorEl.getAttribute("r");
        const g = colorEl.getAttribute("g");
        const b = colorEl.getAttribute("b");
        const a = colorEl.getAttribute("a");
        if (r != null && g != null && b != null) {
          attrs.color = a != null ? "rgba(" + r + "," + g + "," + b + "," + a + ")" : "rgb(" + r + "," + g + "," + b + ")";
        }
      }

      graph.addNode(id, attrs);

      if (i % 500 === 0) {
        setStatus(`Parsing nodes… ${i.toLocaleString()}/${nodeEls.length.toLocaleString()}`);
        await nextFrame();
      }
    }

    // Edges
    const edgeEls = doc.getElementsByTagName("edge");
    for (let i = 0; i < edgeEls.length; i++) {
      const e = edgeEls[i];
      const source = e.getAttribute("source");
      const target = e.getAttribute("target");
      if (!source || !target) continue;

      const type = (e.getAttribute("type") || defaultEdgeType).toLowerCase();
      const w = e.getAttribute("weight");
      const attrs = {};
      if (w != null && w !== "") attrs.weight = Number(w);

      if (type === "directed") graph.addDirectedEdge(source, target, attrs);
      else graph.addUndirectedEdge(source, target, attrs);

      if (i % 5000 === 0) {
        setStatus(`Parsing edges… ${i.toLocaleString()}/${edgeEls.length.toLocaleString()}`);
        await nextFrame();
      }
    }

    return graph;
  }

  (async function main() {
    setStatus("Fetching poets.gexf…");

    if (!window.graphology) throw new Error("Graphology did not load (window.graphology missing).");
    if (!window.Sigma) throw new Error("Sigma did not load (window.Sigma missing).");

    const GraphCtor = window.graphology.Graph || window.graphology.default || window.graphology;
    if (typeof GraphCtor !== "function") throw new Error("Could not find Graphology Graph constructor.");

    const gexfText = await fetch("./poets.gexf").then(r => {
      if (!r.ok) throw new Error(`Failed to load poets.gexf: ${r.status} ${r.statusText}`);
      return r.text();
    });

    // Let the browser paint the status before parsing.
    await nextFrame();

    const graph = await parseGexfToGraph(GraphCtor, gexfText);

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
    new window.Sigma(graph, container, { renderEdgeLabels: false });

    setStatus(`Rendered ${graph.order.toLocaleString()} nodes, ${graph.size.toLocaleString()} edges`);
  })().catch((e) => {
    const msg = e && (e.stack || e.message) ? (e.stack || e.message) : String(e);
    console.error(e);
    setStatus(`Error:\n${msg}`);
  });
})();
