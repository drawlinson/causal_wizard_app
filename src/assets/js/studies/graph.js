// Causal diagram editor: a Cytoscape.js wrapper. Cleaned-up port of the old
// site's graph.js (same library, same node/edge concepts) - modern class,
// no jQuery, no global DOM event bus. Modal/UI concerns live in the page
// controller; this module only knows about the diagram itself.
//
// Node data: { id (random), src (column name, or "u<n>" unobserved / "x<n>"
// user-defined-no-data), name, type ("numerical"|"categorical") }.
// Edge data: { id, source (node id), target (node id) } - a directed causal
// arrow, source -> target.

const STYLE = [
  { selector: "node", css: { width: 50, height: 50, "background-color": "#f0f0f0", "border-width": "2px", "border-color": "#555", "background-fit": "cover", label: "data(name)" } },
  { selector: "edge", style: { width: 4, "line-color": "#555", "curve-style": "bezier", "target-arrow-color": "#555", "target-arrow-shape": "triangle" } },
  { selector: ".categorical-node", style: { "background-image": "/assets/images/var_type_cat.png" } },
  { selector: ".numerical-node", style: { "background-image": "/assets/images/var_type_num.png" } },
  { selector: ".treatment-node", style: { "background-color": "#bfd9ff", "border-color": "#05419c", color: "#05419c" } },
  { selector: ".outcome-node", style: { "background-color": "#d0fcdc", "border-color": "#184925", color: "#184925" } },
  { selector: ".controlled-node", style: { "background-color": "#fab5a5", "border-color": "#f03a11", color: "#f03a11" } },
  { selector: ".frontdoor-node", style: { "background-color": "#ffe6cc", "border-color": "#cc6600", color: "#cc6600" } },
  { selector: ".iv-node", style: { "background-color": "#f2ccff", "border-color": "#cc33ff", color: "#cc33ff" } },
  { selector: ".collider-node", style: { "border-color": "#980000", color: "#980000" } },
  { selector: ".mediator-node", style: { "background-color": "#cccccc", "border-color": "#980000", color: "#980000" } },
  { selector: ".unobserved-node", style: { "background-color": "#fff", "border-style": "dashed" } },
];

const EDGEHANDLES_OPTS = {
  canConnect: (source, target) => !source.same(target),
  edgeParams: () => ({}),
  hoverDelay: 150,
  snap: true,
  snapThreshold: 50,
  snapFrequency: 15,
  noEdgeEventsInDraw: true,
  disableBrowserGestures: true,
};

export class StudyGraph {
  constructor({ containerEl, initialGraph, onTapBackground, onTapNode, onTopologyChanged }) {
    this.onTapBackground = onTapBackground;
    this.onTapNode = onTapNode;
    this.onTopologyChanged = onTopologyChanged;
    this.mode = "nodes";

    this.cy = cytoscape({
      container: containerEl,
      elements: initialGraph && initialGraph.nodes ? { nodes: initialGraph.nodes, edges: initialGraph.edges } : { nodes: [], edges: [] },
      style: STYLE,
      layout: { name: "preset" },
    });
    this.cy.userZoomingEnabled(false);
    this.eh = this.cy.edgehandles(EDGEHANDLES_OPTS);
    this.setMode("nodes");

    this.cy.on("tap", (event) => this._onTap(event));
    this.cy.on("ehcomplete", () => this.onTopologyChanged?.());
  }

  _onTap(event) {
    const target = event.target;
    if (target === this.cy) {
      if (this.mode === "nodes") this.onTapBackground?.(event.renderedPosition);
      return;
    }
    if (target.isNode()) {
      this.onTapNode?.(target);
    } else if (this.mode === "edges") {
      this.deleteEdge(target.id());
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === "edges") {
      this.eh.enable();
      this.eh.enableDrawMode();
    } else {
      this.eh.disableDrawMode();
      this.eh.disable();
    }
  }

  newNodeId() {
    return "n" + Math.random().toString(36).slice(2, 10);
  }

  addNode({ id, src, name, type, x, y }) {
    this.cy.add({ group: "nodes", data: { id, src, name, type }, renderedPosition: { x, y } });
    this.onTopologyChanged?.();
  }

