/*
 * Headless correctness tests for the execution engine and algorithms.
 * Run: node tests/engine.test.js
 *
 * Loads the non-DOM scripts into a sandbox, runs each algorithm on many random
 * inputs, and checks (1) the algorithm's result against a reference
 * implementation and (2) structural invariants of the trace.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { console, Math, JSON };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of [
  'src/engine/core.js',
  'src/engine/tracer.js',
  'src/engine/player.js',
  'src/structures/bst.js',
  'src/structures/array.js',
  'src/algorithms/bst-common.js',
  'src/algorithms/bst-insert.js',
  'src/algorithms/bst-search.js',
  'src/algorithms/bst-delete.js',
  'src/algorithms/binary-search.js',
  'src/algorithms/bubble-sort.js',
  'src/structures/graph.js',
  'src/structures/heap.js',
  'src/structures/linked-list.js',
  'src/algorithms/graph-algorithms.js',
  'src/algorithms/heap-algorithms.js',
  'src/algorithms/sorting.js',
  'src/algorithms/list-and-recursion.js',
  'src/views/call-tree.js',
]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
}
const AV = sandbox.AV;

let failures = 0;
let checks = 0;
function assert(cond, msg) {
  checks++;
  if (!cond) {
    failures++;
    if (failures <= 20) console.error('FAIL:', msg);
  }
}

function inorder(n, out = []) {
  if (n) {
    inorder(n.left, out);
    out.push(n.value);
    inorder(n.right, out);
  }
  return out;
}
function isBST(n, lo = -Infinity, hi = Infinity) {
  if (!n) return true;
  // equal values go right on insert, but delete's successor copy keeps equals right too
  if (n.value < lo || n.value >= hi) return false;
  return isBST(n.left, lo, n.value) && isBST(n.right, n.value, hi);
}
function shape(n) {
  return n ? `(${shape(n.left)} ${n.value} ${shape(n.right)})` : '.';
}
function refInsert(n, v) {
  if (!n) return { value: v, left: null, right: null };
  if (v < n.value) n.left = refInsert(n.left, v);
  else n.right = refInsert(n.right, v);
  return n;
}

function checkTrace(trace, label) {
  assert(!trace.error, `${label}: threw ${trace.error && trace.error.message}`);
  const steps = trace.steps;
  assert(steps.length > 0, `${label}: no steps`);
  let calls = 0;
  let rets = 0;
  steps.forEach((s, i) => {
    assert(s.index === i, `${label}: step index`);
    assert(s.line >= 1 && s.line <= trace.program.lines.length, `${label}: line out of range`);
    assert(trace.program.lines[s.line - 1].trim() !== '', `${label}: step on blank line ${s.line}`);
    assert(!/^\s*(else:|#)/.test(trace.program.lines[s.line - 1]), `${label}: step on non-executable line ${s.line}`);
    assert(s.stack.length >= 1 && s.depth === s.stack.length - 1, `${label}: depth mismatch`);
    assert(s.stack[s.stack.length - 1].line === s.line, `${label}: top frame line != step line`);
    if (s.kind === 'call') calls++;
    if (s.kind === 'return') rets++;
    if (i > 0) {
      const d = s.stack.length - steps[i - 1].stack.length;
      const expected = s.kind === 'call' ? 1 : steps[i - 1].kind === 'return' ? -1 : 0;
      assert(d === expected, `${label}: stack changed by ${d} at step ${i} (${s.kind}), expected ${expected}`);
    }
    if (s.compare) assert(typeof s.compare.result === 'boolean', `${label}: compare result not boolean`);
  });
  assert(calls === rets + 1, `${label}: ${calls} calls vs ${rets} returns (module frame never returns)`);
  const last = steps[steps.length - 1];
  assert(last.stack.length === 1 && last.stack[0].fn === '<module>', `${label}: does not end in <module>`);
}

const bst = AV.structures.get('bst');
const arr = AV.structures.get('array');
const alg = (id) => AV.findAlgorithm(id);

for (let t = 0; t < 400; t++) {
  const n = AV.randInt(0, 14);
  const values = Array.from({ length: n }, () => AV.randInt(1, 30)); // duplicates included on purpose
  const v = AV.randInt(1, 30);

  // insert
  {
    const trace = AV.runAlgorithm(alg('bst-insert'), bst, bst.build(values), { value: v });
    checkTrace(trace, `insert ${v} into [${values}]`);
    let ref = null;
    for (const x of [...values, v]) ref = refInsert(ref, x);
    assert(shape(trace.model.root) === shape(ref), `insert ${v} into [${values}]: wrong shape`);
    // Final snapshot matches the real model
    assert(shape(trace.steps[trace.steps.length - 1].structure.root) === shape(trace.model.root), 'insert: final snapshot != model');
    // New node appears exactly once in snapshots only after being attached
    const created = trace.steps.filter((s) => s.kind === 'return' && s.label === 'new');
    assert(created.length === 1, 'insert: exactly one Node() creation');
  }

  // search
  {
    const trace = AV.runAlgorithm(alg('bst-search'), bst, bst.build(values), { value: v });
    checkTrace(trace, `search ${v} in [${values}]`);
    assert(!!trace.result === values.includes(v), `search ${v} in [${values}]: wrong result`);
    if (trace.result) assert(trace.result.value === v, 'search: wrong node');
    // Every comparison compares against a node on the root->target path, and there are at most height+1 of them.
    const eqs = trace.comparisons.filter((c) => c.expr === 'value == root.value').length;
    assert(eqs <= values.length, 'search: too many comparisons');
  }

  // delete
  {
    const trace = AV.runAlgorithm(alg('bst-delete'), bst, bst.build(values), { value: v });
    checkTrace(trace, `delete ${v} from [${values}]`);
    const expected = [...values].sort((a, b) => a - b);
    const idx = expected.indexOf(v);
    if (idx >= 0) expected.splice(idx, 1);
    const got = inorder(trace.model.root);
    assert(JSON.stringify(got) === JSON.stringify(expected), `delete ${v} from [${values}]: got [${got}] expected [${expected}]`);
    assert(isBST(trace.model.root), `delete ${v} from [${values}]: not a BST`);
    // serialize/rebuild round-trip preserves shape
    assert(shape(bst.build(bst.parse(bst.serialize(trace.model))).root) === shape(trace.model.root), 'serialize round trip');
  }

  // binary search
  {
    const a = alg('binary-search');
    const { values: sorted } = a.prepareInput(values.length ? values : [1]);
    const trace = AV.runAlgorithm(a, arr, arr.build(sorted), { target: v });
    checkTrace(trace, `binary_search ${v} in [${sorted}]`);
    if (trace.result === -1) assert(!sorted.includes(v), `binary search missed ${v} in [${sorted}]`);
    else assert(sorted[trace.result] === v, `binary search wrong index for ${v}`);
    assert(trace.comparisons.filter((c) => c.expr === 'arr[mid] == target').length <= Math.ceil(Math.log2(sorted.length + 1)), 'binary search: too many probes');
  }

  // bubble sort
  {
    const trace = AV.runAlgorithm(alg('bubble-sort'), arr, arr.build(values), {});
    checkTrace(trace, `bubble_sort [${values}]`);
    const got = trace.model.arr.values();
    assert(JSON.stringify(got) === JSON.stringify([...values].sort((a, b) => a - b)), `bubble sort [${values}] -> [${got}]`);
    // item identities are preserved (swaps move items, never recreate them)
    const ids0 = trace.steps[0].structure.items.map((x) => x.id).sort();
    const ids1 = trace.steps[trace.steps.length - 1].structure.items.map((x) => x.id).sort();
    assert(JSON.stringify(ids0) === JSON.stringify(ids1), 'bubble sort: identities changed');
  }
}

// The worked example from the spec: insert 7 into 10,5,15,3,7,12,20 compares 7<10 True, then 7<5 False, then 7<7 False.
{
  const trace = AV.runAlgorithm(alg('bst-insert'), bst, bst.build([10, 5, 15, 3, 7, 12, 20]), { value: 7 });
  const cmps = trace.comparisons.filter((c) => c.expr === 'value < root.value').map((c) => `${c.evaluated}=${c.result}`);
  assert(JSON.stringify(cmps) === JSON.stringify(['7 < 10=true', '7 < 5=false', '7 < 7=false']), `spec example comparisons: ${cmps}`);
  const step = trace.steps.find((s) => s.compare && s.compare.evaluated === '7 < 10');
  assert(trace.program.lines[step.line - 1].trim() === 'if value < root.value:', 'spec example: highlighted line');
  const vars = Object.fromEntries(step.stack[step.stack.length - 1].vars.map((x) => [x.name, x.text]));
  assert(vars.value === '7' && vars.root === 'Node(10)', 'spec example: variables');
  console.log(`spec example: ${trace.steps.length} steps; step ${step.index + 1} executes "if value < root.value:" with value=7, root=Node(10) -> 7 < 10 True`);
}

// ---------------------------------------------------------------------------
// Graphs, heaps, recursive sorts, linked lists, recursion, call tree.
// ---------------------------------------------------------------------------
const graph = AV.structures.get('graph');
const heapS = AV.structures.get('heap');
const listS = AV.structures.get('linked-list');
const recS = AV.structures.get('recursion');

function randomGraphText(weighted) {
  const n = AV.randInt(2, 8);
  const names = 'ABCDEFGH'.slice(0, n).split('');
  const edges = [];
  for (let i = 1; i < n; i++) if (Math.random() < 0.9) edges.push([names[AV.randInt(0, i - 1)], names[i]]);
  for (let k = AV.randInt(0, 5); k > 0; k--) {
    const a = AV.randInt(0, n - 1);
    const b = AV.randInt(0, n - 1);
    if (a !== b) edges.push([names[a], names[b]]);
  }
  const directed = Math.random() < 0.3;
  const parts = edges.map(([a, b]) => `${a}${directed ? '->' : '-'}${b}${weighted ? ':' + AV.randInt(0, 9) : ''}`);
  return (parts.length ? parts : [names[0]]).concat(names).join(', ');
}

for (let t = 0; t < 300; t++) {
  // ---- BFS / DFS / Dijkstra against reference implementations
  const text = randomGraphText(true);
  const parsed = graph.parse(text);
  const start = parsed.nodes[AV.randInt(0, parsed.nodes.length - 1)];
  const g = graph.build(parsed);
  for (const p of g.pos.values()) assert(Number.isFinite(p.x) && Number.isFinite(p.y), 'graph layout finite');

  const bfsTrace = AV.runAlgorithm(alg('bfs'), graph, graph.build(parsed), { start });
  checkTrace(bfsTrace, `bfs ${text} from ${start}`);
  const refBfs = [];
  {
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const u = q.shift();
      refBfs.push(u);
      for (const { to } of g.neighbors(u)) if (!seen.has(to)) seen.add(to), q.push(to);
    }
  }
  assert(JSON.stringify(bfsTrace.result) === JSON.stringify(refBfs), `bfs order ${bfsTrace.result} vs ${refBfs}`);

  const dfsTrace = AV.runAlgorithm(alg('dfs'), graph, graph.build(parsed), { start });
  checkTrace(dfsTrace, `dfs ${text}`);
  const refDfs = [];
  (function go(u) {
    refDfs.push(u);
    for (const { to } of g.neighbors(u)) if (!refDfs.includes(to)) go(to);
  })(start);
  assert(JSON.stringify(dfsTrace.result) === JSON.stringify(refDfs), `dfs order ${dfsTrace.result} vs ${refDfs}`);
  // DFS recursion depth in the trace equals the recursion the reference needed.
  const calls = dfsTrace.steps.filter((s) => s.kind === 'call' && s.stack[s.stack.length - 1].fn === 'dfs').length;
  assert(calls === refDfs.length, 'dfs: one call per visited node');

  const dijTrace = AV.runAlgorithm(alg('dijkstra'), graph, graph.build(parsed), { start });
  checkTrace(dijTrace, `dijkstra ${text}`);
  // Bellman-Ford reference (weights are non-negative here)
  const ref = new Map(parsed.nodes.map((n) => [n, Infinity]));
  ref.set(start, 0);
  for (let k = 0; k < parsed.nodes.length; k++) {
    for (const u of parsed.nodes) for (const { to, w } of g.neighbors(u)) if (ref.get(u) + w < ref.get(to)) ref.set(to, ref.get(u) + w);
  }
  for (const n of parsed.nodes) assert(dijTrace.result.get(n) === ref.get(n), `dijkstra ${text} from ${start}: dist[${n}] ${dijTrace.result.get(n)} vs ${ref.get(n)}`);

  // ---- heaps
  const values = Array.from({ length: AV.randInt(0, 12) }, () => AV.randInt(1, 40));
  const isHeap = (a) => a.every((v, i) => i === 0 || a[Math.floor((i - 1) / 2)] <= v);
  const sortedStr = (a) => JSON.stringify([...a].sort((x, y) => x - y));
  const v = AV.randInt(1, 40);
  {
    const a = alg('heap-push');
    const tr = AV.runAlgorithm(a, heapS, heapS.build(a.prepareInput(values).values), { value: v });
    checkTrace(tr, `heap push ${v} into ${values}`);
    const out = tr.model.arr.values();
    assert(isHeap(out) && sortedStr(out) === sortedStr([...values, v]), `heap push: ${out}`);
  }
  if (values.length) {
    const a = alg('heap-pop');
    const tr = AV.runAlgorithm(a, heapS, heapS.build(a.prepareInput(values).values), {});
    checkTrace(tr, `heap pop ${values}`);
    const out = tr.model.arr.values();
    const rest = [...values].sort((x, y) => x - y);
    assert(tr.result === rest.shift(), `heap pop returned ${tr.result}`);
    assert(isHeap(out) && sortedStr(out) === JSON.stringify(rest), `heap pop remaining ${out}`);
  }
  {
    const tr = AV.runAlgorithm(alg('heapify'), heapS, heapS.build(values), {});
    checkTrace(tr, `heapify ${values}`);
    const out = tr.model.arr.values();
    assert(isHeap(out) && sortedStr(out) === sortedStr(values), `heapify ${values} -> ${out}`);
  }

  // ---- recursive sorts
  for (const id of ['merge-sort', 'quick-sort']) {
    const tr = AV.runAlgorithm(alg(id), arr, arr.build(values), {});
    checkTrace(tr, `${id} ${values}`);
    assert(JSON.stringify(tr.model.arr.values()) === sortedStr(values), `${id} ${values} -> ${tr.model.arr.values()}`);
  }

  // ---- linked lists
  {
    const lv = values.slice(0, 10);
    const tr = AV.runAlgorithm(alg('list-reverse'), listS, listS.build(lv), {});
    checkTrace(tr, `list reverse ${lv}`);
    assert(listS.serialize(tr.model) === [...lv].reverse().join(', '), `reverse ${lv} -> ${listS.serialize(tr.model)}`);
    const snap = tr.steps[tr.steps.length - 1].structure.nodes;
    assert(snap.length === lv.length, 'reverse keeps every node');

    const target = lv.length && Math.random() < 0.8 ? lv[AV.randInt(0, lv.length - 1)] : 99;
    const td = AV.runAlgorithm(alg('list-delete'), listS, listS.build(lv), { value: target });
    checkTrace(td, `list delete ${target} from ${lv}`);
    const expect = [...lv];
    const at = expect.indexOf(target);
    if (at >= 0) expect.splice(at, 1);
    assert(listS.serialize(td.model) === expect.join(', '), `delete ${target} from ${lv} -> ${listS.serialize(td.model)}`);
    assert(td.steps[td.steps.length - 1].structure.nodes.length === expect.length, 'delete: removed node and dummy leave the picture');
  }
}

// ---- recursion + call tree
{
  const fibRef = (n) => (n <= 1 ? n : fibRef(n - 1) + fibRef(n - 2));
  for (let n = 0; n <= 8; n++) {
    const tr = AV.runAlgorithm(alg('fib-naive'), recS, recS.build([]), { n });
    checkTrace(tr, `fib naive ${n}`);
    assert(tr.result === fibRef(n), `fib(${n})`);
    const tree = AV.buildCallTree(tr);
    const expectedCalls = 2 * fibRef(n + 1) - 1;
    assert(tree.calls === expectedCalls, `fib(${n}) call tree has ${tree.calls} calls, expected ${expectedCalls}`);
    assert(tree.nodes.every((x) => x.virtual || x.end !== null), 'every call returned');
    assert(tree.root.label === `fib(${n})` && tree.root.ret === String(fibRef(n)), `call tree root ${tree.root.label} -> ${tree.root.ret}`);
  }
  for (let n = 0; n <= 20; n++) {
    const tr = AV.runAlgorithm(alg('fib-memo'), recS, recS.build([]), { n });
    checkTrace(tr, `fib memo ${n}`);
    assert(tr.result === fibRef(n), `fib memo(${n})`);
    const tree = AV.buildCallTree(tr);
    assert(tree.calls === Math.max(1, 2 * n - 1), `memo fib(${n}) makes ${tree.calls} calls`);
  }
  // Call tree for a BST insert is a simple chain; for merge sort it has merge() leaves.
  const ins = AV.runAlgorithm(alg('bst-insert'), bst, bst.build([10, 5, 15, 3, 7]), { value: 6 });
  const chain = AV.buildCallTree(ins);
  assert(chain.calls === 4 && chain.nodes.every((x) => x.children.length <= 1), `insert call tree is a chain (${chain.calls})`);
  const ms = AV.runAlgorithm(alg('merge-sort'), arr, arr.build([5, 2, 4, 1]), {});
  const mt = AV.buildCallTree(ms);
  assert(mt.root.label === 'merge_sort(arr, 0, 4)', `merge sort root ${mt.root.label}`);
  assert(AV.compactSignature("dfs(graph=graph (6 nodes), node='A', visited=['A'])") === "dfs(graph, 'A', visited)", 'compact dfs');
  assert(AV.compactSignature('insert(root=Node(10), value=7)') === 'insert(Node(10), 7)', 'compact insert');
  assert(mt.nodes.filter((x) => x.fn === 'merge').length === 3, 'merge sort: 3 merges for 4 elements');
}

// Graph parsing errors are friendly.
for (const bad of ['A-A', 'A--B', '', 'A-B:x']) {
  let msg = '';
  try {
    graph.parse(bad);
  } catch (e) {
    msg = e.message;
  }
  assert(msg.length > 0, `graph.parse("${bad}") should fail`);
}

console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
