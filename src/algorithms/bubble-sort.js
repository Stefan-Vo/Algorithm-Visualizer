(function () {
  'use strict';
  const AV = window.AV;
  const py = AV.py;

  AV.registerAlgorithm({
    id: 'bubble-sort',
    structure: 'array',
    name: 'Bubble Sort',
    blurb: 'Swap neighbours that are out of order; each pass bubbles the largest value to the end.',
    complexity: 'O(n²)',
    summary: () => 'bubble_sort(arr)',
    source: `
      def bubble_sort(arr):                             @@def
          n = len(arr)                                  @@n
          for i in range(n - 1):                        @@fori
              swapped = False                           @@sw0
              for j in range(n - 1 - i):                @@forj
                  if arr[j] > arr[j + 1]:               @@cmp
                      arr[j], arr[j + 1] = arr[j + 1], arr[j]   @@swap
                      swapped = True                    @@sw1
              if not swapped:                           @@check
                  break                                 @@break
          return arr                                    @@ret

      # caller
      bubble_sort(arr)                                  @@main
    `,

    run(ctx, model) {
      const arr = model.arr;
      const persist = ctx.persist;
      const main = ctx.call('<module>', { arr }, 'main', `Start: sort ${arr.length} numbers in ascending order.`);
      const f = ctx.call('bubble_sort', { arr }, 'def', 'Enter bubble_sort(). Each pass bubbles the largest remaining value to the end.');

      const n = f.set('n', arr.length);
      ctx.step(f, 'n', `n = ${n}.`);

      for (let i = 0; ; i++) {
        if (!(i < n - 1)) {
          ctx.step(f, 'fori', `range(${n - 1}) is exhausted. All passes are done.`);
          break;
        }
        f.set('i', i);
        ctx.step(f, 'fori', `Pass ${i + 1}: i = ${i}. Positions ${n - i}..${n - 1} are already in their final place.`);
        let swapped = f.set('swapped', false);
        ctx.step(f, 'sw0', 'swapped = False. No swaps yet in this pass.');

        for (let j = 0; ; j++) {
          if (!(j < n - 1 - i)) {
            persist.sortedFrom = n - 1 - i;
            ctx.step(f, 'forj', `Inner loop done. The largest remaining value (${py(arr.get(n - 1 - i))}) has bubbled to index ${n - 1 - i}.`);
            break;
          }
          f.set('j', j);
          ctx.step(f, 'forj', `j = ${j}: look at the neighbours arr[${j}] and arr[${j + 1}].`, { viz: { pointers: { j, 'j+1': j + 1 } } });
          const a = arr.get(j);
          const b = arr.get(j + 1);
          const gt = a > b;
          ctx.step(f, 'cmp', gt ? `${py(a)} > ${py(b)}: they are out of order and must be swapped.` : `${py(a)} > ${py(b)} is False: they are already in order.`, {
            compare: { expr: 'arr[j] > arr[j + 1]', evaluated: `${py(a)} > ${py(b)}`, result: gt, next: gt ? 'swap' : 'keep' },
            viz: { pointers: { j, 'j+1': j + 1 }, compare: [j, j + 1] },
          });
          if (gt) {
            arr.swap(j, j + 1);
            ctx.step(f, 'swap', `Swap them: arr[${j}] = ${py(b)}, arr[${j + 1}] = ${py(a)}.`, { viz: { pointers: { j, 'j+1': j + 1 }, swap: [j, j + 1] } });
            swapped = f.set('swapped', true);
            ctx.step(f, 'sw1', 'swapped = True.', { viz: { pointers: { j, 'j+1': j + 1 } } });
          }
        }

        ctx.step(f, 'check', swapped ? 'At least one swap happened, so the array may still be unsorted. Do another pass.' : 'No swaps in this pass, so the array is sorted.', {
          compare: { expr: 'not swapped', evaluated: `not ${py(swapped)}`, result: !swapped, next: swapped ? 'next pass' : 'break' },
        });
        if (!swapped) {
          persist.sortedFrom = 0;
          ctx.step(f, 'break', 'Stop early. Every element is in order.');
          break;
        }
      }

      persist.sortedFrom = 0;
      ctx.ret(f, 'ret', arr, `Return the sorted array ${AV.py(arr.values())}.`);
      ctx.step(main, 'main', 'The array is sorted in place. Done.');
      return arr;
    },
  });
})();