  updateNode(id, { src, name, type }) {
    const node = this.cy.getElementById(id);
    node.data("src", src);
    node.data("name", name);
    node.data("type", type);
    this.onTopologyChanged?.();
  }

  deleteNode(id) {
    this.cy.$(`#${id}`).remove();
    this.onTopologyChanged?.();
  }

  deleteEdge(id) {
    this.cy.$(`#${id}`).remove();
    this.onTopologyChanged?.();
  }

  /** Column/variable names already used by some node, so the "add node"
   * picker doesn't offer the same variable twice. */
  usedVariables(exceptNodeId = null) {
    const set = new Set();
    this.cy.nodes().forEach((n) => {
      if (n.id() === exceptNodeId) return;
      const src = n.data("src");
      if (src) set.add(src);
    });
    return set;
  }

  nextUnobservedId() {
    const used = this.usedVariables();
    let i = 0;
    while (used.has(`u${i}`)) i += 1;
    return `u${i}`;
  }

  nextUserDefinedId() {
    const used = this.usedVariables();
    let i = 0;
    while (used.has(`x${i}`)) i += 1;
    return `x${i}`;
  }

  serialize() {
    const json = this.cy.json();
    const notGhost = (el) => !(el.classes || []).includes("eh-ghost");
    const nodes = (json.elements.nodes || []).filter(notGhost).map((n) => ({
      data: { id: n.data.id, src: n.data.src, name: n.data.name, type: n.data.type },
      position: n.position,
    }));
    const edges = (json.elements.edges || []).filter(notGhost).map((e) => ({
      data: { id: e.data.id, source: e.data.source, target: e.data.target },
    }));
    return { nodes, edges };
  }

  /** {nodes: [variableName...], edges: [[fromVar, toVar]...]} for dag.js -
   * keyed by variable (src), not Cytoscape's internal node id. */
  toDagShape() {
    const srcById = {};
    const nodes = [];
    this.cy.nodes().forEach((n) => {
      const src = n.data("src");
      if (src) {
        nodes.push(src);
        srcById[n.id()] = src;
      }
    });
    const edges = [];
    this.cy.edges().forEach((e) => {
      const from = srcById[e.data("source")];
      const to = srcById[e.data("target")];
      if (from && to) edges.push([from, to]);
    });
    return { nodes, edges };
  }

  updateClasses({ treatment, outcome, backdoorVariables = [], instrumentalVariables = [], frontdoorVariables = [], mediatorVariables = [], colliderVariables = [] } = {}) {
    this.cy.nodes().forEach((node) => {
      const src = node.data("src");
      if (!src) return;
      node.toggleClass("unobserved-node", src.startsWith("u"));
      node.toggleClass("treatment-node", src === treatment);
      node.toggleClass("outcome-node", src === outcome);
      const isNumeric = (node.data("type") || "numerical") !== "categorical";
      node.toggleClass("numerical-node", isNumeric);
      node.toggleClass("categorical-node", !isNumeric);
      node.toggleClass("controlled-node", backdoorVariables.includes(src));
      node.toggleClass("iv-node", instrumentalVariables.includes(src));
      node.toggleClass("collider-node", colliderVariables.includes(src));
      node.toggleClass("mediator-node", mediatorVariables.includes(src));
      node.toggleClass("frontdoor-node", frontdoorVariables.includes(src));
    });
  }

  fit() {
    this.cy.resize();
    this.cy.fit();
  }

  zoom(delta) {
    const z = this.cy.zoom();
    const newZoom = delta > 0 ? Math.min(this.cy.maxZoom(), z + 0.1) : Math.max(this.cy.minZoom(), z - 0.1);
    this.cy.zoom({ level: newZoom, position: this._centroid() });
  }

  _centroid() {
    let xSum = 0;
    let ySum = 0;
    let n = 0;
    this.cy.nodes().forEach((node) => {
      if (!node.data("src")) return;
      const p = node.position();
      xSum += p.x;
      ySum += p.y;
      n += 1;
    });
    return n > 0 ? { x: xSum / n, y: ySum / n } : { x: 0, y: 0 };
  }

  clear() {
    this.cy.remove("node");
    this.onTopologyChanged?.();
  }
}
