/* BFS, DFS (recursive) and Dijkstra on the graph structure. */
(function () {
  'use strict';
  const AV = window.AV;
  const py = AV.py;

  const startParam = {
    name: 'start',
    label: 'Start node',
    default: 'A',
    parse(text, parsed) {
      const n = AV.parseName(text, 'Start node');
      if (!parsed.nodes.includes(n)) throw new Error(`Start node "${n}" is not in the graph (nodes: ${parsed.nodes.join(', ')}).`);
      return n;
    },
    random: (parsed) => parsed.nodes[AV.randInt(0, parsed.nodes.length - 1)],
  };

  // ---------------------------------------------------------------- BFS
  AV.registerAlgorithm({
    id: 'bfs',
    structure: 'graph',
    name: 'Breadth-First Search',
    blurb: 'Explore level by level with a queue. The first time BFS reaches a node is along a fewest-edges path.',
    complexity: 'O(V + E)',
    summary: (p) => `bfs(graph, ${py(p.start)})`,
    param: startParam,
    source: `
      from collections import deque

      def bfs(graph, start):                            @@def
          visited = {start}                             @@vis
          queue = deque([start])                        @@q
          order = []                                    @@order
          while queue:                                  @@while
              node = queue.popleft()                    @@pop
              order.append(node)                        @@append
              for nb in graph[node]:                    @@for
                  if nb not in visited:                 @@check
                      visited.add(nb)                   @@add
                      queue.append(nb)                  @@push
          return order                                  @@ret

      # caller
      order = bfs(graph, start)                         @@main
    `,
    run(ctx, g, { start }) {
      const main = ctx.call('<module>', { graph: g, start }, 'main', `Start: breadth-first search of the graph from ${start}.`);
      const f = ctx.call('bfs', { graph: g, start }, 'def', `Enter bfs(). BFS visits nodes in order of distance (in edges) from ${start}.`);
      const visited = f.set('visited', new Set([start]));
      const tree = [];
      let node = null;
      let queue;
      let order;
      const vz = (extra) =>
        Object.assign(
          {
            current: node,
            visited: order ? order.slice() : [],
            frontier: queue ? queue.slice() : [start],
            tree: tree.slice(),
            dist: Object.fromEntries((order || []).map((n, i) => [n, `#${i + 1}`])),
            seq: { label: 'queue', items: (queue || []).map(String), front: true },
          },
          extra
        );
      ctx.step(f, 'vis', `Mark ${start} as discovered: visited = {${py(start)}}.`, { viz: vz() });
      queue = f.set('queue', AV.deque([start]));
      ctx.step(f, 'q', `Put ${start} in the queue. The queue decides the order nodes are processed in: first in, first out.`, { viz: vz() });
      order = f.set('order', []);
      ctx.step(f, 'order', '`order` will record the sequence in which nodes are processed.', { viz: vz() });

      for (;;) {
        const nonEmpty = queue.length > 0;
        ctx.step(f, 'while', nonEmpty ? `The queue has ${queue.length} node${queue.length > 1 ? 's' : ''} waiting, so keep going.` : 'The queue is empty: every reachable node has been processed.', {
          compare: { expr: 'queue', evaluated: py(queue), result: nonEmpty, next: nonEmpty ? 'loop' : 'exit loop' },
          viz: vz(),
        });
        if (!nonEmpty) break;
        node = f.set('node', queue.shift());
        ctx.step(f, 'pop', `Take ${node} from the front of the queue.`, { viz: vz() });
        order.push(node);
        ctx.step(f, 'append', `Process ${node}: it is number ${order.length} in the BFS order.`, { viz: vz() });
        for (const { to: nb } of g.neighbors(node)) {
          f.set('nb', nb);
          ctx.step(f, 'for', `Look at neighbour ${nb} of ${node}.`, { viz: vz({ edge: { from: node, to: nb, state: 'check' } }) });
          const fresh = !visited.has(nb);
          ctx.step(f, 'check', fresh ? `${nb} has not been discovered yet.` : `${nb} was already discovered, so skip it.`, {
            compare: { expr: 'nb not in visited', evaluated: `${py(nb)} not in ${py(visited)}`, result: fresh, next: fresh ? 'discover it' : 'skip' },
            viz: vz({ edge: { from: node, to: nb, state: fresh ? 'check' : 'skip' } }),
          });
          if (fresh) {
            visited.add(nb);
            tree.push([node, nb]);
            ctx.step(f, 'add', `Mark ${nb} as discovered (reached from ${node}).`, { viz: vz({ edge: { from: node, to: nb, state: 'relax' } }) });
            queue.push(nb);
            ctx.step(f, 'push', `Add ${nb} to the back of the queue.`, { viz: vz() });
          }
        }
        ctx.step(f, 'for', `All neighbours of ${node} have been checked.`, { viz: vz() });
      }
      node = null;
      ctx.ret(f, 'ret', order, `Return the BFS order: ${py(order)}.`, { viz: vz() });
      main.set('order', order);
      ctx.step(main, 'main', `Done. Nodes in BFS order: ${order.join(' → ')}.`, { viz: vz() });
      return order;
    },
  });

  // ---------------------------------------------------------------- DFS
  AV.registerAlgorithm({
    id: 'dfs',
    structure: 'graph',
    name: 'Depth-First Search',
    blurb: 'Go as deep as possible before backtracking. The call stack acts as the stack, which the call tree makes visible.',
    complexity: 'O(V + E)',
    summary: (p) => `dfs(graph, ${py(p.start)}, visited)`,
    param: startParam,
    source: `
      def dfs(graph, node, visited):                    @@def
          visited.append(node)                          @@visit
          for nb in graph[node]:                        @@for
              if nb not in visited:                     @@check
                  dfs(graph, nb, visited)               @@rec

      # caller
      visited = []                                      @@init
      dfs(graph, start, visited)                        @@main
    `,
    run(ctx, g, { start }) {
      const visited = [];
      const tree = [];
      const path = [];
      const vz = (extra) =>
        Object.assign(
          {
            current: path[path.length - 1] || null,
            visited: visited.slice(),
            frontier: path.slice(0, -1),
            tree: tree.slice(),
            dist: Object.fromEntries(visited.map((n, i) => [n, `#${i + 1}`])),
            seq: { label: 'recursion path', items: path.slice() },
          },
          extra
        );
      const main = ctx.call('<module>', { graph: g, start }, 'init', `Start: depth-first search from ${start}.`, { viz: vz() });
      main.set('visited', visited);
      ctx.step(main, 'init', 'visited = []: records nodes in the order DFS reaches them.', { viz: vz() });
      ctx.step(main, 'main', `Call dfs on ${start}.`, { viz: vz() });

      function dfs(node) {
        path.push(node);
        const f = ctx.call('dfs', { graph: g, node, visited }, 'def', `Enter dfs(${node}). Recursion depth is now ${path.length}.`, { viz: vz() });
        visited.push(node);
        ctx.step(f, 'visit', `Visit ${node}: it is number ${visited.length} in DFS order.`, { viz: vz() });
        let last = 'visit';
        for (const { to: nb } of g.neighbors(node)) {
          f.set('nb', nb);
          ctx.step(f, 'for', `Look at neighbour ${nb} of ${node}.`, { viz: vz({ edge: { from: node, to: nb, state: 'check' } }) });
          const fresh = !visited.includes(nb);
          ctx.step(f, 'check', fresh ? `${nb} is unvisited, so go deeper into it right away.` : `${nb} is already visited. Skip it.`, {
            compare: { expr: 'nb not in visited', evaluated: `${py(nb)} not in ${py(visited)}`, result: fresh, next: fresh ? 'recurse' : 'skip' },
            viz: vz({ edge: { from: node, to: nb, state: fresh ? 'check' : 'skip' } }),
          });
          if (fresh) {
            tree.push([node, nb]);
            ctx.step(f, 'rec', `Recursive call dfs(${nb}). dfs(${node}) is paused here until it returns.`, { viz: vz({ edge: { from: node, to: nb, state: 'relax' } }) });
            dfs(nb);
          }
          last = 'for';
        }
        ctx.step(f, 'for', `No more neighbours of ${node}. Backtrack.`, { viz: vz() });
        void last;
        ctx.ret(f, 'for', null, `dfs(${node}) is finished. Return to the caller${path.length > 1 ? `, dfs(${path[path.length - 2]})` : ''}.`, { viz: vz() });
        path.pop();
      }
      dfs(start);
      ctx.step(main, 'main', `Done. DFS order: ${visited.join(' → ')}.`, { viz: vz() });
      return visited;
    },
  });

  // ---------------------------------------------------------------- Dijkstra
  const lt = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]);
  // heapq's exact algorithms, so the pq list matches what Python would hold.
  function siftdown(heap, startpos, pos) {
    const item = heap[pos];
    while (pos > startpos) {
      const parentpos = (pos - 1) >> 1;
      if (lt(item, heap[parentpos])) {
        heap[pos] = heap[parentpos];
        pos = parentpos;
        continue;
      }
      break;
    }
    heap[pos] = item;
  }
  function siftup(heap, pos) {
    const endpos = heap.length;
    const startpos = pos;
    const item = heap[pos];
    let child = 2 * pos + 1;
    while (child < endpos) {
      const right = child + 1;
      if (right < endpos && !lt(heap[child], heap[right])) child = right;
      heap[pos] = heap[child];
      pos = child;
      child = 2 * pos + 1;
    }
    heap[pos] = item;
    siftdown(heap, startpos, pos);
  }
  const heappush = (heap, item) => {
    heap.push(item);
    siftdown(heap, 0, heap.length - 1);
  };
  const heappop = (heap) => {
    const last = heap.pop();
    if (!heap.length) return last;
    const top = heap[0];
    heap[0] = last;
    siftup(heap, 0);
    return top;
  };

  AV.registerAlgorithm({
    id: 'dijkstra',
    structure: 'graph',
    name: "Dijkstra's Shortest Paths",
    blurb: 'Always settle the closest unsettled node next, using a priority queue. Weights must be non-negative.',
    complexity: 'O((V + E) log V)',
    defaultData: 'A-B:4, A-C:2, B-C:1, B-D:5, C-D:8, C-E:10, D-E:2, D-F:6, E-F:3',
    summary: (p) => `dijkstra(graph, ${py(p.start)})`,
    param: startParam,
    prepareInput(parsed) {
      const neg = parsed.edges.find((e) => e.w < 0);
      if (neg) throw new Error(`Dijkstra needs non-negative weights (${neg.from}-${neg.to} has ${neg.w}).`);
      return { values: parsed, note: parsed.edges.some((e) => e.hasWeight) ? null : 'No weights given, so every edge counts as 1.' };
    },
    source: `
      import heapq

      def dijkstra(graph, start):                            @@def
          dist = {node: inf for node in graph}               @@init
          dist[start] = 0                                    @@zero
          pq = [(0, start)]                                  @@pq
          while pq:                                          @@while
              d, node = heapq.heappop(pq)                    @@pop
              if d > dist[node]:                             @@stale
                  continue                                   @@cont
              for nb, w in graph[node]:                      @@for
                  nd = d + w                                 @@nd
                  if nd < dist[nb]:                          @@better
                      dist[nb] = nd                          @@relax
                      heapq.heappush(pq, (nd, nb))           @@push
          return dist                                        @@ret

      # caller
      dist = dijkstra(graph, start)                          @@main
    `,
    run(ctx, g, { start }) {
      const main = ctx.call('<module>', { graph: g, start }, 'main', `Start: shortest distances from ${start}.`);
      const f = ctx.call('dijkstra', { graph: g, start }, 'def', `Enter dijkstra(). Settle nodes in order of their distance from ${start}.`);
      const dist = new Map();
      const settled = [];
      const parent = new Map();
      let pq = [];
      let node = null;
      const fmt = (x) => (x === Infinity ? '∞' : String(x));
      const vz = (extra) =>
        Object.assign(
          {
            current: node,
            visited: settled.slice(),
            frontier: [...new Set(pq.map((t) => t[1]))].filter((n) => !settled.includes(n)),
            tree: [...parent].map(([c, p]) => [p, c]),
            dist: Object.fromEntries([...dist].map(([n, d]) => [n, fmt(d)])),
            seq: { label: 'pq', items: pq.map((t) => `(${t[0]}, ${t[1]})`) },
          },
          extra
        );

      for (const n of g.nodes) dist.set(n, Infinity);
      f.set('dist', dist);
      ctx.step(f, 'init', 'Every distance starts at infinity (∞): nothing has been reached yet.', { viz: vz() });
      dist.set(start, 0);
      ctx.step(f, 'zero', `The start ${start} is at distance 0 from itself.`, { viz: vz() });
      pq = f.set('pq', [AV.tuple(0, start)]);
      ctx.step(f, 'pq', `The priority queue holds (distance, node) pairs and always pops the smallest distance first.`, { viz: vz() });

      for (;;) {
        const nonEmpty = pq.length > 0;
        ctx.step(f, 'while', nonEmpty ? `${pq.length} entr${pq.length > 1 ? 'ies' : 'y'} in the priority queue.` : 'The priority queue is empty. All reachable distances are final.', {
          compare: { expr: 'pq', evaluated: py(pq), result: nonEmpty, next: nonEmpty ? 'loop' : 'exit loop' },
          viz: vz(),
        });
        if (!nonEmpty) break;
        const [d, n] = heappop(pq);
        node = n;
        f.set('d', d);
        f.set('node', n);
        ctx.step(f, 'pop', `Pop the closest entry: (${d}, ${n}).`, { viz: vz() });
        const stale = d > dist.get(n);
        ctx.step(f, 'stale', stale ? `${d} > dist[${n}] = ${dist.get(n)}: this entry is out of date (a shorter path was already found).` : `${d} is ${n}'s best known distance, so ${n} is now settled.`, {
          compare: { expr: 'd > dist[node]', evaluated: `${d} > ${fmt(dist.get(n))}`, result: stale, next: stale ? 'skip (continue)' : 'settle and relax edges' },
          viz: vz(),
        });
        if (stale) {
          ctx.step(f, 'cont', `Skip the stale entry for ${n}.`, { viz: vz() });
          continue;
        }
        if (!settled.includes(n)) settled.push(n);
        for (const { to: nb, w } of g.neighbors(n)) {
          f.set('nb', nb);
          f.set('w', w);
          ctx.step(f, 'for', `Edge ${n} → ${nb} with weight ${w}.`, { viz: vz({ edge: { from: n, to: nb, state: 'check' } }) });
          const nd = f.set('nd', d + w);
          ctx.step(f, 'nd', `Going through ${n} would reach ${nb} at distance ${d} + ${w} = ${nd}.`, { viz: vz({ edge: { from: n, to: nb, state: 'check' } }) });
          const better = nd < dist.get(nb);
          ctx.step(f, 'better', better ? `${nd} beats the current dist[${nb}] = ${fmt(dist.get(nb))}.` : `${nd} is not better than dist[${nb}] = ${fmt(dist.get(nb))}.`, {
            compare: { expr: 'nd < dist[nb]', evaluated: `${nd} < ${fmt(dist.get(nb))}`, result: better, next: better ? 'relax' : 'keep old distance' },
            viz: vz({ edge: { from: n, to: nb, state: better ? 'check' : 'skip' } }),
          });
          if (better) {
            dist.set(nb, nd);
            parent.set(nb, n);
            ctx.step(f, 'relax', `Relax: dist[${nb}] = ${nd}, reached via ${n}.`, { viz: vz({ edge: { from: n, to: nb, state: 'relax' } }) });
            heappush(pq, AV.tuple(nd, nb));
            ctx.step(f, 'push', `Push (${nd}, ${nb}) onto the priority queue.`, { viz: vz() });
          }
        }
        ctx.step(f, 'for', `All edges out of ${n} have been relaxed.`, { viz: vz() });
      }
      node = null;
      ctx.ret(f, 'ret', dist, 'Return the final distances.', { viz: vz() });
      main.set('dist', dist);
      ctx.step(main, 'main', `Done. Shortest distances: ${[...dist].map(([n, d]) => `${n}=${fmt(d)}`).join(', ')}. Highlighted edges form the shortest-path tree.`, { viz: vz() });
      return dist;
    },
  });
})();
