/* Binary Search Tree structure: the real nodes algorithms operate on. */
(function () {
  'use strict';
  const AV = window.AV;

  class TreeNode {
    constructor(value) {
      this.id = AV.uid('n'); // stable identity so the view can animate a node across steps
      this.value = value;
      this.left = null;
      this.right = null;
    }
  }
  AV.TreeNode = TreeNode;

  function snap(n) {
    return n ? { id: n.id, value: n.value, left: snap(n.left), right: snap(n.right) } : null;
  }

  // Untraced insert used to build the starting tree. Equal values go right,
  // matching the traced insert.
  function plainInsert(root, value) {
    const node = new TreeNode(value);
    if (!root) return node;
    let cur = root;
    for (;;) {
      const side = value < cur.value ? 'left' : 'right';
      if (!cur[side]) {
        cur[side] = node;
        return root;
      }
      cur = cur[side];
    }
  }

  function preorder(n, out) {
    if (n) {
      out.push(n.value);
      preorder(n.left, out);
      preorder(n.right, out);
    }
    return out;
  }

  AV.registerStructure({
    id: 'bst',
    name: 'Binary Search Tree',
    view: 'tree',
    defaultData: '10, 5, 15, 3, 7, 12, 20',
    dataHint: 'The starting tree is built by inserting these values in order.',
    parse: (text) => AV.parseNumberList(text, 31),
    build(values) {
      const model = { root: null };
      for (const v of values) model.root = plainInsert(model.root, v);
      return model;
    },
    snapshot: (model) => ({ root: snap(model.root) }),
    formatValue(v) {
      if (v instanceof TreeNode) return { text: `Node(${AV.py(v.value)})`, ref: v.id };
      return null;
    },
    // Reinserting a pre-order listing reproduces the exact same tree shape.
    serialize: (model) => preorder(model.root, []).join(', '),
    random: () => {
      const vals = AV.uniqueInts(AV.randInt(6, 9), 1, 99);
      return vals.join(', ');
    },
  });
})();
