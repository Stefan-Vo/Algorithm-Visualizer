/*
 * Core: plugin registries, program parsing and value formatting.
 *
 * Everything hangs off the global `AV` namespace so the app runs from file://
 * without a bundler or dev server.
 */
(function () {
  'use strict';
  const AV = (window.AV = window.AV || {});

  AV.structures = new Map();
  AV.views = new Map();
  AV.algorithms = [];

  function requireKeys(kind, def, keys) {
    for (const key of keys) {
      if (def[key] === undefined) throw new Error(`${kind} "${def.id || '?'}" is missing "${key}"`);
    }
  }

  /** A data structure: how to parse input, build a model, snapshot and format it. */
  AV.registerStructure = function (def) {
    requireKeys('Structure', def, ['id', 'name', 'view', 'parse', 'build', 'snapshot']);
    AV.structures.set(def.id, def);
  };

  /** A visualizer: create(container) -> { prepare(trace), render(step, opts), setHover(id), destroy() } */
  AV.registerView = function (def) {
    requireKeys('View', def, ['id', 'create']);
    AV.views.set(def.id, def);
  };

  /** An algorithm: displayed source + an instrumented implementation run against the Tracer. */
  AV.registerAlgorithm = function (def) {
    requireKeys('Algorithm', def, ['id', 'name', 'structure', 'source', 'run']);
    def.program = AV.parseProgram(def.source); // validates line labels up front
    AV.algorithms.push(def);
  };

  AV.findAlgorithm = (id) => AV.algorithms.find((a) => a.id === id);

  /*
   * Source lines may end in `@@label`. The marker is stripped from the displayed
   * code, and algorithms refer to lines by label instead of fragile line numbers.
   */
  const MARKER = /\s*@@([\w.-]+)\s*$/;
  AV.parseProgram = function (source) {
    const raw = source.split('\n');
    while (raw.length && !raw[0].trim()) raw.shift();
    while (raw.length && !raw[raw.length - 1].trim()) raw.pop();
    const indent = Math.min(...raw.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
    const lines = [];
    const labels = {};
    raw.forEach((text, i) => {
      text = text.slice(indent);
      const m = text.match(MARKER);
      if (m) {
        if (labels[m[1]]) throw new Error(`Duplicate line label "@@${m[1]}"`);
        labels[m[1]] = i + 1;
        text = text.slice(0, m.index);
      }
      lines.push(text.replace(/\s+$/, ''));
    });
    return { lines, labels };
  };

  /** Python-style repr for primitive values (the displayed code is Python). */
  AV.py = function (v) {
    if (v === null || v === undefined) return 'None';
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (v === Infinity) return 'inf';
    if (v === -Infinity) return '-inf';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(4));
    if (typeof v === 'string') return `'${v}'`;
    if (v instanceof Set) return v.size ? '{' + [...v].map(AV.py).join(', ') + '}' : 'set()';
    if (v instanceof Map) return '{' + [...v].map(([k, x]) => `${AV.py(k)}: ${AV.py(x)}`).join(', ') + '}';
    if (Array.isArray(v)) {
      const inner = v.map(AV.py).join(', ');
      if (v.pyTuple) return '(' + inner + (v.length === 1 ? ',' : '') + ')';
      if (v.pyDeque) return 'deque([' + inner + '])';
      return '[' + inner + ']';
    }
    return String(v);
  };

  /** JS arrays that print like Python tuples / deques in the variables panel. */
  AV.tuple = (...items) => Object.defineProperty(items, 'pyTuple', { value: true });
  AV.deque = (items = []) => Object.defineProperty([...items], 'pyDeque', { value: true });

  /** A graph node name: letters/digits, e.g. A or n1. */
  AV.parseName = function (text, label = 'Value') {
    const t = String(text).trim();
    if (!/^[A-Za-z0-9_]{1,6}$/.test(t)) throw new Error(`${label} must be a node name like A (got "${t}").`);
    return t;
  };

  AV.parseNumber = function (text, label = 'Value') {
    const t = String(text).trim();
    const n = Number(t);
    if (!t || !Number.isFinite(n)) throw new Error(`${label} must be a number (got "${t}").`);
    return n;
  };

  AV.parseNumberList = function (text, max = 31) {
    const parts = String(text).split(/[\s,]+/).filter(Boolean);
    const values = parts.map((p) => {
      const n = Number(p);
      if (!Number.isFinite(n)) throw new Error(`"${p}" is not a number.`);
      return n;
    });
    if (values.length > max) throw new Error(`Please use at most ${max} values (got ${values.length}).`);
    return values;
  };

  let uid = 0;
  AV.uid = (prefix) => prefix + ++uid;

  AV.randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  AV.uniqueInts = function (count, lo, hi) {
    const set = new Set();
    while (set.size < count) set.add(AV.randInt(lo, hi));
    return [...set];
  };
})();
