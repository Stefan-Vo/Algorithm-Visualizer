/* Recursive sorts on the array structure: merge sort and quicksort. */
(function () {
  'use strict';
  const AV = window.AV;
  const py = AV.py;

  // ---------------------------------------------------------------- merge sort
  AV.registerAlgorithm({
    id: 'merge-sort',
    structure: 'array',
    name: 'Merge Sort',
    blurb: 'Split in half, sort each half recursively, then merge the two sorted halves.',
    complexity: 'O(n log n)',
    summary: () => 'merge_sort(arr, 0, len(arr))',
    source: `
      def merge_sort(arr, lo, hi):                      @@def
          if hi - lo <= 1:                              @@base
              return                                    @@ret0
          mid = (lo + hi) // 2                          @@mid
          merge_sort(arr, lo, mid)                      @@left
          merge_sort(arr, mid, hi)                      @@right
          merge(arr, lo, mid, hi)                       @@merge

      def merge(arr, lo, mid, hi):                      @@mdef
          left = arr[lo:mid]                            @@mleft
          right = arr[mid:hi]                           @@mright
          i = j = 0                                     @@mij
          k = lo                                        @@mk
          while i < len(left) and j < len(right):       @@mwhile
              if left[i] <= right[j]:                   @@mcmp
                  arr[k] = left[i]                      @@mtakel
                  i += 1                                @@minc
              else:
                  arr[k] = right[j]                     @@mtaker
                  j += 1                                @@mjnc
              k += 1                                    @@mknc
          while i < len(left):                          @@lwhile
              arr[k] = left[i]                          @@ltake
              i += 1                                    @@linc
              k += 1                                    @@lknc
          while j < len(right):                         @@rwhile
              arr[k] = right[j]                         @@rtake
              j += 1                                    @@rinc
              k += 1                                    @@rknc

      # caller
      merge_sort(arr, 0, len(arr))                      @@main
    `,
    run(ctx, model) {
      const arr = model.arr;
      const main = ctx.call('<module>', { arr }, 'main', `Start: sort ${arr.length} numbers with merge sort.`);

      function mergeSort(lo, hi) {
        const range = [lo, hi - 1];
        const f = ctx.call('merge_sort', { arr, lo, hi }, 'def', `Enter merge_sort on indexes ${lo}..${hi - 1} (${hi - lo} element${hi - lo === 1 ? '' : 's'}).`, { viz: { range } });
        const base = hi - lo <= 1;
        ctx.step(f, 'base', base ? `${hi - lo} element${hi - lo === 1 ? ' is' : 's are'} already sorted: base case.` : `${hi - lo} elements: split them.`, {
          compare: { expr: 'hi - lo <= 1', evaluated: `${hi} - ${lo} <= 1`, result: base, next: base ? 'return' : 'split' },
          viz: { range },
        });
        if (base) return ctx.ret(f, 'ret0', null, 'Return: nothing to do.', { viz: { range } });
        const mid = f.set('mid', Math.floor((lo + hi) / 2));
        ctx.step(f, 'mid', `mid = (${lo} + ${hi}) // 2 = ${mid}. Left half ${lo}..${mid - 1}, right half ${mid}..${hi - 1}.`, { viz: { range, pointers: { mid } } });
        ctx.step(f, 'left', `Sort the left half (${lo}..${mid - 1}) recursively.`, { viz: { range: [lo, mid - 1], pointers: { mid } } });
        mergeSort(lo, mid);
        ctx.step(f, 'right', `Left half is sorted. Now sort the right half (${mid}..${hi - 1}).`, { viz: { range: [mid, hi - 1], pointers: { mid } } });
        mergeSort(mid, hi);
        ctx.step(f, 'merge', 'Both halves are sorted. Merge them.', { viz: { range, pointers: { mid } } });
        merge(lo, mid, hi);
        return ctx.ret(f, 'merge', null, `Indexes ${lo}..${hi - 1} are sorted: ${py(arr.values().slice(lo, hi))}.`, { viz: { range } });
      }

      function merge(lo, mid, hi) {
        const range = [lo, hi - 1];
        const f = ctx.call('merge', { arr, lo, mid, hi }, 'mdef', `Enter merge: combine sorted ${py(arr.values().slice(lo, mid))} and ${py(arr.values().slice(mid, hi))}.`, { viz: { range } });
        const left = arr.copyItems(lo, mid);
        f.set('left', left.map((x) => x.value));
        let i = 0;
        let j = 0;
        let k = lo;
        let right = null;
        const aux = () => [
          { name: 'left', items: left, ptr: i, ptrName: 'i' },
          ...(right ? [{ name: 'right', items: right, ptr: j, ptrName: 'j' }] : []),
        ];
        const vz = (extra) => Object.assign({ range, aux: aux(), pointers: { k } }, extra);
        ctx.step(f, 'mleft', `Copy the left half into a temporary list: left = ${py(left.map((x) => x.value))}.`, { viz: vz() });
        right = arr.copyItems(mid, hi);
        f.set('right', right.map((x) => x.value));
        ctx.step(f, 'mright', `Copy the right half: right = ${py(right.map((x) => x.value))}.`, { viz: vz() });
        f.set('i', 0);
        f.set('j', 0);
        ctx.step(f, 'mij', 'i and j point at the next unused value in left and right.', { viz: vz() });
        f.set('k', k);
        ctx.step(f, 'mk', `k = ${k}: the next slot in arr to fill.`, { viz: vz() });

        let last = 'mk';
        for (;;) {
          const both = i < left.length && j < right.length;
          ctx.step(f, 'mwhile', both ? 'Both lists still have values: compare their fronts.' : `${i >= left.length ? 'left' : 'right'} is used up.`, {
            compare: {
              expr: 'i < len(left) and j < len(right)',
              evaluated: i < left.length ? `${i} < ${left.length} and ${j} < ${right.length}` : `${i} < ${left.length}`,
              result: both,
            },
            viz: vz(),
          });
          if (!both) break;
          const takeLeft = left[i].value <= right[j].value;
          ctx.step(f, 'mcmp', `${py(left[i].value)} <= ${py(right[j].value)} is ${py(takeLeft)}: the smaller value comes from ${takeLeft ? 'left' : 'right'}.`, {
            compare: { expr: 'left[i] <= right[j]', evaluated: `${py(left[i].value)} <= ${py(right[j].value)}`, result: takeLeft, next: takeLeft ? 'take from left' : 'take from right' },
            viz: vz(),
          });
          if (takeLeft) {
            arr.setItem(k, left[i]);
            ctx.step(f, 'mtakel', `arr[${k}] = ${py(left[i].value)}.`, { viz: vz({ wrote: [k] }) });
            i = f.set('i', i + 1);
            ctx.step(f, 'minc', `i = ${i}.`, { viz: vz() });
          } else {
            arr.setItem(k, right[j]);
            ctx.step(f, 'mtaker', `arr[${k}] = ${py(right[j].value)}.`, { viz: vz({ wrote: [k] }) });
            j = f.set('j', j + 1);
            ctx.step(f, 'mjnc', `j = ${j}.`, { viz: vz() });
          }
          k = f.set('k', k + 1);
          ctx.step(f, 'mknc', `k = ${k}.`, { viz: vz() });
          last = 'mknc';
        }
        for (const [side, list, tag] of [['left', left, 'l'], ['right', right, 'r']]) {
          for (;;) {
            const idx = side === 'left' ? i : j;
            const more = idx < list.length;
            ctx.step(f, `${tag}while`, more ? `Copy the remaining ${side} values.` : `No ${side} values left to copy.`, {
              compare: { expr: `${side === 'left' ? 'i' : 'j'} < len(${side})`, evaluated: `${idx} < ${list.length}`, result: more },
              viz: vz(),
            });
            last = `${tag}while`;
            if (!more) break;
            arr.setItem(k, list[idx]);
            ctx.step(f, `${tag}take`, `arr[${k}] = ${py(list[idx].value)}.`, { viz: vz({ wrote: [k] }) });
            if (side === 'left') i = f.set('i', i + 1);
            else j = f.set('j', j + 1);
            ctx.step(f, `${tag}inc`, `${side === 'left' ? 'i' : 'j'} = ${side === 'left' ? i : j}.`, { viz: vz() });
            k = f.set('k', k + 1);
            ctx.step(f, `${tag}knc`, `k = ${k}.`, { viz: vz() });
            last = `${tag}knc`;
          }
        }
        void last;
        return ctx.ret(f, 'rwhile', null, `Merged: ${py(arr.values().slice(lo, hi))}.`, { viz: { range } });
      }

      mergeSort(0, arr.length);
      ctx.step(main, 'main', `Done. Sorted: ${py(arr.values())}.`, { viz: { sortedFrom: 0 } });
    },
  });

  // ---------------------------------------------------------------- quicksort
  AV.registerAlgorithm({
    id: 'quick-sort',
    structure: 'array',
    name: 'Quicksort',
    blurb: 'Partition around a pivot so smaller values go left and larger go right, then recurse on both sides.',
    complexity: 'O(n log n) average',
    summary: () => 'quick_sort(arr, 0, len(arr) - 1)',
    source: `
      def quick_sort(arr, lo, hi):                      @@def
          if lo < hi:                                   @@if
              p = partition(arr, lo, hi)                @@part
              quick_sort(arr, lo, p - 1)                @@left
              quick_sort(arr, p + 1, hi)                @@right

      def partition(arr, lo, hi):                       @@pdef
          pivot = arr[hi]                               @@pivot
          i = lo - 1                                    @@pi
          for j in range(lo, hi):                       @@for
              if arr[j] <= pivot:                       @@cmp
                  i += 1                                @@inc
                  arr[i], arr[j] = arr[j], arr[i]       @@swap
          arr[i + 1], arr[hi] = arr[hi], arr[i + 1]     @@place
          return i + 1                                  @@ret

      # caller
      quick_sort(arr, 0, len(arr) - 1)                  @@main
    `,
    run(ctx, model) {
      const arr = model.arr;
      const done = [];
      const main = ctx.call('<module>', { arr }, 'main', `Start: sort ${arr.length} numbers with quicksort.`);

      function quickSort(lo, hi) {
        const range = [lo, hi];
        const f = ctx.call('quick_sort', { arr, lo, hi }, 'def', `Enter quick_sort on indexes ${lo}..${hi}.`, { viz: { range, done: done.slice() } });
        const go = lo < hi;
        ctx.step(f, 'if', go ? `lo < hi: ${hi - lo + 1} elements to sort.` : `lo >= hi: at most one element, which is already in place.`, {
          compare: { expr: 'lo < hi', evaluated: `${lo} < ${hi}`, result: go },
          viz: { range, done: done.slice() },
        });
        if (!go) {
          if (lo === hi) done.push(lo);
          return ctx.ret(f, 'if', null, 'Nothing to sort here.', { viz: { range, done: done.slice() } });
        }
        ctx.step(f, 'part', `Partition indexes ${lo}..${hi} around the pivot arr[${hi}] = ${py(arr.get(hi))}.`, { viz: { range, pivot: hi, done: done.slice() } });
        const p = partition(lo, hi);
        f.set('p', p);
        done.push(p);
        ctx.step(f, 'part', `partition returned p = ${p}. The pivot ${py(arr.get(p))} is now in its final position.`, { viz: { range, pointers: { p }, done: done.slice() } });
        ctx.step(f, 'left', `Sort everything left of the pivot (${lo}..${p - 1}).`, { viz: { range: [lo, p - 1], done: done.slice() } });
        quickSort(lo, p - 1);
        ctx.step(f, 'right', `Sort everything right of the pivot (${p + 1}..${hi}).`, { viz: { range: [p + 1, hi], done: done.slice() } });
        quickSort(p + 1, hi);
        return ctx.ret(f, 'right', null, `Indexes ${lo}..${hi} are sorted.`, { viz: { range, done: done.slice() } });
      }

      function partition(lo, hi) {
        const range = [lo, hi];
        const f = ctx.call('partition', { arr, lo, hi }, 'pdef', `Enter partition on ${lo}..${hi}.`, { viz: { range, pivot: hi, done: done.slice() } });
        const pivot = f.set('pivot', arr.get(hi));
        let i = lo - 1;
        const vz = (j, extra) => Object.assign({ range, pivot: hi, pointers: Object.assign(i >= lo ? { i } : {}, j !== undefined ? { j } : {}), done: done.slice() }, extra);
        ctx.step(f, 'pivot', `pivot = ${py(pivot)} (the last element). Everything <= pivot will be moved to the left side.`, { viz: vz() });
        f.set('i', i);
        ctx.step(f, 'pi', `i = ${i}: the end of the "<= pivot" region (empty so far).`, { viz: vz() });
        for (let j = lo; ; j++) {
          if (j >= hi) {
            ctx.step(f, 'for', 'Every element has been compared with the pivot.', { viz: vz() });
            break;
          }
          f.set('j', j);
          ctx.step(f, 'for', `j = ${j}.`, { viz: vz(j) });
          const small = arr.get(j) <= pivot;
          ctx.step(f, 'cmp', small ? `${py(arr.get(j))} <= ${py(pivot)}: it belongs in the left region.` : `${py(arr.get(j))} > ${py(pivot)}: leave it on the right.`, {
            compare: { expr: 'arr[j] <= pivot', evaluated: `${py(arr.get(j))} <= ${py(pivot)}`, result: small, next: small ? 'grow left region' : 'skip' },
            viz: vz(j, { compare: [j] }),
          });
          if (small) {
            i = f.set('i', i + 1);
            ctx.step(f, 'inc', `i = ${i}.`, { viz: vz(j) });
            arr.swap(i, j);
            ctx.step(f, 'swap', i === j ? `Swap arr[${i}] with itself (it is already in place).` : `Swap arr[${i}] and arr[${j}].`, { viz: vz(j, { swap: [i, j] }) });
          }
        }
        arr.swap(i + 1, hi);
        ctx.step(f, 'place', `Put the pivot right after the left region: swap arr[${i + 1}] and arr[${hi}].`, { viz: vz(undefined, { swap: [i + 1, hi], pivot: i + 1 }) });
        return ctx.ret(f, 'ret', i + 1, `Return ${i + 1}, the pivot's final index.`, { viz: vz(undefined, { pivot: i + 1 }) });
      }

      quickSort(0, arr.length - 1);
      ctx.step(main, 'main', `Done. Sorted: ${py(arr.values())}.`, { viz: { sortedFrom: 0 } });
    },
  });
})();
