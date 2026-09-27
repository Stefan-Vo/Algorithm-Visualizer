# Algorithm Visualizer

Step through real algorithm executions. The source line, program state and
picture always describe the same moment of the same run.

- `index.html`: the home page, with a live demo running on the real engine and
  an algorithm catalog generated from the registry
- `app.html`: the visualizer. Deep links work: `app.html?algo=dijkstra`,
  `app.html?algo=custom&example=bfs`

Open either file directly, or serve the folder (`python -m http.server`).
There are no dependencies and no build step.

Tests: `node tests/engine.test.js` and `node tests/python-tracer.test.js` (needs `python` on PATH)

## Architecture

```
Algorithm (source + instrumented run)
      │  executes for real on a real data structure,
      │  reporting to the tracer as it goes
      ▼
Tracer (src/engine/tracer.js) ──► Trace = Step[]
      │
Player (index · play/pause · speed)
      │
      ├─► CodePanel   current line ▶, paused caller lines ↳ / ×n
      ├─► StatePanel  explanation, evaluation, variables, return value, call stack, comparison log
      ├─► View        tree / array / graph / heap / list / objects … renders step.structure + step.viz
      └─► CallTree    recursion tree built from the CALL/RETURN steps (a tab next to the view)
```

The call tree needs nothing from the algorithm. Each CALL step opens a node
under the frame that made it, and its RETURN step closes the node with the
returned value. That is why it also works for pasted Python code.

### A Step

| field | meaning |
|---|---|
| `kind` | `call`, `line` or `return`, the same events as Python's `sys.settrace` |
| `line` | 1-based line in the displayed source |
| `description` | plain-English explanation written with the actual runtime values |
| `stack[]` | every frame: `fn`, call signature, the line it is on, and formatted locals (`{name, text, ref}`) |
| `compare` | `{expr, evaluated, result, next}`, e.g. `value < root.value` → `7 < 10` → `True` → `go left` |
| `returnValue` | formatted value when `kind === 'return'` |
| `structure` | snapshot of the real data structure at this moment |
| `viz` | view hints (current node, visited path, next edge, empty slot …) |

A step shows the state *after* the highlighted line runs. A line containing a
call gets two steps: one before the call and one after its result is used. For
example, `root.left = insert(...)` appears once as the call is made and once
when the returned subtree is assigned. `else:` lines never get a step,
matching Python.

Because the whole trace is recorded up front, Previous, scrubbing and
"jump to comparison" are exact. Nothing is simulated in reverse.

### Why the picture can't drift from the code

The algorithm is ordinary recursive code that mutates real `TreeNode`s. Every
snapshot is taken from those nodes, and every pointer tag (`root`, `node`,
`successor`) comes from the live frame's locals. `tests/engine.test.js` runs
thousands of random inputs and checks the results against reference
implementations. It also checks trace invariants: call/return balance, depth
changes of exactly ±1, and steps landing only on executable lines.

## Adding an algorithm

1. **Structure** (skip if it already exists): `AV.registerStructure({ id, name, view, parse, build, snapshot, formatValue, serialize?, random? })`
2. **View** (skip if it already exists): `AV.registerView({ id, create(container) → { prepare(trace), render(step, {duration}), setHover(id), destroy() } })`
3. **Algorithm**:

```js
AV.registerAlgorithm({
  id: 'linear-search', structure: 'array', name: 'Linear Search',
  param: { name: 'target', label: 'Target', default: '9' },
  source: `
    def linear_search(arr, target):        @@def
        for i in range(len(arr)):          @@for
            if arr[i] == target:           @@cmp
                return i                   @@found
        return -1                          @@none
  `,
  run(ctx, model, { target }) {
    const arr = model.arr;
    const f = ctx.call('linear_search', { arr, target }, 'def', `Search for ${target}.`);
    for (let i = 0; i < arr.length; i++) {
      f.set('i', i);
      ctx.step(f, 'for', `i = ${i}`, { viz: { pointers: { i } } });
      const eq = arr.get(i) === target;
      ctx.step(f, 'cmp', `Compare arr[${i}] with ${target}`, {
        compare: { expr: 'arr[i] == target', evaluated: `${arr.get(i)} == ${target}`, result: eq },
        viz: { pointers: { i }, compare: [i] },
      });
      if (eq) return ctx.ret(f, 'found', i, `Found at index ${i}.`, { viz: { found: i } });
    }
    return ctx.ret(f, 'none', -1, 'Not found.');
  },
});
```

