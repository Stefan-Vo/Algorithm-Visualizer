/* Singly linked list of real ListNode objects. */
(function () {
  'use strict';
  const AV = window.AV;

  let created = 0;
  class ListNode {
    constructor(val, next = null) {
      this.id = AV.uid('l');
      this.order = created++; // creation order fixes each node's column, so re-linking is visible
      this.val = val;
      this.next = next;
    }
  }
  AV.ListNode = ListNode;

  AV.registerStructure({
    id: 'linked-list',
    name: 'Linked List',
    view: 'list',
    defaultData: '1, 2, 3, 4, 5',
    dataHint: 'Values from head to tail.',
    parse: (text) => AV.parseNumberList(text, 12),
    build(values) {
      let head = null;
      const nodes = values.map((v) => new ListNode(v));
      for (let i = nodes.length - 1; i >= 0; i--) {
        nodes[i].next = head;
        head = nodes[i];
      }
      return { head, all: nodes };
    },
    snapshot(model) {
      // Every node the program still holds, with its current link, in creation order.
      return {
        nodes: model.all
          .filter((n) => !n.detached)
          .map((n) => ({ id: n.id, order: n.order, value: n.val, next: n.next ? n.next.id : null })),
      };
    },
    formatValue(v) {
      if (v instanceof ListNode) return { text: `ListNode(${AV.py(v.val)})`, ref: v.id };
      return null;
    },
    serialize(model) {
      const out = [];
      for (let n = model.head, guard = 0; n && guard < 100; n = n.next, guard++) out.push(n.val);
      return out.join(', ');
    },
    random: () => Array.from({ length: AV.randInt(4, 7) }, () => AV.randInt(1, 30)).join(', '),
  });

  // Recursion-only algorithms have no input data; the call tree is the picture.
  AV.registerStructure({
    id: 'recursion',
    name: 'Recursion',
    view: 'calltree',
    noData: true,
    parse: () => [],
    build: () => ({}),
    snapshot: () => ({}),
    formatValue: () => null,
  });
})();
