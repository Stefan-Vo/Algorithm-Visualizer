/*
 * Generic heap view for user-supplied code. It knows nothing about the
 * algorithm; it recognises data structures by shape in step.structure.heap:
 *
 *   objects with .left and .right   -> binary trees
 *   objects with .next              -> linked lists
 *   lists / tuples / sets / deques  -> arrays (list of lists -> grid)
 *   dicts                           -> key/value rows
 *
 * Tags come from the executing frame's variables: references label nodes, and
 * small ints with index-like names (i, j, lo, hi, mid...) point into the array.
 */
(function () {
  'use strict';
  const AV = window.AV;
  const el = AV.svg;

  const GAP = 58;
  const LEVEL = 74;
  const R = 19;
  const CELL = 44;
  const CGAP = 6;
  const LN_W = 56;
  const LN_H = 34;
  const LN_GAP = 40;
  const PAD = 36;
  const SECTION_GAP = 40;
  const LABEL_H = 22;
  const MAX_CELLS = 40;
  const VALUE_KEYS = ['value', 'val', 'key', 'data', 'item', 'v'];
  const INDEX_NAMES = new Set(['i', 'j', 'k', 'l', 'r', 'lo', 'hi', 'low', 'high', 'mid', 'left', 'right', 'start', 'end', 'idx', 'index', 'p', 'q', 'row', 'col', 'x', 'y']);
  const INT = /^-?\d+$/;

  function fieldsOf(entry) {
    const m = {};
    for (const [k, v] of entry.fields || []) m[k] = v;
    return m;
  }

  function nodeLabel(entry, f) {
    for (const k of VALUE_KEYS) if (f[k] && !f[k].ref) return f[k].text;
    const prim = Object.entries(f).find(([, v]) => !v.ref && v.text !== 'None');
    return prim ? prim[1].text : entry.cls;
  }

  /** Turn one step into positioned drawables. Coordinates are section-relative until finalised. */
  function analyze(step) {
    const heap = step.structure.heap || {};
    const top = step.stack[step.stack.length - 1];
    const module = step.stack[0];
    const F = {};
    for (const id in heap) if (heap[id].k === 'obj') F[id] = fieldsOf(heap[id]);
    const isTree = (id) => !!F[id] && 'left' in F[id] && 'right' in F[id];
    const isList = (id) => !!F[id] && !isTree(id) && 'next' in F[id];

    const sections = []; // {width, height, items: [...]} items have local x,y
    const nodes = []; // {key, kind, text, x, y, sec}
    const edges = []; // {from, to, kind}
    const cells = []; // {key, text, x, y, sec, arr, idx}
    const texts = []; // static labels {text, x, y, sec, cls, anchor}
    const placed = new Set();

    // ---- trees ----
    const child = (id, side) => {
      const v = F[id][side];
      return v && v.ref && isTree(v.ref) ? v.ref : null;
    };
    const treeIds = Object.keys(F).filter(isTree);
    const children = new Set();
    for (const id of treeIds) for (const s of ['left', 'right']) if (child(id, s)) children.add(child(id, s));
    let roots = treeIds.filter((id) => !children.has(id));
    if (!roots.length && treeIds.length) roots = [treeIds[0]];
    const seen = new Set();
    const build = (id) => {
      if (!id || seen.has(id)) return null;
      seen.add(id);
      return { id, value: nodeLabel(heap[id], F[id]), left: build(child(id, 'left')), right: build(child(id, 'right')) };
    };
    const trees = roots.map((id) => build(id)).filter(Boolean).map((t) => ({ t, L: AV.treeLayout(t, null) }));
    trees.sort((a, b) => b.L.count - a.L.count);
    if (trees.length) {
      const sec = sections.length;
      let x = 0;
      let h = 0;
      for (const { L } of trees) {
        for (const n of L.nodes) {
          nodes.push({ key: n.id, kind: 'tree', text: n.value, x: x + R + n.x, y: R + n.y, sec });
          placed.add(n.id);
          if (n.parent) edges.push({ from: n.parent, to: n.id, kind: 'tree' });
        }
        x += (L.count - 1) * GAP + 2 * R + 48;
        h = Math.max(h, L.maxDepth * LEVEL + 2 * R);
      }
      sections.push({ width: x - 48, height: h });
    }

    // ---- linked lists ----
    const next = (id) => {
      const v = F[id].next;
      return v && v.ref && isList(v.ref) ? v.ref : null;
    };
    const listIds = Object.keys(F).filter(isList);
    const pointed = new Set(listIds.map(next).filter(Boolean));
    const heads = listIds.filter((id) => !pointed.has(id)).concat(listIds.filter((id) => pointed.has(id)));
    const chains = [];
    const lseen = new Set();
    for (const h of heads) {
      if (lseen.has(h)) continue;
      const chain = [];
      let cur = h;
      while (cur && !lseen.has(cur)) {
        lseen.add(cur);
        chain.push(cur);
        cur = next(cur);
      }
      chains.push(chain);
    }
    chains.sort((a, b) => b.length - a.length);
    if (chains.length) {
      const sec = sections.length;
      let w = 0;
      chains.forEach((chain, row) => {
        const y = LN_H / 2 + row * (LN_H + 26);
        chain.forEach((id, i) => {
          const x = LN_W / 2 + i * (LN_W + LN_GAP);
          nodes.push({ key: id, kind: 'list', text: nodeLabel(heap[id], F[id]), x, y, sec });
          placed.add(id);
          const nx = next(id);
          if (nx) edges.push({ from: id, to: nx, kind: 'list' });
          else if (F[id].next && F[id].next.text === 'None') texts.push({ text: 'None', x: x + LN_W / 2 + 12, y, sec, cls: 'none-mark', anchor: 'start' });
        });
        w = Math.max(w, chain.length * (LN_W + LN_GAP));
      });
      sections.push({ width: w, height: chains.length * (LN_H + 26) - 26 });
    }

    // ---- arrays, grids, dicts referenced by variables ----
    const varRefs = [];
    const addVars = (frame) => {
      for (const v of frame.vars) if (v.ref && heap[v.ref]) varRefs.push(v);
    };
    addVars(top);
    if (module !== top) addVars(module);
    const names = new Map();
    for (const v of varRefs) {
      if (!names.has(v.ref)) names.set(v.ref, []);
      if (!names.get(v.ref).includes(v.name)) names.get(v.ref).push(v.name);
    }
    const pointers = top.vars.filter((v) => !v.ref && INT.test(v.text) && INDEX_NAMES.has(v.name)).map((v) => ({ name: v.name, idx: Number(v.text) }));
    let primary = null;
    const containers = [...names.keys()].filter((id) => heap[id].k === 'list' || heap[id].k === 'dict');
    for (const id of containers) {
      const e = heap[id];
      const label = names.get(id).join(', ');
      const sec = sections.length;
      const rowsAreLists =
        e.k === 'list' && e.items.length > 0 && e.items.length <= 20 &&
        e.items.every((it) => it.ref && heap[it.ref] && heap[it.ref].k === 'list' && heap[it.ref].items.length <= 20 && heap[it.ref].items.every((x) => !x.ref));
      texts.push({ text: `${label}${e.k === 'list' && e.type !== 'list' ? ` (${e.type})` : ''}`, x: 0, y: 8, sec, cls: 'sec-label', anchor: 'start' });
      if (rowsAreLists) {
        const rows = e.items.map((it) => heap[it.ref].items);
        const cols = Math.max(...rows.map((r) => r.length));
        const ox = 26;
        const oy = LABEL_H + 18;
        const ivar = top.vars.find((v) => ['i', 'r', 'row'].includes(v.name) && INT.test(v.text));
        const jvar = top.vars.find((v) => ['j', 'c', 'col'].includes(v.name) && INT.test(v.text));
        for (let c = 0; c < cols; c++) texts.push({ text: String(c), x: ox + c * (CELL + CGAP) + CELL / 2, y: oy - 10, sec, cls: 'index' });
        rows.forEach((row, r) => {
          texts.push({ text: String(r), x: ox - 12, y: oy + r * (CELL + CGAP) + CELL / 2 + 4, sec, cls: 'index' });
          row.forEach((item, c) => {
            const cur = ivar && jvar && Number(ivar.text) === r && Number(jvar.text) === c;
            cells.push({ key: `${id}:${r}:${c}`, text: item.text, x: ox + c * (CELL + CGAP) + CELL / 2, y: oy + r * (CELL + CGAP) + CELL / 2, sec, current: cur });
          });
        });
        sections.push({ width: ox + cols * (CELL + CGAP), height: oy + rows.length * (CELL + CGAP) });
        continue;
      }
      const items = e.items.slice(0, MAX_CELLS);
      const isDict = e.k === 'dict';
      if (!isDict && !primary) primary = { id, len: e.len, sec };
      items.forEach((item, i) => {
        const valueItem = isDict ? item[1] : item;
        const node = valueItem.ref && placed.has(valueItem.ref);
        const cur = !isDict && primary && primary.id === id && pointers.some((p) => p.idx === i);
        cells.push({ key: `${id}:${i}`, text: valueItem.text, x: i * (CELL + CGAP) + CELL / 2, y: LABEL_H + CELL / 2, sec, current: cur, ref: node ? valueItem.ref : null });
        texts.push({ text: isDict ? item[0] : String(i), x: i * (CELL + CGAP) + CELL / 2, y: LABEL_H + CELL + 15, sec, cls: 'index' });
      });
      if (e.len > items.length) texts.push({ text: `… ${e.len - items.length} more`, x: items.length * (CELL + CGAP), y: LABEL_H + CELL / 2 + 4, sec, cls: 'index', anchor: 'start' });
      if (!items.length) texts.push({ text: isDict ? '{} (empty)' : '[] (empty)', x: 0, y: LABEL_H + 20, sec, cls: 'index', anchor: 'start' });
      let h = LABEL_H + CELL + 22;
      if (primary && primary.id === id) h += pointers.filter((p) => p.idx >= 0 && p.idx <= e.len).length ? 26 : 0;
      sections.push({ width: Math.max(items.length * (CELL + CGAP), 120), height: h });
    }

    // Index pointers under the primary array (they may point one past the end).
    const ptrs = [];
    if (primary) {
      const stackAt = new Map();
      for (const p of pointers) {
        if (p.idx < 0 || p.idx > primary.len || p.idx > MAX_CELLS) continue;
        const k = stackAt.get(p.idx) || 0;
        stackAt.set(p.idx, k + 1);
        ptrs.push({ key: 'ptr:' + p.name, name: p.name, idx: p.idx, x: p.idx * (CELL + CGAP) + CELL / 2, y: LABEL_H + CELL + 34 + k * 20, sec: primary.sec });
      }
      if (ptrs.length) sections[primary.sec].height = Math.max(sections[primary.sec].height, Math.max(...ptrs.map((p) => p.y)) + 12);
    }

    // Stack sections vertically and centre each horizontally.
    const width = Math.max(0, ...sections.map((s) => s.width));
    let y = PAD;
    const offsets = sections.map((s) => {
      const o = { x: PAD + (width - s.width) / 2, y };
      y += s.height + SECTION_GAP;
      return o;
    });
    const fix = (it) => {
      const o = offsets[it.sec];
      it.x += o.x;
      it.y += o.y;
    };
    [...nodes, ...cells, ...texts, ...ptrs].forEach(fix);

    // Variable tags on drawn objects.
    const tags = new Map();
    for (const v of top.vars) if (v.ref && placed.has(v.ref)) (tags.get(v.ref) || tags.set(v.ref, []).get(v.ref)).push(v.name);

    return {
      nodes,
      edges,
      cells,
      texts,
      ptrs,
      tags,
      width: width + PAD * 2,
      height: sections.length ? y - SECTION_GAP + PAD : 0,
      textByKey: new Map([...nodes, ...cells].map((i) => [i.key, i.text])),
    };
  }

  class HeapView {
    constructor(container) {
      this.container = container;
      this.svg = el('svg', { class: 'viz-svg heap-svg', preserveAspectRatio: 'xMidYMid meet', role: 'img' });
      const defs = el('defs', {}, this.svg);
      const marker = el('marker', { id: 'av-heap-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow-head muted-head' }, marker);
      this.gStatic = el('g', {}, this.svg);
      this.gEdges = el('g', { class: 'edges' }, this.svg);
      this.gItems = el('g', {}, this.svg);
      this.gOverlay = el('g', { class: 'overlay' }, this.svg);
      this.emptyText = el('text', { class: 'empty-text' }, this.svg);
      container.appendChild(this.svg);

      this.legend = document.createElement('div');
      this.legend.className = 'legend';
      this.legend.innerHTML = [
        ['current', 'referenced by a variable'],
        ['found', 'new object'],
        ['successor', 'value changed'],
      ]
        .map(([c, t]) => `<span><i class="sw sw-${c}"></i>${t}</span>`)
        .join('') + '<span class="legend-note">Structures are detected by shape: .left/.right → tree, .next → linked list</span>';
      container.appendChild(this.legend);

      this.els = new Map();
      this.pos = new Map();
      this.cancel = () => {};
      this.hoverId = null;
    }

    prepare(trace) {
      this.trace = trace;
      this.models = trace.steps.map(analyze);
      this.width = Math.max(440, ...this.models.map((m) => m.width));
      this.height = Math.max(260, ...this.models.map((m) => m.height));
      this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
      this.cancel();
      for (const g of [this.gStatic, this.gEdges, this.gItems, this.gOverlay]) g.textContent = '';
      this.els.clear();
      this.pos.clear();
    }

    render(step, { duration = 0 } = {}) {
      this.cancel();
      const m = this.models[step.index];
      const prev = step.index > 0 ? this.models[step.index - 1] : null;
      const dx = (this.width - m.width) / 2;
      const targets = new Map();
      const live = new Set();

      const upsert = (key, build) => {
        let g = this.els.get(key);
        if (!g) {
          g = build();
          this.gItems.appendChild(g);
          this.els.set(key, g);
        }
        live.add(key);
        return g;
      };
      const setText = (g, text) => {
        const t = g.querySelector('text');
        if (t.textContent !== text) t.textContent = text;
      };

      for (const n of m.nodes) {
        const g = upsert(n.key, () => {
          const g = el('g', {});
          if (n.kind === 'tree') el('circle', { r: R }, g);
          else el('rect', { x: -LN_W / 2, y: -LN_H / 2, width: LN_W, height: LN_H, rx: 8 }, g);
          el('text', { class: 'val' }, g);
          return g;
        });
        setText(g, n.text);
        const cls = [n.kind === 'tree' ? 'node' : 'node lnode'];
        if (m.tags.has(n.key)) cls.push('current');
        if (prev && !prev.textByKey.has(n.key)) cls.push('created');
        else if (prev && prev.textByKey.get(n.key) !== n.text) cls.push('changed-val');
        if (n.key === this.hoverId) cls.push('hover');
        g.setAttribute('class', cls.join(' '));
        targets.set(n.key, { x: dx + n.x, y: n.y });
      }
      for (const c of m.cells) {
        const g = upsert(c.key, () => {
          const g = el('g', {});
          el('rect', { x: -CELL / 2, y: -CELL / 2, width: CELL, height: CELL, rx: 7 }, g);
          el('text', { class: 'val' }, g);
          return g;
        });
        setText(g, c.text);
        const cls = ['cell'];
        if (c.current) cls.push('current');
        if (prev && prev.textByKey.has(c.key) && prev.textByKey.get(c.key) !== c.text) cls.push('changed-val');
        if (c.text.length > 5) cls.push('long');
        g.setAttribute('class', cls.join(' '));
        targets.set(c.key, { x: dx + c.x, y: c.y });
      }
      for (const [key, g] of this.els) {
        if (!live.has(key)) {
          this.els.delete(key);
          g.remove();
        }
      }

      this.gStatic.textContent = '';
      for (const t of m.texts) {
        const e = el('text', { x: dx + t.x, y: t.y, class: t.cls, 'text-anchor': t.anchor || 'middle' }, this.gStatic);
        e.textContent = t.text;
      }

      this.gEdges.textContent = '';
      this.edges = m.edges.map((e) => {
        const line = el('line', { class: `edge ${e.kind === 'list' ? 'list-edge' : ''}` }, this.gEdges);
        if (e.kind === 'list') line.setAttribute('marker-end', 'url(#av-heap-arrow)');
        return Object.assign({ line }, e);
      });

      this.gOverlay.textContent = '';
      this.overlay = [];
      for (const [key, names] of m.tags) {
        const g = AV.svgLabel(this.gOverlay, names.join(', '), 'tag');
        const kind = m.nodes.find((n) => n.key === key).kind;
        this.overlay.push({ g, anchor: key, dx: 0, dy: kind === 'tree' ? R + 14 : LN_H / 2 + 13 });
      }
      for (const p of m.ptrs) {
        const g = AV.svgLabel(this.gOverlay, `↑ ${p.name}`, 'tag ptr');
        targets.set(p.key, { x: dx + p.x, y: p.y });
        this.overlay.push({ g, key: p.key });
      }
      if (step.compare) {
        const anchor = this.compareAnchor(step, m, targets);
        if (anchor) {
          const c = step.compare;
          const g = AV.svgLabel(this.gOverlay, `${c.evaluated} → ${c.result ? 'True' : 'False'}`, `bubble ${c.result ? 'is-true' : 'is-false'}`, { h: 22, padX: 9, charW: 7.4 });
          targets.set('bubble', anchor);
          this.overlay.push({ g, key: 'bubble' });
        }
      }

      this.emptyText.textContent = m.nodes.length || m.cells.length ? '' : 'No data structures in scope';
      this.emptyText.setAttribute('x', this.width / 2);
      this.emptyText.setAttribute('y', this.height / 2);

      this.cancel = AV.tweenPositions(this.pos, targets, duration, () => this.draw());
    }

    /** Place the condition bubble over the object or index the condition mentions. */
    compareAnchor(step, m, targets) {
      const words = new Set(step.compare.expr.match(/[A-Za-z_]\w*/g) || []);
      const top = step.stack[step.stack.length - 1];
      for (const v of top.vars) {
        if (!words.has(v.name)) continue;
        if (v.ref && targets.has(v.ref) && m.tags.has(v.ref)) {
          const p = targets.get(v.ref);
          const n = m.nodes.find((x) => x.key === v.ref);
          return { x: p.x, y: p.y - (n && n.kind === 'list' ? LN_H / 2 + 16 : R + 17) };
        }
      }
      for (const p of m.ptrs) {
        if (!words.has(p.name)) continue;
        const cell = m.cells.find((c) => c.current && c.key.endsWith(':' + p.idx));
        if (cell) {
          const t = targets.get(cell.key);
          return { x: t.x, y: t.y - CELL / 2 - 30 };
        }
      }
      const cur = m.cells.find((c) => c.current && c.key.split(':').length === 3);
      if (cur) {
        // Grid: float above the whole grid, over the current column, so no values are covered.
        const grid = cur.key.split(':')[0] + ':';
        const top = Math.min(...m.cells.filter((c) => c.key.startsWith(grid)).map((c) => targets.get(c.key).y));
        return { x: targets.get(cur.key).x, y: top - CELL / 2 - 34 };
      }
      return null;
    }

    draw() {
      for (const [key, g] of this.els) {
        const p = this.pos.get(key);
        if (p) g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      }
      for (const e of this.edges) {
        const a = this.pos.get(e.from);
        const b = this.pos.get(e.to);
        if (!a || !b) continue;
        let x1, y1, x2, y2;
        if (e.kind === 'tree') {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          x1 = a.x + (dx / len) * R;
          y1 = a.y + (dy / len) * R;
          x2 = b.x - (dx / len) * R;
          y2 = b.y - (dy / len) * R;
        } else if (b.x > a.x + LN_W) {
          x1 = a.x + LN_W / 2;
          y1 = a.y;
          x2 = b.x - LN_W / 2 - 2;
          y2 = b.y;
        } else {
          // backwards / cycle: go from the bottom of a to the bottom of b
          x1 = a.x;
          y1 = a.y + LN_H / 2;
          x2 = b.x;
          y2 = b.y + LN_H / 2 + 2;
        }
        e.line.setAttribute('x1', x1.toFixed(1));
        e.line.setAttribute('y1', y1.toFixed(1));
        e.line.setAttribute('x2', x2.toFixed(1));
        e.line.setAttribute('y2', y2.toFixed(1));
      }
      for (const o of this.overlay) {
        const p = o.key ? this.pos.get(o.key) : this.pos.get(o.anchor);
        if (!p) continue;
        o.g.setAttribute('transform', `translate(${(p.x + (o.dx || 0)).toFixed(1)},${(p.y + (o.dy || 0)).toFixed(1)})`);
      }
    }

    setHover(id) {
      if (this.hoverId && this.els.get(this.hoverId)) this.els.get(this.hoverId).classList.remove('hover');
      this.hoverId = id;
      if (id && this.els.get(id)) this.els.get(id).classList.add('hover');
    }

    destroy() {
      this.cancel();
      this.container.textContent = '';
    }
  }

  AV.registerView({ id: 'objects', create: (container) => new HeapView(container) });
  AV.analyzeHeap = analyze; // exposed for tests
})();