Then add the `<script>` tag to `app.html` (and to `index.html` if it should
appear in the home page catalog). Optional fields: `blurb` and `complexity`
(shown in the catalog), `defaultData`, `prepareInput(values)` (e.g. heapify
the input or reject bad data), and `param.parse(text, data)` / `param.random(data)`. `@@label` markers are stripped
from the displayed code, and the engine rejects unknown or duplicate labels.
`ctx.persist` holds viz hints that last across steps (such as the visited path);
the `viz` passed with a step applies to that step only.

## Your own code (Python)

Choose **Algorithm → Paste your own (Python)**, then paste or type any Python
program, including its own driver code, and press **Run** (or Ctrl+Enter).
Your code is saved in the browser.

How it works (`src/python/`):

1. On first use the page loads [Pyodide](https://pyodide.org), which is real
   CPython compiled to WebAssembly (about 10 MB, then cached by the browser).
2. `tracer-py.js` runs your program under `sys.settrace`. Every call, line,
   return and exception in your code becomes a step. Each step holds the user
   call stack with formatted locals, a snapshot of every object reachable from
   those locals, and the output printed so far.
3. `if` / `elif` / `while` conditions are shown with their live values, e.g.
   `j >= 0 and arr[j] > key` → `0 >= 0 and 29 > 10` → `True`. A condition is
   re-evaluated only when it is side-effect free (comparisons, attribute and
   index access, `len`...), and short-circuiting is respected. Conditions
   that call your own functions are resolved from the branch that actually
   ran.
4. `python-runner.js` converts that into the same Step format the built-in
   algorithms use, so the player, code panel and state panel work unchanged.
5. `heap-view.js` draws whatever it finds, detected by shape:

| shape | drawn as |
|---|---|
| objects with `.left` and `.right` | binary tree(s) |
| objects with `.next` | linked list(s) |
| lists, tuples, sets, deques in variables | arrays; ints named `i`, `j`, `lo`, `hi`, `mid`… become index pointers |
| list of lists | grid, with the `(i, j)` cell highlighted |
| dicts | key → value row |

For your code, a step shows the state *before* the highlighted line runs,
like a debugger. Runs stop after 3000 steps, so infinite loops are safe;
`input()` returns an empty string.

## Included

| Structure | Algorithms | View |
|---|---|---|
| Binary Search Tree | insert, search, delete (with in-order successor) | tree with value probe, empty-slot ghost, pointer tags |
| Array | binary search, bubble sort, merge sort, quicksort | cells that move by identity; merge sort's `left`/`right` temporaries |
| Graph (`A-B:4, B->C`) | BFS, DFS (recursive), Dijkstra | force-directed layout, frontier, discovery / shortest-path tree, queue / stack / pq chips |
| Binary heap | push (sift up), pop (sift down), heapify | tree and backing array animate together |
| Linked list | reverse, delete value | nodes keep their column, so re-pointed `.next` arrows are visible |
| Recursion | Fibonacci naive vs memoized | the call tree is the main picture |

## Controls

`←` / `→` step · `Space` play/pause · `Home` reset · `End` jump to the last step ·
`C` toggle the call tree. Click a node in the call tree to jump to that call.
Click a comparison in the log to jump to it. Hover a `Node(…)` value to
highlight that node. **Keep result** turns the final tree into the next input,
so you can chain operations.
