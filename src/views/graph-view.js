/*
 * Graph view. Positions are fixed by the structure's layout; the algorithm's
 * state arrives in step.viz:
 *   current            node being processed
 *   visited[]          finished / settled nodes
 *   frontier[]         nodes waiting in the queue / stack / priority queue
 *   tree[]             [parent, child] discovery edges
 *   edge {from,to,state}  edge being examined: 'check' | 'relax' | 'skip'
 *   dist {node: text}  labels drawn above nodes (distances, visit order)
 *   seq {label, items[]}  the container, drawn as a row of chips
 */
(function () {
  'use strict';
  const AV = window.AV;
  const el = AV.svg;
  const R = 20;
  const PAD = 44;
  const SEQ_H = 64;

  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  class GraphView {
    constructor(container) {
      this.container = container;
      this.svg = el('svg', { class: 'viz-svg graph-svg', preserveAspectRatio: 'xMidYMid meet', role: 'img' });
      const defs = el('defs', {}, this.svg);
      for (const [id, cls] of [['g-arrow', 'arrow-head muted-head'], ['g-arrow-hot', 'arrow-head']]) {
        const m = el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 12, markerHeight: 12, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs);
        el('path', { d: 'M0,0 L10,5 L0,10 z', class: cls }, m);
      }
      this.gEdges = el('g', {}, this.svg);
      this.gNodes = el('g', {}, this.svg);
      this.gOverlay = el('g', {}, this.svg);
      container.appendChild(this.svg);
      this.legend = document.createElement('div');
      this.legend.className = 'legend';
      this.legend.innerHTML = [
        ['current', 'current node'],
        ['frontier', 'waiting in queue / stack'],
        ['found', 'visited / settled'],
        ['visited', 'discovery edge'],
      ]
        .map(([c, t]) => `<span><i class="sw sw-${c}"></i>${t}</span>`)
        .join('');
      container.appendChild(this.legend);
    }

    prepare(trace) {
      const g = trace.steps[0].structure;
      this.g = g;
      this.width = 560 + PAD * 2;
      this.height = 340 + PAD * 2 + SEQ_H;
      this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
      this.gEdges.textContent = '';
      this.gNodes.textContent = '';
      this.P = (n) => {
        const p = g.pos.get(n);
        return { x: p.x + PAD, y: p.y + PAD };
      };
      this.edgeEls = new Map();
      for (const e of g.edges) {
        const a = this.P(e.from);
        const b = this.P(e.to);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const grp = el('g', { class: 'gedge' }, this.gEdges);
        const line = el('line', {
          x1: a.x + (dx / len) * R, y1: a.y + (dy / len) * R,
          x2: b.x - (dx / len) * (R + 3), y2: b.y - (dy / len) * (R + 3),
        }, grp);
        if (e.directed) line.setAttribute('marker-end', 'url(#g-arrow)');
        if (g.weighted) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const lbl = AV.svgLabel(grp, String(e.w), 'weight', { h: 17, padX: 5, charW: 7 });
          lbl.setAttribute('transform', `translate(${mx},${my})`);
        }
        this.edgeEls.set(e.directed ? `${e.from}>${e.to}` : edgeKey(e.from, e.to), { grp, line, e });
      }
      this.nodeEls = new Map();
      for (const n of g.nodes) {
        const p = this.P(n);
        const grp = el('g', { class: 'node', transform: `translate(${p.x},${p.y})` }, this.gNodes);
        el('circle', { r: R }, grp);
        const t = el('text', { class: 'val' }, grp);
        t.textContent = n;
        this.nodeEls.set(n, grp);
      }
    }

    findEdge(a, b) {
      return this.edgeEls.get(`${a}>${b}`) || this.edgeEls.get(edgeKey(a, b)) || this.edgeEls.get(`${b}>${a}`);
    }

    render(step) {
      const viz = step.viz || {};
      const visited = new Set(viz.visited || []);
      const frontier = new Set(viz.frontier || []);
      for (const [n, grp] of this.nodeEls) {
        const cls = ['node'];
        if (visited.has(n)) cls.push('found');
        if (frontier.has(n)) cls.push('frontier');
        if (viz.current === n) cls.push('current');
        if (viz.edge && viz.edge.to === n) cls.push('probe-target');
        grp.setAttribute('class', cls.join(' '));
      }
      const tree = new Set((viz.tree || []).map(([a, b]) => this.findEdge(a, b)).filter(Boolean));
      const hot = viz.edge ? this.findEdge(viz.edge.from, viz.edge.to) : null;
      for (const rec of this.edgeEls.values()) {
        const cls = ['gedge'];
        if (tree.has(rec)) cls.push('tree');
        if (rec === hot) cls.push('hot', `hot-${viz.edge.state || 'check'}`);
        rec.grp.setAttribute('class', cls.join(' '));
        if (rec.e.directed) rec.line.setAttribute('marker-end', rec === hot ? 'url(#g-arrow-hot)' : 'url(#g-arrow)');
      }

      this.gOverlay.textContent = '';
      for (const [n, text] of Object.entries(viz.dist || {})) {
        const p = this.P(n);
        const g = AV.svgLabel(this.gOverlay, text, 'tag dist');
        g.setAttribute('transform', `translate(${p.x},${p.y - R - 13})`);
      }
      const top = step.stack[step.stack.length - 1];
      const tags = new Map();
      for (const v of top.vars) {
        const m = /^'([A-Za-z0-9_]+)'$/.exec(v.text);
        if (m && this.nodeEls.has(m[1]) && ['node', 'nb', 'start', 'u', 'v'].includes(v.name)) (tags.get(m[1]) || tags.set(m[1], []).get(m[1])).push(v.name);
      }
      for (const [n, names] of tags) {
        const p = this.P(n);
        const g = AV.svgLabel(this.gOverlay, names.join(', '), 'tag');
        g.setAttribute('transform', `translate(${p.x},${p.y + R + 14})`);
      }
      if (step.compare && viz.edge) {
        const a = this.P(viz.edge.from);
        const b = this.P(viz.edge.to);
        const c = step.compare;
        const g = AV.svgLabel(this.gOverlay, `${c.evaluated} → ${AV.py(c.result)}`, `bubble ${c.result ? 'is-true' : 'is-false'}`, { h: 22, padX: 9, charW: 7.4 });
        g.setAttribute('transform', `translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2 - 24})`);
      }

      // The algorithm's container (queue / stack / priority queue) as chips along the bottom.
      if (viz.seq) {
        const y = this.height - SEQ_H / 2 - 4;
        const label = el('text', { x: PAD - 20, y: y + 4, class: 'seq-label' }, this.gOverlay);
        label.textContent = viz.seq.label;
        let x = PAD - 20 + viz.seq.label.length * 7.6 + 14;
        if (!viz.seq.items.length) {
          const t = el('text', { x, y: y + 4, class: 'seq-empty' }, this.gOverlay);
          t.textContent = '(empty)';
        }
        viz.seq.items.forEach((item, i) => {
          const g = AV.svgLabel(this.gOverlay, item, `chip${i === 0 && viz.seq.front ? ' front' : ''}`, { align: 'left', h: 24, padX: 9, charW: 7.6 });
          g.setAttribute('transform', `translate(${x},${y})`);
          x += item.length * 7.6 + 18 + 8;
        });
      }
    }

    setHover() {}
    destroy() {
      this.container.textContent = '';
    }
  }

  AV.registerView({ id: 'graph', create: (container) => new GraphView(container) });
})();
