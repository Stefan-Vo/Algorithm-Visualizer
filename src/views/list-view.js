/*
 * Linked list view. Each node keeps the column it was created in, so when the
 * algorithm re-points .next the arrows visibly flip instead of nodes shuffling.
 * Forward links are straight arrows; backward links arc underneath.
 * Tags come from the executing frame's variables (head, prev, curr, ...).
 */
(function () {
  'use strict';
  const AV = window.AV;
  const el = AV.svg;
  const W = 58;
  const H = 38;
  const GAPX = 44;
  const Y = 110;

  class ListView {
    constructor(container) {
      this.container = container;
      this.svg = el('svg', { class: 'viz-svg list-svg', preserveAspectRatio: 'xMidYMid meet', role: 'img' });
      const defs = el('defs', {}, this.svg);
      for (const [id, cls] of [['l-arrow', 'arrow-head muted-head'], ['l-arrow-hot', 'arrow-head']]) {
        const m = el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 11, markerHeight: 11, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs);
        el('path', { d: 'M0,0 L10,5 L0,10 z', class: cls }, m);
      }
      this.gEdges = el('g', {}, this.svg);
      this.gNodes = el('g', {}, this.svg);
      this.gOverlay = el('g', {}, this.svg);
      container.appendChild(this.svg);
      this.legend = document.createElement('div');
      this.legend.className = 'legend';
      this.legend.innerHTML = [
        ['current', 'referenced by a variable'],
        ['target', 'being removed'],
      ]
        .map(([c, t]) => `<span><i class="sw sw-${c}"></i>${t}</span>`)
        .join('') + '<span class="legend-note">arrows are .next links</span>';
      container.appendChild(this.legend);
      this.els = new Map();
      this.opacity = new Map();
    }

    prepare(trace) {
      const orders = new Set();
      for (const s of trace.steps) for (const n of s.structure.nodes) orders.add(n.order);
      this.columns = [...orders].sort((a, b) => a - b);
      this.width = Math.max(460, this.columns.length * (W + GAPX) + 120);
      this.height = 230;
      this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
      this.gNodes.textContent = '';
      this.els.clear();
    }

    x(order) {
      const i = this.columns.indexOf(order);
      const total = this.columns.length * (W + GAPX) - GAPX;
      return (this.width - total) / 2 + i * (W + GAPX) + W / 2;
    }

    render(step) {
      const viz = step.viz || {};
      const nodes = step.structure.nodes;
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const live = new Set();
      const top = step.stack[step.stack.length - 1];
      const tags = new Map();
      for (const v of top.vars) if (v.ref && byId.has(v.ref)) (tags.get(v.ref) || tags.set(v.ref, []).get(v.ref)).push(v.name);

      for (const n of nodes) {
        let g = this.els.get(n.id);
        if (!g) {
          g = el('g', {}, this.gNodes);
          el('rect', { x: -W / 2, y: -H / 2, width: W, height: H, rx: 8 }, g);
          el('text', { class: 'val' }, g);
          this.els.set(n.id, g);
        }
        live.add(n.id);
        g.querySelector('text').textContent = AV.py(n.value);
        g.setAttribute('transform', `translate(${this.x(n.order)},${Y})`);
        const cls = ['node', 'lnode'];
        if (tags.has(n.id)) cls.push('current');
        if (n.id === viz.removing) cls.push('removing');
        g.setAttribute('class', cls.join(' '));
      }
      for (const [id, g] of this.els) {
        if (!live.has(id)) {
          g.remove();
          this.els.delete(id);
        }
      }

      this.gEdges.textContent = '';
      const taken = new Set(nodes.map((n) => this.columns.indexOf(n.order)));
      for (const n of nodes) {
        const x1 = this.x(n.order);
        const hot = viz.link && viz.link === n.id;
        if (!n.next) {
          // Put the None marker on a free side so it never sits on a neighbouring node.
          const col = this.columns.indexOf(n.order);
          const right = !taken.has(col + 1);
          const left = !right && !taken.has(col - 1);
          const t = el('text', {
            x: right ? x1 + W / 2 + 8 : left ? x1 - W / 2 - 8 : x1,
            y: right || left ? Y + 4 : Y - H / 2 - 34,
            'text-anchor': right ? 'start' : left ? 'end' : 'middle',
            class: `none-mark${hot ? ' hot' : ''}`,
          }, this.gEdges);
          t.textContent = right ? '→ None' : left ? 'None ←' : '.next = None';
          continue;
        }
        const target = byId.get(n.next);
        if (!target) continue;
        const x2 = this.x(target.order);
        let d;
        if (x2 > x1) {
          d = `M${x1 + W / 2},${Y} L${x2 - W / 2 - 3},${Y}`;
        } else {
          // backward link: arc below the row
          const sx = x1 - 10;
          const ex = x2 + 10;
          const depth = 34 + Math.min(40, (x1 - x2) / 8);
          d = `M${sx},${Y + H / 2} C${sx},${Y + H / 2 + depth} ${ex},${Y + H / 2 + depth} ${ex},${Y + H / 2 + 3}`;
        }
        el('path', { d, class: `link${hot ? ' hot' : ''}`, 'marker-end': hot ? 'url(#l-arrow-hot)' : 'url(#l-arrow)' }, this.gEdges);
      }

      this.gOverlay.textContent = '';
      for (const [id, names] of tags) {
        AV.svgLabel(this.gOverlay, names.join(', '), 'tag').setAttribute('transform', `translate(${this.x(byId.get(id).order)},${Y - H / 2 - 16})`);
      }
      if (step.compare && viz.at && byId.has(viz.at)) {
        const c = step.compare;
        AV.svgLabel(this.gOverlay, `${c.evaluated} → ${AV.py(c.result)}`, `bubble ${c.result ? 'is-true' : 'is-false'}`, { h: 22, padX: 9, charW: 7.4 }).setAttribute(
          'transform',
          `translate(${this.x(byId.get(viz.at).order)},${Y - H / 2 - 42})`
        );
      }
      if (!nodes.length) {
        const t = el('text', { x: this.width / 2, y: Y, class: 'empty-text' }, this.gOverlay);
        t.textContent = 'Empty list (head is None)';
      }
    }

    setHover() {}
    destroy() {
      this.container.textContent = '';
    }
  }

  AV.registerView({ id: 'list', create: (container) => new ListView(container) });
})();
