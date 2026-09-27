(function () {
  'use strict';
  const AV = window.AV;
  const py = AV.py;

  AV.registerAlgorithm({
    id: 'binary-search',
    structure: 'array',
    name: 'Binary Search',
    blurb: 'Halve the search range of a sorted array with every comparison.',
    complexity: 'O(log n)',
    summary: (p) => `binary_search(arr, ${py(p.target)})`,
    param: {
      name: 'target',
      label: 'Target',
      default: '43',
      random: (values) => (Math.random() < 0.7 ? values[AV.randInt(0, values.length - 1)] : AV.randInt(1, 99)),
    },
    // Binary search is only correct on sorted input.
    prepareInput(values) {
      const sorted = [...values].sort((a, b) => a - b);
      const changed = sorted.some((v, i) => v !== values[i]);
      return { values: sorted, note: changed ? 'Binary search needs sorted input, so the array was sorted first.' : null };
    },
    source: `
      def binary_search(arr, target):                   @@def
          lo, hi = 0, len(arr) - 1                      @@init
          while lo <= hi:                               @@while
              mid = (lo + hi) // 2                      @@mid
              if arr[mid] == target:                    @@eq
                  return mid                            @@found
              elif arr[mid] < target:                   @@lt
                  lo = mid + 1                          @@golo
              else:
                  hi = mid - 1                          @@gohi
          return -1                                     @@notfound

      # caller
      index = binary_search(arr, target)                @@main
    `,

    run(ctx, model, { target }) {
      const arr = model.arr;
      const main = ctx.call('<module>', { arr, target }, 'main', `Start: search the sorted array for ${py(target)}.`);

      const f = ctx.call('binary_search', { arr, target }, 'def', `Enter binary_search(). The array has ${arr.length} elements.`);
      let lo = 0;
      let hi = arr.length - 1;
      let mid = null;
      const viz = (extra) => Object.assign({ range: [lo, hi], pointers: mid === null ? { lo, hi } : { lo, mid, hi } }, extra);

      f.set('lo', lo);
      f.set('hi', hi);
      ctx.step(f, 'init', `The search range starts as the whole array: lo = 0, hi = ${hi}.`, { viz: viz() });

      for (;;) {
        const cond = lo <= hi;
        ctx.step(f, 'while', cond ? `lo (${lo}) <= hi (${hi}), so the range is not empty. Keep searching.` : `lo (${lo}) > hi (${hi}): the range is empty.`, {
          compare: { expr: 'lo <= hi', evaluated: `${lo} <= ${hi}`, result: cond, next: cond ? 'loop' : 'exit loop' },
          viz: viz(),
        });
        if (!cond) break;

        mid = f.set('mid', Math.floor((lo + hi) / 2));
        ctx.step(f, 'mid', `Pick the middle of the range: mid = (${lo} + ${hi}) // 2 = ${mid}.`, { viz: viz() });

        const v = arr.get(mid);
        const eq = v === target;
        ctx.step(f, 'eq', `arr[${mid}] is ${py(v)}. ${py(v)} == ${py(target)} is ${py(eq)}.`, {
          compare: { expr: 'arr[mid] == target', evaluated: `${py(v)} == ${py(target)}`, result: eq, next: eq ? 'found' : null },
          viz: viz({ compare: [mid] }),
        });
        if (eq) {
          ctx.ret(f, 'found', mid, `Found ${py(target)} at index ${mid}. Return ${mid}.`, { viz: viz({ found: mid }) });
          main.set('index', mid);
          ctx.step(main, 'main', `binary_search returned ${mid}: arr[${mid}] == ${py(target)}. Done.`, { viz: { found: mid } });
          return mid;
        }

        const lt = v < target;
        ctx.step(
          f,
          'lt',
          `${py(v)} < ${py(target)} is ${py(lt)}, so the target can only be to the ${lt ? 'right' : 'left'} of mid. Discard the ${lt ? 'left' : 'right'} half.`,
          { compare: { expr: 'arr[mid] < target', evaluated: `${py(v)} < ${py(target)}`, result: lt, next: lt ? 'search right half' : 'search left half' }, viz: viz({ compare: [mid] }) }
        );
        if (lt) {
          lo = f.set('lo', mid + 1);
          ctx.step(f, 'golo', `Move lo past mid: lo = ${lo}. The range is now [${lo}, ${hi}].`, { viz: viz() });
        } else {
          hi = f.set('hi', mid - 1);
          ctx.step(f, 'gohi', `Move hi before mid: hi = ${hi}. The range is now [${lo}, ${hi}].`, { viz: viz() });
        }
      }

      ctx.ret(f, 'notfound', -1, `${py(target)} is not in the array. Return -1.`, { viz: viz() });
      main.set('index', -1);
      ctx.step(main, 'main', `binary_search returned -1: ${py(target)} is not in the array. Done.`, {});
      return -1;
    },
  });
})();
