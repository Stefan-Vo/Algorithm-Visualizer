/*
 * Runs the in-browser Python tracer under the local CPython (same tracer source
 * that Pyodide executes) against every example plus edge cases.
 * Run: node tests/python-tracer.test.js   (needs `python` on PATH)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of [
  'src/engine/core.js',
  'src/views/animate.js',
  'src/views/tree-view.js',
  'src/views/heap-view.js',
  'src/python/tracer-py.js',
  'src/python/examples.js',
  'src/python/python-runner.js',
]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
}
const AV = sandbox.AV;

function trace(code, maxSteps = 3000) {
  const driver = AV.PY_TRACER_SOURCE + '\nimport sys, json\n_req = json.loads(sys.stdin.read())\nsys.__stdout__.write(run_json(_req["code"], _req["max"]))\n';
  const r = spawnSync('python', ['-c', driver], { input: JSON.stringify({ code, max: maxSteps }), encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}

let failures = 0;
let checks = 0;
const assert = (cond, msg) => {
  checks++;
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  }
};

function invariants(res, label) {
  const lines = null;
  res.steps.forEach((s, i) => {
    assert(['call', 'line', 'return', 'exception'].includes(s.kind), `${label}: kind ${s.kind}`);
    assert(s.line >= 1, `${label}: step ${i} line ${s.line}`);
    assert(s.stack.length >= 1 && s.stack[s.stack.length - 1].line === s.line, `${label}: top frame line`);
    assert(typeof s.desc === 'string' && s.desc.length > 0, `${label}: description`);
    for (const f of s.stack) for (const v of f.vars) if (v.ref) assert(v.ref in s.heap, `${label}: dangling ref ${v.name}`);
    if (s.compare) assert(typeof s.compare.result === 'boolean', `${label}: compare`);
  });
  void lines;
}

for (const ex of AV.pythonExamples) {
  const res = trace(ex.code);
  assert(!res.error, `${ex.name}: error ${JSON.stringify(res.error)}`);
  assert(!res.truncated, `${ex.name}: truncated`);
  invariants(res, ex.name);
  const cmps = res.steps.filter((s) => s.compare).length;
  console.log(`${ex.name.padEnd(22)} ${String(res.steps.length).padStart(4)} steps, ${String(cmps).padStart(3)} evaluated conditions, output: ${JSON.stringify(res.output.trim())}`);
}

// Structure detection on the final step of each example (what the heap view draws).
{
  const expect = {
    bst: (m) => m.nodes.filter((n) => n.kind === 'tree').length === 5 && m.edges.length === 4,
    'linked-list': (m) => m.nodes.filter((n) => n.kind === 'list').length === 4 && m.edges.length === 3,
    'insertion-sort': (m) => m.cells.map((c) => c.text).join(',') === '10,13,14,29,37',
    'binary-search': (m) => m.cells.length === 9,
    'fib-memo': (m) => m.cells.length === 5, // memo {2..6}
    'grid-dp': (m) => m.cells.length === 0 || m.cells.length === 12,
    bfs: (m) => m.cells.length >= 6,
  };
  for (const ex of AV.pythonExamples) {
    const t = AV.buildPythonTrace(ex.code, trace(ex.code));
    const models = t.steps.map((s) => AV.analyzeHeap(s)); // must not throw on any step
    const last = models[models.length - 1];
    assert(!expect[ex.id] || expect[ex.id](last), `${ex.name}: detection on final step: nodes=${last.nodes.length} edges=${last.edges.length} cells=${last.cells.map((c) => c.text)}`);
    assert(models.some((m) => m.nodes.length + m.cells.length > 0), `${ex.name}: nothing drawn`);
  }
  // Grid: a mid-run step of the DP example draws the 3x4 matrix with the (i, j) cell highlighted.
  const g = AV.buildPythonTrace(AV.pythonExamples.find((e) => e.id === 'grid-dp').code, trace(AV.pythonExamples.find((e) => e.id === 'grid-dp').code));
  const mid = g.steps.map((s) => AV.analyzeHeap(s)).find((m) => m.cells.length === 12 && m.cells.some((c) => c.current));
  assert(!!mid, 'grid-dp: matrix with current cell');
  // Linked list reversal: pointer tags for prev/curr appear on list nodes mid-run.
  const ll = AV.buildPythonTrace(AV.pythonExamples[1].code, trace(AV.pythonExamples[1].code));
  const tagged = ll.steps.map((s) => AV.analyzeHeap(s)).find((m) => [...m.tags.values()].flat().includes('curr') && [...m.tags.values()].flat().includes('prev'));
  assert(!!tagged, 'linked list: prev/curr tags');
}

// BST example: the condition on "if value < root.value" is shown with live values, and the returned new Node is in the heap.
{
  const res = trace(AV.pythonExamples[0].code);
  const c = res.steps.find((s) => s.compare && s.compare.expr === 'value < root.value');
  assert(c && c.compare.evaluated === '5 < 10' && c.compare.result === true, `bst compare: ${c && JSON.stringify(c.compare)}`);
  const ret = res.steps.find((s) => s.kind === 'return' && s.stack[s.stack.length - 1].fn === 'insert' && s.ret && s.ret.ref);
  assert(ret && ret.heap[ret.ret.ref] && ret.heap[ret.ret.ref].cls === 'Node', 'returned Node is in heap');
  const last = res.steps[res.steps.length - 1];
  const rootVar = last.stack[0].vars.find((v) => v.name === 'root');
  assert(rootVar && rootVar.text === 'Node(10)', `final root ${rootVar && rootVar.text}`);
}

// Compound conditions show live values per operand and respect short-circuiting.
{
  const res = trace(AV.pythonExamples.find((e) => e.id === 'insertion-sort').code);
  const evs = res.steps.filter((s) => s.compare && s.compare.expr === 'j >= 0 and arr[j] > key').map((s) => s.compare.evaluated);
  assert(evs.includes('0 >= 0 and 29 > 10'), `and-condition values: ${evs}`);
  assert(evs.includes('-1 >= 0'), `short-circuit stops before arr[-1]: ${evs}`);
  const grid = trace(AV.pythonExamples.find((e) => e.id === 'grid-dp').code);
  const g = grid.steps.filter((s) => s.compare && s.compare.expr === 'i == 0 or j == 0').map((s) => `${s.compare.evaluated}=${s.compare.result}`);
  assert(g.includes('0 == 0=true') && g.includes('1 == 0 or 1 == 0=false'), `or-condition values: ${g}`);
  const neg = trace('xs = [1]\nwhile not (len(xs) > 2):\n    xs.append(0)\n');
  const n = neg.steps.filter((s) => s.compare).map((s) => s.compare.evaluated);
  assert(n[0] === 'not (1 > 2)', `not-condition: ${n}`);
}

// Impure condition (calls a user function) is resolved from the branch actually taken.
{
  const res = trace('def big(x):\n    return x > 3\n\nfor n in [1, 5]:\n    if big(n):\n        print("big", n)\n');
  const conds = res.steps.filter((s) => s.compare && s.compare.expr === 'big(n)').map((s) => s.compare.result);
  assert(JSON.stringify(conds) === '[false,true]', `impure condition results ${JSON.stringify(conds)}`);
  assert(res.output === 'big 5\n', 'impure output');
}

// Errors, infinite loops, syntax errors.
{
  const res = trace('x = [1, 2]\ny = x[5]\n');
  assert(res.error && res.error.type === 'IndexError' && res.error.line === 2, `runtime error ${JSON.stringify(res.error)}`);
  assert(res.steps.some((s) => s.kind === 'exception'), 'exception step recorded');

  const loop = trace('i = 0\nwhile True:\n    i += 1\n', 500);
  assert(loop.truncated && loop.steps.length === 500, 'step limit');

  const syn = trace('def f(:\n  pass\n');
  assert(syn.error && syn.error.type === 'SyntaxError' && syn.error.line === 1, 'syntax error');

  const inp = trace('name = input("? ")\nprint("hi", name)\n');
  assert(!inp.error && inp.output === 'hi \n', 'input() is stubbed');
}

console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
