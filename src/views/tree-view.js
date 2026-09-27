/*
 * Binary tree view. Renders step.structure (a snapshot of real nodes) plus
 * step.viz hints:
 *   current, path[], found, created, removing, target, successor, changed: node ids
 *   slot {parent, side}      the empty child link a frame with root=None is at
 *   detached {id, value, parent, side}  node created but not linked yet
 *   nextEdge {from, side}    branch the algorithm is about to take
 *   probe {label, value}     value being inserted/searched, drawn next to the focus
 *   notFound                 mark the slot as a failed search
 * Pointer tags come from the executing frame's local variables that reference nodes.
 */
(function () {
  'use strict';
  const AV = window.AV;
  const el = AV.svg;

  const GAP = 58;
  const LEVEL = 78;
  const R = 19;
  const PAD_X = 72;
  const PAD_TOP = 64;
  const PAD_BOTTOM = 52;
  const MIN_W = 440;
  const MIN_H = 300;

  function findNode(n, id) {
    if (!n) return null;
    if (n.id === id) return n;
    return findNode(n.left, id) || findNode(n.right, id);
  }
  const slotId = (s) => `slot:${s.parent || 'root'}:${s.side || ''}`;

  /** A placeholder that is not (yet) part of the tree but should be laid out as if it were. */
  function ghostFor(step) {
    const viz = step.viz || {};
    const root = step.structure.root;
    if (viz.detached && !findNode(root, viz.detached.id)) {
      const d = viz.detached;
      return { id: d.id, kind: 'detached', value: d.value, parent: d.parent, side: d.side };
    }
    let s = viz.slot;
    if (!s && viz.nextEdge) {
      const from = findNode(root, viz.nextEdge.from);
      if (from && !from[viz.nextEdge.side]) s = { parent: viz.nextEdge.from, side: viz.nextEdge.side };
    }
    return s ? { id: slotId(s), kind: 'slot', value: null, parent: s.parent, side: s.side } : null;
  }

  /** In-order x, depth y. */
  function layout(root, ghost) {
    const nodes = [];
    let i = 0;
    let maxDepth = 0;
    const ghostNode = ghost && { id: ghost.id, value: ghost.value, left: null, right: null, ghost: ghost.kind };
    const child = (n, side) =>
      n[side] || (ghost && !n.ghost && ghost.parent === n.id && ghost.side === side ? ghostNode : null);
    (function walk(n, depth, parent, side) {
      if (!n) return;
      walk(child(n, 'left'), depth + 1, n.id, 'left');
      nodes.push({ id: n.id, value: n.value, ghost: n.ghost || null, parent, side, x: i++ * GAP, y: depth * LEVEL });
      maxDepth = Math.max(maxDepth, depth);
      walk(child(n, 'right'), depth + 1, n.id, 'right');
    })(root || (ghost && ghost.parent == null ? ghostNode : null), 0, null, null);
    return { nodes, count: i, maxDepth };
  }

  class TreeView {
    constructor(container) {
      this.container = container;
      this.svg = el('svg', { class: 'viz-svg tree-svg', preserveAspectRatio: 'xMidYMid meet', role: 'img' });
      const defs = el('defs', {}, this.svg);
      const marker = el('marker', { id: 'av-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow-head' }, marker);
      this.gEdges = el('g', { class: 'edges' }, this.svg);
      this.gNodes = el('g', { class: 'nodes' }, this.svg);
      this.gOverlay = el('g', { class: 'overlay' }, this.svg);
      this.emptyText = el('text', { class: 'empty-text' }, this.svg);
      container.appendChild(this.svg);

      this.legend = document.createElement('div');
      this.legend.className = 'legend';
      this.legend.innerHTML = [
        ['current', 'current node'],
        ['visited', 'visited path'],
        ['found', 'found / inserted'],
        ['target', 'to delete'],
        ['successor', 'successor'],
        ['slot', 'empty link (None)'],
      ]
        .map(([c, t]) => `<span><i class="sw sw-${c}"></i>${t}</span>`)
        .join('');
      container.appendChild(this.legend);

      this.nodeEls = new Map();
      this.pos = new Map();
      this.cancel = () => {};
      this.hoverId = null;
    }

    prepare(trace) {
      let maxCount = 1;
      let maxDepth = 0;
      for (const step of trace.steps) {
        const l = layout(step.structure.root, ghostFor(step));
        maxCount = Math.max(maxCount, l.count);
        maxDepth = Math.max(maxDepth, l.maxDepth);
      }
      this.width = Math.max(MIN_W, PAD_X * 2 + (maxCount - 1) * GAP);
      this.height = Math.max(MIN_H, PAD_TOP + PAD_BOTTOM + maxDepth * LEVEL);
      this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
      this.cancel();
      this.gNodes.textContent = '';
      this.gEdges.textContent = '';
      this.gOverlay.textContent = '';
      this.nodeEls.clear();
      this.pos.clear();
    }

    render(step, { duration = 0 } = {}) {
      this.cancel();
      const viz = step.viz || {};
      const ghost = ghostFor(step);
      const L = layout(step.structure.root, ghost);
      const offX = (this.width - (L.count - 1) * GAP) / 2;

      const targets = new Map();
      const byId = new Map();
      for (const n of L.nodes) {
        targets.set(n.id, { x: offX + n.x, y: PAD_TOP + n.y });
        byId.set(n.id, n);
      }

      // ---- nodes (keyed, persistent) ----
      const path = new Set(viz.path || []);
      for (const n of L.nodes) {
        let g = this.nodeEls.get(n.id);
        if (!g) {
          g = el('g', {}, this.gNodes);
          el('circle', { r: R }, g);
          el('text', { class: 'val' }, g);
          this.nodeEls.set(n.id, g);
        }
        const text = n.ghost === 'slot' ? 'None' : AV.py(n.value);
        const t = g.querySelector('text');
        if (t.textContent !== text) {
          const hadValue = t.textContent !== '';
          t.textContent = text;
          if (hadValue && duration > 0 && t.animate) {
            t.animate([{ opacity: 0.1 }, { opacity: 1 }], { duration: Math.max(200, duration) });
          }
        }
        const cls = ['node'];
        if (n.ghost) cls.push('ghost', 'ghost-' + n.ghost);
        if (path.has(n.id)) cls.push('visited');
        if (n.id === viz.current) cls.push('current');
        if (n.id === viz.created) cls.push('created');
        if (n.id === viz.found) cls.push('found');
        if (n.id === viz.successor) cls.push('successor');
        if (n.id === viz.target) cls.push('target');
        if (n.id === viz.removing) cls.push('removing');
        if (n.id === viz.changed) cls.push('changed');
        if (n.ghost === 'slot' && viz.notFound) cls.push('missing');
        if (n.id === this.hoverId) cls.push('hover');
        g.setAttribute('class', cls.join(' '));
        g.dataset.id = n.id;
      }
      for (const [id, g] of this.nodeEls) {
        if (targets.has(id)) continue;
        this.nodeEls.delete(id);
        g.classList.add('leaving');
        setTimeout(() => g.remove(), duration > 0 ? 350 : 0);
      }

      // ---- edges (rebuilt each step, endpoints follow node positions) ----
      this.gEdges.textContent = '';
      this.edges = [];
      for (const n of L.nodes) {
        if (!n.parent) continue;
        const cls = ['edge'];
        if (n.ghost) cls.push('ghost');
        if (path.has(n.parent) && path.has(n.id)) cls.push('visited');
        const isNext = viz.nextEdge && viz.nextEdge.from === n.parent && viz.nextEdge.side === n.side;
        if (isNext) cls.push('next');
        const line = el('line', { class: cls.join(' ') }, this.gEdges);
        if (isNext) line.setAttribute('marker-end', 'url(#av-arrow)');
        this.edges.push({ line, from: n.parent, to: n.id });
      }

      // ---- overlay: pointer tags, comparison bubble, probe chip ----
      this.gOverlay.textContent = '';
      this.overlay = [];
      const anchor =
        viz.current && targets.has(viz.current) ? viz.current : viz.slot && ghost && ghost.kind === 'slot' ? ghost.id : null;

      const top = step.stack[step.stack.length - 1];
      const tags = new Map();
      for (const v of top.vars) if (v.ref && targets.has(v.ref)) (tags.get(v.ref) || tags.set(v.ref, []).get(v.ref)).push(v.name);
      for (const [id, names] of tags) {
        const g = AV.svgLabel(this.gOverlay, names.join(', '), 'tag');
        this.overlay.push({ g, anchor: id, dx: 0, dy: R + 14 });
      }
      if (step.kind === 'return' && step.returnValue && step.returnValue.ref && targets.has(step.returnValue.ref)) {
        const id = step.returnValue.ref;
        const g = AV.svgLabel(this.gOverlay, 'returned', 'tag tag-ret');
        this.overlay.push({ g, anchor: id, dx: 0, dy: R + 14 + (tags.has(id) ? 20 : 0) });
      }
      // One chip above the focus node that glides along with the algorithm. It shows the
      // comparison being evaluated, or else the value being inserted/searched.
      if (anchor && (step.compare || viz.probe)) {
        const c = step.compare;
        const g = c
          ? AV.svgLabel(this.gOverlay, `${c.evaluated} → ${AV.py(c.result)}`, `bubble ${c.result ? 'is-true' : 'is-false'}`, { h: 22, padX: 9, charW: 7.4 })
          : AV.svgLabel(this.gOverlay, `${viz.probe.label} = ${AV.py(viz.probe.value)}`, 'probe', { h: 22, padX: 9, charW: 7.4 });
        const a = targets.get(anchor);
        targets.set('probe', { x: a.x, y: a.y - R - 17 });
        this.overlay.push({ g, key: 'probe' });
      }

      this.emptyText.textContent = L.nodes.length ? '' : 'Empty tree (root is None)';
      this.emptyText.setAttribute('x', this.width / 2);
      this.emptyText.setAttribute('y', this.height / 2);

      this.cancel = AV.tweenPositions(this.pos, targets, duration, () => this.draw());
    }

    draw() {
      for (const [id, g] of this.nodeEls) {
        const p = this.pos.get(id);
        if (p) g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      }
      for (const e of this.edges) {
        const a = this.pos.get(e.from);
        const b = this.pos.get(e.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        e.line.setAttribute('x1', (a.x + ux * R).toFixed(1));
        e.line.setAttribute('y1', (a.y + uy * R).toFixed(1));
        e.line.setAttribute('x2', (b.x - ux * (R + 2)).toFixed(1));
        e.line.setAttribute('y2', (b.y - uy * (R + 2)).toFixed(1));
      }
      for (const o of this.overlay) {
        const p = o.key ? this.pos.get(o.key) : this.pos.get(o.anchor);
        if (!p) continue;
        const x = p.x + (o.dx || 0);
        const y = p.y + (o.dy || 0);
        o.g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      }
    }

    setHover(id) {
      if (this.hoverId && this.nodeEls.get(this.hoverId)) this.nodeEls.get(this.hoverId).classList.remove('hover');
      this.hoverId = id;
      if (id && this.nodeEls.get(id)) this.nodeEls.get(id).classList.add('hover');
    }

    destroy() {
      this.cancel();
      this.container.textContent = '';
    }
  }

  AV.registerView({ id: 'tree', create: (container) => new TreeView(container) });
  AV.treeLayout = layout; // exposed for tests
})();
