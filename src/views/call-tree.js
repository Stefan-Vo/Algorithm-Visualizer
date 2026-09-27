/*
 * Recursion (call) tree, derived purely from the trace: every CALL step opens a
 * node under the frame that made it, and its RETURN step closes it with the
 * returned value. Works for built-in algorithms and user Python alike.
 *
 * The layout is computed once on the complete tree so nodes never move; at
 * step k only calls that have started by k are shown. States:
 *   active   still on the call stack      current  the executing call
 *   done     returned (value shown underneath)
 */
(function () {
  'use strict';
  const AV = window.AV;
  const el = AV.svg;

  const MAX_NODES = 500;
  const H = 30;
  const VGAP = 34;
  const HGAP = 12;
  const PAD = 24;

  /**
   * "insert(root=Node(10), value=7)"        -> "insert(Node(10), 7)"
   * "merge(arr=[27, 38, 3, 43], lo=0, ...)" -> "merge(arr, 0, ...)"
   * Short values are shown; long ones (lists, dicts, graphs) collapse to the parameter name.
   */
  function compact(sig) {
    const m = /^([^(]*)\(([\s\S]*)\)$/.exec(sig);
    if (!m) return sig;
    const args = [];
    let depth = 0;
    let cur = '';
    let quote = null;
    for (const ch of m[2]) {
      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"') quote = ch;
      else if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      else if (ch === ',' && depth === 0) {
        args.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) args.push(cur.trim());
    const shown = args.map((a) => {
      const kv = /^([A-Za-z_]\w*)=([\s\S]*)$/.exec(a);
      if (!kv) return a;
      const [, name, val] = kv;
      const long = /^[[{(]/.test(val) || val.length > 10 || (/\s/.test(val) && !/^['"]/.test(val));
      return long ? name : val;
    });
    return `${m[1]}(${shown.join(', ')})`;
  }
  AV.compactSignature = compact;
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  AV.buildCallTree = function (trace) {
    const nodes = [];
    const root = { id: 0, label: 'program', parent: null, children: [], start: 0, end: null, ret: null, virtual: true };
    nodes.push(root);
    const active = []; // depth -> node
    let truncated = false;
    for (const s of trace.steps) {
      const d = s.stack.length - 1;
      if (s.kind === 'call') {
        const frame = s.stack[d];
        if (frame.fn === '<module>') {
          active[d] = root;
          continue;
        }
        if (nodes.length > MAX_NODES) {
          truncated = true;
          active[d] = null;
          continue;
        }
        const parent = (d > 0 && active[d - 1]) || root;
        const node = { id: nodes.length, label: compact(frame.signature || frame.fn + '()'), fn: frame.fn, parent, children: [], start: s.index, end: null, ret: null, depth: 0 };
        parent.children.push(node);
        nodes.push(node);
        active[d] = node;
        active.length = d + 1;
      } else if (s.kind === 'return') {
        const node = active[d];
        if (node && !node.virtual) {
          node.end = s.index;
          node.ret = s.returnValue ? s.returnValue.text : 'None';
        }
      }
    }
    // Hide the virtual root when there is exactly one top-level call.
    const top = root.children.length === 1 ? root.children[0] : root;
    return { root: top, nodes: nodes.filter((n) => n === top || isUnder(n, top)), truncated, calls: nodes.length - 1 };
  };

  function isUnder(n, top) {
    for (let p = n.parent; p; p = p.parent) if (p === top) return true;
    return false;
  }

  class CallTree {
    constructor(container, { onSeek } = {}) {
      this.container = container;
      this.onSeek = onSeek;
      this.scroller = document.createElement('div');
      this.scroller.className = 'calltree-scroll';
      container.appendChild(this.scroller);
      this.svg = el('svg', { class: 'calltree-svg' }, this.scroller);
      this.gEdges = el('g', {}, this.svg);
      this.gNodes = el('g', {}, this.svg);
      this.note = document.createElement('div');
      this.note.className = 'legend';
      container.appendChild(this.note);
      this.svg.addEventListener('click', (e) => {
        const g = e.target.closest('[data-start]');
        if (g && this.onSeek) this.onSeek(Number(g.dataset.start));
      });
    }

    prepare(trace) {
      this.tree = AV.buildCallTree(trace);
      const nodes = this.tree.nodes;
      const maxLabel = Math.max(6, ...nodes.map((n) => Math.min(n.label.length, 26)));
      this.W = Math.round(maxLabel * 7.1 + 18);
      // Tidy layout: leaves take consecutive columns, parents centre over their children.
      let col = 0;
      let maxDepth = 0;
      const place = (n, depth) => {
        n.depth = depth;
        maxDepth = Math.max(maxDepth, depth);
        if (!n.children.length) n.x = col++;
        else {
          n.children.forEach((c) => place(c, depth + 1));
          n.x = (n.children[0].x + n.children[n.children.length - 1].x) / 2;
        }
      };
      place(this.tree.root, 0);
      this.cols = col;
      const w = PAD * 2 + col * this.W + (col - 1) * HGAP;
      const h = PAD * 2 + (maxDepth + 1) * H + maxDepth * VGAP + 16;
      this.svg.setAttribute('width', w);
      this.svg.setAttribute('height', h);
      this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      this.gEdges.textContent = '';
      this.gNodes.textContent = '';
      this.els = new Map();
      for (const n of nodes) {
        const { x, y } = this.xy(n);
        if (n.parent && this.els.has(n.parent.id)) {
          const p = this.xy(n.parent);
          n.edge = el('path', { class: 'ct-edge', d: `M${p.x},${p.y + H / 2} C${p.x},${p.y + H / 2 + VGAP / 2} ${x},${y - H / 2 - VGAP / 2} ${x},${y - H / 2}` }, this.gEdges);
        }
        const g = el('g', { class: 'ct-node', transform: `translate(${x},${y})`, 'data-start': n.start }, this.gNodes);
        el('rect', { x: -this.W / 2, y: -H / 2, width: this.W, height: H, rx: 7 }, g);
        const t = el('text', { class: 'ct-label' }, g);
        t.textContent = clip(n.label, 26);
        const title = el('title', {}, g);
        title.textContent = `${n.label}${n.end !== null ? ` → ${n.ret}` : ''}\n(click to jump to this call)`;
        const r = el('text', { class: 'ct-ret', y: H / 2 + 13 }, g);
        r.textContent = n.end !== null ? `→ ${clip(n.ret, 18)}` : '';
        this.els.set(n.id, g);
      }
      const calls = this.tree.calls;
      this.note.innerHTML =
        `<span><i class="sw sw-current"></i>executing</span><span><i class="sw sw-visited"></i>waiting on the stack</span><span><i class="sw sw-found"></i>returned</span>` +
        `<span class="legend-note">${calls} call${calls === 1 ? '' : 's'}${this.tree.truncated ? ` (showing first ${MAX_NODES})` : ''} · click a call to jump to it</span>`;
      this.lastCurrent = null;
    }

    xy(n) {
      return { x: PAD + n.x * (this.W + HGAP) + this.W / 2, y: PAD + n.depth * (H + VGAP) + H / 2 };
    }

    render(step) {
      if (!this.tree) return;
      const i = step.index;
      let current = null;
      for (const n of this.tree.nodes) {
        const g = this.els.get(n.id);
        const started = n.virtual || n.start <= i;
        const returned = n.end !== null && n.end < i;
        const onStack = started && !returned;
        g.style.display = started ? '' : 'none';
        if (n.edge) n.edge.style.display = started ? '' : 'none';
        const cls = ['ct-node'];
        if (n.virtual) cls.push('virtual');
        if (returned) cls.push('done');
        else if (onStack) cls.push('active');
        g.setAttribute('class', cls.join(' '));
        g.querySelector('.ct-ret').style.display = n.end !== null && n.end <= i ? '' : 'none';
        if (onStack && !n.virtual && (!current || n.start > current.start)) current = n;
        if (n.edge) n.edge.setAttribute('class', `ct-edge${onStack ? ' active' : ''}`);
      }
      if (current) {
        this.els.get(current.id).classList.add('current');
        if (current !== this.lastCurrent) this.scrollTo(current);
      }
      this.lastCurrent = current;
    }

    scrollTo(n) {
      const { x, y } = this.xy(n);
      const s = this.scroller;
      if (!s.clientWidth) return;
      const left = x - s.clientWidth / 2;
      const top = y - s.clientHeight / 2;
      if (x < s.scrollLeft + 40 || x > s.scrollLeft + s.clientWidth - 40 || y < s.scrollTop + 30 || y > s.scrollTop + s.clientHeight - 30) {
        s.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: 'smooth' });
      }
    }

    setHover() {}
    destroy() {
      this.container.textContent = '';
    }
  }

  AV.CallTree = CallTree;
  // For recursion-only algorithms the call tree *is* the main visualization.
  AV.registerView({ id: 'calltree', create: (container) => new CallTree(container) });
})();
