/*
 * Binary heap view: the same items drawn twice, as a complete binary tree
 * (index i -> children 2i+1, 2i+2) and as the backing array. Both are keyed by
 * item id, so a swap visibly moves the two values in both pictures.
 *   viz: compare[i,j], swap[i,j], pointers{name: index}, popped (value), done
 */
(function () {
  'use strict';
  const AV = window.AV;
  const el = AV.svg;
  const R = 19;
  const LEVEL = 70;
  const TOP = 44;
  const CELL = 40;
  const CGAP = 5;

  class BinHeapView {
    constructor(container) {
      this.container = container;
      this.svg = el('svg', { class: 'viz-svg binheap-svg', preserveAspectRatio: 'xMidYMid meet', role: 'img' });
      this.gEdges = el('g', {}, this.svg);
      this.gItems = el('g', {}, this.svg);
      this.gOverlay = el('g', {}, this.svg);
      container.appendChild(this.svg);
      this.legend = document.createElement('div');
      this.legend.className = 'legend';
      this.legend.innerHTML = [
        ['current', 'comparing'],
        ['swap', 'swapped'],
        ['found', 'heap property holds'],
      ]
        .map(([c, t]) => `<span><i class="sw sw-${c}"></i>${t}</span>`)
        .join('') + '<span class="legend-note">children of i are 2i+1 and 2i+2</span>';
      container.appendChild(this.legend);
      this.els = new Map();
      this.pos = new Map();
      this.cancel = () => {};
    }

    prepare(trace) {
      const n = Math.max(1, ...trace.steps.map((s) => s.structure.items.length));
      this.levels = Math.max(1, Math.ceil(Math.log2(n + 1)));
      this.treeW = Math.max(2 ** (this.levels - 1) * (2 * R + 12), 300);
      this.arrW = n * (CELL + CGAP);
      this.width = Math.max(this.treeW, this.arrW) + 80;
      this.arrY = TOP + (this.levels - 1) * LEVEL + R + 62;
      this.height = this.arrY + CELL + 62;
      this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
      this.cancel();
      this.gItems.textContent = '';
      this.els.clear();
      this.pos.clear();
    }

    treePos(i) {
      const d = Math.floor(Math.log2(i + 1));
      const slot = i - (2 ** d - 1);
      const span = this.treeW / 2 ** d;
      return { x: (this.width - this.treeW) / 2 + span * (slot + 0.5), y: TOP + d * LEVEL };
    }
    cellPos(i, n) {
      return { x: (this.width - n * (CELL + CGAP) + CGAP) / 2 + i * (CELL + CGAP) + CELL / 2, y: this.arrY + CELL / 2 };
    }

    render(step, { duration = 0 } = {}) {
      this.cancel();
      const items = step.structure.items;
      const viz = step.viz || {};
      const n = items.length;
      const has = (list, i) => Array.isArray(list) && list.includes(i);
      const targets = new Map();
      const live = new Set();

      items.forEach((item, i) => {
        for (const kind of ['t', 'c']) {
          const key = `${kind}:${item.id}`;
          let g = this.els.get(key);
          if (!g) {
            g = el('g', {}, this.gItems);
            if (kind === 't') el('circle', { r: R }, g);
            else el('rect', { x: -CELL / 2, y: -CELL / 2, width: CELL, height: CELL, rx: 7 }, g);
            el('text', { class: 'val' }, g);
            this.els.set(key, g);
          }
          g.querySelector('text').textContent = AV.py(item.value);
          const cls = [kind === 't' ? 'node' : 'cell'];
          if (has(viz.compare, i)) cls.push('current');
          if (has(viz.swap, i)) cls.push('swap');
          if (viz.done) cls.push(kind === 't' ? 'created' : 'sorted');
          g.setAttribute('class', cls.join(' '));
          targets.set(key, kind === 't' ? this.treePos(i) : this.cellPos(i, n));
          live.add(key);
        }
      });
      // A value temporarily held in a variable (pop's `last`) floats beside the root.
      if (viz.held) {
        const key = `t:${viz.held.id}`;
        let g = this.els.get(key);
        if (!g) {
          g = el('g', {}, this.gItems);
          el('circle', { r: R }, g);
          el('text', { class: 'val' }, g);
          this.els.set(key, g);
        }
        g.querySelector('text').textContent = AV.py(viz.held.value);
        g.setAttribute('class', 'node ghost-detached current');
        const root = this.treePos(0);
        targets.set(key, { x: root.x + 2 * R + 70, y: root.y });
        live.add(key);
      }
      for (const [key, g] of this.els) {
        if (!live.has(key)) {
          g.remove();
          this.els.delete(key);
        }
      }

      this.gEdges.textContent = '';
      for (let i = 1; i < n; i++) {
        const a = this.treePos(Math.floor((i - 1) / 2));
        const b = this.treePos(i);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const hot = has(viz.compare, i) && has(viz.compare, Math.floor((i - 1) / 2));
        el('line', { class: `edge${hot ? ' next' : ''}`, x1: a.x + (dx / len) * R, y1: a.y + (dy / len) * R, x2: b.x - (dx / len) * R, y2: b.y - (dy / len) * R }, this.gEdges);
      }

      this.gOverlay.textContent = '';
      for (let i = 0; i < n; i++) {
        const t = el('text', { x: this.cellPos(i, n).x, y: this.arrY + CELL + 15, class: 'index' }, this.gOverlay);
        t.textContent = i;
      }
      const lab = el('text', { x: this.cellPos(0, Math.max(n, 1)).x - CELL / 2, y: this.arrY - 10, class: 'sec-label', 'text-anchor': 'start' }, this.gOverlay);
      lab.textContent = 'heap (array)';
      const byIdx = new Map();
      for (const [name, idx] of Object.entries(viz.pointers || {})) {
        if (idx < 0 || idx >= n) continue;
        (byIdx.get(idx) || byIdx.set(idx, []).get(idx)).push(name);
      }
      for (const [idx, names] of byIdx) {
        const p = this.treePos(idx);
        AV.svgLabel(this.gOverlay, names.join(', '), 'tag').setAttribute('transform', `translate(${p.x},${p.y + R + 13})`);
        const c = this.cellPos(idx, n);
        AV.svgLabel(this.gOverlay, names.join(', '), 'tag ptr').setAttribute('transform', `translate(${c.x},${this.arrY + CELL + 34})`);
      }
      if (step.compare && viz.compare && viz.compare.length) {
        const ps = viz.compare.filter((i) => i < n).map((i) => this.treePos(i));
        if (ps.length) {
          const c = step.compare;
          const x = ps.reduce((s, p) => s + p.x, 0) / ps.length;
          const y = Math.min(...ps.map((p) => p.y)) - R - 16;
          AV.svgLabel(this.gOverlay, `${c.evaluated} → ${AV.py(c.result)}`, `bubble ${c.result ? 'is-true' : 'is-false'}`, { h: 22, padX: 9, charW: 7.4 }).setAttribute('transform', `translate(${x},${Math.max(12, y)})`);
        }
      }
      if (viz.held) {
        const root = this.treePos(0);
        AV.svgLabel(this.gOverlay, viz.held.name, 'tag').setAttribute('transform', `translate(${root.x + 2 * R + 70},${root.y + R + 13})`);
      }
      if (viz.popped !== undefined) {
        AV.svgLabel(this.gOverlay, `popped: ${AV.py(viz.popped)}`, 'tag tag-ret', { align: 'left' }).setAttribute('transform', `translate(14,18)`);
      }
      if (!n) {
        const t = el('text', { x: this.width / 2, y: TOP + 10, class: 'empty-text' }, this.gOverlay);
        t.textContent = 'Empty heap []';
      }

      this.cancel = AV.tweenPositions(this.pos, targets, duration, () => this.draw());
    }

    draw() {
      for (const [key, g] of this.els) {
        const p = this.pos.get(key);
        if (p) g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      }
    }

    setHover() {}
    destroy() {
      this.cancel();
      this.container.textContent = '';
    }
  }

  AV.registerView({ id: 'binheap', create: (container) => new BinHeapView(container) });
})();
