/* Small helpers shared by the BST algorithms (description text + viz hints). */
(function () {
  'use strict';
  const AV = window.AV;

  AV.bst = {
    /** "Node(10)" / "None" as it would print in the Python code. */
    name: (node) => (node ? `Node(${AV.py(node.value)})` : 'None'),

    /**
     * Visualization focus for a frame whose `root` parameter is `root`.
     * When root is None we point at the empty child slot the call came through.
     */
    focus(root, slot, value, extra) {
      const viz = root ? { current: root.id } : { slot };
      if (value !== undefined) viz.probe = { label: 'value', value };
      return Object.assign(viz, extra);
    },

    param(label, pick) {
      return { name: 'value', label, default: '7', random: pick };
    },
  };
})();
