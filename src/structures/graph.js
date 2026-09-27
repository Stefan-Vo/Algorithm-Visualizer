/*
 * Graph structure. Input is an edge list such as "A-B:4, B-C, C->D".
 *   A-B    undirected edge      A->B (or A>B)  directed edge
 *   :4     optional weight      a lone name    isolated node
 * Positions come from a deterministic force-directed layout, so the same
 * input always draws the same way.
 */
(function () {
  'use strict';
  const AV = window.AV;

  const EDGE = /^([A-Za-z0-9_]{1,6})\s*(->|>|-)\s*([A-Za-z0-9_]{1,6})\s*(?::\s*(-?\d+(?:\.\d+)?))?$/;
  const NODE = /^[A-Za-z0-9_]{1,6}$/;

  class Graph {
    constructor({ nodes, edges }) {
      this.nodes = nodes;
      this.edges = edges; // {id, from, to, w, directed}
      this.directed = edges.some((e) => e.directed);
      this.weighted = edges.some((e) => e.hasWeight);
      this.adj = new Map(nodes.map((n) => [n, []]));
      for (const e of edges) {
        this.adj.get(e.from).push({ to: e.to, w: e.w, edge: e.id });
        if (!e.directed) this.adj.get(e.to).push({ to: e.from, w: e.w, edge: e.id });
      }
      this.pos = layout(nodes, edges);
    }
    neighbors(n) {
      return this.adj.get(n) || [];
    }
    has(n) {
      return this.adj.has(n);
    }
  }
  AV.Graph = Graph;

  function parse(text) {
    const tokens = String(text).split(/[,\n;]+/).map((t) => t.trim()).filter(Boolean);
    if (!tokens.length) throw new Error('Enter at least one edge, e.g. A-B, B-C.');
    const nodes = [];
    const edges = [];
    const addNode = (n) => nodes.includes(n) || nodes.push(n);
    for (const t of tokens) {
      const m = t.match(EDGE);
      if (m) {
        const [, a, op, b, w] = m;
        if (a === b) throw new Error(`Self-loop "${t}" is not supported.`);
        addNode(a);
        addNode(b);
        edges.push({ id: 'e' + edges.length, from: a, to: b, w: w === undefined ? 1 : Number(w), hasWeight: w !== undefined, directed: op !== '-' });
      } else if (NODE.test(t)) addNode(t);
      else throw new Error(`Can't read "${t}". Use A-B, A->B or A-B:5.`);
    }
    if (nodes.length > 16) throw new Error(`Please use at most 16 nodes (got ${nodes.length}).`);
    if (edges.length > 40) throw new Error(`Please use at most 40 edges (got ${edges.length}).`);
    return { nodes, edges };
  }

  /** Fruchterman-Reingold with a fixed start, normalised to a 560x340 box. */
  function layout(nodes, edges) {
    const n = nodes.length;
    const W = 560;
    const H = 340;
    const idx = new Map(nodes.map((v, i) => [v, i]));
    const p = nodes.map((_, i) => ({
      x: W / 2 + (W / 3) * Math.cos((2 * Math.PI * i) / n - Math.PI / 2),
      y: H / 2 + (H / 3) * Math.sin((2 * Math.PI * i) / n - Math.PI / 2),
    }));
    if (n <= 1) return new Map(nodes.map((v) => [v, { x: W / 2, y: H / 2 }]));
    const k = Math.sqrt((W * H) / n) * 0.75;
    let temp = W / 8;
    for (let it = 0; it < 400; it++) {
      const d = p.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = p[i].x - p[j].x;
          let dy = p[i].y - p[j].y;
          let dist = Math.hypot(dx, dy);
          if (dist < 0.01) {
            dx = 0.01 * (i + 1);
            dy = 0.01;
            dist = Math.hypot(dx, dy);
          }
          const f = (k * k) / dist;
          d[i].x += (dx / dist) * f;
          d[i].y += (dy / dist) * f;
          d[j].x -= (dx / dist) * f;
          d[j].y -= (dy / dist) * f;
        }
      }
      for (const e of edges) {
        const a = idx.get(e.from);
        const b = idx.get(e.to);
        const dx = p[a].x - p[b].x;
        const dy = p[a].y - p[b].y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const f = (dist * dist) / k;
        d[a].x -= (dx / dist) * f;
        d[a].y -= (dy / dist) * f;
        d[b].x += (dx / dist) * f;
        d[b].y += (dy / dist) * f;
      }
      for (let i = 0; i < n; i++) {
        const len = Math.hypot(d[i].x, d[i].y) || 1;
        p[i].x += (d[i].x / len) * Math.min(len, temp);
        p[i].y += (d[i].y / len) * Math.min(len, temp);
      }
      temp *= 0.985;
    }
    // Normalise into the box, keeping the aspect ratio.
    const xs = p.map((q) => q.x);
    const ys = p.map((q) => q.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const sw = Math.max(...xs) - minX || 1;
    const sh = Math.max(...ys) - minY || 1;
    const s = Math.min(W / sw, H / sh);
    const ox = (W - sw * s) / 2;
    const oy = (H - sh * s) / 2;
    return new Map(nodes.map((v, i) => [v, { x: ox + (p[i].x - minX) * s, y: oy + (p[i].y - minY) * s }]));
  }

  AV.registerStructure({
    id: 'graph',
    name: 'Graph',
    view: 'graph',
    defaultData: 'A-B, A-C, B-D, C-D, C-E, D-F, E-F',
    dataHint: 'Edges: A-B (undirected), A->B (directed), A-B:4 (weighted).',
    parse,
    build: (parsed) => new Graph(parsed),
    // The graph itself never changes during these algorithms; the view reads state from step.viz.
    snapshot: (g) => ({ nodes: g.nodes, edges: g.edges, pos: g.pos, directed: g.directed, weighted: g.weighted }),
    formatValue(v) {
      if (v instanceof Graph) return { text: `graph (${v.nodes.length} nodes)` };
      return null;
    },
    random() {
      const names = 'ABCDEFGH'.split('').slice(0, AV.randInt(5, 8));
      const edges = new Set();
      for (let i = 1; i < names.length; i++) edges.add(`${names[AV.randInt(0, i - 1)]}-${names[i]}`); // spanning tree keeps it connected
      for (let extra = AV.randInt(1, 4); extra > 0; extra--) {
        const a = AV.randInt(0, names.length - 1);
        const b = AV.randInt(0, names.length - 1);
        if (a !== b && !edges.has(`${names[b]}-${names[a]}`)) edges.add(`${names[Math.min(a, b)]}-${names[Math.max(a, b)]}`);
      }
      return [...edges].map((e) => `${e}:${AV.randInt(1, 9)}`).join(', ');
    },
  });
})();
