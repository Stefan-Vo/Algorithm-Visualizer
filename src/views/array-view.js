/*
 * Array view. Renders step.structure.items plus step.viz hints:
 *   range [lo, hi]   active search window (cells outside are dimmed)
 *   pointers {name: index}
 *   compare [i...], swap [i, j], found i, sortedFrom k (indices >= k are final)
 *   pivot i          quicksort pivot
 *   aux [{name, items, ptr}]  temporary arrays (merge sort's left/right) drawn
 *                    underneath; an item moved from aux into the array flies up
 */
(function () {
  'use strict';
  const AV = window.AV;
  const el = AV.svg;

  const W = 52;
  const H = 52;
  const GAPX = 10;
  const STEP = W + GAPX;
  const PAD = 80;
  const TOP = 86;
  const HEIGHT = 290;
  const AUX_H = 86;
  const MIN_W = 620;

  class ArrayView {
    constructor(container) {
      this.container = container;
      this.svg = el('svg', { class: 'viz-svg array-svg', preserveAspectRatio: 'xMidYMid meet', role: 'img' });
      this.gCells = el('g', {}, this.svg);
      this.gIndex = el('g', { class: 'indices' }, this.svg);
      this.gOverlay = el('g', { class: 'overlay' }, this.svg);
      container.appendChild(this.svg);

      this.legend = document.createElement('div');
      this.legend.className = 'legend';
      this.legend.innerHTML = [
        ['current', 'comparing'],
        ['found', 'found / final position'],
        ['swap', 'swapped'],
        ['dim', 'outside search range'],
      ]
        .map(([c, t]) => `<span><i class="sw sw-${c}"></i>${t}</span>`)
        .join('');
      container.appendChild(this.legend);

      this.cells = new Map();
      this.pos = new Map();
      this.cancel = () => {};
    }

    prepare(trace) {
      const n = Math.max(1, ...trace.steps.map((s) => s.structure.items.length));
      const aux = Math.max(0, ...trace.steps.map((s) => (s.viz && s.viz.aux ? s.viz.aux.length : 0)));
      this.width = Math.max(MIN_W, PAD * 2 + n * STEP - GAPX);
      this.height = HEIGHT + aux * AUX_H;
      this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
      this.cancel();
      this.gCells.textContent = '';
      this.cells.clear();
      this.pos.clear();
    }

    render(step, { duration = 0 } = {}) {
      this.cancel();
      this.gOverlay.textContent = '';
      this.overlayQueue = [];
      const items = step.structure.items;
      const viz = step.viz || {};
      const offX = (this.width - (items.length * STEP - GAPX)) / 2;
      const xAt = (i) => offX + i * STEP;
      const targets = new Map();
      const has = (list, i) => Array.isArray(list) && list.includes(i);

      items.forEach((item, i) => {
        targets.set(item.id, { x: xAt(i), y: TOP });
        let g = this.cells.get(item.id);
        if (!g) {
          g = el('g', {}, this.gCells);
          el('rect', { width: W, height: H, rx: 8 }, g);
          el('text', { x: W / 2, y: H / 2 + 1, class: 'val' }, g);
          this.cells.set(item.id, g);
        }
        g.querySelector('text').textContent = AV.py(item.value);
        const cls = ['cell'];
        if (viz.range && (i < viz.range[0] || i > viz.range[1])) cls.push('dim');
        if (viz.sortedFrom != null && i >= viz.sortedFrom) cls.push('sorted');
        if (has(viz.compare, i)) cls.push('current');
        if (has(viz.swap, i)) cls.push('swap');
        if (viz.found === i) cls.push('found');
        if (viz.pivot === i) cls.push('pivot');
        if (has(viz.done, i)) cls.push('sorted');
        if (has(viz.wrote, i)) cls.push('wrote');
        g.setAttribute('class', cls.join(' '));
      });
      // Temporary arrays (e.g. merge sort's left/right halves) below the main array.
      this.gIndex.textContent = '';
      (viz.aux || []).forEach((row, r) => {
        const y = HEIGHT - 40 + r * AUX_H;
        const ox = (this.width - (row.items.length * STEP - GAPX)) / 2;
        const lbl = el('text', { x: ox - 12, y: y + H / 2 + 4, class: 'sec-label', 'text-anchor': 'end' }, this.gIndex);
        lbl.textContent = row.name;
        row.items.forEach((item, i) => {
          const key = 'aux:' + item.id;
          targets.set(key, { x: ox + i * STEP, y });
          let g = this.cells.get(key);
          if (!g) {
            g = el('g', {}, this.gCells);
            el('rect', { width: W, height: H, rx: 8 }, g);
            el('text', { x: W / 2, y: H / 2 + 1, class: 'val' }, g);
            this.cells.set(key, g);
          }
          g.querySelector('text').textContent = AV.py(item.value);
          g.setAttribute('class', `cell aux${row.ptr !== undefined && i < row.ptr ? ' used' : ''}${row.ptr === i ? ' current' : ''}`);
        });
        if (row.ptrName && row.ptr !== undefined) {
          const g = AV.svgLabel(this.gOverlay, `↑ ${row.ptrName}`, 'tag ptr');
          targets.set('ptr:' + row.ptrName, { x: ox + Math.min(row.ptr, row.items.length) * STEP + W / 2, y: y + H + 16 });
          this.overlayQueue.push({ g, key: 'ptr:' + row.ptrName });
        }
      });
      // An array cell that just received an item from a temporary array starts where that item was.
      for (const [id] of targets) {
        if (!id.startsWith('aux:') && !this.pos.has(id) && this.pos.has('aux:' + id)) this.pos.set(id, this.pos.get('aux:' + id));
      }
      for (const [id, g] of this.cells) {
        if (!targets.has(id)) {
          g.remove();
          this.cells.delete(id);
        }
      }

      items.forEach((_, i) => {
        const t = el('text', { x: xAt(i) + W / 2, y: TOP + H + 17, class: 'index' }, this.gIndex);
        t.textContent = i;
      });

      // Pointers glide between indices; several on one index stack vertically.
      this.overlay = this.overlayQueue;
      const stacks = new Map();
      for (const [name, idx] of Object.entries(viz.pointers || {})) {
        const k = stacks.get(idx) || 0;
        stacks.set(idx, k + 1);
        const g = AV.svgLabel(this.gOverlay, `↑ ${name}`, 'tag ptr');
        const key = 'ptr:' + name;
        targets.set(key, { x: xAt(idx) + W / 2, y: TOP + H + 40 + k * 22 });
        this.overlay.push({ g, key });
      }
      if (step.compare) {
        const idx = viz.compare && viz.compare.length ? viz.compare : null;
        const c = step.compare;
        const g = AV.svgLabel(this.gOverlay, `${c.evaluated} → ${AV.py(c.result)}`, `bubble ${c.result ? 'is-true' : 'is-false'}`, { h: 22, padX: 9, charW: 7.4 });
        const cx = idx ? (xAt(Math.min(...idx)) + xAt(Math.max(...idx)) + W) / 2 : this.width / 2;
        g.setAttribute('transform', `translate(${cx},${TOP - 26})`);
      }

      this.cancel = AV.tweenPositions(this.pos, targets, duration, () => this.draw());
    }

    draw() {
      for (const [id, g] of this.cells) {
        const p = this.pos.get(id);
        if (p) g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      }
      for (const o of this.overlay) {
        const p = this.pos.get(o.key);
        if (p) o.g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      }
    }

    setHover() {}

    destroy() {
      this.cancel();
      this.container.textContent = '';
    }
  }

  AV.registerView({ id: 'array', create: (container) => new ArrayView(container) });
})();
