/* Binary min-heap: push (sift up), pop (sift down), heapify. */
(function () {
  'use strict';
  const AV = window.AV;
  const py = AV.py;

  const asHeap = (values) => ({ values: AV.heapifyValues(values), note: null });

  const SIFT_DOWN_SOURCE = `
      def sift_down(heap, i):                           @@sdef
          n = len(heap)                                 @@sn
          while 2 * i + 1 < n:                          @@swhile
              smallest = 2 * i + 1                      @@sleft
              right = smallest + 1                      @@sright
              if right < n and heap[right] < heap[smallest]:   @@scr
                  smallest = right                      @@ssr
              if heap[i] <= heap[smallest]:             @@sok
                  break                                 @@sbreak
              heap[i], heap[smallest] = heap[smallest], heap[i]   @@sswap
              i = smallest                              @@sdown`;

  /** Traced sift_down shared by pop and heapify (both listings contain the same function). */
  function siftDown(ctx, arr, i0, extraViz = () => ({})) {
    let i = i0;
    const f = ctx.call('sift_down', { heap: arr, i }, 'sdef', `Enter sift_down at index ${i} (value ${py(arr.get(i))}). Push it down until both children are larger.`, {
      viz: Object.assign({ pointers: { i } }, extraViz()),
    });
    const vz = (extra) => Object.assign({ pointers: { i } }, extraViz(), extra);
    const n = f.set('n', arr.length);
    ctx.step(f, 'sn', `The heap has n = ${n} elements.`, { viz: vz() });
    let last = 'sn';
    for (;;) {
      const hasChild = 2 * i + 1 < n;
      ctx.step(f, 'swhile', hasChild ? `Index ${i} has at least one child (${2 * i + 1} < ${n}).` : `Index ${i} is a leaf: nothing below it.`, {
        compare: { expr: '2 * i + 1 < n', evaluated: `${2 * i + 1} < ${n}`, result: hasChild, next: hasChild ? 'keep sifting' : 'stop' },
        viz: vz(),
      });
      last = 'swhile';
      if (!hasChild) break;
      let smallest = f.set('smallest', 2 * i + 1);
      ctx.step(f, 'sleft', `Start by assuming the left child (index ${smallest}, value ${py(arr.get(smallest))}) is the smaller child.`, { viz: vz({ pointers: { i, smallest } }) });
      const right = f.set('right', smallest + 1);
      ctx.step(f, 'sright', `The right child would be at index ${right}.`, { viz: vz({ pointers: { i, smallest, right } }) });
      const inRange = right < n;
      const rightSmaller = inRange && arr.get(right) < arr.get(smallest);
      ctx.step(
        f,
        'scr',
        !inRange ? `There is no right child (${right} >= ${n}).` : rightSmaller ? `The right child ${py(arr.get(right))} is smaller than the left ${py(arr.get(smallest))}.` : `The left child ${py(arr.get(smallest))} is the smaller one.`,
        {
          compare: {
            expr: 'right < n and heap[right] < heap[smallest]',
            evaluated: inRange ? `${right} < ${n} and ${py(arr.get(right))} < ${py(arr.get(smallest))}` : `${right} < ${n}`,
            result: rightSmaller,
          },
          viz: vz({ pointers: { i, smallest, right }, compare: inRange ? [right, smallest] : [smallest] }),
        }
      );
      if (rightSmaller) {
        smallest = f.set('smallest', right);
        ctx.step(f, 'ssr', `smallest = ${right}.`, { viz: vz({ pointers: { i, smallest } }) });
      }
      const ok = arr.get(i) <= arr.get(smallest);
      ctx.step(f, 'sok', ok ? `${py(arr.get(i))} <= ${py(arr.get(smallest))}: the heap property holds here, so stop.` : `${py(arr.get(i))} > ${py(arr.get(smallest))}: the parent is bigger than its smallest child, so swap them.`, {
        compare: { expr: 'heap[i] <= heap[smallest]', evaluated: `${py(arr.get(i))} <= ${py(arr.get(smallest))}`, result: ok, next: ok ? 'stop' : 'swap down' },
        viz: vz({ pointers: { i, smallest }, compare: [i, smallest] }),
      });
      if (ok) {
        ctx.step(f, 'sbreak', 'Break out of the loop.', { viz: vz({ pointers: { i } }) });
        last = 'sbreak';
        break;
      }
      arr.swap(i, smallest);
      ctx.step(f, 'sswap', `Swap indexes ${i} and ${smallest}.`, { viz: vz({ pointers: { i, smallest }, swap: [i, smallest] }) });
      i = f.set('i', smallest);
      ctx.step(f, 'sdown', `Continue from index ${i}.`, { viz: vz() });
      last = 'sdown';
    }
    ctx.ret(f, last, null, 'sift_down is done.', { viz: vz() });
  }

  // ---------------------------------------------------------------- push
  AV.registerAlgorithm({
    id: 'heap-push',
    structure: 'heap',
    name: 'Push (sift up)',
    blurb: 'Append at the end, then swap upward while smaller than the parent.',
    complexity: 'O(log n)',
    summary: (p) => `push(heap, ${py(p.value)})`,
    param: { name: 'value', label: 'Value to push', default: '1', random: () => AV.randInt(1, 60) },
    prepareInput: asHeap,
    source: `
      def push(heap, value):                            @@def
          heap.append(value)                            @@append
          i = len(heap) - 1                             @@i
          while i > 0:                                  @@while
              parent = (i - 1) // 2                     @@parent
              if heap[i] < heap[parent]:                @@cmp
                  heap[i], heap[parent] = heap[parent], heap[i]   @@swap
                  i = parent                            @@up
              else:
                  break                                 @@break

      # caller
      push(heap, value)                                 @@main
    `,
    run(ctx, model, { value }) {
      const arr = model.arr;
      const main = ctx.call('<module>', { heap: arr, value }, 'main', `Start: push ${py(value)} onto the min-heap ${py(arr.values())}.`);
      const f = ctx.call('push', { heap: arr, value }, 'def', 'Enter push().');
      arr.push(value);
      ctx.step(f, 'append', `Append ${py(value)} at the end (index ${arr.length - 1}). It may now be smaller than its parent.`, { viz: { pointers: { i: arr.length - 1 } } });
      let i = f.set('i', arr.length - 1);
      ctx.step(f, 'i', `i = ${i}, the new element's index.`, { viz: { pointers: { i } } });
      let last = 'i';
      for (;;) {
        const up = i > 0;
        ctx.step(f, 'while', up ? `i = ${i} is not the root yet.` : 'i reached the root (index 0).', {
          compare: { expr: 'i > 0', evaluated: `${i} > 0`, result: up, next: up ? 'check parent' : 'stop' },
          viz: { pointers: { i } },
        });
        last = 'while';
        if (!up) break;
        const parent = f.set('parent', Math.floor((i - 1) / 2));
        ctx.step(f, 'parent', `The parent of index ${i} is (${i} - 1) // 2 = ${parent}.`, { viz: { pointers: { i, parent } } });
        const smaller = arr.get(i) < arr.get(parent);
        ctx.step(f, 'cmp', smaller ? `${py(arr.get(i))} < ${py(arr.get(parent))}: the child is smaller, which breaks the min-heap rule.` : `${py(arr.get(i))} >= ${py(arr.get(parent))}: the heap property holds.`, {
          compare: { expr: 'heap[i] < heap[parent]', evaluated: `${py(arr.get(i))} < ${py(arr.get(parent))}`, result: smaller, next: smaller ? 'swap up' : 'stop' },
          viz: { pointers: { i, parent }, compare: [i, parent] },
        });
        if (!smaller) {
          ctx.step(f, 'break', 'Stop: the new value has found its place.', { viz: { pointers: { i } } });
          last = 'break';
          break;
        }
        arr.swap(i, parent);
        ctx.step(f, 'swap', `Swap indexes ${i} and ${parent}.`, { viz: { pointers: { i, parent }, swap: [i, parent] } });
        i = f.set('i', parent);
        ctx.step(f, 'up', `Move up: i = ${i}.`, { viz: { pointers: { i } } });
        last = 'up';
      }
      ctx.ret(f, last, null, 'push() is done.', { viz: { done: true } });
      ctx.step(main, 'main', `Done. The heap is ${py(arr.values())}.`, { viz: { done: true } });
    },
  });

  // ---------------------------------------------------------------- pop
  AV.registerAlgorithm({
    id: 'heap-pop',
    structure: 'heap',
    name: 'Pop min (sift down)',
    blurb: 'Remove the root, move the last element to the top, then swap it downward.',
    complexity: 'O(log n)',
    summary: () => 'pop(heap)',
    prepareInput: asHeap,
    source: `
      def pop(heap):                                    @@def
          top = heap[0]                                 @@top
          last = heap.pop()                             @@last
          if heap:                                      @@if
              heap[0] = last                            @@move
              sift_down(heap, 0)                        @@sift
          return top                                    @@ret
      ${SIFT_DOWN_SOURCE}

      # caller
      top = pop(heap)                                   @@main
    `,
    run(ctx, model) {
      const arr = model.arr;
      if (!arr.length) throw new Error('IndexError: pop from an empty heap');
      const main = ctx.call('<module>', { heap: arr }, 'main', `Start: remove the smallest value from ${py(arr.values())}.`);
      const f = ctx.call('pop', { heap: arr }, 'def', 'Enter pop(). In a min-heap the smallest value is always at index 0.');
      const top = f.set('top', arr.get(0));
      ctx.step(f, 'top', `top = ${py(top)} (the root) is the value we will return.`, { viz: { pointers: { top: 0 } } });
      const lastItem = arr.popItem();
      f.set('last', lastItem.value);
      ctx.step(f, 'last', `Remove the last element (${py(lastItem.value)}). It will fill the hole at the root.`, { viz: { held: { id: lastItem.id, value: lastItem.value, name: 'last' } } });
      const nonEmpty = arr.length > 0;
      ctx.step(f, 'if', nonEmpty ? 'The heap still has elements.' : 'The heap is now empty, nothing to fix.', {
        compare: { expr: 'heap', evaluated: py(arr.values()), result: nonEmpty },
        viz: { held: { id: lastItem.id, value: lastItem.value, name: 'last' } },
      });
      if (nonEmpty) {
        arr.setItem(0, lastItem);
        ctx.step(f, 'move', `Put ${py(lastItem.value)} at the root, replacing ${py(top)}. It is probably too big for this spot.`, { viz: { pointers: { i: 0 }, popped: top } });
        ctx.step(f, 'sift', 'Call sift_down from the root to restore the heap property.', { viz: { pointers: { i: 0 }, popped: top } });
        siftDown(ctx, arr, 0, () => ({ popped: top }));
      }
      ctx.ret(f, 'ret', top, `Return ${py(top)}, the minimum.`, { viz: { popped: top, done: true } });
      main.set('top', top);
      ctx.step(main, 'main', `Done. Popped ${py(top)}; the heap is ${py(arr.values())}.`, { viz: { popped: top, done: true } });
      return top;
    },
  });

  // ---------------------------------------------------------------- heapify
  AV.registerAlgorithm({
    id: 'heapify',
    structure: 'heap',
    name: 'Heapify (build heap)',
    blurb: 'Turn any array into a heap by sifting down every parent, from the last one back to the root.',
    complexity: 'O(n)',
    summary: () => 'heapify(heap)',
    source: `
      def heapify(heap):                                @@def
          for i in range(len(heap) // 2 - 1, -1, -1):   @@for
              sift_down(heap, i)                        @@call
      ${SIFT_DOWN_SOURCE}

      # caller
      heapify(heap)                                     @@main
    `,
    run(ctx, model) {
      const arr = model.arr;
      const main = ctx.call('<module>', { heap: arr }, 'main', `Start: build a min-heap from ${py(arr.values())}.`);
      const f = ctx.call('heapify', { heap: arr }, 'def', 'Enter heapify(). Leaves are already heaps, so start at the last parent and work backwards.');
      for (let i = Math.floor(arr.length / 2) - 1; ; i--) {
        if (i < 0) {
          ctx.step(f, 'for', 'Every parent has been sifted down. The whole array is a heap.', { viz: {} });
          break;
        }
        f.set('i', i);
        ctx.step(f, 'for', `i = ${i}: fix the subtree rooted at index ${i} (value ${py(arr.get(i))}).`, { viz: { pointers: { i } } });
        ctx.step(f, 'call', `sift_down(heap, ${i}).`, { viz: { pointers: { i } } });
        siftDown(ctx, arr, i);
      }
      ctx.ret(f, 'for', null, 'heapify() is done.', { viz: { done: true } });
      ctx.step(main, 'main', `Done. The array is now a valid min-heap: ${py(arr.values())}.`, { viz: { done: true } });
    },
  });
})();
