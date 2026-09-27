/* Binary min-heap stored in an array. Items keep ids so the tree and array animate together. */
(function () {
  'use strict';
  const AV = window.AV;

  // Untraced heapify so the starting state is always a valid heap.
  function heapify(values) {
    const a = [...values];
    const n = a.length;
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
      let j = i;
      for (;;) {
        let s = j;
        const l = 2 * j + 1;
        const r = l + 1;
        if (l < n && a[l] < a[s]) s = l;
        if (r < n && a[r] < a[s]) s = r;
        if (s === j) break;
        [a[j], a[s]] = [a[s], a[j]];
        j = s;
      }
    }
    return a;
  }
  AV.heapifyValues = heapify;

  AV.registerStructure({
    id: 'heap',
    name: 'Binary Heap',
    view: 'binheap',
    defaultData: '3, 9, 5, 12, 10, 8, 20',
    dataHint: 'The starting values are arranged into a valid min-heap first.',
    parse: (text) => AV.parseNumberList(text, 31),
    build: (values) => ({ arr: new AV.TracedArray(values) }),
    snapshot: (model) => ({ items: model.arr.items.map((x) => ({ id: x.id, value: x.value })) }),
    formatValue(v) {
      if (v instanceof AV.TracedArray) return { text: AV.py(v.values()) };
      return null;
    },
    serialize: (model) => model.arr.values().join(', '),
    random: () => AV.uniqueInts(AV.randInt(6, 10), 1, 60).join(', '),
  });
})();
