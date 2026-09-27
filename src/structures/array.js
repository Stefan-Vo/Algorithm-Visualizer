/* Array structure. Items carry ids so swaps can animate. */
(function () {
  'use strict';
  const AV = window.AV;

  class TracedArray {
    constructor(values) {
      this.items = values.map((value) => ({ id: AV.uid('a'), value }));
    }
    get length() {
      return this.items.length;
    }
    get(i) {
      if (i < 0 || i >= this.items.length) throw new Error(`IndexError: list index ${i} out of range`);
      return this.items[i].value;
    }
    set(i, value) {
      this.get(i);
      this.items[i] = { id: AV.uid('a'), value };
    }
    swap(i, j) {
      this.get(i);
      this.get(j);
      const t = this.items[i];
      this.items[i] = this.items[j];
      this.items[j] = t;
    }
    values() {
      return this.items.map((x) => x.value);
    }
    /** Copies of items lo..hi-1 with fresh identities (Python slicing makes a new list). */
    copyItems(lo, hi) {
      return this.items.slice(lo, hi).map((x) => ({ id: AV.uid('a'), value: x.value }));
    }
    /** Put an existing item (e.g. from a copy) at index i, keeping its identity so it can animate there. */
    setItem(i, item) {
      this.get(i);
      this.items[i] = item;
    }
    push(value) {
      this.items.push({ id: AV.uid('a'), value });
    }
    popItem() {
      if (!this.items.length) throw new Error('IndexError: pop from empty list');
      return this.items.pop();
    }
  }
  AV.TracedArray = TracedArray;

  AV.registerStructure({
    id: 'array',
    name: 'Array',
    view: 'array',
    defaultData: '38, 27, 43, 3, 9, 82, 10, 55',
    dataHint: 'Comma or space separated numbers.',
    parse: (text) => AV.parseNumberList(text, 24),
    build: (values) => ({ arr: new TracedArray(values) }),
    snapshot: (model) => ({ items: model.arr.items.map((x) => ({ id: x.id, value: x.value })) }),
    formatValue(v) {
      if (v instanceof TracedArray) return { text: AV.py(v.values()) };
      return null;
    },
    serialize: (model) => model.arr.values().join(', '),
    random: () => Array.from({ length: AV.randInt(7, 10) }, () => AV.randInt(1, 99)).join(', '),
  });
})();
